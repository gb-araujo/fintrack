# ADR 0005 — Parcelas reconhecidas no período da fatura

- **Status:** aceito (FASE 0); implementado na FASE 5 ([ADR 0017](./0017-cartao-faturas-e-parcelas.md)):
  "mês de referência" = mês do **vencimento** da fatura

## Contexto

Uma compra de R$ 900 em 3x pode ser reconhecida (a) inteira na data da compra ou (b) R$ 300 em cada
fatura. A escolha afeta relatórios, orçamento e o "Quanto posso gastar?".

## Decisão

A despesa é reconhecida **por parcela, no mês de referência da fatura** à qual a parcela pertence.
A fatura de cada parcela é determinada pela data da compra e pelo dia de fechamento do cartão.

## Consequências

- Orçamento e relatórios mensais refletem o dinheiro que efetivamente sai em cada mês.
- Parcelas futuras aparecem em "Compromissos futuros".
- O relatório "gastos por cartão" pode mostrar também o valor total na data da compra — apenas como
  visão informativa, sem reentrar em somas de despesa.
