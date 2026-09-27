/**
 * Rendimento (ADR 0020). Função PURA: nunca lê o banco, só recebe os números já apurados.
 *
 * rendimento(A → B) = saldo em B − saldo em A − aportes líquidos entre A e B (exclusive A, inclusive B)
 *
 * Isto é o que sobra depois de descontar tudo que o USUÁRIO colocou ou tirou — só o que o mercado
 * rendeu (ou perdeu). É uma rentabilidade SIMPLES (não considera o efeito do tempo dentro do
 * intervalo, como TWR/XIRR fariam): correta para o valor em reais, uma aproximação no percentual
 * quando há aportes grandes no meio do intervalo — documentado no ADR como limitação conhecida.
 */
export interface YieldResult {
  yieldCents: number;
  /** Percentual sobre o saldo inicial; null se o saldo inicial for 0 (não dá para calcular %). */
  yieldPercent: number | null;
}

export function computeYield(
  startBalanceCents: number,
  endBalanceCents: number,
  netContributedCents: number,
): YieldResult {
  const yieldCents = endBalanceCents - startBalanceCents - netContributedCents;
  return {
    yieldCents,
    yieldPercent:
      startBalanceCents !== 0 ? Math.round((yieldCents * 10_000) / startBalanceCents) / 100 : null,
  };
}
