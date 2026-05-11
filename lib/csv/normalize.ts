/**
 * Normalización determinista para matching (sin heurísticas de negocio):
 * lowercase, sin acentos, sin símbolos especiales, espacios colapsados, trim.
 */
export function normalizeMovement(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const noAccents = stripCombiningMarks(trimmed.normalize("NFD"));
  const lower = noAccents.toLowerCase();
  const lettersNumbersSpace = lower.replace(/[^a-z0-9\s]/g, " ");
  const collapsed = lettersNumbersSpace.replace(/\s+/g, " ").trim();
  return collapsed;
}

function stripCombiningMarks(s: string): string {
  return s.replace(/\p{M}/gu, "");
}
