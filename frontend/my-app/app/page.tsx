export default function Home() {
  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-col gap-4 px-16 py-32">
        <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          SIGMA-FCEN
        </h1>
        <p className="text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          Sistema de gestión de monitorías académicas de la Facultad de Ciencias Exactas y
          Naturales.
        </p>
      </main>
    </div>
  );
}
