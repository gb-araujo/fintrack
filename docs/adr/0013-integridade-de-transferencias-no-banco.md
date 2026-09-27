# ADR 0013 — Integridade de transferências garantida no banco

- **Status:** aceito (FASE 2). Complementa o [ADR 0003](./0003-transferencias-vinculadas.md).

## Contexto

Uma transferência é um cabeçalho (`transfers`) e duas pernas (`transactions`). Se uma perna existir sem
a outra, o dinheiro "some" ou "aparece" e o patrimônio deixa de fechar. Garantir isso só no código da
aplicação deixa a regra vulnerável a bugs, scripts manuais e migrations futuras.

## Decisão

Um **constraint trigger deferido** (migration 0003) verifica, no `COMMIT`, que toda transferência tem
exatamente duas pernas: uma `out` na conta de origem e uma `in` na de destino, com o mesmo valor, data
e status do cabeçalho. O gatilho roda em INSERT/UPDATE de `transfers` e de pernas e em DELETE de pernas.
Apagar a transferência inteira (cabeçalho e pernas na mesma transação, ou por cascata do usuário) segue
possível.

Reforços no mesmo espírito:

- `CHECK` de forma: transferência ⇔ tem `transfer_id` e direção e **não tem categoria**; valor > 0;
  origem ≠ destino.
- **Chaves estrangeiras compostas** `(id, user_id)`: um lançamento não pode apontar para conta,
  categoria ou transferência de outro usuário, mesmo com bug na aplicação.
- Edição concorrente da mesma transferência é serializada com `SELECT … FOR UPDATE`.

## Consequências

- Testes de integração escrevem SQL cru para tentar quebrar as regras (perna solta, valor diferente,
  conta errada, alterar uma perna só, apagar uma perna, usar conta de outro usuário) e exigem recusa.
- Toda alteração de transferência precisa mexer no cabeçalho e nas duas pernas na mesma transação
  (`TransfersRepository.replace`).
- Um teste de propriedade compara o saldo calculado em SQL com a especificação em TypeScript
  (`balanceEffect`) em sequências aleatórias e verifica que transferências nunca alteram o total.
