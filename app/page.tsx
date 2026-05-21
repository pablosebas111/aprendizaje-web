export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <h1 className="mb-4 max-w-4xl text-center text-4xl font-semibold tracking-tight md:text-6xl">
        Clasificador Inteligente de Gastos
      </h1>
      <p className="mb-10 max-w-2xl text-center text-lg leading-relaxed text-[color:color-mix(in_oklab,var(--foreground)_55%,transparent)]">
        Importa movimientos bancarios, clasificalos automaticamente y analiza tus gastos por
        categoria.
      </p>
      <a
        href="/importar-csv"
        className="surface-panel rounded-xl px-8 py-3 text-base font-semibold transition hover:opacity-90"
      >
        Importar CSV
      </a>
    </main>
  );
}
