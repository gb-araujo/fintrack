# ADR 0020 — Rendimento de investimento: derivado de avaliações, nunca um número solto

- **Status:** aceito (FASE 8)

## Contexto

Uma conta de investimento (`accounts.type = 'investment'`) já tinha saldo — soma de aportes e
resgates (transferências) desde a criação da conta, igual a qualquer outra conta (ADR 0002). Isso
mede o **dinheiro que entrou e saiu**, não o **rendimento** (o que o mercado pagou). Bastaria uma
coluna `current_value_cents` atualizada a cada consulta de extrato — mas isso destrói a informação:
sobrescrever o valor apaga a história de como a posição chegou lá, e não há como responder "quanto
rendeu este mês" ou "quanto rendeu desde que eu investi" depois do fato. Requisito explícito do
projeto: **o histórico/rentabilidade tem que ser preservado, nunca só uma atualização de valor.**

## Decisão

1. **Avaliação é um fato histórico, não um estado.** Nova tabela `investment_valuations`
   (`account_id`, `date`, `balance_cents`, `note`) com `UNIQUE(account_id, date)`: o usuário registra
   "minha posição valia X nesta data" (confere no extrato da corretora). Corrigir uma avaliação
   **atualiza a linha daquela data** (nunca cria uma duplicata), mas todas as OUTRAS datas
   permanecem — o histórico nunca é substituído por um único número atual.
2. **Rendimento é sempre calculado, nunca armazenado:**
   ```
   rendimento(A → B) = saldo(B) − saldo(A) − aportes líquidos entre A e B (exclusive A, inclusive B)
   ```
   onde "aportes líquidos" é a mesma fórmula de efeito no saldo já usada em todo o sistema
   (`completedEffectSql`/`balanceEffect`, ADR 0002) — aplicações somam, resgates subtraem. Isso é
   **rentabilidade simples**: correta em reais; uma aproximação no percentual quando há aporte grande
   no meio do intervalo (não é TWR/XIRR). Documentado como limitação conhecida, não escondida.
   Consequência de calcular sempre: corrigir uma avaliação antiga recalcula automaticamente o
   rendimento de todas as avaliações seguintes, sem nenhuma migração ou job de recálculo.
3. **Saldo "atual" de uma conta de investimento** (`AccountsRepository`, reaproveitado por
   `ReportsRepository`): se existe avaliação, é **a avaliação mais recente + efeito dos lançamentos
   completados depois dela**; sem avaliação nenhuma, cai na mesma regra de qualquer conta (saldo
   inicial + efeito completo) — o recurso é 100% opt-in por conta, nenhuma conta existente muda de
   comportamento até o usuário registrar a primeira avaliação.
4. **Módulo `investments` novo**, só para o que é específico de investimento (a conta em si
   continua sendo criada/arquivada em `/accounts`, igual às outras):
   - `GET /investments` — resumo por conta: saldo, aportado líquido desde a criação, rendimento
     total desde a primeira avaliação (`null` se nenhuma).
   - `GET /investments/:accountId/valuations` — histórico completo, com rendimento entre cada par
     consecutivo.
   - `PUT /investments/:accountId/valuations` — registra/corrige (por data); rejeita conta que não
     é investimento, arquivada, ou data futura.
   - `DELETE /investments/:accountId/valuations/:id` — remove uma avaliação do histórico.
   - `PATCH /investments/:accountId` — instituição/produto (metadado, tabela `investment_details`
     separada — não afeta saldo/rendimento).
5. **Relatório de investimentos** (ADR 0019) ganha `yieldCents` por conta e agregado: soma só das
   contas com avaliação suficiente para cobrir o período pedido; `null` quando nenhuma conta tem
   avaliação (nunca `0` fingindo que o rendimento é conhecido e é zero).

## Consequências

- Nenhuma tabela existente muda de formato; contas de investimento sem avaliação continuam se
  comportando exatamente como antes da FASE 8.
- O preço de "nunca armazenar o rendimento" é recalcular em toda leitura (algumas somas por conta);
  aceitável no volume esperado (poucas avaliações por conta, poucas contas de investimento por
  usuário) — sem índice ou cache adicional por agora.
- Rentabilidade simples (não TWR/XIRR) é uma limitação conhecida e documentada, não um bug: para o
  uso pessoal do projeto (poucas contas, poucos aportes por mês) a diferença é desprezível; caso vire
  problema real, a mudança fica isolada em `computeYield` (domínio puro, sem tocar em schema).
