import { BannerVerificacion, Cabecera } from "@/components/cabecera";
import { requireUsuario } from "@/lib/authz";

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  // Puerta única de la zona privada. El middleware ya desvía a quien no trae
  // cookie, pero la comprobación real contra la base de datos ocurre aquí.
  const sesion = await requireUsuario();

  return (
    <>
      <Cabecera usuario={sesion.user} />
      <BannerVerificacion verificado={Boolean(sesion.user.emailVerifiedAt)} />
      <main id="contenido" className="mx-auto w-full max-w-6xl flex-1 px-4 py-7 sm:px-6">
        {children}
      </main>
    </>
  );
}
