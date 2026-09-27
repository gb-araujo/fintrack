# Arquitetura do FINTRACK

> Status: **FASE 1 concluída** (autenticação + banco + API básica). Contas, categorias e transações
> entram na FASE 2. Este documento é atualizado ao fim de cada fase.

## 1. Visão geral

```
 Web (React/Vite) ─┐
                   ├── HTTPS/JSON ──> API Fastify (/health, /api/v1/*)
 Android (Compose)─┘                     │
                                         ├─ controller  → valida entrada/saída (Zod), extrai userId do JWT
                                         ├─ service     → regras de negócio, transações SQL
                                         ├─ domain      → funções puras (cálculos financeiros), 100% testadas
                                         └─ repository  → único ponto com SQL (Drizzle), sempre filtra por userId
                                                   │
                                              PostgreSQL
```

Princípios:

- **O backend é a fonte da verdade.** Web e Android só formatam valores; nenhum cálculo financeiro
  relevante acontece nos clientes.
- **Nenhuma movimentação é contada duas vezes.** Cada evento financeiro é reconhecido em um único
  lugar — ver [financial-rules.md](./financial-rules.md).
- **Web e Android nunca acessam o PostgreSQL.** Toda comunicação passa pela API REST.
- **Isolamento por usuário:** o `userId` vem sempre do token (nunca do corpo/query) e toda tabela
  financeira tem `user_id`, com FKs compostas impedindo referências entre usuários.

## 2. Monorepo

```
fintrack/
├── apps/
│   ├── api/        Fastify + Drizzle + Zod (Node 24, TypeScript)
│   ├── web/        Vite + React 19 + Tailwind 4 + React Router + TanStack Query
│   └── android/    Kotlin + Jetpack Compose (projeto Gradle independente)
├── packages/
│   └── shared/     Schemas Zod, enums e utilitários de dinheiro (API + Web)
├── database/
│   ├── migrations/ SQL gerado pelo drizzle-kit (versionado)
│   ├── seeds/      dados de exemplo para desenvolvimento
│   └── init/       scripts do container PostgreSQL local (cria fintrack_test)
├── docs/           arquitetura, regras financeiras, convenções, ADRs
└── .github/workflows/ci.yml
```

- **npm workspaces**: `packages/shared`, `apps/api`, `apps/web`. O Android fica fora dos workspaces
  (Gradle próprio), mas no mesmo repositório e no mesmo CI.
- `@fintrack/shared` é compilado para `dist/` (os scripts da raiz o compilam antes de lint/test/dev).
  O Android não consome TypeScript: segue o contrato OpenAPI gerado pela API.

### API (`apps/api/src`)

| Pasta | Conteúdo |
|---|---|
| `config/` | `env.ts` — variáveis de ambiente validadas com Zod no boot (a API não sobe com config inválida). |
| `plugins/` | `error-handler` (envelope de erro único), `security` (helmet, CORS, rate limit), `docs` (OpenAPI), `logger` (redação de dados sensíveis). |
| `db/` | `client.ts` (postgres.js + Drizzle), `schema/` (tabelas), `migrate.ts`, `seed.ts`. |
| `modules/<módulo>/` | `*.controller.ts`, `*.service.ts`, `*.repository.ts`, `*.schema.ts`, `*.types.ts`, `domain/`. Na FASE 0 só existe `health`. |
| `shared/` | `errors/` (`AppError`, `NotFoundError`, …), `types/`, `utils/`. |
| `app.ts` | `buildApp({ config, database })` — monta a aplicação sem abrir porta (usado pelos testes via `app.inject`). |
| `server.ts` | Boot, `listen`, encerramento gracioso (SIGTERM do Railway). |

### Web (`apps/web/src`)

`components/` (layout: sidebar no desktop, bottom navigation no mobile), `features/<área>/`,
`hooks/`, `lib/` (env, QueryClient), `pages/`, `routes/`, `services/` (`http.ts`: cliente único,
valida toda resposta com Zod), `types/`.

### Android (`apps/android/app/src/main/java/com/fintrack/app`)

MVVM: `presentation/<tela>/` (ViewModel + `StateFlow<UiState>` + Composables) → `domain/usecases`
→ `domain/repositories` (interfaces) ← `data/repositories` (implementações) → `data/api` (Retrofit).
`core/` contém rede (OkHttp/Retrofit/kotlinx.serialization), navegação, tema, utils e o
`AppContainer` (injeção de dependências manual — migrável para Hilt quando crescer).

## 3. Contrato da API

Ver [api-conventions.md](./api-conventions.md). Resumo: REST/JSON em `/api/v1`, camelCase, dinheiro
em **centavos inteiros** (`amountCents`), datas ISO, erros no envelope
`{ "error": { "code", "message", "details?" } }`, OpenAPI em `/docs` (desligado em produção).

Endpoints existentes (FASE 1):

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| GET | `/health` | — | Status da API e do banco. `200` ok · `503` degradado (mesmo corpo). Sem rate limit. |
| POST | `/api/v1/auth/register` | — | Cria a conta e inicia a sessão (`201`). 5/min por IP. |
| POST | `/api/v1/auth/login` | — | Login. 20/min por IP + 5/min por IP+e-mail. Erro sempre genérico. |
| POST | `/api/v1/auth/refresh` | refresh token | Rotaciona o refresh token e emite novo access token. 30/min por IP. |
| POST | `/api/v1/auth/logout` | refresh token | Revoga a sessão (família). Idempotente (`204`). |
| GET | `/api/v1/users/me` | Bearer | Usuário autenticado. |
| GET | `/docs`, `/docs/json` | — | Swagger UI e OpenAPI (apenas fora de produção, ou com `API_DOCS_ENABLED=true`). |

## 4. Como Web e Android consomem a API

- **Web**: `services/http.ts` (`apiRequest`) → hooks TanStack Query por feature. Em desenvolvimento
  o Vite faz proxy de `/api` e `/health` para `localhost:3333` (mesma origem: sem CORS e sem cookie
  cross-site). Em produção usa `VITE_API_URL`.
- **Android**: Retrofit + OkHttp + kotlinx.serialization. `BASE_URL` por build type (`BuildConfig`):
  - debug: `http://localhost:3333/` com `adb reverse tcp:3333 tcp:3333` (ver ADR 0009);
  - release: `fintrack.apiBaseUrl` (HTTPS obrigatório — tráfego em claro é bloqueado).
  - Dois clientes OkHttp sobre o mesmo pool: **público** (health/auth) e **autenticado**
    (`AuthInterceptor` com Bearer + `TokenAuthenticator` que renova em 401). O autenticado tem
    `Dispatcher` próprio: com um dispatcher compartilhado, 5+ requisições simultâneas recebendo 401
    ocupariam todas as vagas por host e o refresh nunca executaria (deadlock encontrado e coberto
    por teste na FASE 1).
  - Todas as requisições enviam `X-Client: android` (refresh token no corpo, não em cookie).

## 5. Autenticação (implementada na FASE 1)

Ver [ADR 0007](./adr/0007-autenticacao-jwt-refresh-rotativo.md).

- Senha com **argon2id**. Access token **JWT HS256 de 15 min** (`sub = userId`).
- Refresh token **opaco**, 30 dias, apenas o **hash SHA-256** no banco (`refresh_tokens`),
  **rotação a cada uso** com detecção de reuso (reuso revoga a família inteira).
- Web: access em memória, refresh em cookie `httpOnly; Secure; SameSite=Lax`, `path=/api/v1/auth`.
- **Domínio próprio** (decidido): web em `app.<dominio>` e API em `api.<dominio>` — mesmo site,
  o que permite `SameSite=Lax`. Os domínios `*.up.railway.app` não são usados pelos clientes.
- Android: refresh no corpo da resposta, guardado criptografado (DataStore + Android Keystore).
- Rate limit mais rígido em `/auth/login` e `/auth/register`.
- **Janela de concorrência (30 s):** reapresentar um refresh token recém-rotacionado (duas abas, duas
  requisições simultâneas) responde `401` com `details.reason = "concurrent_rotation"` **sem**
  revogar a sessão; o cliente tenta de novo com o token atual. Após a janela, é tratado como roubo
  e a família inteira é revogada.
- `userId` vem **somente** do token: o hook `app.authenticate` preenche `request.userId` (JWT HS256
  com `iss`/`aud` verificados e algoritmo fixo — `none` e tokens de outro segredo são rejeitados).

| Cliente | Access token | Refresh token | Renovação |
|---|---|---|---|
| Web | memória (`lib/session.ts`) | cookie `fintrack_refresh` httpOnly (inacessível a JS) | `apiRequest` renova 1x em 401; `refreshSession` single-flight; recarregar a página restaura via cookie |
| Android | memória (`SessionManager`) | DataStore cifrado com AES-256-GCM (chave no Android Keystore), excluído de backup | `TokenAuthenticator` + `Mutex`: N requisições com 401 → 1 refresh |

A navegação dos dois clientes é guiada pelo estado da sessão: sem sessão → login; sessão expirada em
qualquer requisição → volta ao login automaticamente.

## 6. Segurança

| Item | Implementação |
|---|---|
| Validação | Zod em env, entrada e saída das rotas (`fastify-type-provider-zod`). |
| Erros | Handler central; erros inesperados viram `500 INTERNAL_ERROR` sem detalhes internos. |
| Cabeçalhos | `@fastify/helmet`; CSP `default-src 'none'` para a API em produção. |
| CORS | Apenas origens de `CORS_ORIGINS`, com `credentials`. |
| Rate limiting | Global (`RATE_LIMIT_MAX`/`RATE_LIMIT_WINDOW`); `/health` isento. |
| Logs | pino com `redact` (authorization, cookie, senhas, tokens, valores, descrições, e-mail) e sem query string. |
| Segredos | Somente variáveis de ambiente; `.env` no `.gitignore`; mensagens de erro de env não exibem valores. |
| Container | Imagem multi-stage, só dependências de produção, usuário `node` (não-root), HEALTHCHECK. |
| Android | Release só HTTPS (network security config); log HTTP só em debug e sem corpo. |
| Senhas | argon2id (m=19 MiB, t=2, p=1); 8–128 caracteres; verificação "dummy" quando o e-mail não existe (tempo de resposta não revela cadastro). |
| CSRF | Refresh/logout via cookie exigem `Origin` presente em `CORS_ORIGINS` (além de `SameSite=Lax`). |

## 7. Banco de dados

PostgreSQL 17, Drizzle ORM, migrations SQL versionadas em `database/migrations`.

- `0000_init_extensions` (FASE 0): extensão `citext`.
- `0001_auth_users_refresh_tokens` (FASE 1): `users` (e-mail `citext` UNIQUE, CHECKs de nome e
  moeda) e `refresh_tokens` (hash SHA-256 UNIQUE, família, expiração, revogação, substituto; FK com
  `ON DELETE CASCADE`).
- Schema aprovado (✅ = criado):

| Tabela | Fase | Observações |
|---|---|---|
| `users` ✅, `refresh_tokens` ✅ | 1 | e-mail `citext` único; tokens só como hash |
| `accounts`, `categories`, `transactions`, `transfers` | 2 | transferência = cabeçalho + 2 transações vinculadas |
| `recurring_transactions` | 4 | geram ocorrências **virtuais** até a confirmação |
| `budgets` | 4 | `UNIQUE(user_id, category_id, month)` |
| `credit_cards`, `credit_card_invoices`, `credit_card_transactions`, `credit_card_installments` | 5 | parcelas no período da fatura; pagamento = `card_payment` |
| `imports`, `imported_transactions`, `merchant_rules` | 6 | fingerprint para duplicidade |
| `investments` | 8 | representação de rendimentos a decidir na FASE 8 |

Convenções: `id uuid` (`gen_random_uuid()`), `created_at`/`updated_at timestamptz`, dinheiro em
`*_cents bigint CHECK (>= 0)`, datas de movimentação em `date`, `archived_at` em cadastros (nunca
apagar histórico financeiro), FKs compostas `(id, user_id)`.

## 8. Deploy (Railway)

Três serviços no mesmo projeto Railway:

1. **Postgres** — plugin gerenciado.
2. **api** — `apps/api/Dockerfile` (contexto = raiz). Config em `apps/api/railway.json`:
   `preDeployCommand: node dist/db/migrate.js` (migrations antes de cada deploy) e
   `healthcheckPath: /health`. Variáveis: `DATABASE_URL=${{Postgres.DATABASE_URL}}`,
   `CORS_ORIGINS`, `TRUST_PROXY=true`, `NODE_ENV=production` (já na imagem) e, a partir da FASE 1,
   `JWT_SECRET`.
3. **web** — `apps/web/Dockerfile` (build Vite + Caddy). `VITE_API_URL` como build arg.
   Config em `apps/web/railway.json`.

Passo a passo no [README](../README.md#deploy-no-railway).

## 9. Versões (setembro/2026)

| Componente | Versão |
|---|---|
| Node.js / npm | 24 / 11 |
| TypeScript | 6.0 (ver [ADR 0010](./adr/0010-typescript-6.md)) |
| Fastify / Zod / Drizzle ORM | 5.12 / 4.6 / 0.45 |
| React / Vite / Tailwind / React Router / TanStack Query | 19.3 / 8.3 / 4.3 / 8.4 / 5.104 |
| Vitest / ESLint | 5.0 / 10.11 |
| PostgreSQL | 17 |
| Kotlin / AGP / Gradle | 2.4.20 / 9.4.1 / 9.8.0 |
| Android compileSdk / targetSdk / minSdk | 37 / 37 / 26 |
| Compose BOM / Retrofit / OkHttp | 2026.09.00 / 3.0.0 / 5.5.0 |
| Autenticação (API) | @fastify/jwt 10.2 · @fastify/cookie 11.1 · @node-rs/argon2 2.2 |
| Autenticação (Android) | DataStore Preferences 1.2.1 · Android Keystore (AES-256-GCM) |
