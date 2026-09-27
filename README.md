# FINTRACK

Sistema de controle financeiro pessoal — **Web + Android + API REST + PostgreSQL** — para responder:

> **"Quanto dinheiro eu realmente posso gastar?"**

Considerando saldo, receitas e despesas futuras, contas recorrentes, cartão de crédito, parcelas,
investimentos, transferências e orçamento — sem contar nenhuma movimentação duas vezes.

## Status

| Fase | Escopo | Status |
|---|---|---|
| 0 | Arquitetura e setup | ✅ concluída |
| 1 | Autenticação + banco + API básica | ✅ concluída |
| 2 | Contas + categorias + transações | ✅ concluída |
| 3 | Dashboard + cálculo de dinheiro disponível | ✅ concluída |
| 4 | Recorrências + orçamento | ✅ concluída |
| 5 | Cartão + faturas + parcelas | ✅ concluída |
| 6 | Importação CSV | ✅ concluída |
| 7 | Relatórios | ✅ concluída |
| 8 | Investimentos | — |
| 9 | Melhorias e automações | — |

## Documentação

- [Arquitetura](docs/architecture.md) — camadas, monorepo, segurança, schema planejado, deploy
- [Regras financeiras](docs/financial-rules.md) — o que entra (e o que não entra) em cada cálculo
- [Convenções da API](docs/api-conventions.md) — formatos, erros, paginação, autenticação
- [ADRs](docs/adr/README.md) — decisões arquiteturais registradas

## Stack

| Parte | Tecnologias |
|---|---|
| API (`apps/api`) | Node 24, TypeScript 6, Fastify 5, Zod 4, Drizzle ORM, PostgreSQL 17, Vitest |
| Web (`apps/web`) | Vite 8, React 19, TypeScript, Tailwind CSS 4, React Router, TanStack Query, Zod, Vitest |
| Android (`apps/android`) | Kotlin 2.4, Jetpack Compose, Coroutines, Retrofit 3, OkHttp 5, JUnit (compile/target SDK 37, min 26) |
| Compartilhado (`packages/shared`) | Schemas Zod, enums e utilitários de dinheiro usados por API e Web |
| Infra | Docker, docker compose, Railway, GitHub Actions |

```
fintrack/
├── apps/{api,web,android}
├── packages/shared
├── database/{migrations,seeds,init}
├── docs/
├── docker-compose.yml
└── package.json          # npm workspaces
```

## Pré-requisitos

- **Node.js 24** e npm 11 (`.nvmrc`)
- **Docker** (PostgreSQL local)
- Android: **JDK 17** e Android SDK (Android Studio), com a plataforma 37 instalada

## Desenvolvimento local

```bash
# 1. Dependências (todos os workspaces)
npm install

# 2. Variáveis de ambiente (credenciais locais de desenvolvimento apenas)
cp .env.example .env
#    Recomendado: preencha JWT_SECRET no .env (sem ele, as sessões caem a cada restart da API)
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"

# 3. PostgreSQL local (cria também o banco fintrack_test)
npm run db:up                  # = docker compose up -d db

# 4. Migrations e seeds
npm run db:migrate
npm run db:seed

# 5. API (http://localhost:3333) + Web (http://localhost:5173)
npm run dev                    # ou: npm run dev:api / npm run dev:web
```

- Web: <http://localhost:5173> → entre com o usuário de demonstração criado pelo seed (`demo@fintrack.dev` / `demo-fintrack-123`) ou use **Criar conta**.
- Status da API: <http://localhost:3333/health>
- Documentação OpenAPI (dev): <http://localhost:3333/docs>
- Em desenvolvimento a web chama a API pela mesma origem (proxy do Vite para `/api` e `/health`),
  então o cookie de sessão funciona sem configuração de CORS.

O sistema funciona inteiramente local, sem Railway.

### PostgreSQL local

| Item | Valor padrão |
|---|---|
| Host / porta | `localhost:5432` (`POSTGRES_PORT` para mudar) |
| Usuário / senha | `fintrack` / `fintrack` |
| Bancos | `fintrack` (desenvolvimento), `fintrack_test` (testes de integração) |

```bash
docker compose exec db psql -U fintrack -d fintrack   # console SQL
npm run db:down                                        # para os containers (dados preservados no volume)
docker compose down -v                                 # remove também os dados
```

### Migrations

O schema fica em `apps/api/src/db/schema`; as migrations SQL geradas vão para `database/migrations`
(versionadas).

```bash
npm run db:generate    # gera migration a partir de mudanças no schema (drizzle-kit)
npm run db:migrate     # aplica migrations pendentes (idempotente)
```

Em produção as migrations rodam automaticamente antes de cada deploy (Railway `preDeployCommand`).

### Seeds

`npm run db:seed` — cria o usuário `demo@fintrack.dev` (senha `demo-fintrack-123`) com 4 contas, categorias, lançamentos e transferências de exemplo, usando os mesmos services da API. Idempotente; recusa rodar em produção.
Ver [database/seeds/README.md](database/seeds/README.md).

## Qualidade

```bash
npm run lint           # ESLint (type-aware) em shared, api e web
npm run typecheck      # tsc --noEmit
npm run format:check   # Prettier (npm run format para corrigir)
npm test               # Vitest em shared, api e web
npm run build          # build de shared, api e web
```

Testes de integração da API com PostgreSQL real rodam quando `TEST_DATABASE_URL` está definido:

```bash
TEST_DATABASE_URL=postgres://fintrack:fintrack@localhost:5432/fintrack_test npm test -w @fintrack/api
```

## Android

Projeto Gradle independente em `apps/android` (abra essa pasta no Android Studio).

```bash
cd apps/android
./gradlew testDebugUnitTest     # testes JUnit (ViewModels, UseCases, repositório com MockWebServer)
./gradlew lintDebug             # Android lint
./gradlew assembleDebug         # APK debug
./gradlew assembleRelease -Pfintrack.apiBaseUrl=https://sua-api.exemplo/   # APK release (R8)
```

**Conectar o app à API local** (emulador ou celular via USB):

```bash
npm run dev:api                     # na raiz do monorepo
adb reverse tcp:3333 tcp:3333       # repita sempre que o dispositivo reconectar
```

O build debug usa `http://localhost:3333/`. Não use `10.0.2.2`: no Android 17 (targetSdk 37) o acesso
a IPs de rede local exige uma permissão de runtime — ver [ADR 0009](docs/adr/0009-android-dev-adb-reverse.md).

Teste de ponta a ponta contra a API real:

```bash
# health + fluxo completo de autenticação (cadastro, /me, rotação, logout, login) contra a API real
FINTRACK_LIVE_API_URL=http://localhost:3333/ ./gradlew testDebugUnitTest --tests "*HealthLiveApiTest*"
```

## Docker

```bash
docker build -f apps/api/Dockerfile -t fintrack-api .                                   # API (produção)
docker build -f apps/web/Dockerfile --build-arg VITE_API_URL=https://api.exemplo -t fintrack-web .
docker compose --profile full up -d --build   # PostgreSQL + API (imagem de produção; exige JWT_SECRET no .env)
```

Ambos os Dockerfiles usam a **raiz do monorepo** como contexto.

## Deploy no Railway

1. Crie um projeto no Railway e conecte este repositório GitHub.
2. **PostgreSQL**: *New → Database → PostgreSQL*.
3. **Serviço `api`**:
   - *Settings → Config-as-code*: `apps/api/railway.json` (usa `apps/api/Dockerfile`, roda
     `node dist/db/migrate.js` como pre-deploy e usa `/health` como healthcheck).
   - Variáveis:

     | Variável | Valor |
     |---|---|
     | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (referência — rede privada) |
     | `CORS_ORIGINS` | `https://app.<dominio>` (domínio próprio da web) |
     | `TRUST_PROXY` | `true` |
     | `APP_VERSION` | opcional (ex.: SHA do commit) |
     | `JWT_SECRET` | **obrigatório** — 48 bytes aleatórios (comando acima); a API não sobe sem ele |

4. **Serviço `web`**:
   - *Config-as-code*: `apps/web/railway.json` (usa `apps/web/Dockerfile`).
   - Variável `VITE_API_URL` = `https://api.<dominio>` (usada no build).
5. **Domínio próprio** (decidido): *Settings → Networking → Custom Domain* em cada serviço —
   `app.<dominio>` no `web` e `api.<dominio>` na `api` — e crie os registros CNAME indicados pelo
   Railway no seu provedor de DNS. Depois ajuste `CORS_ORIGINS=https://app.<dominio>` na API e
   `VITE_API_URL=https://api.<dominio>` na web. Web e API no mesmo site permitem o cookie de sessão
   com `SameSite=Lax` ([ADR 0007](docs/adr/0007-autenticacao-jwt-refresh-rotativo.md)).

`NODE_ENV=production` já vem definido na imagem. Em produção `/docs` fica desligado
(`API_DOCS_ENABLED=true` para habilitar) e os logs saem em JSON, sem dados financeiros.

## Variáveis de ambiente

Todas documentadas em [.env.example](.env.example). A API valida as variáveis no boot e não sobe
se alguma estiver inválida. **Nunca** coloque credenciais no código ou no git.

## CI

`.github/workflows/ci.yml` executa em push/PR para `main`:

- **API + Web + Shared**: `npm ci`, format check, lint, typecheck, migrations em PostgreSQL de
  serviço, testes (incluindo integração) e build;
- **Imagens Docker**: build de `apps/api` e `apps/web`;
- **Android**: `testDebugUnitTest`, `lintDebug` e `assembleDebug`.
