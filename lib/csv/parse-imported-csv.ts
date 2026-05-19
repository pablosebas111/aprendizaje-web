import Papa from "papaparse";

const LOG = "[CSV-IMPORT]";

const MOVEMENT_COLUMN_PRIORITY = [
  "CONCEPTO",
  "MOVIMIENTO",
  "DESCRIPCIÓN",
  "DESCRIPCION",
  "DETALLE",
  "MERCHANT",
  "COMERCIO",
  "BENEFICIARIO",
  "CONCEPTO OPERACIÓN",
  "CONCEPTO OPERACION",
] as const;

export type MovementColumnDetection = {
  column: string;
  reason: string;
};

export type ImportedCsvRow = {
  original: Record<string, string>;
  dataLineNumber: number;
};

export type ParseImportedCsvSuccess = {
  ok: true;
  headers: string[];
  rows: ImportedCsvRow[];
  totalDataRows: number;
  nonEmptyRawRows: number;
  detectedMovementColumn: MovementColumnDetection | null;
};

export type ParseImportedCsvError = {
  ok: false;
  message: string;
};

export type ParseImportedCsvResult = ParseImportedCsvSuccess | ParseImportedCsvError;

function normalizeHeaderName(h: string): string {
  return h
    .replace(/^\uFEFF/, "")
    .trim()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase();
}

function rowHasAnyValue(row: Record<string, unknown>): boolean {
  return Object.values(row).some((v) => String(v ?? "").trim() !== "");
}

function countDataLines(text: string): number {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.at(-1) === "") lines.pop();
  return Math.max(lines.length - 1, 0);
}

export function detectMovementColumn(headers: string[]): MovementColumnDetection | null {
  const byNormalized = new Map<string, string>();
  for (const header of headers) {
    const normalized = normalizeHeaderName(header);
    if (!byNormalized.has(normalized)) byNormalized.set(normalized, header);
  }

  for (const candidate of MOVEMENT_COLUMN_PRIORITY) {
    const found = byNormalized.get(normalizeHeaderName(candidate));
    if (found) {
      return {
        column: found,
        reason: `Coincidencia por prioridad: ${candidate}`,
      };
    }
  }

  return null;
}

export function parseImportedCsv(text: string): ParseImportedCsvResult {
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

  const headers = parsed.meta.fields ?? [];
  if (headers.length === 0) {
    return { ok: false, message: "El CSV no contiene cabeceras." };
  }

  const rows: ImportedCsvRow[] = [];
  let nonEmptyRawRows = 0;
  const data = parsed.data ?? [];

  for (let i = 0; i < data.length; i++) {
    const obj = data[i]!;
    if (!rowHasAnyValue(obj)) continue;
    nonEmptyRawRows += 1;

    const original: Record<string, string> = {};
    for (const header of headers) {
      original[header] = String(obj[header] ?? "").trim();
    }

    rows.push({
      original,
      dataLineNumber: i + 2,
    });
  }

  const detectedMovementColumn = detectMovementColumn(headers);

  console.log(LOG, "columnas originales detectadas:", headers);
  console.log(LOG, "columna elegida para matching:", detectedMovementColumn);
  console.log(LOG, "resumen parse:", {
    totalDataRows: countDataLines(text),
    nonEmptyRawRows,
    materializedRows: rows.length,
  });

  return {
    ok: true,
    headers,
    rows,
    totalDataRows: countDataLines(text),
    nonEmptyRawRows,
    detectedMovementColumn,
  };
}
