export type KBEntry = {
  tipo_movimiento: string;
  concepto_1: string;
  concepto_2: string;
  concepto_3: string;
  /** Último texto de movimiento visto asociado a esta clave (solo trazabilidad). */
  originalMovimiento: string;
};

export type MovementKnowledgeBase = {
  version: 1;
  /** Clave = normalizeMovement(movimiento) */
  byNormalizedKey: Record<string, KBEntry>;
};

export type MatchKind = "exact" | "partial" | "similarity";

export type MovementMatchResult = {
  matched: boolean;
  tipo_movimiento: string | null;
  concepto_1: string | null;
  concepto_2: string | null;
  concepto_3: string | null;
  matchKind: MatchKind | null;
  /** Score de similitud usado para desempatar / modo similarity (0–1). */
  score: number | null;
  /** Clave normalizada del registro histórico elegido. */
  matchedNormalizedKey: string | null;
  noMatchReason: string | null;
};
