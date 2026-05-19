import Papa from "papaparse";
import { BANK_CSV_HEADERS } from "./parse-bank-csv";
import type { ClassifiedBankCsvRow } from "./classify-bank-csv";

const ENRICHED_HEADERS = [
  "TIPO MOVIMIENTO",
  "CONCEPTO 1",
  "CONCEPTO 2",
  "CONCEPTO 3",
  "ESTADO CLASIFICACION",
  "MATCH SCORE",
  "MATCH FUENTE",
] as const;

export function exportClassifiedBankCsv(rows: ClassifiedBankCsvRow[]): string {
  return Papa.unparse(
    rows.map((row) => ({
      "FECHA OPERACIÓN": row.original["FECHA OPERACIÓN"],
      Columna2: row.original.Columna2,
      "FECHA VALOR": row.original["FECHA VALOR"],
      CONCEPTO: row.original.CONCEPTO,
      "IMPORTE EUR": row.original["IMPORTE EUR"],
      SALDO: row.original.SALDO,
      Columna1: row.original.Columna1,
      "TIPO MOVIMIENTO": row.tipo_movimiento ?? "",
      "CONCEPTO 1": row.concepto_1 ?? "",
      "CONCEPTO 2": row.concepto_2 ?? "",
      "CONCEPTO 3": row.concepto_3 ?? "",
      "ESTADO CLASIFICACION": row.estado_clasificacion,
      "MATCH SCORE": row.match_score != null ? row.match_score.toFixed(4) : "",
      "MATCH FUENTE": row.match_fuente ?? "",
    })),
    {
      columns: [...BANK_CSV_HEADERS, ...ENRICHED_HEADERS],
    },
  );
}
