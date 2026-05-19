import { matchMovementAgainstKb } from "./match";
import { normalizeMovement } from "./normalize";
import type { MovementKnowledgeBase } from "./kb-types";
import type { ImportedCsvRow } from "./parse-imported-csv";

const LOG = "[CSV-IMPORT]";

export type ClassificationStatus = "Clasificado" | "Sin clasificar";

export type ClassifiedImportedCsvRow = ImportedCsvRow & {
  movementText: string;
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

export type ImportedClassificationStats = {
  total_filas_importadas: number;
  filas_validas: number;
  columna_matching: string;
  clasificados: number;
  sin_clasificar: number;
  porcentaje_clasificado: string;
  filas_ignoradas_movimiento_vacio: number;
};

export type ClassifyImportedRowsResult = {
  rows: ClassifiedImportedCsvRow[];
  stats: ImportedClassificationStats;
};

export function classifyImportedRows(
  rows: ImportedCsvRow[],
  movementColumn: string,
  kb: MovementKnowledgeBase,
  totalDataRows: number,
): ClassifyImportedRowsResult {
  const out: ClassifiedImportedCsvRow[] = [];
  let emptyMovementRows = 0;

  console.log(LOG, "primeras 5 filas procesadas:", rows.slice(0, 5).map((row) => ({
    line: row.dataLineNumber,
    movement: row.original[movementColumn] ?? "",
  })));

  for (const row of rows) {
    const movementText = String(row.original[movementColumn] ?? "").trim();
    if (!movementText || !normalizeMovement(movementText)) {
      emptyMovementRows += 1;
      console.log(LOG, "fila ignorada por campo de movimiento vacio:", {
        line: row.dataLineNumber,
        movementColumn,
      });
      continue;
    }

    const match = matchMovementAgainstKb(movementText, kb);
    const classified = match.matched;

    if (classified) {
      console.log(LOG, "match encontrado:", {
        line: row.dataLineNumber,
        movement: movementText,
        matchKind: match.matchKind,
        score: match.score,
        matchedNormalizedKey: match.matchedNormalizedKey,
      });
    } else {
      console.log(LOG, "movimiento sin clasificar:", {
        line: row.dataLineNumber,
        movement: movementText,
        score: match.score,
        reason: match.noMatchReason,
      });
    }

    out.push({
      ...row,
      movementText,
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

  const clasificados = out.filter((r) => r.estado_clasificacion === "Clasificado").length;
  const filas_validas = out.length;
  const sin_clasificar = filas_validas - clasificados;
  const pct = filas_validas === 0 ? 0 : (clasificados / filas_validas) * 100;

  const stats: ImportedClassificationStats = {
    total_filas_importadas: totalDataRows,
    filas_validas,
    columna_matching: movementColumn,
    clasificados,
    sin_clasificar,
    porcentaje_clasificado: `${pct.toFixed(1)}%`,
    filas_ignoradas_movimiento_vacio: emptyMovementRows,
  };

  console.log(LOG, "resumen clasificacion importada:", stats);

  return { rows: out, stats };
}
