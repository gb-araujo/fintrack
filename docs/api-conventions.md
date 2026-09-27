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

## Painel (FASE 3)

`GET /api/v1/dashboard?until=AAAA-MM-DD` devolve, calculado pelo backend: `availableToSpend { amountCents,
components }`, `totalBalanceCents`, `investmentsCents`, `netWorthCents`, `month { incomeCents, expenseCents }`
(efetivadas; sem transferências), `pendingBills { count, totalCents, overdueCount, next[] }` e
`futureCommitments`. `until` anterior a hoje → `422`; data inválida → `400`. Novos componentes de fases
futuras são acrescentados sem quebrar clientes (campos desconhecidos são ignorados).

## Recorrências e orçamentos (FASE 4)

- **Recorrências** (`/recurring`): `POST` cria a regra (mensal exige `dayOfMonth`; valor fixo exige
  `amountCents`; `autoConfirm` só com valor fixo; conta de investimento → `422`). Regras não são
  apagadas: `POST /recurring/:id/deactivate|activate`. `GET /recurring/occurrences[?until=]` lista as
  **previsões** (atrasadas dos últimos 62 dias + próximas 60 dias por padrão), já sem as ocorrências
  confirmadas/puladas.
- **Confirmar** `POST /recurring/:id/occurrences/:date/confirm` (corpo opcional
  `{ amountCents, transactionDate }`) devolve `201` com o lançamento efetivado (`recurringId`
  preenchido); **pular** `POST …/skip` devolve `201` com o lançamento `cancelled`. Ocorrência
  inexistente na regra → `404`; já confirmada/pulada (inclusive em corrida) → `409`; data futura sem
  `transactionDate` até hoje → `422`.
- Toda requisição `GET` autenticada materializa recorrências com `autoConfirm` já vencidas (ADR 0016).
- **Orçamentos** (`/budgets`): `GET ?month=AAAA-MM` (padrão: mês atual no fuso do usuário) devolve
  `items[]` com `limitCents`, `spentCents`, `pendingCents`, `remainingCents`, `percentUsed`, `status`
  (`ok|warning|exceeded`), `totals` e `unbudgetedSpentCents`. `PUT /budgets` faz upsert por
  `(categoryId, month)`; `DELETE /budgets/:id` → `204`. Categoria de receita → `422`.

## Cartões (FASE 5)

- **Cartões** (`/credit-cards`): `POST` cadastra (limite > 0; dias de fechamento/vencimento 1–31;
  conta de pagamento opcional, banco/carteira). `GET` devolve `usedLimitCents`, `availableLimitCents`
  (pode ser negativo: a API não bloqueia) e a fatura aberta. Arquivar: `POST …/archive|unarchive`.
- **Compras**: `POST /credit-cards/:id/purchases` `{ description, purchaseDate (≤ hoje), totalAmountCents,
  installmentsCount (1–48), categoryId? }` devolve as parcelas já distribuídas nas faturas. Data futura,
  categoria de receita, valor menor que o nº de parcelas → `422`; cartão arquivado → `409`.
  `PATCH /purchases/:id` (só descrição/categoria); `POST /purchases/:id/cancel` (estorno, idempotente).
- **Faturas**: `GET /credit-cards/:id/invoices` (mais recente primeiro) e `GET /invoices/:id` (parcelas e
  pagamentos). Status `open|closed|paid` + `overdue`, calculados no backend.
- **Pagar**: `POST /invoices/:id/payments` `{ accountId, amountCents?, paymentDate? }` → `201` com a
  transação `card_payment` (`creditCardInvoiceId`). Mais que o em aberto, ou fatura sem saldo → `422`;
  conta de investimento → `422`; arquivada → `409`. Efetivar/cancelar: `/transactions/:id/complete|cancel`;
  editar → `409`.

## Importação de extratos (FASE 6)

- `POST /imports` `{ accountId, filename, content, delimiter?, mapping? }` (corpo até 4 MB) lê o CSV e
  devolve `201` com a importação **em revisão**: `rows[]` (valor positivo + `direction`, sugestão de tipo/
  categoria/conta/fatura, `duplicate { kind: exact|possible, transactionId }`, `defaultAction`),
  `detected` (delimitador, cabeçalhos, colunas usadas) e `ignoredRows[]` com o motivo. Não cria
  lançamentos. Colunas não reconhecidas → `422` com `details.headers` (envie `mapping`). Conta de
  investimento → `422`; arquivada → `409`; formato ≠ csv → `422`.
- `GET /imports`, `GET /imports/:id`; `POST /imports/:id/confirm` `{ decisions[] }` (linhas sem decisão
  seguem `defaultAction`) → `200` `{ imported, skipped, transfers, cardPayments, rulesSaved }`; qualquer
  linha inválida → `422` `Linha N: …` e **nada** é criado. Já confirmada/cancelada/desfeita → `409`.
  `POST /imports/:id/cancel` (só em revisão) e `POST /imports/:id/revert` (só confirmada; cancela o criado).
- `GET/POST /merchant-rules`, `DELETE /merchant-rules/:id`: regras "contém/começa com X → categoria ou
  conta" (texto normalizado; `POST` repetido atualiza, não duplica).
- `GET /invoices/payable`: faturas com valor a pagar de todos os cartões (para ligar um pagamento).

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
