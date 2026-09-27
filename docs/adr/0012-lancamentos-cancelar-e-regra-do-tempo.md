# ADR 0012 — Lançamentos: cancelar em vez de apagar, e a regra do tempo

- **Status:** aceito (FASE 2)

## Contexto

Precisamos decidir (a) o que acontece quando o usuário "desfaz" um lançamento e (b) quando um
lançamento passa a contar no saldo. Um saldo confiável exige histórico auditável e uma regra simples
para separar o que **já aconteceu** do que é **previsão**.

## Decisão

- **Sem exclusão física.** Lançamentos e transferências são *cancelados* (`status = cancelled`);
  contas e categorias são *arquivadas*. O histórico permanece; cancelado não conta em saldo,
  relatórios nem orçamento e é imutável.
- **Regra do tempo.** Só é `completed` (efetivado) o que tem data **até hoje** no fuso do usuário
  (`users.timezone`). Data futura = `pending` (previsão). O servidor roda em UTC, então "hoje" é sempre
  calculado com `todayInTimeZone(user.timezone)`; nunca com a data do servidor.
- **Nada muda sozinho com o passar do tempo.** Um pendente só vira efetivado por ação explícita
  (`POST /transactions/:id/complete`), opcionalmente informando a data real. Efetivar com data futura
  é recusado (422 `BUSINESS_RULE_VIOLATION`).
- **Idempotência:** efetivar um efetivado e cancelar um cancelado retornam o estado atual; efetivar ou
  editar um cancelado responde 409.
- **Tipo imutável:** para trocar receita por despesa, cancela-se e relança-se.
- **Saldo** = saldo inicial + Σ efeito dos lançamentos `completed`. O saldo inicial pode ser negativo
  (cheque especial) e não tem data (é o saldo antes de qualquer lançamento).
- **Contas de investimento** só têm transferências (aplicação e resgate) até a FASE 8.

## Consequências

- Relatórios e "dinheiro disponível" podem confiar que `completed` = aconteceu e `pending` = previsão.
- A tela de "contas a pagar" da FASE 3 é simplesmente a lista de pendentes.
- Corrigir um lançamento errado é editar (se não cancelado) ou cancelar e lançar de novo.
