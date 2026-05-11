export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <h1 className="mb-4 text-center text-4xl font-semibold tracking-tight md:text-6xl">
        Mi Startup IA 🚀
      </h1>
      <p className="mb-10 max-w-lg text-center text-lg text-[color:color-mix(in_oklab,var(--foreground)_55%,transparent)]">
        Construyendo aplicaciones con agentes IA
      </p>
      <button
        type="button"
        className="surface-panel rounded-xl px-8 py-3 text-base font-semibold transition hover:opacity-90"
      >
        Empezar
      </button>
    </main>
  );
}