# Convenções da API

## Base

- REST sobre HTTPS, JSON (`application/json; charset=utf-8`).
- Rotas de negócio em `/api/v1/...`. `/health` fica na raiz (healthcheck do Railway).
- Nomes de campos em **camelCase**; recursos no plural (`/api/v1/accounts`).
- Autenticação (a partir da FASE 1): `Authorization: Bearer <access token>`.
- O `userId` **nunca** é aceito do cliente; vem do token.

## Tipos

| Dado | Formato |
|---|---|
| Dinheiro | inteiro em centavos, sufixo `Cents` (`amountCents: 9099` = R$ 90,99), sempre ≥ 0 |
| Data de movimentação | `YYYY-MM-DD` |
| Data/hora | ISO-8601 em UTC (`2026-09-26T12:00:00.000Z`) |
| Identificadores | UUID |
| Enums | strings minúsculas (`income`, `expense`, `transfer`, `card_payment`) |

## Erros

Toda resposta de erro usa o mesmo envelope:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Dados inválidos.", "details": [ ... ] } }
```

| HTTP | `code` | Quando |
|---|---|---|
| 400 | `VALIDATION_ERROR` | corpo/query/params inválidos, JSON malformado |
| 401 | `UNAUTHORIZED` | token ausente/inválido/expirado |
| 403 | `FORBIDDEN` | autenticado, mas sem permissão |
| 404 | `NOT_FOUND` | rota ou recurso inexistente (inclusive recurso de outro usuário) |
| 409 | `CONFLICT` | violação de unicidade/estado |
| 429 | `RATE_LIMITED` | limite de requisições; `Retry-After` no cabeçalho |
| 500 | `INTERNAL_ERROR` | erro inesperado (sem detalhes internos) |
| 503 | — | `/health` com dependência fora (corpo = contrato de health) |

Recurso de outro usuário responde **404** (não 403), para não revelar sua existência.

## Paginação

Listagens grandes usam cursor: `?limit=50&cursor=<opaco>` → `{ "items": [...], "nextCursor": "..." | null }`.

## Cabeçalhos

- `X-Request-Id` em toda resposta (correlação com os logs).
- `X-Client: android` identifica o app (a partir da FASE 1, define a entrega do refresh token).

## Contrato

- Schemas Zod em `packages/shared` (Web + API) e nos `*.schema.ts` de cada módulo.
- OpenAPI gerado automaticamente em `/docs/json` (contrato do Android).
- Mudanças incompatíveis exigem nova versão (`/api/v2`). Campos novos são compatíveis: os clientes
  ignoram campos desconhecidos (Android: `ignoreUnknownKeys = true`).
