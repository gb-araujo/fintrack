# ADR 0001 — Dinheiro em centavos inteiros

- **Status:** aceito (FASE 0)

## Contexto

Ponto flutuante não representa valores decimais com exatidão (`0.1 + 0.2 !== 0.3`;
`0.29 * 100 === 28.999999999999996`). Em um sistema cujo princípio é a confiabilidade financeira,
um centavo perdido em somas é um defeito.

## Decisão

- Todo valor monetário é um **inteiro em centavos**: `bigint` no PostgreSQL (colunas `*_cents`),
  `number` inteiro em TypeScript (validado com `Number.isSafeInteger`, limite ≈ R$ 90 trilhões),
  `Long` em Kotlin. Campos da API usam o sufixo `Cents`.
- Valores são sempre **não negativos**; o sentido vem do tipo da movimentação.
- A conversão de texto digitado para centavos é feita sem aritmética de ponto flutuante
  (`parseBRLToCents` em `packages/shared`). A formatação (`formatBRL`) é apenas visual.
- Moeda única no MVP: BRL (`users.currency` preparado para o futuro).

## Consequências

- Somas e comparações são exatas. Divisões (parcelas, rateios) precisam de regra explícita para o
  resto (resto na 1ª parcela — ver `financial-rules.md`).
- O Drizzle deve mapear `bigint` em modo `number`, com validação de faixa na borda da API.
