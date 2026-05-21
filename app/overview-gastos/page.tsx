import type { Metadata } from "next";
import { OverviewGastosClient } from "./overview-gastos-client";

export const metadata: Metadata = {
  title: "Overview gastos",
  description: "Resumen de gastos por clasificacion del ultimo CSV importado.",
};

export default function OverviewGastosPage() {
  return <OverviewGastosClient />;
}
