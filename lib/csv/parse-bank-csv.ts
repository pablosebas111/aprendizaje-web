import Papa from "papaparse";
import { normalizeMovement } from "./normalize";

const LOG = "[CSV-BANK]";

export const BANK_CSV_HEADERS = [
  "FECHA OPERACIÓN",
  "Columna2",
  "FECHA VALOR",
  "CONCEPTO",
  "IMPORTE EUR",
  "SALDO",
  "Columna1",
] as const;

export type BankCsvHeader = (typeof BANK_CSV_HEADERS)[number];
export type BankCsvOriginalRow = Record<BankCsvHeader, string>;

export type BankCsvRow = {
  fecha_operacion: string;
  columna2: string;
  fecha_valor: string;
  concepto: string;
  importe: string;
  saldo: string;
  columna1: string;
  original: BankCsvOriginalRow;
  dataLineNumber: number;
};

export type ParseBankCsvSuccess = {
  ok: true;
  resolvedHeaders: Record<BankCsvHeader, string>;
  rows: BankCsvRow[];
  totalDataRows: number;
  nonEmptyRawRows: number;
  skippedInvalidRows: number;
};

export type ParseBankCsvError = {
  ok: false;
  message: string;
};

export type ParseBankCsvResult = ParseBankCsvSuccess | ParseBankCsvError;

function normalizeHeaderName(h: string): string {
  return h.replace(/^\uFEFF/, "").trim().toLowerCase();
}

function resolveHeaderKeys(
  metaFields: string[],
): { ok: true; resolved: Record<BankCsvHeader, string> } | ParseBankCsvError {
  const requiredLower = new Map<string, BankCsvHeader>();
  for (const h of BANK_CSV_HEADERS) {
    requiredLower.set(h.toLowerCase(), h);
  }

  const resolved: Partial<Record<BankCsvHeader, string>> = {};
  const used = new Set<BankCsvHeader>();

  for (const field of metaFields) {
    const canon = requiredLower.get(normalizeHeaderName(field));
    if (!canon) continue;
    if (used.has(canon)) {
      return { ok: false, message: `Cabecera duplicada para columna requerida «${canon}».` };
    }
    used.add(canon);
    resolved[canon] = field;
  }

  const missing = BANK_CSV_HEADERS.filter((h) => !resolved[h]);
  if (missing.length > 0) {
    return {
      ok: false,
      message: `Faltan columnas obligatorias del CSV bancario: ${missing
        .map((m) => `«${m}»`)
        .join(", ")}. Cabeceras detectadas: ${JSON.stringify(metaFields)}`,
    };
  }

  return {
    ok: true,
    resolved: {
      "FECHA OPERACIÓN": resolved["FECHA OPERACIÓN"]!,
      Columna2: resolved.Columna2!,
      "FECHA VALOR": resolved["FECHA VALOR"]!,
      CONCEPTO: resolved.CONCEPTO!,
      "IMPORTE EUR": resolved["IMPORTE EUR"]!,
      SALDO: resolved.SALDO!,
      Columna1: resolved.Columna1!,
    },
  };
}

function rowHasAnyValue(row: Record<string, unknown>): boolean {
  return Object.values(row).some((v) => String(v ?? "").trim() !== "");
}

function readCell(row: Record<string, string>, header: string): string {
  return String(row[header] ?? "").trim();
}

function countDataLines(text: string): number {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.at(-1) === "") lines.pop();
  return Math.max(lines.length - 1, 0);
}

export function parseBankCsv(text: string): ParseBankCsvResult {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h,
  });

  if (parsed.errors?.length) {
    const msg = parsed.errors.map((e) => `${e.type}:${e.message}@${e.row}`).join(" | ");
    console.warn(LOG, "PapaParse errors:", parsed.errors);
    return { ok: false, message: `Error parseando CSV bancario: ${msg}` };
  }

  const metaFields = parsed.meta.fields ?? [];
  console.log(LOG, "columnas detectadas:", metaFields);

  const headerResolution = resolveHeaderKeys(metaFields);
  if (!headerResolution.ok) {
    console.log(LOG, "parse abortado:", headerResolution.message);
    return headerResolution;
  }

  const hk = headerResolution.resolved;
  const data = parsed.data ?? [];
  const totalDataRows = countDataLines(text);
  const rows: BankCsvRow[] = [];
  let nonEmptyRawRows = 0;
  let skippedInvalidRows = 0;

  for (let i = 0; i < data.length; i++) {
    const obj = data[i]!;
    if (!rowHasAnyValue(obj)) {
      skippedInvalidRows += 1;
      continue;
    }
    nonEmptyRawRows += 1;

    const concepto = readCell(obj, hk.CONCEPTO);
    if (!concepto || !normalizeMovement(concepto)) {
      skippedInvalidRows += 1;
      continue;
    }

    const original: BankCsvOriginalRow = {
      "FECHA OPERACIÓN": readCell(obj, hk["FECHA OPERACIÓN"]),
      Columna2: readCell(obj, hk.Columna2),
      "FECHA VALOR": readCell(obj, hk["FECHA VALOR"]),
      CONCEPTO: concepto,
      "IMPORTE EUR": readCell(obj, hk["IMPORTE EUR"]),
      SALDO: readCell(obj, hk.SALDO),
      Columna1: readCell(obj, hk.Columna1),
    };

    rows.push({
      fecha_operacion: original["FECHA OPERACIÓN"],
      columna2: original.Columna2,
      fecha_valor: original["FECHA VALOR"],
      concepto,
      importe: original["IMPORTE EUR"],
      saldo: original.SALDO,
      columna1: original.Columna1,
      original,
      dataLineNumber: i + 2,
    });
  }

  console.log(LOG, "resumen parse:", {
    totalDataRows,
    nonEmptyRawRows,
    validRows: rows.length,
    skippedInvalidRows: Math.max(totalDataRows - rows.length, skippedInvalidRows),
    firstConcepts: rows.slice(0, 5).map((r) => r.concepto),
  });

  return {
    ok: true,
    resolvedHeaders: hk,
    rows,
    totalDataRows,
    nonEmptyRawRows,
    skippedInvalidRows: Math.max(totalDataRows - rows.length, skippedInvalidRows),
  };
}
