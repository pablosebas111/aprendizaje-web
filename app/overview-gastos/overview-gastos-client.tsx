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

function groupBy(
  rows: StoredOverviewRow[],
  field: "tipo_movimiento" | "concepto_1",
  kind: "expense" | "income",
): GroupRow[] {
  const groups = new Map<string, GroupRow>();

  for (const row of rows) {
    if (row.amount == null) continue;
    if (kind === "expense" && row.amount >= 0) continue;
    if (kind === "income" && row.amount <= 0) continue;

    const label = row[field]?.trim() || "Sin clasificar";
    const current = groups.get(label) ?? { label, count: 0, amount: 0 };
    current.count += 1;
    current.amount += kind === "expense" ? Math.abs(row.amount) : row.amount;
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
    const incomeRows = rowsWithAmount.filter((row) => Number(row.amount) > 0);
    const expenseRows = rowsWithAmount.filter((row) => Number(row.amount) < 0);
    const classifiedRows = data.rows.filter((row) => row.estado_clasificacion === "Clasificado");
    const unclassifiedRows = data.rows.filter((row) => row.estado_clasificacion !== "Clasificado");
    const totalIncome = incomeRows.reduce((sum, row) => sum + Number(row.amount), 0);
    const totalExpenses = expenseRows.reduce((sum, row) => sum + Math.abs(Number(row.amount)), 0);
    const netBalance = rowsWithAmount.reduce((sum, row) => sum + Number(row.amount), 0);
    const topExpenses = expenseRows
      .map((row) => ({ row, amount: Math.abs(Number(row.amount)) }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 12);
    const topIncome = incomeRows
      .map((row) => ({ row, amount: Number(row.amount) }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 12);

    return {
      rowsWithAmount,
      incomeRows,
      expenseRows,
      classifiedRows,
      unclassifiedRows,
      totalIncome,
      totalExpenses,
      netBalance,
      expensesByTipoMovimiento: groupBy(data.rows, "tipo_movimiento", "expense"),
      incomeByTipoMovimiento: groupBy(data.rows, "tipo_movimiento", "income"),
      expensesByConcepto1: groupBy(data.rows, "concepto_1", "expense"),
      incomeByConcepto1: groupBy(data.rows, "concepto_1", "income"),
      topExpenses,
      topIncome,
    };
  }, [data]);

  if (!data || !summary) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6 md:p-10">
        <header className="max-w-5xl space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Overview financiero
          </h1>
          <p className="max-w-3xl text-sm leading-relaxed text-[color:color-mix(in_oklab,var(--foreground)_55%,transparent)]">
            Todavia no hay un CSV clasificado guardado. Ve a Importar CSV, clasifica un archivo
            con una columna de importe y vuelve a esta pestana.
          </p>
        </header>
      </div>
    );
  }

  const diagnostics = data.diagnostics ?? {
    validAmountRows: summary.rowsWithAmount.length,
    negativeAmountRows: summary.expenseRows.length,
    positiveAmountRows: summary.incomeRows.length,
    zeroAmountRows: 0,
    sampleRawValues: [],
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 md:p-10">
      <header className="max-w-5xl space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Overview financiero
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-[color:color-mix(in_oklab,var(--foreground)_55%,transparent)]">
          Analiza ingresos y gastos del ultimo CSV clasificado. Los importes negativos se
          interpretan como gastos y los importes positivos como ingresos.
        </p>
        <p className="text-xs text-[color:color-mix(in_oklab,var(--foreground)_50%,transparent)]">
          Archivo: <span className="font-mono">{data.sourceFileName ?? "Sin nombre"}</span> -
          guardado: <span className="font-mono">{formatDate(data.savedAt)}</span> - importe:{" "}
          <span className="font-mono">{data.amountColumn ?? "No detectado"}</span>
        </p>
      </header>

      <section className="grid max-w-5xl gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Ingresos" value={currency.format(summary.totalIncome)} />
        <MetricCard label="Gastos" value={currency.format(summary.totalExpenses)} />
        <MetricCard label="Balance neto" value={currency.format(summary.netBalance)} />
        <MetricCard label="Con importe" value={String(summary.rowsWithAmount.length)} />
        <MetricCard label="Sin clasificar" value={String(summary.unclassifiedRows.length)} />
      </section>

      <section className="surface-panel max-w-5xl rounded-2xl p-4 md:p-6">
        <h2 className="mb-3 text-sm font-semibold">Autodiagnostico de importes</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-5">
          <DiagnosticItem label="Columna" value={data.amountColumn ?? "No detectada"} />
          <DiagnosticItem label="Validos" value={String(diagnostics.validAmountRows)} />
          <DiagnosticItem label="Negativos" value={String(diagnostics.negativeAmountRows)} />
          <DiagnosticItem label="Positivos" value={String(diagnostics.positiveAmountRows)} />
          <DiagnosticItem label="Cero" value={String(diagnostics.zeroAmountRows)} />
        </dl>
        <p className="mt-3 text-xs text-[color:color-mix(in_oklab,var(--foreground)_55%,transparent)]">
          Muestra leida:{" "}
          <span className="font-mono">
            {diagnostics.sampleRawValues.length ? diagnostics.sampleRawValues.join(" | ") : "Sin muestra"}
          </span>
        </p>
      </section>

      <section className="grid max-w-5xl gap-6 xl:grid-cols-2">
        <GroupedTable title="Gastos por TIPO MOVIMIENTO" rows={summary.expensesByTipoMovimiento} />
        <GroupedTable title="Ingresos por TIPO MOVIMIENTO" rows={summary.incomeByTipoMovimiento} />
        <GroupedTable title="Gastos por CONCEPTO 1" rows={summary.expensesByConcepto1} />
        <GroupedTable title="Ingresos por CONCEPTO 1" rows={summary.incomeByConcepto1} />
      </section>

      <section className="grid max-w-5xl gap-6 xl:grid-cols-2">
        <MovementTable title="Mayores gastos" rows={summary.topExpenses} />
        <MovementTable title="Mayores ingresos" rows={summary.topIncome} />
      </section>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-panel rounded-2xl p-5">
      <p className="text-xs uppercase tracking-wide text-[color:color-mix(in_oklab,var(--foreground)_50%,transparent)]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function DiagnosticItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-subtle rounded-lg px-3 py-2">
      <dt className="text-xs uppercase tracking-wide text-[color:color-mix(in_oklab,var(--foreground)_50%,transparent)]">
        {label}
      </dt>
      <dd className="mt-1 font-mono text-sm tabular-nums">{value}</dd>
    </div>
  );
}

function GroupedTable({ title, rows }: { title: string; rows: GroupRow[] }) {
  return (
    <section className="surface-panel overflow-x-auto rounded-2xl p-4 md:p-6">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-[color:color-mix(in_oklab,var(--foreground)_55%,transparent)]">
          Sin movimientos para esta vista.
        </p>
      ) : (
        <table className="min-w-full border-collapse text-left text-xs md:text-sm">
          <thead>
            <tr className="border-b border-[color:color-mix(in_oklab,var(--foreground)_12%,transparent)] text-[color:color-mix(in_oklab,var(--foreground)_55%,transparent)]">
              <th className="py-2 pr-3 font-medium">Categoria</th>
              <th className="py-2 pr-3 font-medium">Movs.</th>
              <th className="py-2 font-medium">Importe</th>
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
      )}
    </section>
  );
}

function MovementTable({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ row: StoredOverviewRow; amount: number }>;
}) {
  return (
    <section className="surface-panel overflow-x-auto rounded-2xl p-4 md:p-6">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-[color:color-mix(in_oklab,var(--foreground)_55%,transparent)]">
          No hay importes validos para mostrar.
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
            {rows.map(({ row, amount }) => (
              <tr
                key={`${row.dataLineNumber}-${row.movementText}`}
                className="border-b border-[color:color-mix(in_oklab,var(--foreground)_8%,transparent)]"
              >
                <td className="max-w-[260px] truncate py-2 pr-3 font-mono text-[12px] md:max-w-md">
                  {row.movementText}
                </td>
                <td className="py-2 pr-3 font-mono tabular-nums">{currency.format(amount)}</td>
                <td className="py-2 pr-3">{row.tipo_movimiento || "-"}</td>
                <td className="py-2 pr-3">{row.concepto_1 || "-"}</td>
                <td className="py-2">{row.estado_clasificacion}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
