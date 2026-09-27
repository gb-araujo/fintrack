import { createHash, randomBytes } from 'node:crypto';

/** 32 bytes aleatórios (256 bits) em base64url: impossível de adivinhar, seguro em URL/cookie. */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * SHA-256 do refresh token. Como o token já tem 256 bits de entropia, um hash rápido e sem salt
 * é suficiente (não há o que atacar por dicionário) e permite a busca direta por índice.
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}
