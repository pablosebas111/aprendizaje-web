import { normalizeMovement } from "./normalize";
import { similarityRatio } from "./similarity";
import type { KBEntry, MovementKnowledgeBase, MovementMatchResult } from "./kb-types";

const LOG = "[CSV-KB]";

/** Longitud mínima de la subcadena más corta en match parcial (reduce ruido). */
const MIN_PARTIAL_SUBSTRING_LEN = 5;
/** Umbral de similitud (ratio Levenshtein normalizado) cuando no hay exact ni parcial. */
const SIMILARITY_THRESHOLD = 0.82;

function entryToResult(
  e: KBEntry,
  kind: MovementMatchResult["matchKind"],
  score: number | null,
  matchedNormalizedKey: string,
): MovementMatchResult {
  return {
    matched: true,
    concepto_1: e.concepto_1 || null,
    concepto_2: e.concepto_2 || null,
    concepto_3: e.concepto_3 || null,
    matchKind: kind,
    score,
    matchedNormalizedKey,
    noMatchReason: null,
  };
}

/**
 * Busca en la KB por: exact → parcial (subcadena) → similitud ≥ umbral.
 * Registra trazas en consola para depuración.
 */
export function matchMovementAgainstKb(
  movimientoRaw: string,
  kb: MovementKnowledgeBase,
): MovementMatchResult {
  const norm = normalizeMovement(movimientoRaw);
  console.log(
    LOG,
    "matchMovementAgainstKb: raw=",
    JSON.stringify(movimientoRaw),
    "→ normalizado=",
    JSON.stringify(norm),
  );

  if (!norm) {
    const reason =
      "NO MATCH: MOVIMIENTO vacío o queda vacío tras normalizar (trim / solo símbolos).";
    console.log(LOG, reason);
    return {
      matched: false,
      concepto_1: null,
      concepto_2: null,
      concepto_3: null,
      matchKind: null,
      score: null,
      matchedNormalizedKey: null,
      noMatchReason: reason,
    };
  }

  const keys = Object.keys(kb.byNormalizedKey);
  if (keys.length === 0) {
    const reason = "NO MATCH: knowledge base vacía (0 claves en memoria histórica).";
    console.log(LOG, reason);
    return {
      matched: false,
      concepto_1: null,
      concepto_2: null,
      concepto_3: null,
      matchKind: null,
      score: null,
      matchedNormalizedKey: null,
      noMatchReason: reason,
    };
  }

  const exact = kb.byNormalizedKey[norm];
  if (exact) {
    console.log(LOG, "MATCH exact:", { normalizedKey: norm, score: 1 });
    return entryToResult(exact, "exact", 1, norm);
  }

  type PartialCand = { key: string; containmentRatio: number };
  const partials: PartialCand[] = [];
  for (const key of keys) {
    if (key.length < MIN_PARTIAL_SUBSTRING_LEN || norm.length < MIN_PARTIAL_SUBSTRING_LEN) {
      continue;
    }
    const shorter = key.length <= norm.length ? key : norm;
    const longer = key.length > norm.length ? key : norm;
    if (!longer.includes(shorter)) continue;
    const containmentRatio = shorter.length / longer.length;
    partials.push({ key, containmentRatio });
  }

  if (partials.length > 0) {
    partials.sort((a, b) => {
      if (b.containmentRatio !== a.containmentRatio) return b.containmentRatio - a.containmentRatio;
      if (b.key.length !== a.key.length) return b.key.length - a.key.length;
      return a.key.localeCompare(b.key);
    });
    const best = partials[0]!;
    const entry = kb.byNormalizedKey[best.key]!;
    console.log(LOG, "MATCH partial:", {
      normalizedKey: best.key,
      containmentRatio: Number(best.containmentRatio.toFixed(4)),
      candidatosParciales: partials.length,
    });
    return entryToResult(entry, "partial", best.containmentRatio, best.key);
  }

  let bestKey: string | null = null;
  let bestScore = 0;
  for (const key of keys) {
    const sc = similarityRatio(norm, key);
    if (sc > bestScore || (sc === bestScore && key < (bestKey ?? "\uFFFF"))) {
      bestScore = sc;
      bestKey = key;
    }
  }

  if (bestKey && bestScore >= SIMILARITY_THRESHOLD) {
    const entry = kb.byNormalizedKey[bestKey]!;
    console.log(LOG, "MATCH similarity:", {
      normalizedKey: bestKey,
      similarityScore: Number(bestScore.toFixed(4)),
      umbral: SIMILARITY_THRESHOLD,
    });
    return entryToResult(entry, "similarity", bestScore, bestKey);
  }

  const reason = `NO MATCH: sin exact; sin parcial (subcadena ≥${MIN_PARTIAL_SUBSTRING_LEN} chars); mejor similitud=${bestScore.toFixed(4)} < umbral ${SIMILARITY_THRESHOLD}; mejorCandidato=${JSON.stringify(bestKey)}`;
  console.log(LOG, reason);
  return {
    matched: false,
    concepto_1: null,
    concepto_2: null,
    concepto_3: null,
    matchKind: null,
    score: bestScore,
    matchedNormalizedKey: null,
    noMatchReason: reason,
  };
}
