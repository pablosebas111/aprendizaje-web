import type { Metadata } from "next";
import { OverviewGastosClient } from "./overview-gastos-client";

export const metadata: Metadata = {
  title: "Overview financiero",
  description: "Resumen de ingresos y gastos por clasificacion del ultimo CSV importado.",
};

export default function OverviewGastosPage() {
  return <OverviewGastosClient />;
}
