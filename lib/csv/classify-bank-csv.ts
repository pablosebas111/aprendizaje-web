import { matchMovementAgainstKb } from "./match";
import type { MovementKnowledgeBase } from "./kb-types";
import type { BankCsvRow } from "./parse-bank-csv";

const LOG = "[CSV-BANK]";

export type ClassificationStatus = "Clasificado" | "Sin clasificar";

export type ClassifiedBankCsvRow = BankCsvRow & {
  tipo_movimiento: string | null;
  concepto_1: string | null;
  concepto_2: string | null;
  concepto_3: string | null;
  estado_clasificacion: ClassificationStatus;
  match_score: number | null;
  match_fuente: string | null;
  matched_normalized_key: string | null;
  no_match_reason: string | null;
};

export type BankClassificationStats = {
  total_filas_archivo: number;
  movimientos_validos_procesados: number;
  movimientos_clasificados: number;
  movimientos_sin_clasificar: number;
  porcentaje_clasificado: string;
};

export type ClassifyBankCsvResult = {
  rows: ClassifiedBankCsvRow[];
  stats: BankClassificationStats;
};

export function classifyBankCsvRows(
  rows: BankCsvRow[],
  kb: MovementKnowledgeBase,
  totalDataRows: number,
): ClassifyBankCsvResult {
  const out: ClassifiedBankCsvRow[] = [];

  for (const row of rows) {
    const match = matchMovementAgainstKb(row.concepto, kb);
    const classified = match.matched;

    if (classified) {
      console.log(LOG, "match encontrado:", {
        line: row.dataLineNumber,
        concepto: row.concepto,
        matchKind: match.matchKind,
        score: match.score,
        matchedNormalizedKey: match.matchedNormalizedKey,
      });
    } else {
      console.log(LOG, "movimiento sin clasificar:", {
        line: row.dataLineNumber,
        concepto: row.concepto,
        score: match.score,
        reason: match.noMatchReason,
      });
    }

    out.push({
      ...row,
      tipo_movimiento: classified ? match.tipo_movimiento : null,
      concepto_1: classified ? match.concepto_1 : null,
      concepto_2: classified ? match.concepto_2 : null,
      concepto_3: classified ? match.concepto_3 : null,
      estado_clasificacion: classified ? "Clasificado" : "Sin clasificar",
      match_score: match.score,
      match_fuente: match.matchKind,
      matched_normalized_key: match.matchedNormalizedKey,
      no_match_reason: match.noMatchReason,
    });
  }

  const movimientos_clasificados = out.filter(
    (r) => r.estado_clasificacion === "Clasificado",
  ).length;
  const movimientos_validos_procesados = out.length;
  const movimientos_sin_clasificar = movimientos_validos_procesados - movimientos_clasificados;
  const pct =
    movimientos_validos_procesados === 0
      ? 0
      : (movimientos_clasificados / movimientos_validos_procesados) * 100;

  const stats: BankClassificationStats = {
    total_filas_archivo: totalDataRows,
    movimientos_validos_procesados,
    movimientos_clasificados,
    movimientos_sin_clasificar,
    porcentaje_clasificado: `${pct.toFixed(1)}%`,
  };

  console.log(LOG, "resumen clasificacion bancaria:", stats);

  return { rows: out, stats };
}
