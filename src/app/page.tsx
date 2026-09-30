import Link from "next/link";
import { redirect } from "next/navigation";

import {
  IconoAlerta,
  IconoCaja,
  IconoDespensa,
  IconoEscudo,
  IconoPersonas,
  IconoReloj,
} from "@/components/iconos";
import { BotonEnlace } from "@/components/ui";
import { sesionActual } from "@/lib/session";

export default async function Portada() {
  // Quien ya entró no necesita ver la presentación.
  if (await sesionActual()) redirect("/despensas");

  return (
    <>
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
        <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <span className="flex items-center gap-2.5 font-bold tracking-tight text-slate-900 dark:text-white">
            <IconoDespensa className="size-6 text-marca-700 dark:text-marca-400" />
            Despensa
          </span>
          <div className="flex items-center gap-2">
            <BotonEnlace href="/ingresar" variante="fantasma" tamano="sm">
              Ingresar
            </BotonEnlace>
            <BotonEnlace href="/registro" tamano="sm">
              Crear cuenta
            </BotonEnlace>
          </div>
        </nav>
      </header>

      <main id="contenido" className="flex-1">
        {/* ------------------------------- Portada ------------------------------ */}
        <section className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 -z-10 opacity-60 dark:opacity-30"
            style={{
              background:
                "radial-gradient(60rem 30rem at 50% -10rem, var(--color-marca-200), transparent 70%)",
            }}
            aria-hidden
          />
          <div className="mx-auto max-w-3xl px-5 py-20 text-center sm:py-28">
            <p className="inline-flex items-center gap-2 rounded-full bg-marca-100 px-3.5 py-1.5 text-xs font-semibold text-marca-800 ring-1 ring-marca-600/20 ring-inset dark:bg-marca-950 dark:text-marca-200">
              <IconoEscudo className="size-3.5" />
              Inventario compartido, con la seguridad tomada en serio
            </p>

            <h1 className="mt-6 text-4xl font-bold tracking-tight text-balance text-slate-900 sm:text-5xl dark:text-white">
              Sabe qué hay en casa <span className="text-marca-700 dark:text-marca-400">antes</span> de
              que caduque
            </h1>

            <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-pretty text-slate-600 dark:text-slate-300">
              Comida preparada, latas y no perecederos, cosas del baño, limpieza, botiquín. Todo en un
              inventario que tu familia o tus compañeros de piso mantienen entre todos, con avisos antes
              de que algo se eche a perder.
            </p>

            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <BotonEnlace href="/registro" tamano="lg">
                Empezar gratis
              </BotonEnlace>
              <BotonEnlace href="/ingresar" variante="secundario" tamano="lg">
                Ya tengo cuenta
              </BotonEnlace>
            </div>
          </div>
        </section>

        {/* ----------------------------- Capacidades ---------------------------- */}
        <section className="mx-auto max-w-6xl px-5 pb-20">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Capacidad
              icono={<IconoReloj className="size-5" />}
              titulo="Control de caducidad por lote"
              texto="Cada compra se registra por separado con su propia fecha. Así sabes que caduca el yogur del martes, no «los yogures» en abstracto."
            />
            <Capacidad
              icono={<IconoAlerta className="size-5" />}
              titulo="Avisos antes, no después"
              texto="Un semáforo ordena la despensa por urgencia: caducado, caduca hoy, caduca pronto. Tú decides con cuántos días de antelación avisar."
            />
            <Capacidad
              icono={<IconoCaja className="size-5" />}
              titulo="Cualquier cosa, no sólo comida"
              texto="Categorías para higiene personal, limpieza, botiquín, mascotas o bebé, y ubicaciones como alacena, refrigerador o baño."
            />
            <Capacidad
              icono={<IconoPersonas className="size-5" />}
              titulo="Se entra por invitación"
              texto="Nadie llega por casualidad. Invitas por correo o con un enlace de un solo uso, y eliges si esa persona administra, edita o sólo mira."
            />
            <Capacidad
              icono={<IconoEscudo className="size-5" />}
              titulo="Seguridad de verdad"
              texto="Argon2id para las contraseñas, sesiones revocables, límite de intentos, verificación de origen y bitácora de todo lo sensible."
            />
            <Capacidad
              icono={<IconoDespensa className="size-5" />}
              titulo="Varias despensas"
              texto="La casa familiar, el departamento compartido, la oficina. Cada una con sus miembros, sus categorías y sus reglas."
            />
          </div>
        </section>

        {/* ------------------------------ Seguridad ----------------------------- */}
        <section className="border-y border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto max-w-4xl px-5 py-16">
            <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Qué hacemos con tus datos, en concreto
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600 dark:text-slate-300">
              Una despensa compartida dice mucho de una casa: cuánta gente vive ahí, qué medicamentos
              toman, cuándo se va de viaje. Por eso el acceso está cerrado por defecto.
            </p>

            <dl className="mt-10 grid gap-x-10 gap-y-7 sm:grid-cols-2">
              <Punto titulo="Las contraseñas no se guardan">
                Sólo su hash Argon2id, el algoritmo recomendado hoy por OWASP. Ni el administrador de la
                base de datos puede leerlas.
              </Punto>
              <Punto titulo="Las sesiones se pueden cortar">
                Son identificadores opacos guardados cifrados. Si pierdes el móvil, cierras esa sesión
                desde tu cuenta y deja de valer al instante.
              </Punto>
              <Punto titulo="Cada despensa está aislada">
                Toda consulta se filtra por tu pertenencia comprobada. Cambiar un número en la dirección
                no te lleva a la despensa de nadie.
              </Punto>
              <Punto titulo="Los enlaces de invitación caducan">
                Un solo uso, con fecha de vencimiento, revocables en cualquier momento y opcionalmente
                atados a una dirección de correo concreta.
              </Punto>
              <Punto titulo="Se limita la fuerza bruta">
                Los intentos de acceso se cuentan por red y por cuenta, con bloqueo temporal creciente.
              </Punto>
              <Punto titulo="Queda registro">
                Accesos, invitaciones, cambios de rol y de contraseña se anotan con fecha, red y
                dispositivo, y puedes consultarlos.
              </Punto>
            </dl>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 py-8 dark:border-slate-800">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-5 text-sm text-slate-500 sm:flex-row sm:justify-between dark:text-slate-400">
          <p>Despensa · inventario doméstico compartido</p>
          <p className="flex gap-4">
            <Link href="/ingresar" className="hover:text-slate-900 dark:hover:text-white">
              Ingresar
            </Link>
            <Link href="/registro" className="hover:text-slate-900 dark:hover:text-white">
              Crear cuenta
            </Link>
          </p>
        </div>
      </footer>
    </>
  );
}

function Capacidad({ icono, titulo, texto }: { icono: React.ReactNode; titulo: string; texto: string }) {
  return (
    <div className="tarjeta p-6">
      <div className="inline-flex rounded-xl bg-marca-50 p-2.5 text-marca-700 dark:bg-marca-950 dark:text-marca-300">
        {icono}
      </div>
      <h3 className="mt-4 font-semibold text-slate-900 dark:text-white">{titulo}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{texto}</p>
    </div>
  );
}

function Punto({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-semibold text-slate-900 dark:text-white">{titulo}</dt>
      <dd className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{children}</dd>
    </div>
  );
}
