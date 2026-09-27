/**
 * Lê o arquivo do extrato como texto. Bancos brasileiros exportam ora UTF-8, ora Windows-1252
 * (acentos "quebrados" se lidos como UTF-8): tenta UTF-8 estrito e, se falhar, usa Windows-1252.
 */
export async function readStatementFile(file: Blob): Promise<string> {
  const bytes = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}
