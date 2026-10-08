import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { fr } from "@/i18n/fr";

export const metadata = { title: "Administration" };

const NAV = [
  ["/admin", "📊 Économie"],
  ["/admin/joueurs", "👥 Joueurs"],
  ["/admin/prix", "🏷️ Prix"],
  ["/admin/journal", "📜 Journal"],
] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: role } = await supabase.rpc("admin_role");
  // Une page d'administration n'existe pas pour un joueur ordinaire.
  if (!role) notFound();
  return (
    <div className="min-h-dvh bg-sable">
      <header className="border-b border-encre/10 bg-papyrus">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <p className="font-black text-terre">
            {fr.app.name} <span className="font-semibold text-brume">· Administration ({role})</span>
          </p>
          <nav className="flex flex-wrap gap-1 text-sm font-semibold">
            {NAV.map(([href, label]) => (
              <Link key={href} href={href} className="rounded-lg px-3 py-1.5 hover:bg-sable">
                {label}
              </Link>
            ))}
          </nav>
          <Link href="/jeu" className="ml-auto text-sm text-indigo underline">
            Retour au jeu
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
