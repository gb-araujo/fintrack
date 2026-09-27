/**
 * Divide o valor de uma compra em parcelas, em centavos inteiros (sem ponto flutuante).
 * A soma das parcelas é SEMPRE o total; o resto dos centavos vai na PRIMEIRA parcela:
 * R$ 100,00 em 3x = 33,34 + 33,33 + 33,33 (docs/financial-rules.md §3).
 */
export function splitInstallments(totalCents: number, count: number): number[] {
  if (!Number.isInteger(totalCents) || totalCents <= 0) {
    throw new RangeError('O valor total deve ser um inteiro positivo em centavos.');
  }
  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError('O número de parcelas deve ser um inteiro maior que zero.');
  }
  if (totalCents < count) {
    throw new RangeError('Cada parcela precisa ter ao menos 1 centavo.');
  }
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;
  return Array.from({ length: count }, (_, index) => (index === 0 ? base + remainder : base));
}
