# ADR 0002 — Saldo calculado a partir do histórico

- **Status:** aceito (FASE 0)

## Contexto

Um campo `balance` atualizado a cada operação pode divergir do histórico (condições de corrida,
edições, exclusões, bugs), e então não há como saber qual dos dois está certo.

## Decisão

O saldo de uma conta é **sempre calculado**: `initial_balance_cents + Σ transações completed` da
conta (receitas e pernas de entrada somam; despesas, pernas de saída e `card_payment` subtraem).
Não existe coluna de saldo persistida como fonte da verdade.

## Consequências

- O saldo não tem como divergir do extrato; editar ou cancelar uma transação corrige o saldo
  automaticamente.
- Consultas de saldo precisam de índices (`(account_id, status)`, `(user_id, transaction_date)`).
- Se o volume exigir, um cache/snapshot pode ser adicionado no futuro — sempre derivado e
  recalculável, nunca fonte da verdade (exigirá novo ADR).
