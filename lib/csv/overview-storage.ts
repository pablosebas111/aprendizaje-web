import type { ClassifiedImportedCsvRow } from "./classify-imported-csv";

export const CLASSIFIED_OVERVIEW_STORAGE_KEY = "mi-app-ia:classified-overview:v1";

const AMOUNT_COLUMN_PRIORITY = [
  "IMPORTE",
  "CUANTIA",
  "CUANTÍA",
  "CANTIDAD",
  "AMOUNT",
  "CARGO",
  "DEBITO",
  "DÉBITO",
  "DEBIT",
  "VALOR",
  "TOTAL",
] as const;

export type StoredOverviewRow = {
  original: Record<string, string>;
  dataLineNumber: number;
  movementText: string;
  amount: number | null;
  tipo_movimiento: string | null;
  concepto_1: string | null;
  concepto_2: string | null;
  concepto_3: string | null;
  estado_clasificacion: string;
  match_score: number | null;
  match_fuente: string | null;
};

export type StoredClassifiedOverview = {
  version: 1;
  savedAt: string;
  sourceFileName: string | null;
  movementColumn: string;
  amountColumn: string | null;
  rows: StoredOverviewRow[];
};

function normalizeHeaderName(header: string): string {
  return header
    .replace(/^\uFEFF/, "")
    .trim()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase();
}

export function detectAmountColumn(headers: string[]): string | null {
  const byNormalized = new Map<string, string>();
  for (const header of headers) {
    const normalized = normalizeHeaderName(header);
    if (!byNormalized.has(normalized)) byNormalized.set(normalized, header);
  }

  for (const candidate of AMOUNT_COLUMN_PRIORITY) {
    const found = byNormalized.get(normalizeHeaderName(candidate));
    if (found) return found;
  }

  return null;
}

export function parseAmountValue(raw: string | number | null | undefined): number | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;

  const withoutCurrency = value.replace(/[^0-9,.-]/g, "");
  if (!withoutCurrency || withoutCurrency === "-" || withoutCurrency === "," || withoutCurrency === ".") {
    return null;
  }

  const lastComma = withoutCurrency.lastIndexOf(",");
  const lastDot = withoutCurrency.lastIndexOf(".");
  let normalized = withoutCurrency;

  if (lastComma > lastDot) {
    normalized = withoutCurrency.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    normalized = withoutCurrency.replace(/,/g, "");
  }

  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

export function buildClassifiedOverview(params: {
  rows: ClassifiedImportedCsvRow[];
  headers: string[];
  sourceFileName: string | null;
  movementColumn: string;
}): StoredClassifiedOverview {
  const amountColumn = detectAmountColumn(params.headers);

  return {
    version: 1,
    savedAt: new Date().toISOString(),
    sourceFileName: params.sourceFileName,
    movementColumn: params.movementColumn,
    amountColumn,
    rows: params.rows.map((row) => ({
      original: row.original,
      dataLineNumber: row.dataLineNumber,
      movementText: row.movementText,
      amount: amountColumn ? parseAmountValue(row.original[amountColumn]) : null,
      tipo_movimiento: row.tipo_movimiento,
      concepto_1: row.concepto_1,
      concepto_2: row.concepto_2,
      concepto_3: row.concepto_3,
      estado_clasificacion: row.estado_clasificacion,
      match_score: row.match_score,
      match_fuente: row.match_fuente,
    })),
  };
}

export function saveClassifiedOverview(data: StoredClassifiedOverview): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CLASSIFIED_OVERVIEW_STORAGE_KEY, JSON.stringify(data));
}

export function loadClassifiedOverview(): StoredClassifiedOverview | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(CLASSIFIED_OVERVIEW_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredClassifiedOverview;
    if (parsed?.version !== 1 || !Array.isArray(parsed.rows)) return null;
    return parsed;
  } catch {
    return null;
  }
}
