import { KB_STORAGE_KEY } from "./constants";
import type { KBEntry, MovementKnowledgeBase } from "./kb-types";

const LOG = "[CSV-KB]";

function emptyKb(): MovementKnowledgeBase {
  return { version: 1, byNormalizedKey: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateKnowledgeBase(value: unknown): MovementKnowledgeBase | null {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.byNormalizedKey)) {
    return null;
  }

  const byNormalizedKey: MovementKnowledgeBase["byNormalizedKey"] = {};

  for (const [key, rawEntry] of Object.entries(value.byNormalizedKey)) {
    if (!key.trim() || !isRecord(rawEntry)) return null;

    byNormalizedKey[key] = {
      tipo_movimiento: String(rawEntry.tipo_movimiento ?? ""),
      concepto_1: String(rawEntry.concepto_1 ?? ""),
      concepto_2: String(rawEntry.concepto_2 ?? ""),
      concepto_3: String(rawEntry.concepto_3 ?? ""),
      originalMovimiento: String(rawEntry.originalMovimiento ?? ""),
    };
  }

  return { version: 1, byNormalizedKey };
}

export function loadKnowledgeBase(): MovementKnowledgeBase {
  if (typeof window === "undefined") return emptyKb();
  try {
    const raw = window.localStorage.getItem(KB_STORAGE_KEY);
    if (!raw) return emptyKb();
    const parsed = validateKnowledgeBase(JSON.parse(raw));
    if (!parsed) {
      console.warn(LOG, "KB en localStorage con formato inesperado; se reinicia objeto vacío.");
      return emptyKb();
    }
    return parsed;
  } catch (e) {
    console.warn(LOG, "No se pudo leer KB desde localStorage:", e);
    return emptyKb();
  }
}

export function saveKnowledgeBase(kb: MovementKnowledgeBase): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KB_STORAGE_KEY, JSON.stringify(kb));
  const n = Object.keys(kb.byNormalizedKey).length;
  console.log(LOG, "KB persistida. Registros únicos por clave normalizada:", n);
}

export type UpsertKbStats = {
  /** Claves que no estaban en la KB antes de este lote (primera aparición en archivo). */
  nuevas_claves: number;
  /** Sobrescrituras: ya existía en KB o es fila duplicada posterior en el mismo CSV. */
  sobrescrituras: number;
  /** Veces que se repitió la misma clave normalizada dentro del archivo importado. */
  duplicados_en_archivo: number;
};

export function upsertKbEntries(
  kb: MovementKnowledgeBase,
  entries: Array<{ normalizedKey: string; entry: KBEntry }>,
): UpsertKbStats {
  const beforeKeys = new Set(Object.keys(kb.byNormalizedKey));
  const seenInBatch = new Set<string>();

  let nuevas_claves = 0;
  let sobrescrituras = 0;
  let duplicados_en_archivo = 0;

  for (const { normalizedKey, entry } of entries) {
    if (!normalizedKey) continue;

    const dupInFile = seenInBatch.has(normalizedKey);
    if (dupInFile) duplicados_en_archivo += 1;
    seenInBatch.add(normalizedKey);

    const existedInKbBefore = beforeKeys.has(normalizedKey);
    kb.byNormalizedKey[normalizedKey] = entry;

    if (!existedInKbBefore && !dupInFile) nuevas_claves += 1;
    else sobrescrituras += 1;

    if (!existedInKbBefore) beforeKeys.add(normalizedKey);
  }

  return { nuevas_claves, sobrescrituras, duplicados_en_archivo };
}
