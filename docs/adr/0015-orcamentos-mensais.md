# ADR 0015 — Orçamentos mensais por categoria

- **Status:** aceito (FASE 4)

## Contexto

O orçamento responde "quanto já usei do que planejei gastar em cada categoria neste mês?". O risco
é o mesmo do resto do sistema: contar uma movimentação duas vezes ou contar o que não é despesa
(transferência, investimento) ou o que não aconteceu (previsão, cancelado).

## Decisão

- Um orçamento é `(usuário, categoria de despesa, mês) → limite em centavos` (`budgets`, `UNIQUE`
  nessa trinca; o mês é gravado como o dia 1). Só categorias **de despesa e ativas** aceitam
  orçamento. `PUT /budgets` é um *upsert*: repetir a trinca altera o limite, não duplica.
- O **gasto nunca é gravado**: é `Σ amount` das transações `type = expense`, `status = completed`
  da categoria com `transaction_date` dentro do mês. Ficam de fora, por construção:
  transferências (`type = transfer`, sem categoria), pagamentos de fatura (`card_payment`, já contados
  nas parcelas — ADR 0005), investimentos, lançamentos `pending` e `cancelled` (inclusive ocorrências
  de recorrência puladas).
- Despesas `pending` do mês e ocorrências **previstas** de recorrências de despesa da categoria
  aparecem em `pendingCents` — informação, **não** entram em `spentCents`, `remainingCents` nem no
  percentual. Ao confirmar/efetivar, saem de `pendingCents` e entram em `spentCents` (sem contagem
  dupla, pela mesma regra de anti-duplicidade das recorrências).
- `remainingCents = limitCents − spentCents` (pode ser negativo), `percentUsed` é o inteiro
  arredondado de `spent × 100 / limit` (pode passar de 100) e `status` é `ok`, `warning`
  (≥ 80%, `BUDGET_WARNING_PERCENT`) ou `exceeded` (gasto > limite; exatamente 100% ainda é `warning`).
  Tudo é calculado no backend; Web e Android só exibem (a barra é limitada a 100% apenas visualmente).
- Despesas efetivadas em categorias **sem orçamento** no mês (ou sem categoria) somam em
  `unbudgetedSpentCents`, para o usuário ver o que escapou do planejamento.
- Remover um orçamento apaga só a configuração; lançamentos não são afetados. Orçamento é
  configuração, não histórico financeiro; por isso, ao contrário de contas, categorias e lançamentos,
  pode ser apagado fisicamente.

## Consequências

- A soma "orçado × gasto" é sempre coerente com o extrato e com os relatórios (FASE 7), porque usa a
  mesma definição de despesa efetivada.
- Compras no cartão entram no orçamento pelo mês da **parcela/fatura** (ADR 0005), a partir da FASE 5.
- Não há orçamento recorrente automático: cada mês é definido explicitamente (a tela permite copiar
  de um mês para outro em melhorias futuras — FASE 9).
