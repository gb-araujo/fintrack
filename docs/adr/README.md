# Architecture Decision Records (ADRs)

Cada decisão arquitetural relevante é registrada aqui: contexto, decisão e consequências.
Um ADR aceito só muda por meio de um novo ADR que o substitua.

| # | Decisão | Status |
|---|---|---|
| [0001](./0001-dinheiro-em-centavos.md) | Dinheiro em centavos inteiros | Aceito |
| [0002](./0002-saldo-calculado.md) | Saldo calculado a partir do histórico | Aceito |
| [0003](./0003-transferencias-vinculadas.md) | Transferências com origem/destino vinculados | Aceito |
| [0004](./0004-card-payment-e-faturas.md) | Tipo `card_payment` e tabela de faturas | Aceito |
| [0005](./0005-parcelas-no-periodo-da-fatura.md) | Parcelas reconhecidas no período da fatura | Aceito |
| [0006](./0006-investimentos-como-movimentacao-entre-contas.md) | Investimentos como movimentação entre contas | Aceito (rendimentos: pendente FASE 8) |
| [0007](./0007-autenticacao-jwt-refresh-rotativo.md) | JWT de curta duração + refresh token rotativo | Aceito (implementação FASE 1) |
| [0008](./0008-recorrencias-como-previsao.md) | Recorrências como previsão até confirmação | Aceito |
| [0009](./0009-android-dev-adb-reverse.md) | Android em desenvolvimento via `adb reverse` | Aceito |
| [0010](./0010-typescript-6.md) | TypeScript 6.0 (não 7.0) | Aceito |
| [0011](./0011-monorepo-npm-workspaces.md) | Monorepo com npm workspaces | Aceito |
