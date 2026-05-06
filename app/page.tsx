import Image from "next/image";

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-10">

      <h1 className="text-6xl font-bold mb-6">
        Mi Startup IA 🚀
      </h1>

      <p className="text-xl text-gray-400 mb-8">
        Construyendo aplicaciones con agentes IA
      </p>

      <button className="bg-white text-black px-6 py-3 rounded-xl text-lg font-semibold hover:scale-105 transition">
        Empezar
      </button>

    </main>
  );
}