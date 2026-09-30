import { NavDespensa } from "@/components/nav-despensa";
import { requireMiembro } from "@/lib/authz";

export default async function LayoutDespensa({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ householdId: string }>;
}) {
  const { householdId } = await params;
  // Barrera de autorización de toda la sección: sin pertenencia, 404.
  const ctx = await requireMiembro(householdId, "viewer");

  return (
    <div className="space-y-6">
      <NavDespensa despensa={ctx.despensa} rol={ctx.rol} />
      {children}
    </div>
  );
}
