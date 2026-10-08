import { createClient } from "@/lib/supabase/server";

import { PlayerRow, type AdminPlayer } from "./player-row";

export default async function PlayersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const supabase = await createClient();
  const [{ data, error }, { data: role }] = await Promise.all([supabase.rpc("admin_players", { p_search: q ?? null }), supabase.rpc("admin_role")]);
  if (error) throw new Error(error.message);
  const players = (data ?? []) as AdminPlayer[];
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">Joueurs</h1>
      <form className="flex gap-2">
        <input name="q" defaultValue={q} placeholder="Pseudo ou prénom" className="w-full max-w-sm rounded-xl border border-encre/15 bg-white px-3 py-2" />
        <button className="rounded-xl bg-indigo px-4 font-semibold text-white">Rechercher</button>
      </form>
      <p className="text-xs text-brume">{players.length} joueur(s) affiché(s) (100 au plus).</p>
      <div className="space-y-2">
        {players.map((p) => (
          <PlayerRow key={p.id} player={p} isAdmin={role === "admin"} />
        ))}
      </div>
    </div>
  );
}
