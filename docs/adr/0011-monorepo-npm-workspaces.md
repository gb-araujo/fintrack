# ADR 0011 — Monorepo com npm workspaces

- **Status:** aceito (FASE 0)

## Decisão

- Workspaces npm: `packages/shared`, `apps/api`, `apps/web`, com um único `package-lock.json`.
- `@fintrack/shared` é compilado (`tsc`) para `dist/`; os scripts da raiz compilam o shared antes de
  `dev`, `lint`, `typecheck` e `test`.
- O Android (`apps/android`) é um projeto Gradle independente, fora dos workspaces, mas no mesmo
  repositório, na mesma documentação e no mesmo CI.

## Consequências

- Nenhuma ferramenta extra (pnpm/turbo) para instalar; suportado nativamente pelo Railway e pelo CI.
- As imagens Docker usam a raiz como contexto e instalam apenas os workspaces necessários (`npm ci -w`).
