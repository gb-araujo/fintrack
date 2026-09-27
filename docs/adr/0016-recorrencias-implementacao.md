# ADR 0016 — Recorrências: decisões de implementação

- **Status:** aceito (FASE 4) — detalha o [ADR 0008](./0008-recorrencias-como-previsao.md)

## Decisões

1. **Ocorrências são calculadas, não gravadas.** `occurrencesBetween(regra, de, até)` é uma função
   pura sobre datas de calendário (`AAAA-MM-DD`), testada contra um oráculo dia a dia. Mensal usa o
   `dayOfMonth` e cai no último dia de meses curtos; semanal repete o dia da semana da data de início;
   anual repete dia/mês da data de início (29/02 → 28/02 em ano comum). `interval` permite "a cada N".
2. **Uma ocorrência deixa de ser previsão quando existe transação vinculada em qualquer status.**
   Confirmar cria uma transação `completed`; **pular** grava uma transação `cancelled` (valor de
   marcação, sem efeito em saldo, relatórios ou orçamento). `UNIQUE(recurring_transaction_id,
   occurrence_date)` garante uma única resolução por ocorrência, inclusive com requisições
   concorrentes (a segunda recebe `409`).
3. **Nada é efetivado no futuro.** Confirmar uma ocorrência futura exige informar uma data até hoje
   (ex.: conta paga adiantada); sem data, a API responde `422`. Ocorrências vencidas e não resolvidas
   ficam como **atrasadas** (janela de 62 dias — `RECURRING_LOOKBACK_DAYS`; mais antigas são
   ignoradas por se presumirem refletidas no saldo inicial ou esquecidas).
4. **Auto-confirmação sob demanda.** Regras com `autoConfirm` (só valor fixo) viram lançamentos
   `completed` quando o usuário consulta seus dados (hook `preHandler` em toda requisição `GET`
   autenticada, além do painel e das previsões). Não há job em segundo plano: o resultado é idêntico
   para o usuário e evita processo agendado, fuso por usuário e reexecução. É idempotente e seguro
   sob concorrência (a unicidade descarta a duplicata). Falha na materialização é registrada em log e
   nunca derruba a leitura.
5. **Valor variável** (ex.: Enel): a previsão usa o último valor confirmado da regra; sem histórico, a
   estimativa informada; sem nenhum dos dois, a previsão vale 0 e a interface pede o valor ao
   confirmar. Sempre sinalizado `estimated`.
6. **Efeito no "Quanto posso gastar?" (ADR 0014):** só previsões com `includeInForecast`, em conta
   líquida e dentro do horizonte somam em `forecastIncomeCents`/`forecastExpensesCents`. Confirmar move
   o valor da previsão para o saldo — o disponível não muda (teste de integração de "sem dupla
   contagem"). Previsões vencidas contam nas "contas pendentes" como atrasadas.
7. **Regras não são apagadas**, só desativadas (`active = false`): lançamentos já confirmados mantêm o
   vínculo. Tipo, frequência e início não são editáveis (reescreveriam a história); o restante vale
   para as próximas ocorrências.
8. **Conta de investimento não recebe recorrência** de receita/despesa (regra geral do ledger).

## Consequências

- O extrato só contém movimentações que aconteceram (ou foram explicitamente pendentes).
- Editar o dia de vencimento de uma regra muda as ocorrências não resolvidas; as já resolvidas ficam
  presas às datas originais (o vínculo é por `occurrence_date`).
