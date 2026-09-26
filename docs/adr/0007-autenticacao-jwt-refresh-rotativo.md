# ADR 0007 — JWT de curta duração + refresh token rotativo

- **Status:** aceito (FASE 0); implementação na FASE 1

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
