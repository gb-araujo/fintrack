/**
 * Cores fixas por identidade (nunca por posição/rank). Receita/despesa reaproveitam o verde/vermelho
 * já usado em todo o app (valores com sinal — `amountTone`); patrimônio e caixa usam a marca e um tom
 * secundário fixo, também sem se repetir entre gráficos.
 */
export const SERIES_COLORS = {
  income: '#047857', // emerald-700 — igual ao valor positivo no resto do app
  expense: '#e11d48', // rose-600 — igual ao valor negativo no resto do app
  net: '#0f766e', // brand-700
  cash: '#0d9488', // brand-600
  investments: '#0284c7', // sky-600
} as const;
