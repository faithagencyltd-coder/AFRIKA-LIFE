"use client";

import { useEffect } from "react";

import { Avatar } from "@/components/avatar";
import { fcfa } from "@/game/format";
import { fr } from "@/i18n/fr";
import type { GameNotification, LedgerEntry } from "@/game/types";
import { signOut } from "@/server/auth-actions";
import { markNotificationsRead } from "@/server/game-actions";

import type { GameContext } from "./game-screen";

const KIND: Record<string, string> = {
  starting_cash: "Capital de départ",
  activity: "Dépense",
  travel: "Transport",
  salary: "Salaire",
  mission: "Mission",
  admin: "Ajustement",
  rent: "Loyer",
  upkeep: "Charges du logement",
  deposit: "Caution",
  deposit_refund: "Caution remboursée",
  arrears: "Arriérés réglés",
  home_purchase: "Achat de logement",
  home_sale: "Vente de logement",
};

const NOTE_ICON: Record<string, string> = { rent_paid: "🧾", rent_missed: "⚠️", eviction: "🚪", home: "🏠" };

export function MeTab({ ctx, ledger, notifications }: { ctx: GameContext; ledger: LedgerEntry[]; notifications: GameNotification[] }) {
  const c = ctx.state.character;
  const unread = ctx.state.unread_notifications;
  // Ouvrir l'onglet vaut lecture des notifications.
  useEffect(() => {
    if (unread > 0) void markNotificationsRead();
  }, [unread]);
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

      {notifications.length > 0 && (
        <section className="rounded-2xl bg-papyrus p-4 ring-1 ring-encre/5">
          <h2 className="font-bold">Notifications</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {notifications.map((n) => (
              <li key={n.id} className={`flex gap-2 rounded-xl px-3 py-2 ${n.read_at ? "bg-sable/60" : "bg-ocre/15 font-medium"}`}>
                <span aria-hidden>{NOTE_ICON[n.kind] ?? "🔔"}</span>
                <span>{n.message}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

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
