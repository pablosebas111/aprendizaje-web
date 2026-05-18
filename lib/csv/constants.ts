/** Nombres de columna exigidos en el CSV (mapping fijo, sin autodetección). */
export const CSV_COLUMN_MOVIMIENTO = "MOVIMIENTO";
export const CSV_COLUMN_TIPO_MOVIMIENTO = "TIPO MOVIMIENTO";
export const CSV_COLUMN_CONCEPTO_1 = "CONCEPTO 1";
export const CSV_COLUMN_CONCEPTO_2 = "CONCEPTO 2";
export const CSV_COLUMN_CONCEPTO_3 = "CONCEPTO 3";

export const REQUIRED_CSV_HEADERS = [
  CSV_COLUMN_MOVIMIENTO,
  CSV_COLUMN_TIPO_MOVIMIENTO,
  CSV_COLUMN_CONCEPTO_1,
  CSV_COLUMN_CONCEPTO_2,
  CSV_COLUMN_CONCEPTO_3,
] as const;

export const KB_STORAGE_KEY = "mi-app-ia:movimiento-kb:v1";
