# Deploy

A API e a web têm Dockerfiles próprios e usam a **raiz do monorepo** como contexto de build:

```bash
docker build -f apps/api/Dockerfile -t fintrack-api .
docker build -f apps/web/Dockerfile --build-arg VITE_API_URL=https://api.exemplo -t fintrack-web .
docker compose --profile full up -d --build   # PostgreSQL + API (imagem de produção; exige JWT_SECRET no .env)
```

`NODE_ENV=production` já vem definido na imagem da API. Em produção `/docs` fica desligado
(`API_DOCS_ENABLED=true` para habilitar) e os logs saem em JSON, sem dados financeiros. As migrations
rodam antes de cada deploy (`node dist/db/migrate.js`).

## Railway

1. Crie um projeto no Railway e conecte este repositório GitHub.
2. **PostgreSQL**: _New → Database → PostgreSQL_.
3. **Serviço `api`**:
   - _Settings → Config-as-code_: `apps/api/railway.json` (usa `apps/api/Dockerfile`, roda
     `node dist/db/migrate.js` como pre-deploy e usa `/health` como healthcheck).
   - Variáveis:

     | Variável       | Valor                                                                               |
     | -------------- | ----------------------------------------------------------------------------------- |
     | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (referência — rede privada)                            |
     | `CORS_ORIGINS` | `https://app.<dominio>` (domínio próprio da web)                                    |
     | `TRUST_PROXY`  | `true`                                                                              |
     | `APP_VERSION`  | opcional (ex.: SHA do commit)                                                       |
     | `JWT_SECRET`   | **obrigatório** — 48 bytes aleatórios (veja `.env.example`); a API não sobe sem ele |

4. **Serviço `web`**:
   - _Config-as-code_: `apps/web/railway.json` (usa `apps/web/Dockerfile`).
   - Variável `VITE_API_URL` = `https://api.<dominio>` (usada no build).

> Em serviços novos o Railway pode não permitir apontar o _Config-as-code_. Nesse caso, aplique
> manualmente nas configurações de cada serviço os valores de `apps/*/railway.json` (Dockerfile,
> pre-deploy, healthcheck e política de restart).

### Com domínio próprio (recomendado)

Em _Settings → Networking → Custom Domain_ de cada serviço, configure `app.<dominio>` no `web` e
`api.<dominio>` na `api`, e crie os registros CNAME indicados pelo Railway no seu provedor de DNS.
Depois ajuste `CORS_ORIGINS=https://app.<dominio>` na API e `VITE_API_URL=https://api.<dominio>` na
web. Web e API no mesmo site permitem o cookie de sessão com `SameSite=Lax`
([ADR 0007](adr/0007-autenticacao-jwt-refresh-rotativo.md)).

### Sem domínio próprio

Gere o domínio `*.up.railway.app` só no `web` e deixe `VITE_API_URL` vazio. O Caddy da web repassa
`/api/*` e `/health` para a API pela rede privada, na mesma origem (o cookie `SameSite=Lax` continua
funcionando). Variáveis extras:

| Serviço | Variável       | Valor                                                    |
| ------- | -------------- | -------------------------------------------------------- |
| `web`   | `API_UPSTREAM` | `http://${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}`   |
| `api`   | `HOST`         | `::` (a rede privada do Railway usa IPv6)                |
| `api`   | `PORT`         | `3333`                                                   |
| `api`   | `CORS_ORIGINS` | `https://${{web.RAILWAY_PUBLIC_DOMAIN}}`                 |

## Android (release)

```bash
cd apps/android
./gradlew assembleRelease -Pfintrack.apiBaseUrl=https://api.<dominio>/   # APK release (R8)
```
