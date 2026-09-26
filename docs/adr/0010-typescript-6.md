# ADR 0010 — TypeScript 6.0 (não 7.0)

- **Status:** aceito (FASE 0)

## Contexto

A versão mais recente do TypeScript é a 7.0 (compilador nativo), mas o `typescript-eslint` 8.x,
necessário para o lint com informação de tipos, declara suporte a `typescript >=4.8.4 <6.1.0`.

## Decisão

Fixar `typescript ~6.0.3` em todo o monorepo. Reavaliar quando o `typescript-eslint` suportar a 7.x.

## Consequências

- Lint type-aware (`recommendedTypeChecked`) funcionando.
- No TS 6, `types` precisa ser explícito em cada `tsconfig` (ex.: `"types": ["node"]`).
