import Link from "next/link";

import { IconoDespensa } from "@/components/iconos";

export default function LayoutAuth({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="px-5 py-6">
        <Link
          href="/"
          className="mx-auto flex w-fit items-center gap-2.5 font-bold tracking-tight text-slate-900 dark:text-white"
        >
          <IconoDespensa className="size-6 text-marca-700 dark:text-marca-400" />
          Despensa
        </Link>
      </header>

      <main id="contenido" className="flex flex-1 items-start justify-center px-5 pb-16">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
