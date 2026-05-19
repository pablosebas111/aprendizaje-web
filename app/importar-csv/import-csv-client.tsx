"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { normalizeMovement } from "@/lib/csv/normalize";
import { parseFixedMappingCsv } from "@/lib/csv/parse-fixed-csv";
import { parseImportedCsv } from "@/lib/csv/parse-imported-csv";
import { classifyImportedRows } from "@/lib/csv/classify-imported-csv";
import { exportRowsWithClassification } from "@/lib/csv/export-imported-csv";
import {
  loadKnowledgeBase,
  saveKnowledgeBase,
  upsertKbEntries,
  validateKnowledgeBase,
} from "@/lib/csv/kb-storage";
import type { KBEntry, MovementKnowledgeBase } from "@/lib/csv/kb-types";
import type { FixedCsvRow } from "@/lib/csv/parse-fixed-csv";
import type { ClassifiedImportedCsvRow } from "@/lib/csv/classify-imported-csv";
import type { ParseImportedCsvSuccess } from "@/lib/csv/parse-imported-csv";

const LOG = "[CSV-KB]";

type Mode = "historico" | "clasificar";

function emptyDisplay(value: string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  return String(value);
}

export function ImportCsvClient() {
  const [mode, setMode] = useState<Mode>("historico");
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [kb, setKb] = useState<MovementKnowledgeBase | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [lastStats, setLastStats] = useState<Record<string, string | number> | null>(null);
  const [previewHistorico, setPreviewHistorico] = useState<FixedCsvRow[]>([]);
  const [classifiedRows, setClassifiedRows] = useState<ClassifiedImportedCsvRow[]>([]);
  const [importedHeaders, setImportedHeaders] = useState<string[]>([]);
  const [movementColumn, setMovementColumn] = useState<string | null>(null);
  const [pendingImportedCsv, setPendingImportedCsv] = useState<ParseImportedCsvSuccess | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      const k = loadKnowledgeBase();
      setKb(k);
      console.log(
        LOG,
        "KB cargada al montar. Registros en memoria historica:",
        Object.keys(k.byNormalizedKey).length,
      );
    });
  }, []);

  const kbCount = kb ? Object.keys(kb.byNormalizedKey).length : 0;

  const refreshKb = useCallback(() => {
    const k = loadKnowledgeBase();
    setKb(k);
    return k;
  }, []);

  const exportKb = () => {
    const currentKb = refreshKb();
    const count = Object.keys(currentKb.byNormalizedKey).length;
    const blob = new Blob([JSON.stringify(currentKb, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `mi-app-ia-kb-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus(`KB exportada con ${count} registro(s).`);
    console.log(LOG, "KB exportada a JSON:", { registros: count });
  };

  const importKbFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = validateKnowledgeBase(JSON.parse(String(reader.result ?? "")));
        if (!parsed) {
          setStatus("El archivo JSON no tiene formato de KB valido.");
          console.warn(LOG, "Importacion de KB rechazada: formato invalido.");
          return;
        }

        saveKnowledgeBase(parsed);
        setKb(parsed);
        setLastStats({
          registros_importados_kb: Object.keys(parsed.byNormalizedKey).length,
        });
        setStatus("KB importada correctamente. Se reemplazo la memoria local.");
        console.log(LOG, "KB importada desde JSON:", {
          registros: Object.keys(parsed.byNormalizedKey).length,
        });
      } catch (e) {
        setStatus("No se pudo leer el JSON de KB.");
        console.warn(LOG, "Error importando KB JSON:", e);
      }
    };
    reader.onerror = () => {
      setStatus("No se pudo leer el archivo de KB.");
      console.error(LOG, "FileReader error importando KB");
    };
    reader.readAsText(file, "UTF-8");
  };

  const resetImportState = () => {
    setStatus(null);
    setLastStats(null);
    setPreviewHistorico([]);
    setClassifiedRows([]);
    setImportedHeaders([]);
    setMovementColumn(null);
    setPendingImportedCsv(null);
  };

  const readFile = (file: File) => {
    setFileName(file.name);
    resetImportState();

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const currentKb = refreshKb();

      if (mode === "historico") {
        const parsed = parseFixedMappingCsv(text);
        if (!parsed.ok) {
          setStatus(parsed.message);
          console.log(LOG, "Importacion historica detenida:", parsed.message);
          return;
        }
        processHistorico(parsed.rows, currentKb);
        return;
      }

      const parsed = parseImportedCsv(text);
      if (!parsed.ok) {
        setStatus(parsed.message);
        console.log(LOG, "Clasificacion de CSV importado detenida:", parsed.message);
        return;
      }
      setImportedHeaders(parsed.headers);

      if (!parsed.detectedMovementColumn) {
        setPendingImportedCsv(parsed);
        setStatus(
          "No se detecto automaticamente la columna de movimiento. Elige una columna para clasificar.",
        );
        console.log(LOG, "No se detecto columna de movimiento; esperando seleccion manual.", {
          headers: parsed.headers,
        });
        return;
      }

      processClasificarImportado(parsed, parsed.detectedMovementColumn.column, currentKb);
    };
    reader.onerror = () => {
      setStatus("No se pudo leer el archivo.");
      console.error(LOG, "FileReader error");
    };
    reader.readAsText(file, "UTF-8");
  };

  const processHistorico = (rows: FixedCsvRow[], baseKb: MovementKnowledgeBase) => {
    const next: MovementKnowledgeBase = {
      version: 1,
      byNormalizedKey: { ...baseKb.byNormalizedKey },
    };

    let skippedEmptyMovimiento = 0;
    const skipSamples: string[] = [];
    const upserts: Array<{ normalizedKey: string; entry: KBEntry }> = [];

    for (const row of rows) {
      if (!row.movimiento.trim()) {
        skippedEmptyMovimiento += 1;
        const msg = `Fila ${row.dataLineNumber}: MOVIMIENTO vacio -> descartada.`;
        if (skipSamples.length < 8) skipSamples.push(msg);
        console.warn(LOG, msg);
        continue;
      }

      const nk = normalizeMovement(row.movimiento);
      console.log(
        LOG,
        "historico: fila",
        row.dataLineNumber,
        "movimiento normalizado=",
        JSON.stringify(nk),
      );

      if (!nk) {
        skippedEmptyMovimiento += 1;
        const msg = `Fila ${row.dataLineNumber}: MOVIMIENTO sin clave normalizada -> descartada.`;
        if (skipSamples.length < 8) skipSamples.push(msg);
        console.warn(LOG, msg);
        continue;
      }

      upserts.push({
        normalizedKey: nk,
        entry: {
          tipo_movimiento: row.tipo_movimiento,
          concepto_1: row.concepto_1,
          concepto_2: row.concepto_2,
          concepto_3: row.concepto_3,
          originalMovimiento: row.movimiento,
        },
      });

      console.log(LOG, "historico: fila", row.dataLineNumber, "payload KB=", {
        normalizedKey: nk,
        tipo_movimiento: row.tipo_movimiento || null,
        concepto_1: row.concepto_1 || null,
        concepto_2: row.concepto_2 || null,
        concepto_3: row.concepto_3 || null,
      });
    }

    const upsertStats = upsertKbEntries(next, upserts);
    saveKnowledgeBase(next);
    refreshKb();

    const totalKeys = Object.keys(next.byNormalizedKey).length;
    const rowsTotal = rows.length;
    const rowsUsed = upserts.length;

    console.log(LOG, "Resumen historico:", {
      filasEnCsv: rowsTotal,
      filasAceptadasParaKb: rowsUsed,
      filasDescartadasMovimientoVacio: skippedEmptyMovimiento,
      nuevas_claves: upsertStats.nuevas_claves,
      sobrescrituras: upsertStats.sobrescrituras,
      duplicados_en_archivo: upsertStats.duplicados_en_archivo,
      totalRegistrosKbTrasImport: totalKeys,
    });

    setPreviewHistorico(rows.slice(0, 25));
    setLastStats({
      filas_en_csv: rowsTotal,
      filas_aceptadas: rowsUsed,
      descartadas_movimiento_vacio: skippedEmptyMovimiento,
      nuevas_claves_en_kb: upsertStats.nuevas_claves,
      sobrescrituras: upsertStats.sobrescrituras,
      duplicados_en_archivo: upsertStats.duplicados_en_archivo,
      total_en_memoria_historica: totalKeys,
    });
    setStatus(
      skippedEmptyMovimiento > 0
        ? `Importacion historica completada con ${skippedEmptyMovimiento} fila(s) descartadas.`
        : "Importacion historica completada.",
    );

    if (skipSamples.length) {
      console.log(LOG, "Muestra de descartes:", skipSamples);
    }
  };

  const processClasificarImportado = (
    parsed: ParseImportedCsvSuccess,
    selectedMovementColumn: string,
    baseKb: MovementKnowledgeBase,
  ) => {
    const result = classifyImportedRows(
      parsed.rows,
      selectedMovementColumn,
      baseKb,
      parsed.totalDataRows,
    );
    setClassifiedRows(result.rows);
    setImportedHeaders(parsed.headers);
    setMovementColumn(selectedMovementColumn);
    setPendingImportedCsv(null);
    setLastStats(result.stats);
    setStatus(
      `Clasificacion completada usando "${selectedMovementColumn}": ${result.stats.clasificados} de ${result.stats.filas_validas} fila(s) clasificada(s).`,
    );
  };

  const downloadClassifiedCsv = () => {
    if (classifiedRows.length === 0) {
      setStatus("No hay movimientos clasificados para descargar.");
      return;
    }

    const csv = exportRowsWithClassification(importedHeaders, classifiedRows);
    const blob = new Blob([`\uFEFF${csv}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const sourceName = fileName?.replace(/\.csv$/i, "") || "movimientos";
    a.href = url;
    a.download = `${sourceName}-clasificado.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus(`CSV clasificado descargado con ${classifiedRows.length} fila(s).`);
    console.log(LOG, "CSV clasificado descargado:", {
      filas: classifiedRows.length,
      archivo: a.download,
    });
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".csv")) {
      setStatus("Solo se admiten archivos .csv");
      return;
    }
    readFile(f);
  };

  const onPick: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    readFile(f);
  };

  const modeLabel = useMemo(
    () =>
      mode === "historico"
        ? "Construir / ampliar memoria historica"
        : "Clasificar cualquier CSV usando la columna de movimiento detectada",
    [mode],
  );

  const uploadHint =
    mode === "historico"
      ? "CSV historico con MOVIMIENTO, TIPO MOVIMIENTO y CONCEPTO 1/2/3"
      : "CSV con una columna de movimiento como CONCEPTO, MOVIMIENTO, DESCRIPCION o MERCHANT";

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 md:p-10">
      <header className="max-w-5xl space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Importar CSV</h1>
        <p className="max-w-3xl text-sm leading-relaxed text-[color:color-mix(in_oklab,var(--foreground)_55%,transparent)]">
          El historico aprende desde <span className="font-mono text-[13px]">MOVIMIENTO</span>.
          Los nuevos CSV se clasifican detectando una columna de movimiento como{" "}
          <span className="font-mono text-[13px]">CONCEPTO</span>,{" "}
          <span className="font-mono text-[13px]">MOVIMIENTO</span> o{" "}
          <span className="font-mono text-[13px]">MERCHANT</span>. La exportacion conserva todas
          las columnas originales y anade la clasificacion al final.
        </p>
      </header>

      <div className="flex max-w-5xl flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setMode("historico");
            resetImportState();
          }}
          className={[
            "rounded-full px-4 py-2 text-sm font-medium transition-colors",
            mode === "historico"
              ? "surface-subtle text-[var(--foreground)]"
              : "text-[color:color-mix(in_oklab,var(--foreground)_65%,transparent)] hover:surface-subtle",
          ].join(" ")}
        >
          Historico {"->"} KB
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("clasificar");
            resetImportState();
          }}
          className={[
            "rounded-full px-4 py-2 text-sm font-medium transition-colors",
            mode === "clasificar"
              ? "surface-subtle text-[var(--foreground)]"
              : "text-[color:color-mix(in_oklab,var(--foreground)_65%,transparent)] hover:surface-subtle",
          ].join(" ")}
        >
          Nuevos movimientos
        </button>
      </div>
      <p className="max-w-5xl text-sm text-[color:color-mix(in_oklab,var(--foreground)_60%,transparent)]">
        {modeLabel}
      </p>

      <section className="surface-panel max-w-5xl rounded-2xl p-6 md:p-8">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Memoria historica persistente</p>
            <p className="text-xs text-[color:color-mix(in_oklab,var(--foreground)_55%,transparent)]">
              Registros unicos indexados por MOVIMIENTO normalizado (localStorage).
            </p>
          </div>
          <p className="text-2xl font-semibold tabular-nums">{kbCount}</p>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportKb}
            className="surface-subtle rounded-lg px-3 py-2 text-sm font-medium transition hover:opacity-85"
          >
            Exportar KB JSON
          </button>
          <label className="surface-subtle cursor-pointer rounded-lg px-3 py-2 text-sm font-medium transition hover:opacity-85">
            Importar KB JSON
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.currentTarget.value = "";
                if (!f) return;
                importKbFile(f);
              }}
            />
          </label>
        </div>

        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={[
            "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center transition-colors",
            dragOver
              ? "border-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)] surface-subtle"
              : "border-[color:color-mix(in_oklab,var(--foreground)_22%,transparent)] hover:surface-subtle",
          ].join(" ")}
        >
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={onPick} />
          <span className="text-sm font-medium">Arrastra un CSV aqui o haz clic para elegir</span>
          <span className="text-xs text-[color:color-mix(in_oklab,var(--foreground)_50%,transparent)]">
            {uploadHint}
          </span>
        </label>

        {fileName ? (
          <p className="mt-4 text-sm">
            Archivo: <span className="font-mono text-[13px]">{fileName}</span>
          </p>
        ) : null}

        {status ? (
          <p className="mt-4 rounded-lg border border-[color:color-mix(in_oklab,var(--foreground)_14%,transparent)] bg-[color:color-mix(in_oklab,var(--foreground)_4%,var(--background))] px-3 py-2 text-sm">
            {status}
          </p>
        ) : null}

        {lastStats ? (
          <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
            {Object.entries(lastStats).map(([k, v]) => (
              <div key={k} className="surface-subtle rounded-lg px-3 py-2">
                <dt className="text-xs uppercase tracking-wide text-[color:color-mix(in_oklab,var(--foreground)_50%,transparent)]">
                  {k.replaceAll("_", " ")}
                </dt>
                <dd className="mt-1 font-mono text-base tabular-nums">{String(v)}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {pendingImportedCsv ? (
          <div className="mt-6 rounded-lg border border-[color:color-mix(in_oklab,var(--foreground)_14%,transparent)] p-4">
            <label className="block text-sm font-medium" htmlFor="movement-column">
              Columna para matching
            </label>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <select
                id="movement-column"
                value={movementColumn ?? ""}
                onChange={(e) => setMovementColumn(e.target.value || null)}
                className="surface-subtle min-w-0 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Selecciona una columna</option>
                {pendingImportedCsv.headers.map((header) => (
                  <option key={header} value={header}>
                    {header}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  if (!movementColumn) {
                    setStatus("Selecciona una columna de movimiento para continuar.");
                    return;
                  }
                  processClasificarImportado(pendingImportedCsv, movementColumn, refreshKb());
                }}
                className="rounded-lg bg-[var(--foreground)] px-4 py-2 text-sm font-semibold text-[var(--background)] transition hover:opacity-85"
              >
                Clasificar con esta columna
              </button>
            </div>
          </div>
        ) : null}

        {classifiedRows.length > 0 ? (
          <button
            type="button"
            onClick={downloadClassifiedCsv}
            className="mt-6 rounded-lg bg-[var(--foreground)] px-4 py-2 text-sm font-semibold text-[var(--background)] transition hover:opacity-85"
          >
            Descargar CSV clasificado
          </button>
        ) : null}
      </section>

      {mode === "historico" && previewHistorico.length > 0 ? (
        <section className="surface-panel max-w-5xl overflow-x-auto rounded-2xl p-4 md:p-6">
          <h2 className="mb-3 text-sm font-semibold">Vista previa (primeras filas del CSV)</h2>
          <table className="min-w-full border-collapse text-left text-xs md:text-sm">
            <thead>
              <tr className="border-b border-[color:color-mix(in_oklab,var(--foreground)_12%,transparent)] text-[color:color-mix(in_oklab,var(--foreground)_55%,transparent)]">
                <th className="py-2 pr-3 font-medium">#</th>
                <th className="py-2 pr-3 font-medium">MOVIMIENTO</th>
                <th className="py-2 pr-3 font-medium">TIPO</th>
                <th className="py-2 pr-3 font-medium">C1</th>
                <th className="py-2 pr-3 font-medium">C2</th>
                <th className="py-2 font-medium">C3</th>
              </tr>
            </thead>
            <tbody>
              {previewHistorico.map((r) => (
                <tr
                  key={`${r.dataLineNumber}-${r.movimiento}`}
                  className="border-b border-[color:color-mix(in_oklab,var(--foreground)_8%,transparent)]"
                >
                  <td className="py-2 pr-3 font-mono text-[12px] text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)]">
                    {r.dataLineNumber}
                  </td>
                  <td className="max-w-[220px] truncate py-2 pr-3 font-mono text-[12px] md:max-w-md">
                    {r.movimiento}
                  </td>
                  <td className="py-2 pr-3">{emptyDisplay(r.tipo_movimiento)}</td>
                  <td className="py-2 pr-3">{emptyDisplay(r.concepto_1)}</td>
                  <td className="py-2 pr-3">{emptyDisplay(r.concepto_2)}</td>
                  <td className="py-2">{emptyDisplay(r.concepto_3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {mode === "clasificar" && classifiedRows.length > 0 ? (
        <section className="surface-panel max-w-5xl overflow-x-auto rounded-2xl p-4 md:p-6">
          <h2 className="mb-3 text-sm font-semibold">Resultado (muestra)</h2>
          <table className="min-w-full border-collapse text-left text-xs md:text-sm">
            <thead>
              <tr className="border-b border-[color:color-mix(in_oklab,var(--foreground)_12%,transparent)] text-[color:color-mix(in_oklab,var(--foreground)_55%,transparent)]">
                <th className="py-2 pr-3 font-medium">{movementColumn ?? "MOVIMIENTO"}</th>
                <th className="py-2 pr-3 font-medium">TIPO</th>
                <th className="py-2 pr-3 font-medium">C1</th>
                <th className="py-2 pr-3 font-medium">C2</th>
                <th className="py-2 pr-3 font-medium">C3</th>
                <th className="py-2 font-medium">ESTADO</th>
              </tr>
            </thead>
            <tbody>
              {classifiedRows.slice(0, 40).map((r) => (
                <tr
                  key={`${r.dataLineNumber}-${r.movementText}`}
                  className="border-b border-[color:color-mix(in_oklab,var(--foreground)_8%,transparent)]"
                >
                  <td className="max-w-[240px] truncate py-2 pr-3 font-mono text-[12px] md:max-w-md">
                    {r.movementText}
                  </td>
                  <td className="py-2 pr-3">{emptyDisplay(r.tipo_movimiento)}</td>
                  <td className="py-2 pr-3">{emptyDisplay(r.concepto_1)}</td>
                  <td className="py-2 pr-3">{emptyDisplay(r.concepto_2)}</td>
                  <td className="py-2 pr-3">{emptyDisplay(r.concepto_3)}</td>
                  <td className="py-2">{r.estado_clasificacion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}
