# ADR 0003 — Transferências com origem/destino vinculados

- **Status:** aceito (FASE 0)

## Contexto

"Banco Inter → Mercado Pago" não é despesa nem receita. Tratar cada lado isoladamente causa dupla
contagem (uma despesa em uma conta e uma receita na outra) e infla os relatórios.

## Decisão

- Uma transferência cria **um** registro em `transfers` (origem, destino, valor, data, status) e
  **duas** transações do tipo `transfer` (perna `out` na origem e `in` no destino), vinculadas por
  `transfer_id`, na **mesma transação SQL**.
- CHECKs no banco: tipo `transfer` ⇔ `transfer_id` e `transfer_direction` preenchidos e sem
  categoria; `from_account_id <> to_account_id`.
- Relatórios de receitas/despesas e orçamento **excluem** `transfer`.

## Consequências

- O saldo de cada conta continua sendo uma soma simples das suas transações (ADR 0002).
- Editar ou cancelar uma transferência atualiza as duas pernas atomicamente.
- Aplicações e resgates de investimento reutilizam este modelo (ADR 0006).
