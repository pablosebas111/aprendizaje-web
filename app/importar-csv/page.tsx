import type { Metadata } from "next";
import { ImportCsvClient } from "./import-csv-client";

export const metadata: Metadata = {
  title: "Importar CSV",
  description: "Importación CSV con memoria histórica y matching determinista.",
};

export default function ImportarCsvPage() {
  return <ImportCsvClient />;
}
