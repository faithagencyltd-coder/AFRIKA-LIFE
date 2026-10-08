"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Avatar } from "@/components/avatar";
import { gameMinuteAt, splitGameMinute } from "@/game/clock";
import { fcfa } from "@/game/format";
import type { ActionResult, Catalog, GameState } from "@/game/types";
import { fr } from "@/i18n/fr";

import { BusyCard } from "./busy-card";
import { HereTab } from "./here-tab";
import { MapTab } from "./map-tab";
import { MeTab } from "./me-tab";
import { NeedsPanel } from "./needs-panel";
import type { LedgerEntry } from "./page";
import { WorkTab } from "./work-tab";

type Tab = keyof typeof fr.game.tabs;
const TAB_ICONS: Record<Tab, string> = { here: "📍", map: "🗺️", work: "💼", me: "🙂" };

export interface GameContext {
  state: GameState;
  catalog: Catalog;
  /** Minute de jeu courante (horloge vivante). */
  minute: number;
  busy: boolean;
  pending: boolean;
  run: (action: () => Promise<ActionResult>, success?: string) => void;
  goToMap: (district: string) => void;
}

/** Instant serveur estimé, rafraîchi chaque seconde. */
function useServerNow(serverNowIso: string): number {
  const [now, setNow] = useState(() => Date.parse(serverNowIso));
  useEffect(() => {
    const offset = Date.parse(serverNowIso) - Date.now();
    const id = setInterval(() => setNow(Date.now() + offset), 1000);
    return () => clearInterval(id);
  }, [serverNowIso]);
  return now;
}

export function GameScreen({ state, catalog, ledger }: { state: GameState; catalog: Catalog; ledger: LedgerEntry[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("here");
  const [mapFocus, setMapFocus] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const now = useServerNow(state.clock.server_now);
  const minute = gameMinuteAt(state.clock, now);
  const time = splitGameMinute(minute);
  const c = state.character;
  const activity = c.activity;
  const district = catalog.districts.find((d) => d.code === c.district_code);

  // Fin de l'action en cours : on redemande l'état au serveur (une seule fois par action).
  const syncedFor = useRef<string | null>(null);
  const endsAt = activity ? Date.parse(activity.ends_at) : null;
  useEffect(() => {
    if (endsAt !== null && now >= endsAt && syncedFor.current !== activity?.ends_at) {
      syncedFor.current = activity?.ends_at ?? null;
      router.refresh();
    }
  }, [now, endsAt, activity?.ends_at, router]);

  // Besoins à jour : toutes les 60 s et au retour sur l'onglet.
  useEffect(() => {
    const id = setInterval(() => document.visibilityState === "visible" && router.refresh(), 60_000);
    const onVisible = () => document.visibilityState === "visible" && router.refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), toast.kind === "error" ? 6000 : 3000);
    return () => clearTimeout(id);
  }, [toast]);

  const ctx: GameContext = {
    state,
    catalog,
    minute,
    busy: activity !== null,
    pending,
    run: (action, success) =>
      startTransition(async () => {
        const result = await action();
        setToast(result.ok ? (success ? { kind: "ok", text: success } : null) : { kind: "error", text: result.error });
      }),
    goToMap: (code) => {
      setMapFocus(code);
      setTab("map");
    },
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col pb-24">
      {/* HUD */}
      <header className="sticky top-0 z-20 border-b border-encre/5 bg-sable/95 px-4 pt-3 pb-2 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 overflow-hidden rounded-full bg-ocre/30 ring-2 ring-papyrus">
            <Avatar appearance={c.appearance} gender={c.gender} size={48} className="-mt-0.5 scale-[1.9] origin-top" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold leading-tight">
              {c.first_name} <span className="font-normal text-brume">@{c.pseudo}</span>
            </p>
            <p className="text-xs text-brume">
              Niveau {c.level} · {district?.name ?? c.district_code}
            </p>
          </div>
          <div className="text-right">
            <p className="font-mono text-base font-bold tabular-nums" aria-label={`Jour ${time.day}, ${time.hhmm}`}>
              {time.period === "nuit" ? "🌙" : time.period === "soir" ? "🌆" : "☀️"} {time.hhmm}
            </p>
            <p className="text-xs text-brume">Jour {time.day}</p>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between rounded-xl bg-papyrus px-3 py-1.5 text-sm ring-1 ring-encre/5">
          <span className="text-brume">Argent</span>
          <span className="font-mono font-bold tabular-nums text-foret">{fcfa(c.cash)}</span>
        </div>
      </header>

      <main className="flex-1 space-y-4 px-4 pt-4">
        <NeedsPanel needs={c.needs} />
        {activity && <BusyCard activity={activity} now={now} />}
        {tab === "here" && <HereTab ctx={ctx} />}
        {tab === "map" && <MapTab ctx={ctx} focus={mapFocus} onFocus={setMapFocus} />}
        {tab === "work" && <WorkTab ctx={ctx} />}
        {tab === "me" && <MeTab ctx={ctx} ledger={ledger} />}
      </main>

      {toast && (
        <div
          role={toast.kind === "error" ? "alert" : "status"}
          className={`fixed inset-x-4 bottom-24 z-30 mx-auto max-w-md rounded-2xl px-4 py-3 text-sm font-medium shadow-xl ${toast.kind === "error" ? "bg-red-700 text-white" : "bg-foret text-white"}`}
        >
          {toast.text}
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-encre/10 bg-papyrus/95 backdrop-blur" aria-label="Navigation du jeu">
        <div className="mx-auto grid max-w-2xl grid-cols-4">
          {(Object.keys(fr.game.tabs) as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              aria-current={tab === t ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 py-2.5 text-xs font-semibold ${tab === t ? "text-terre" : "text-brume"}`}
            >
              <span className="text-xl" aria-hidden>
                {TAB_ICONS[t]}
              </span>
              {fr.game.tabs[t]}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
