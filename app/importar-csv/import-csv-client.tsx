"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { normalizeMovement } from "@/lib/csv/normalize";
import { matchMovementAgainstKb } from "@/lib/csv/match";
import { parseFixedMappingCsv } from "@/lib/csv/parse-fixed-csv";
import {
  loadKnowledgeBase,
  saveKnowledgeBase,
  upsertKbEntries,
  validateKnowledgeBase,
} from "@/lib/csv/kb-storage";
import type { KBEntry, MovementKnowledgeBase } from "@/lib/csv/kb-types";
import type { FixedCsvRow } from "@/lib/csv/parse-fixed-csv";

const LOG = "[CSV-KB]";

type Mode = "historico" | "clasificar";

type ClassifiedRow = FixedCsvRow & {
  filled_tipo_movimiento: string | null;
  filled_concepto_1: string | null;
  filled_concepto_2: string | null;
  filled_concepto_3: string | null;
  matchKind: string | null;
  score: number | null;
  noMatchReason: string | null;
};

export function ImportCsvClient() {
  const [mode, setMode] = useState<Mode>("historico");
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [kb, setKb] = useState<MovementKnowledgeBase | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [lastStats, setLastStats] = useState<Record<string, string | number> | null>(null);
  const [previewHistorico, setPreviewHistorico] = useState<FixedCsvRow[]>([]);
  const [previewClasificar, setPreviewClasificar] = useState<ClassifiedRow[]>([]);

  useEffect(() => {
    queueMicrotask(() => {
      const k = loadKnowledgeBase();
      setKb(k);
      console.log(
        LOG,
        "KB cargada al montar. Registros en memoria histórica:",
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
          setStatus("El archivo JSON no tiene formato de KB válido.");
          console.warn(LOG, "Importación de KB rechazada: formato inválido.");
          return;
        }

        saveKnowledgeBase(parsed);
        setKb(parsed);
        setLastStats({
          registros_importados_kb: Object.keys(parsed.byNormalizedKey).length,
        });
        setStatus("KB importada correctamente. Se reemplazó la memoria local.");
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

  const readFile = (file: File) => {
    setFileName(file.name);
    setStatus(null);
    setLastStats(null);
    setPreviewHistorico([]);
    setPreviewClasificar([]);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const parsed = parseFixedMappingCsv(text);
      if (!parsed.ok) {
        setStatus(parsed.message);
        console.log(LOG, "Importación detenida:", parsed.message);
        return;
      }

      const currentKb = refreshKb();

      if (mode === "historico") {
        processHistorico(parsed.rows, currentKb);
      } else {
        processClasificar(parsed.rows, currentKb);
      }
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
        const msg = `Fila ${row.dataLineNumber}: MOVIMIENTO vacío → descartada (no silenciosa).`;
        if (skipSamples.length < 8) skipSamples.push(msg);
        console.warn(LOG, msg);
        continue;
      }

      const nk = normalizeMovement(row.movimiento);
      console.log(LOG, "histórico: fila", row.dataLineNumber, "movimiento normalizado=", JSON.stringify(nk));

      if (!nk) {
        skippedEmptyMovimiento += 1;
        const msg = `Fila ${row.dataLineNumber}: MOVIMIENTO sin caracteres alfanuméricos tras normalizar → descartada.`;
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

    console.log(LOG, "Resumen histórico:", {
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
        ? `Importación histórica completada con ${skippedEmptyMovimiento} fila(s) descartadas (ver consola).`
        : "Importación histórica completada.",
    );

    if (skipSamples.length) {
      console.log(LOG, "Muestra de descartes:", skipSamples);
    }
  };

  const processClasificar = (rows: FixedCsvRow[], baseKb: MovementKnowledgeBase) => {
    let skippedEmptyMovimiento = 0;
    let skippedSinClaveTrasNormalizar = 0;
    const out: ClassifiedRow[] = [];

    for (const row of rows) {
      if (!row.movimiento.trim()) {
        skippedEmptyMovimiento += 1;
        console.warn(
          LOG,
          `Fila ${row.dataLineNumber}: MOVIMIENTO vacío → sin clasificación.`,
        );
        continue;
      }

      const nk = normalizeMovement(row.movimiento);
      if (!nk) {
        skippedSinClaveTrasNormalizar += 1;
        console.warn(
          LOG,
          `Fila ${row.dataLineNumber}: MOVIMIENTO sin clave normalizada (solo símbolos) → descartada.`,
        );
        continue;
      }

      const m = matchMovementAgainstKb(row.movimiento, baseKb);
      console.log(LOG, "clasificar: fila", row.dataLineNumber, {
        matched: m.matched,
        matchKind: m.matchKind,
        score: m.score,
        tipo_movimiento_rellenado: m.matched ? m.tipo_movimiento : null,
        concepto_1_rellenado: m.matched ? m.concepto_1 : null,
        concepto_2_rellenado: m.matched ? m.concepto_2 : null,
        concepto_3_rellenado: m.matched ? m.concepto_3 : null,
        noMatchReason: m.noMatchReason,
      });

      out.push({
        ...row,
        filled_tipo_movimiento: m.matched ? m.tipo_movimiento : null,
        filled_concepto_1: m.matched ? m.concepto_1 : null,
        filled_concepto_2: m.matched ? m.concepto_2 : null,
        filled_concepto_3: m.matched ? m.concepto_3 : null,
        matchKind: m.matchKind,
        score: m.score,
        noMatchReason: m.noMatchReason,
      });
    }

    const matched = out.filter((r) => r.matchKind !== null).length;
    const unmatched = out.length - matched;

    console.log(LOG, "Resumen clasificación:", {
      filasEnCsv: rows.length,
      filasClasificables: out.length,
      descartadas_movimiento_vacio: skippedEmptyMovimiento,
      descartadas_sin_clave_normalizada: skippedSinClaveTrasNormalizar,
      matches: matched,
      sin_match: unmatched,
      kb_size: Object.keys(baseKb.byNormalizedKey).length,
    });

    setPreviewClasificar(out.slice(0, 40));
    setLastStats({
      filas_en_csv: rows.length,
      filas_clasificadas: out.length,
      descartadas_movimiento_vacio: skippedEmptyMovimiento,
      descartadas_sin_clave_norm: skippedSinClaveTrasNormalizar,
      con_match: matched,
      sin_match: unmatched,
      kb_consultada: Object.keys(baseKb.byNormalizedKey).length,
    });
    setStatus("Clasificación completada (solo lectura de KB; no se modifica el histórico).");
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
        ? "Construir / ampliar memoria histórica"
        : "Clasificar nuevos movimientos contra el histórico",
    [mode],
  );

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 md:p-10">
      <header className="max-w-5xl space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Importar CSV</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-[color:color-mix(in_oklab,var(--foreground)_55%,transparent)]">
          Mapping fijo de columnas: <span className="font-mono text-[13px]">MOVIMIENTO</span>,{" "}
          <span className="font-mono text-[13px]">TIPO MOVIMIENTO</span>,{" "}
          <span className="font-mono text-[13px]">CONCEPTO 1</span>,{" "}
          <span className="font-mono text-[13px]">CONCEPTO 2</span>,{" "}
          <span className="font-mono text-[13px]">CONCEPTO 3</span>. Sin autodetección de
          columnas. Trazas detalladas en la consola del navegador ({LOG}).
        </p>
      </header>

      <div className="flex max-w-5xl flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode("historico")}
          className={[
            "rounded-full px-4 py-2 text-sm font-medium transition-colors",
            mode === "historico"
              ? "surface-subtle text-[var(--foreground)]"
              : "text-[color:color-mix(in_oklab,var(--foreground)_65%,transparent)] hover:surface-subtle",
          ].join(" ")}
        >
          Histórico → KB
        </button>
        <button
          type="button"
          onClick={() => setMode("clasificar")}
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
            <p className="text-sm font-medium">Memoria histórica persistente</p>
            <p className="text-xs text-[color:color-mix(in_oklab,var(--foreground)_55%,transparent)]">
              Registros únicos indexados por MOVIMIENTO normalizado (localStorage).
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
          <span className="text-sm font-medium">Arrastra un CSV aquí o haz clic para elegir</span>
          <span className="text-xs text-[color:color-mix(in_oklab,var(--foreground)_50%,transparent)]">
            UTF-8 recomendado · cabecera obligatoria con nombres fijos
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
                  <td className="py-2 pr-3">{r.tipo_movimiento || "—"}</td>
                  <td className="py-2 pr-3">{r.concepto_1 || "—"}</td>
                  <td className="py-2 pr-3">{r.concepto_2 || "—"}</td>
                  <td className="py-2">{r.concepto_3 || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {mode === "clasificar" && previewClasificar.length > 0 ? (
        <section className="surface-panel max-w-5xl overflow-x-auto rounded-2xl p-4 md:p-6">
          <h2 className="mb-3 text-sm font-semibold">Resultado (muestra)</h2>
          <table className="min-w-full border-collapse text-left text-xs md:text-sm">
            <thead>
              <tr className="border-b border-[color:color-mix(in_oklab,var(--foreground)_12%,transparent)] text-[color:color-mix(in_oklab,var(--foreground)_55%,transparent)]">
                <th className="py-2 pr-2 font-medium">#</th>
                <th className="py-2 pr-2 font-medium">MOVIMIENTO</th>
                <th className="py-2 pr-2 font-medium">Match</th>
                <th className="py-2 pr-2 font-medium">Score</th>
                <th className="py-2 pr-2 font-medium">TIPO</th>
                <th className="py-2 pr-2 font-medium">C1</th>
                <th className="py-2 pr-2 font-medium">C2</th>
                <th className="py-2 font-medium">C3</th>
              </tr>
            </thead>
            <tbody>
              {previewClasificar.map((r) => (
                <tr
                  key={`${r.dataLineNumber}-${r.movimiento}`}
                  className="border-b border-[color:color-mix(in_oklab,var(--foreground)_8%,transparent)]"
                >
                  <td className="py-2 pr-2 font-mono text-[12px]">{r.dataLineNumber}</td>
                  <td className="max-w-[180px] truncate py-2 pr-2 font-mono text-[12px] md:max-w-sm">
                    {r.movimiento}
                  </td>
                  <td className="py-2 pr-2">{r.matchKind ?? "—"}</td>
                  <td className="py-2 pr-2 font-mono text-[12px]">
                    {r.score != null ? r.score.toFixed(3) : "—"}
                  </td>
                  <td className="py-2 pr-2">{r.filled_tipo_movimiento ?? "—"}</td>
                  <td className="py-2 pr-2">{r.filled_concepto_1 ?? "—"}</td>
                  <td className="py-2 pr-2">{r.filled_concepto_2 ?? "—"}</td>
                  <td className="py-2">{r.filled_concepto_3 ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-[color:color-mix(in_oklab,var(--foreground)_50%,transparent)]">
            Si no hay match, tipo de movimiento y conceptos quedan vacíos (null en datos; aquí se
            muestran como —). Motivo exacto en consola por fila.
          </p>
        </section>
      ) : null}
    </div>
  );
}
