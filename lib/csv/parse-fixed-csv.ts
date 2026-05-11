import Papa from "papaparse";
import {
  CSV_COLUMN_CONCEPTO_1,
  CSV_COLUMN_CONCEPTO_2,
  CSV_COLUMN_CONCEPTO_3,
  CSV_COLUMN_MOVIMIENTO,
  REQUIRED_CSV_HEADERS,
} from "./constants";

const LOG = "[CSV-KB]";

export type FixedCsvRow = {
  movimiento: string;
  concepto_1: string;
  concepto_2: string;
  concepto_3: string;
  /** Aproximación a línea en archivo (1-based; cabecera = 1). */
  dataLineNumber: number;
};

export type ResolvedCsvHeaders = Record<(typeof REQUIRED_CSV_HEADERS)[number], string>;

export type ParseFixedCsvSuccess = {
  ok: true;
  resolvedHeaders: ResolvedCsvHeaders;
  rows: FixedCsvRow[];
  /** Filas objeto con al menos un campo no vacío. */
  nonEmptyRawRows: number;
};

export type ParseFixedCsvError = {
  ok: false;
  message: string;
};

export type ParseFixedCsvResult = ParseFixedCsvSuccess | ParseFixedCsvError;

function normalizeHeaderName(h: string): string {
  return h.replace(/^\uFEFF/, "").trim().toLowerCase();
}

function resolveHeaderKeys(metaFields: string[]): { ok: true; resolved: ResolvedCsvHeaders } | ParseFixedCsvError {
  const requiredLower = new Map<string, (typeof REQUIRED_CSV_HEADERS)[number]>();
  for (const r of REQUIRED_CSV_HEADERS) {
    requiredLower.set(r.toLowerCase(), r);
  }

  const resolved: Partial<ResolvedCsvHeaders> = {};
  const used = new Set<string>();

  for (const field of metaFields) {
    const canon = requiredLower.get(normalizeHeaderName(field));
    if (!canon) continue;
    if (used.has(canon)) {
      return {
        ok: false,
        message: `Cabecera duplicada para columna requerida «${canon}».`,
      };
    }
    used.add(canon);
    resolved[canon] = field;
  }

  const missing = REQUIRED_CSV_HEADERS.filter((h) => !resolved[h]);
  if (missing.length > 0) {
    return {
      ok: false,
      message: `Faltan columnas obligatorias (mapping fijo): ${missing.map((m) => `«${m}»`).join(", ")}. Cabeceras detectadas: ${JSON.stringify(metaFields)}`,
    };
  }

  return {
    ok: true,
    resolved: {
      MOVIMIENTO: resolved.MOVIMIENTO!,
      "CONCEPTO 1": resolved["CONCEPTO 1"]!,
      "CONCEPTO 2": resolved["CONCEPTO 2"]!,
      "CONCEPTO 3": resolved["CONCEPTO 3"]!,
    },
  };
}

function rowHasAnyValue(row: Record<string, unknown>): boolean {
  return Object.values(row).some((v) => String(v ?? "").trim() !== "");
}

export function parseFixedMappingCsv(text: string): ParseFixedCsvResult {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h,
  });

  if (parsed.errors?.length) {
    const msg = parsed.errors.map((e) => `${e.type}:${e.message}@${e.row}`).join(" | ");
    console.warn(LOG, "PapaParse errors:", parsed.errors);
    return { ok: false, message: `Error parseando CSV: ${msg}` };
  }

  const metaFields = parsed.meta.fields ?? [];
  console.log(LOG, "columnas cargadas (orden original):", metaFields);

  const headerResolution = resolveHeaderKeys(metaFields);
  if (!headerResolution.ok) {
    console.log(LOG, "parse abortado:", headerResolution.message);
    return headerResolution;
  }

  const hk = headerResolution.resolved;

  const rows: FixedCsvRow[] = [];
  let nonEmptyRawRows = 0;

  const data = parsed.data ?? [];
  console.log(LOG, "filas parseadas (objetos tras cabecera):", data.length);

  for (let i = 0; i < data.length; i++) {
    const obj = data[i]!;
    if (!rowHasAnyValue(obj)) continue;
    nonEmptyRawRows += 1;

    const movimiento = String(obj[hk[CSV_COLUMN_MOVIMIENTO]] ?? "").trim();
    const concepto_1 = String(obj[hk[CSV_COLUMN_CONCEPTO_1]] ?? "").trim();
    const concepto_2 = String(obj[hk[CSV_COLUMN_CONCEPTO_2]] ?? "").trim();
    const concepto_3 = String(obj[hk[CSV_COLUMN_CONCEPTO_3]] ?? "").trim();

    rows.push({
      movimiento,
      concepto_1,
      concepto_2,
      concepto_3,
      dataLineNumber: i + 2,
    });
  }

  console.log(
    LOG,
    "filas con datos (no vacías):",
    nonEmptyRawRows,
    "| filas materializadas:",
    rows.length,
  );

  if (nonEmptyRawRows !== rows.length) {
    console.warn(
      LOG,
      "Inconsistencia: nonEmptyRawRows !== rows.length (revisar lógica de filas vacías).",
    );
  }

  return {
    ok: true,
    resolvedHeaders: hk,
    rows,
    nonEmptyRawRows,
  };
}
