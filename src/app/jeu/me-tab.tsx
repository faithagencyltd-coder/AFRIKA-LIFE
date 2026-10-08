import { Avatar } from "@/components/avatar";
import { fcfa } from "@/game/format";
import { fr } from "@/i18n/fr";
import { signOut } from "@/server/auth-actions";

import type { GameContext } from "./game-screen";
import type { LedgerEntry } from "./page";

const KIND: Record<string, string> = {
  starting_cash: "Capital de départ",
  activity: "Dépense",
  travel: "Transport",
  salary: "Salaire",
  mission: "Mission",
  admin: "Ajustement",
};

export function MeTab({ ctx, ledger }: { ctx: GameContext; ledger: LedgerEntry[] }) {
  const c = ctx.state.character;
  const prevLevelXp = (100 * c.level * (c.level - 1)) / 2;
  const progress = Math.min(100, ((c.xp - prevLevelXp) / Math.max(1, c.next_level_xp - prevLevelXp)) * 100);
  return (
    <div className="space-y-4">
      <section className="flex items-center gap-4 rounded-2xl bg-gradient-to-br from-ocre/25 to-terre/20 p-4">
        <Avatar appearance={c.appearance} gender={c.gender} size={96} />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-black">{c.first_name}</h1>
          <p className="text-sm text-brume">
            @{c.pseudo} · {c.age} ans · 🇧🇯 Cotonou
          </p>
          <p className="mt-2 text-sm font-semibold">Niveau {c.level}</p>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/60">
            <div className="h-full rounded-full bg-terre" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1 text-xs text-brume">
            {c.xp} / {c.next_level_xp} XP
          </p>
        </div>
      </section>

      <section className="rounded-2xl bg-papyrus p-4 ring-1 ring-encre/5">
        <h2 className="font-bold">Derniers mouvements</h2>
        <ul className="mt-2 divide-y divide-encre/5 text-sm">
          {ledger.map((e) => (
            <li key={e.id} className="flex items-center justify-between py-2">
              <span>
                {KIND[e.kind] ?? e.kind}
                {e.ref && <span className="text-xs text-brume"> · {e.ref.replaceAll("_", " ")}</span>}
              </span>
              <span className={`font-mono tabular-nums ${e.amount > 0 ? "text-foret" : "text-red-700"}`}>
                {e.amount > 0 ? "+" : ""}
                {fcfa(e.amount)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <form action={signOut}>
        <button className="w-full rounded-2xl bg-papyrus py-3 font-semibold text-brume ring-1 ring-encre/10">{fr.auth.signOut}</button>
      </form>
    </div>
  );
}
