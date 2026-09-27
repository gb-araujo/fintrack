/**
 * Regras de comerciante PADRÃO (valem para todo usuário, depois das regras dele). Comparam com a
 * descrição normalizada por PALAVRA INTEIRA ("VIVO" não casa com "OBJETIVO"). A categoria é
 * procurada pelo NOME entre as categorias do usuário; se ele a renomeou/arquivou, nada é sugerido.
 */
export interface DefaultRule {
  /** Texto normalizado (maiúsculas, sem acentos). */
  pattern: string;
  categoryName: string;
  /** Sentido do dinheiro em que a regra vale. */
  direction: 'in' | 'out';
}

export const DEFAULT_MERCHANT_RULES: readonly DefaultRule[] = [
  // Contas de consumo
  { pattern: 'TELEFONICA BRAS', categoryName: 'Internet', direction: 'out' },
  { pattern: 'VIVO FIBRA', categoryName: 'Internet', direction: 'out' },
  { pattern: 'TIM S A', categoryName: 'Celular', direction: 'out' },
  { pattern: 'SABESP', categoryName: 'Água', direction: 'out' },
  { pattern: 'ENEL', categoryName: 'Energia', direction: 'out' },
  { pattern: 'CPFL', categoryName: 'Energia', direction: 'out' },
  { pattern: 'CEMIG', categoryName: 'Energia', direction: 'out' },
  { pattern: 'COPEL', categoryName: 'Energia', direction: 'out' },
  // Assinaturas
  { pattern: 'NETFLIX', categoryName: 'Assinaturas', direction: 'out' },
  { pattern: 'SPOTIFY', categoryName: 'Assinaturas', direction: 'out' },
  { pattern: 'YOUTUBE PREMIUM', categoryName: 'Assinaturas', direction: 'out' },
  { pattern: 'DISNEY PLUS', categoryName: 'Assinaturas', direction: 'out' },
  { pattern: 'AMAZON PRIME', categoryName: 'Assinaturas', direction: 'out' },
  { pattern: 'HBO MAX', categoryName: 'Assinaturas', direction: 'out' },
  // Transporte e alimentação
  { pattern: 'UBER', categoryName: 'Transporte', direction: 'out' },
  { pattern: '99 APP', categoryName: 'Transporte', direction: 'out' },
  { pattern: '99POP', categoryName: 'Transporte', direction: 'out' },
  { pattern: 'IFOOD', categoryName: 'Alimentação', direction: 'out' },
  { pattern: 'RAPPI', categoryName: 'Alimentação', direction: 'out' },
  // Saúde
  { pattern: 'DROGASIL', categoryName: 'Saúde', direction: 'out' },
  { pattern: 'DROGARIA', categoryName: 'Saúde', direction: 'out' },
  // Receitas
  { pattern: 'SALARIO', categoryName: 'Salário', direction: 'in' },
  { pattern: 'PAGAMENTO DE SALARIO', categoryName: 'Salário', direction: 'in' },
];

/** Descrições típicas de pagamento de fatura de cartão (já normalizadas). */
export const CARD_PAYMENT_PATTERNS: readonly RegExp[] = [
  /\b(PAGAMENTO|PGTO|PAGTO|PAG)\b.*\bFATURA\b/,
  /\bFATURA\b.*\b(CARTAO|CREDITO)\b/,
  /\bPAGAMENTO\b.*\bCARTAO\b.*\bCREDITO\b/,
  /\bPGTO\b.*\bCARTAO\b/,
];
