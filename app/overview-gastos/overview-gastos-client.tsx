"use client";

import { useEffect, useMemo, useState } from "react";
import {
  loadClassifiedOverview,
  type StoredClassifiedOverview,
  type StoredOverviewRow,
} from "@/lib/csv/overview-storage";

type GroupRow = {
  label: string;
  count: number;
  amount: number;
};

const currency = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
});

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function expenseAmount(row: StoredOverviewRow, useOnlyNegativeAmounts: boolean): number {
  if (row.amount == null) return 0;
  if (useOnlyNegativeAmounts) return row.amount < 0 ? Math.abs(row.amount) : 0;
  return Math.abs(row.amount);
}

function groupBy(
  rows: StoredOverviewRow[],
  field: "tipo_movimiento" | "concepto_1",
  useOnlyNegativeAmounts: boolean,
): GroupRow[] {
  const groups = new Map<string, GroupRow>();

  for (const row of rows) {
    const label = row[field]?.trim() || "Sin clasificar";
    const current = groups.get(label) ?? { label, count: 0, amount: 0 };
    current.count += 1;
    current.amount += expenseAmount(row, useOnlyNegativeAmounts);
    groups.set(label, current);
  }

  return [...groups.values()].sort((a, b) => b.amount - a.amount || b.count - a.count);
}

export function OverviewGastosClient() {
  const [data, setData] = useState<StoredClassifiedOverview | null>(null);

  useEffect(() => {
    setData(loadClassifiedOverview());
  }, []);

  const summary = useMemo(() => {
    if (!data) return null;

    const rowsWithAmount = data.rows.filter((row) => row.amount != null);
    const hasNegativeAmounts = rowsWithAmount.some((row) => Number(row.amount) < 0);
    const totalSpent = data.rows.reduce(
      (sum, row) => sum + expenseAmount(row, hasNegativeAmounts),
      0,
    );
    const classifiedRows = data.rows.filter((row) => row.estado_clasificacion === "Clasificado");
    const unclassifiedRows = data.rows.filter((row) => row.estado_clasificacion !== "Clasificado");
    const topExpenses = [...data.rows]
      .map((row) => ({ row, expense: expenseAmount(row, hasNegativeAmounts) }))
      .filter((item) => item.expense > 0)
      .sort((a, b) => b.expense - a.expense)
      .slice(0, 12);

    return {
      rowsWithAmount,
      hasNegativeAmounts,
      totalSpent,
      classifiedRows,
      unclassifiedRows,
      byTipoMovimiento: groupBy(data.rows, "tipo_movimiento", hasNegativeAmounts),
      byConcepto1: groupBy(data.rows, "concepto_1", hasNegativeAmounts),
      topExpenses,
    };
  }, [data]);

  if (!data || !summary) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6 md:p-10">
        <header className="max-w-5xl space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Overview gastos</h1>
          <p className="max-w-3xl text-sm leading-relaxed text-[color:color-mix(in_oklab,var(--foreground)_55%,transparent)]">
            Todavia no hay un CSV clasificado guardado. Ve a Importar CSV, clasifica un archivo
            con una columna de importe y vuelve a esta pestaña.
          </p>
        </header>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 md:p-10">
      <header className="max-w-5xl space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Overview gastos</h1>
        <p className="max-w-3xl text-sm leading-relaxed text-[color:color-mix(in_oklab,var(--foreground)_55%,transparent)]">
          Resumen del ultimo CSV clasificado. Si el archivo contiene importes negativos, el panel
          los interpreta como gastos; si no, usa el valor absoluto de cada importe.
        </p>
        <p className="text-xs text-[color:color-mix(in_oklab,var(--foreground)_50%,transparent)]">
          Archivo: <span className="font-mono">{data.sourceFileName ?? "Sin nombre"}</span> ·
          guardado: <span className="font-mono">{formatDate(data.savedAt)}</span> · importe:{" "}
          <span className="font-mono">{data.amountColumn ?? "No detectado"}</span>
        </p>
      </header>

      <section className="grid max-w-5xl gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="surface-panel rounded-2xl p-5">
          <p className="text-xs uppercase tracking-wide text-[color:color-mix(in_oklab,var(--foreground)_50%,transparent)]">
            Movimientos clasificados
          </p>
          <p className="mt-2 text-3xl font-semibold tabular-nums">{summary.classifiedRows.length}</p>
        </div>
        <div className="surface-panel rounded-2xl p-5">
          <p className="text-xs uppercase tracking-wide text-[color:color-mix(in_oklab,var(--foreground)_50%,transparent)]">
            Total gastado
          </p>
          <p className="mt-2 text-3xl font-semibold tabular-nums">
            {currency.format(summary.totalSpent)}
          </p>
        </div>
        <div className="surface-panel rounded-2xl p-5">
          <p className="text-xs uppercase tracking-wide text-[color:color-mix(in_oklab,var(--foreground)_50%,transparent)]">
            Sin clasificar
          </p>
          <p className="mt-2 text-3xl font-semibold tabular-nums">{summary.unclassifiedRows.length}</p>
        </div>
        <div className="surface-panel rounded-2xl p-5">
          <p className="text-xs uppercase tracking-wide text-[color:color-mix(in_oklab,var(--foreground)_50%,transparent)]">
            Filas con importe
          </p>
          <p className="mt-2 text-3xl font-semibold tabular-nums">{summary.rowsWithAmount.length}</p>
        </div>
      </section>

      <section className="grid max-w-5xl gap-6 xl:grid-cols-2">
        <GroupedTable title="Gasto por TIPO MOVIMIENTO" rows={summary.byTipoMovimiento} />
        <GroupedTable title="Gasto por CONCEPTO 1" rows={summary.byConcepto1} />
      </section>

      <section className="surface-panel max-w-5xl overflow-x-auto rounded-2xl p-4 md:p-6">
        <h2 className="mb-3 text-sm font-semibold">Mayores gastos</h2>
        {summary.topExpenses.length === 0 ? (
          <p className="text-sm text-[color:color-mix(in_oklab,var(--foreground)_55%,transparent)]">
            No hay importes validos para mostrar en la tabla.
          </p>
        ) : (
          <table className="min-w-full border-collapse text-left text-xs md:text-sm">
            <thead>
              <tr className="border-b border-[color:color-mix(in_oklab,var(--foreground)_12%,transparent)] text-[color:color-mix(in_oklab,var(--foreground)_55%,transparent)]">
                <th className="py-2 pr-3 font-medium">Movimiento</th>
                <th className="py-2 pr-3 font-medium">Importe</th>
                <th className="py-2 pr-3 font-medium">TIPO</th>
                <th className="py-2 pr-3 font-medium">CONCEPTO 1</th>
                <th className="py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {summary.topExpenses.map(({ row, expense }) => (
                <tr
                  key={`${row.dataLineNumber}-${row.movementText}`}
                  className="border-b border-[color:color-mix(in_oklab,var(--foreground)_8%,transparent)]"
                >
                  <td className="max-w-[260px] truncate py-2 pr-3 font-mono text-[12px] md:max-w-md">
                    {row.movementText}
                  </td>
                  <td className="py-2 pr-3 font-mono tabular-nums">{currency.format(expense)}</td>
                  <td className="py-2 pr-3">{row.tipo_movimiento || "-"}</td>
                  <td className="py-2 pr-3">{row.concepto_1 || "-"}</td>
                  <td className="py-2">{row.estado_clasificacion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function GroupedTable({ title, rows }: { title: string; rows: GroupRow[] }) {
  return (
    <section className="surface-panel overflow-x-auto rounded-2xl p-4 md:p-6">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      <table className="min-w-full border-collapse text-left text-xs md:text-sm">
        <thead>
          <tr className="border-b border-[color:color-mix(in_oklab,var(--foreground)_12%,transparent)] text-[color:color-mix(in_oklab,var(--foreground)_55%,transparent)]">
            <th className="py-2 pr-3 font-medium">Categoria</th>
            <th className="py-2 pr-3 font-medium">Movs.</th>
            <th className="py-2 font-medium">Gasto</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 12).map((row) => (
            <tr
              key={row.label}
              className="border-b border-[color:color-mix(in_oklab,var(--foreground)_8%,transparent)]"
            >
              <td className="py-2 pr-3">{row.label}</td>
              <td className="py-2 pr-3 font-mono tabular-nums">{row.count}</td>
              <td className="py-2 font-mono tabular-nums">{currency.format(row.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
