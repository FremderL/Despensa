import {
  BotonExpulsar,
  BotonRevocarInvitacion,
  FormularioInvitar,
  SelectorRol,
} from "@/components/formularios-miembros";
import { Avatar, Insignia, Seccion } from "@/components/ui";
import { DESCRIPCION_ROL, ETIQUETA_ROL, JERARQUIA, requireMiembro } from "@/lib/authz";
import { formatearFecha, tiempoRelativo } from "@/lib/format";
import { invitacionesPendientes, miembrosDe } from "@/lib/queries";
import { ROLES, type Rol } from "@/lib/catalogos";

export const metadata = { title: "Miembros" };

export default async function PaginaMiembros({
  params,
}: {
  params: Promise<{ householdId: string }>;
}) {
  const { householdId } = await params;
  const ctx = await requireMiembro(householdId, "viewer");

  const [miembros, pendientes] = await Promise.all([
    miembrosDe(householdId),
    ctx.puede("admin") ? invitacionesPendientes(householdId) : Promise.resolve([]),
  ]);

  const esAdmin = ctx.puede("admin");
  const yo = ctx.sesion.user.id;

  /** Roles que este usuario puede otorgar, según su propio nivel. */
  const rolesOtorgables: Rol[] = ROLES.filter((r) =>
    ctx.rol === "owner" ? true : JERARQUIA[r] < JERARQUIA[ctx.rol],
  );

  return (
    <div className="space-y-6">
      <Seccion
        titulo={`Miembros (${miembros.length})`}
        descripcion="Quién tiene acceso a esta despensa y con qué permisos"
      >
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {miembros.map((m) => {
            // Sólo se puede gestionar a quien está estrictamente por debajo.
            const gestionable = esAdmin && m.userId !== yo && JERARQUIA[ctx.rol] > JERARQUIA[m.role];

            return (
              <li key={m.userId} className="flex flex-wrap items-center gap-x-4 gap-y-3 py-4 first:pt-0">
                <Avatar nombre={m.name} color={m.avatarColor} tamano={40} />

                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900 dark:text-white">
                    {m.name}
                    {m.userId === yo && (
                      <span className="text-xs font-normal text-slate-500 dark:text-slate-400">(tú)</span>
                    )}
                    {!m.emailVerifiedAt && (
                      <Insignia className="bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-950/60 dark:text-amber-300">
                        Correo sin confirmar
                      </Insignia>
                    )}
                  </p>
                  <p className="truncate text-sm text-slate-500 dark:text-slate-400">{m.email}</p>
                  <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                    Desde {formatearFecha(m.joinedAt)}
                  </p>
                </div>

                {gestionable ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <SelectorRol
                      householdId={householdId}
                      userId={m.userId}
                      rolActual={m.role}
                      rolesDisponibles={rolesOtorgables}
                    />
                    <BotonExpulsar householdId={householdId} userId={m.userId} nombre={m.name} />
                  </div>
                ) : (
                  <Insignia>{ETIQUETA_ROL[m.role]}</Insignia>
                )}
              </li>
            );
          })}
        </ul>
      </Seccion>

      {esAdmin && (
        <>
          <Seccion
            titulo="Invitar a alguien"
            descripcion="Sólo se entra por invitación: no hay forma de encontrar esta despensa desde fuera"
          >
            <FormularioInvitar
              householdId={householdId}
              puedeInvitar={esAdmin}
              correoVerificado={Boolean(ctx.sesion.user.emailVerifiedAt)}
            />
          </Seccion>

          <Seccion
            titulo={`Invitaciones pendientes (${pendientes.length})`}
            descripcion="Enlaces creados que todavía nadie ha usado"
          >
            {pendientes.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No hay invitaciones pendientes.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {pendientes.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-800 dark:text-slate-100">
                        {i.email ?? "Enlace abierto (sin correo asignado)"}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Rol {ETIQUETA_ROL[i.role]} · creada por {i.creador ?? "—"} ·{" "}
                        caduca {tiempoRelativo(i.expiresAt)}
                      </p>
                    </div>
                    <BotonRevocarInvitacion householdId={householdId} id={i.id} />
                  </li>
                ))}
              </ul>
            )}
          </Seccion>
        </>
      )}

      <Seccion titulo="Qué puede hacer cada rol" descripcion="Los permisos se aplican en el servidor">
        <dl className="grid gap-4 sm:grid-cols-2">
          {ROLES.map((r) => (
            <div key={r} className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50">
              <dt className="font-semibold text-slate-900 dark:text-white">{ETIQUETA_ROL[r]}</dt>
              <dd className="mt-1 text-sm text-slate-600 dark:text-slate-400">{DESCRIPCION_ROL[r]}</dd>
            </div>
          ))}
        </dl>
      </Seccion>
    </div>
  );
}
