import { createClient } from "@/lib/supabase/server";

interface AuditEntry {
  id: number;
  action: string;
  target: string | null;
  details: Record<string, unknown>;
  created_at: string;
  admin: string | null;
}

export default async function AuditPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_audit_log");
  if (error) throw new Error(error.message);
  const entries = (data ?? []) as AuditEntry[];
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">Journal d&apos;administration</h1>
      <p className="text-sm text-brume">Toutes les sanctions, ajustements d&apos;argent et changements de prix (100 derniers).</p>
      <div className="overflow-x-auto rounded-2xl bg-papyrus p-4 ring-1 ring-encre/5">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs text-brume">
            <tr>
              <th className="py-1 font-semibold">Date</th>
              <th className="py-1 font-semibold">Par</th>
              <th className="py-1 font-semibold">Action</th>
              <th className="py-1 font-semibold">Cible</th>
              <th className="py-1 font-semibold">Détails</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-encre/5">
            {entries.length === 0 && (
              <tr>
                <td colSpan={5} className="py-3 text-brume">
                  Aucune action pour l&apos;instant.
                </td>
              </tr>
            )}
            {entries.map((e) => (
              <tr key={e.id}>
                <td className="py-2 whitespace-nowrap">{new Date(e.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</td>
                <td className="py-2">{e.admin ?? "—"}</td>
                <td className="py-2 font-semibold">{e.action.replaceAll("_", " ")}</td>
                <td className="py-2 font-mono text-xs">{e.target}</td>
                <td className="py-2 font-mono text-xs">{JSON.stringify(e.details)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
