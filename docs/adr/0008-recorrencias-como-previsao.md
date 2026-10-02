# ADR 0008 — Recorrências como previsão até confirmação

- **Status:** aceito (FASE 0); implementado na FASE 4 — decisões de implementação no
  [ADR 0016](./0016-recorrencias-implementacao.md)

## Decisão

- Uma recorrência (ex.: Vivo, R$ 90,99, dia 5) gera **ocorrências virtuais**, calculadas sob
  demanda — nada é gravado como transação antes da confirmação.
- Ao confirmar, cria-se uma transação com `(recurring_transaction_id, occurrence_date)`; um `UNIQUE`
  nesse par impede confirmar a mesma ocorrência duas vezes.
- Pular uma ocorrência grava a transação como `cancelled` (a ocorrência deixa de ser prevista).
- Opcional por recorrência: `auto_confirm = true`.
- Valor variável (ex.: Enel): a previsão usa o último valor confirmado ou a estimativa informada.

## Consequências

- Não há "despesas fantasmas" no extrato; a previsão aparece no dinheiro disponível e em
  "Contas pendentes" com rótulo de previsão.
