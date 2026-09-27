# ADR 0007 — JWT de curta duração + refresh token rotativo

- **Status:** aceito (FASE 0); **implementado na FASE 1**

## Decisão

- Senhas com **argon2id** (`@node-rs/argon2`, binários prontos, sem compilação nativa).
- **Access token**: JWT HS256, 15 minutos, payload mínimo `{ sub: userId }`, segredo em
  `JWT_SECRET` (somente variável de ambiente, ≥ 32 bytes aleatórios).
- **Refresh token**: valor opaco de 32 bytes, 30 dias. O banco guarda **somente o hash SHA-256**
  (`refresh_tokens`: `user_id`, `token_hash`, `family_id`, `expires_at`, `revoked_at`, `replaced_by`).
- **Rotação a cada uso**; reapresentar um refresh já rotacionado revoga **toda a família**
  (indício de roubo).
- Logout revoga a família da sessão atual.
- Web: access token em memória; refresh em cookie `httpOnly; Secure; SameSite`, `path=/api/v1/auth`.
- Android: refresh no corpo da resposta (`X-Client: android`), armazenado criptografado
  (DataStore + Android Keystore); `TokenAuthenticator` renova em 401 com mutex.
- Rate limit dedicado em `/auth/login` e `/auth/register`.

## Domínios (decidido após a FASE 0)

- Web e API usarão **domínio próprio**, no mesmo site: `app.<dominio>` (web) e `api.<dominio>` (API).
  Como são o mesmo site (mesmo domínio registrável), o cookie de refresh usa **`SameSite=Lax`**,
  host-only (sem atributo `Domain`, válido só para `api.<dominio>`), `Secure`, `httpOnly`,
  `path=/api/v1/auth`.
- A web chama a API com `credentials: 'include'`; `CORS_ORIGINS` = `https://app.<dominio>`.
- Defesa em profundidade: `/auth/refresh` e `/auth/logout` validam o cabeçalho `Origin`
  contra `CORS_ORIGINS`.
- Os subdomínios `*.up.railway.app` **não** são usados pelos clientes: estão na Public Suffix List,
  o que tornaria web e API sites diferentes e exigiria `SameSite=None`.

## Refinamentos na implementação (FASE 1)

- **Janela de concorrência de 30 s.** Rotação estrita derrubaria usuários legítimos: duas abas (ou
  duas requisições) renovando ao mesmo tempo apresentam o mesmo token. Dentro de 30 s após a
  rotação, reapresentar o token antigo responde `401` com `details.reason = "concurrent_rotation"`
  **sem** revogar nada; depois disso, é tratado como reuso (roubo) e a família é revogada.
  A rotação no banco é atômica (`UPDATE … WHERE revoked_at IS NULL` dentro de transação).
- **Web:** o cookie não é apagado quando o refresh falha (a aba que perde a corrida apagaria o cookie
  novo da outra). `refreshSession` é single-flight e só repete a chamada no caso `concurrent_rotation`.
- **Login com dois limites:** 20/min por IP (antes de ler o corpo) + 5/min por IP+e-mail. O segundo
  usa `createRateLimit()`: um segundo `app.rateLimit()` na mesma rota é ignorado silenciosamente pelo
  plugin (marca a requisição como já avaliada) — descoberto por teste.
- **Tempo de resposta:** e-mail inexistente ainda executa uma verificação argon2 contra um hash
  descartável, para não revelar quais e-mails estão cadastrados.
- **JWT:** `iss = fintrack-api`, `aud = fintrack`, algoritmo fixo `HS256` na verificação.
- **Segredo em desenvolvimento:** sem `JWT_SECRET` fora de produção, a API gera um segredo aleatório
  por execução (sessões caem no restart). Em produção a API não sobe sem ele.
- **Android:** o cliente autenticado usa um `Dispatcher` OkHttp próprio. O `TokenAuthenticator`
  bloqueia a thread da requisição durante o refresh; com o dispatcher compartilhado, 5+ requisições
  simultâneas recebendo 401 esgotavam as vagas por host e o refresh nunca executava (deadlock
  reproduzido em teste com 8 requisições concorrentes).
- **Android:** refresh token cifrado com AES-256-GCM, chave não exportável no Android Keystore,
  arquivo excluído de backup/transferência de dispositivo. Sem rede na abertura do app, a sessão
  salva é mantida e o app mostra "Sem conexão" com opção de tentar de novo.
