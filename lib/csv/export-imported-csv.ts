import Papa from "papaparse";
import type { ClassifiedImportedCsvRow } from "./classify-imported-csv";

const ENRICHED_HEADERS = [
  "TIPO MOVIMIENTO",
  "CONCEPTO 1",
  "CONCEPTO 2",
  "CONCEPTO 3",
  "ESTADO CLASIFICACION",
  "MATCH SCORE",
  "MATCH FUENTE",
] as const;

export function exportRowsWithClassification(
  originalHeaders: string[],
  classifiedRows: ClassifiedImportedCsvRow[],
): string {
  return Papa.unparse(
    classifiedRows.map((row) => {
      const output: Record<string, string> = {};
      for (const header of originalHeaders) {
        output[header] = row.original[header] ?? "";
      }
      output["TIPO MOVIMIENTO"] = row.tipo_movimiento ?? "";
      output["CONCEPTO 1"] = row.concepto_1 ?? "";
      output["CONCEPTO 2"] = row.concepto_2 ?? "";
      output["CONCEPTO 3"] = row.concepto_3 ?? "";
      output["ESTADO CLASIFICACION"] = row.estado_clasificacion;
      output["MATCH SCORE"] = row.match_score != null ? row.match_score.toFixed(4) : "";
      output["MATCH FUENTE"] = row.match_fuente ?? "";
      return output;
    }),
    {
      columns: [...originalHeaders, ...ENRICHED_HEADERS],
    },
  );
}
