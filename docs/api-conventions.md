# Convenções da API

## Base

- REST sobre HTTPS, JSON (`application/json; charset=utf-8`).
- Rotas de negócio em `/api/v1/...`. `/health` fica na raiz (healthcheck do Railway).
- Nomes de campos em **camelCase**; recursos no plural (`/api/v1/accounts`).
- Autenticação: `Authorization: Bearer <access token>` (JWT de 15 min).
- O `userId` **nunca** é aceito do cliente; vem do token.

## Autenticação

| Rota | Corpo | Resposta |
|---|---|---|
| `POST /api/v1/auth/register` | `{ name, email, password, timezone? }` | `201` + sessão |
| `POST /api/v1/auth/login` | `{ email, password }` | `200` + sessão |
| `POST /api/v1/auth/refresh` | Android: `{ refreshToken }` · Web: vazio (cookie) | `200` + nova sessão |
| `POST /api/v1/auth/logout` | Android: `{ refreshToken }` · Web: vazio (cookie) | `204` |
| `GET /api/v1/users/me` | — | `200` + usuário |

Sessão (`authResponseSchema`):

```json
{
  "user": { "id": "…", "name": "…", "email": "…", "timezone": "America/Sao_Paulo", "currency": "BRL", "createdAt": "…" },
  "accessToken": "eyJ…",
  "accessTokenExpiresAt": "2026-09-26T12:15:00.000Z",
  "refreshToken": "… (somente com X-Client: android)",
  "refreshTokenExpiresAt": "… (somente com X-Client: android)"
}
```

- **Web:** o refresh token vai no cookie `fintrack_refresh` (`HttpOnly; Secure; SameSite=Lax;
  Path=/api/v1/auth`). Chamadas com credenciais (`credentials: 'include'`) e cabeçalho `Origin`
  autorizado; sem `Origin` válido, refresh/logout por cookie respondem `403`.
- **Android:** envia `X-Client: android` e recebe/envia o refresh token no corpo.
- O refresh token é **rotacionado a cada uso**. Um `401` com `details.reason = "concurrent_rotation"`
  significa que outra requisição acabou de rotacionar o mesmo token: o cliente pode tentar de novo
  com o token atual. Qualquer outro `401` no refresh significa "faça login".
- Senha: 8–128 caracteres. E-mail é normalizado (espaços e maiúsculas) e comparado sem diferenciar
  maiúsculas. Login inválido responde sempre `401 "E-mail ou senha inválidos."`.

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
| 409 | `CONFLICT` | violação de unicidade/estado (nome repetido, conta arquivada, editar cancelado) |
| 422 | `BUSINESS_RULE_VIOLATION` | requisição válida que viola regra financeira (efetivar data futura, receita em conta de investimento, categoria do tipo errado) |
| 429 | `RATE_LIMITED` | limite de requisições; `Retry-After` no cabeçalho |
| 500 | `INTERNAL_ERROR` | erro inesperado (sem detalhes internos) |
| 503 | — | `/health` com dependência fora (corpo = contrato de health) |

Recurso de outro usuário responde **404** (não 403), para não revelar sua existência.

## Livro-caixa (FASE 2)

- **Contas** (`/accounts`): retornam `balanceCents` **calculado pelo backend**. `?includeArchived=true`
  inclui arquivadas. Nome único entre contas ativas (sem diferenciar maiúsculas) → `409`.
- **Lançamentos** (`/transactions`): `POST` cria só `income`/`expense`; transferências usam `/transfers`.
  Sem `status`, a API decide pela data no fuso do usuário (até hoje = `completed`, futuro = `pending`).
  `status: "completed"` com data futura → `422`. Listagem ordenada por data desc; filtros `accountId`,
  `categoryId`, `type`, `status`, `from`, `to`, `q` (busca literal na descrição), `includeCancelled`;
  paginação `limit` (máx. 100) + `cursor` opaco (cursor inválido → `400`).
- **Efetivar** (`POST …/complete`): corpo opcional `{ "transactionDate": "AAAA-MM-DD" }` (até hoje).
  Efetivar e cancelar são idempotentes; efetivar/editar um cancelado → `409`.
- **Transferências**: `POST /transfers` cria cabeçalho + 2 pernas atomicamente. As pernas aparecem em
  `GET /transactions` (`type = "transfer"`, campo `transfer`), mas só se alteram por `/transfers/:id`
  (`PATCH /transactions/:id` numa perna → `409`).
- Recurso de outro usuário (conta, categoria, lançamento, transferência), inclusive referenciado no
  corpo, responde sempre `404`.

## Paginação

Listagens grandes usam cursor: `?limit=50&cursor=<opaco>` → `{ "items": [...], "nextCursor": "..." | null }`.

## Cabeçalhos

- `X-Request-Id` em toda resposta (correlação com os logs).
- `X-Client: android` identifica o app e define a entrega do refresh token (corpo em vez de cookie).
- `Cache-Control: no-store` nas respostas que contêm tokens.

## Contrato

- Schemas Zod em `packages/shared` (Web + API) e nos `*.schema.ts` de cada módulo.
- OpenAPI gerado automaticamente em `/docs/json` (contrato do Android).
- Mudanças incompatíveis exigem nova versão (`/api/v2`). Campos novos são compatíveis: os clientes
  ignoram campos desconhecidos (Android: `ignoreUnknownKeys = true`).
