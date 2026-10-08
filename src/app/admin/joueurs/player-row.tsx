"use client";

import { useState, useTransition } from "react";

import { fcfa } from "@/game/format";
import { adjustCash, sanctionPlayer } from "@/server/admin-actions";

export interface AdminPlayer {
  id: string;
  pseudo: string;
  first_name: string;
  email: string | null;
  level: number;
  cash: number;
  city_code: string;
  district_code: string;
  created_at: string;
  last_activity: string | null;
  sanction: "suspendu" | "banni" | null;
  sanction_until: string | null;
  sanction_reason: string | null;
  sanction_active: boolean;
}

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—");

export function PlayerRow({ player: p, isAdmin }: { player: AdminPlayer; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [hours, setHours] = useState("24");
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const active = p.sanction_active;

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) =>
    start(async () => {
      const r = await fn();
      setMessage(r.ok ? { ok: true, text: done } : { ok: false, text: r.error });
    });

  return (
    <div className="rounded-2xl bg-papyrus p-3 ring-1 ring-encre/5">
      <button onClick={() => setOpen(!open)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 text-left text-sm" aria-expanded={open}>
        <span className="font-bold">@{p.pseudo}</span>
        <span className="text-brume">
          {p.first_name} · niv. {p.level} · {p.district_code}
        </span>
        <span className="font-mono tabular-nums">{fcfa(Number(p.cash))}</span>
        {active && (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
            ⛔ {p.sanction}
            {p.sanction_until && ` jusqu'au ${date(p.sanction_until)}`}
          </span>
        )}
        <span className="ml-auto text-xs text-brume">Dernière action : {date(p.last_activity)}</span>
      </button>

      {open && (
        <div className="mt-3 grid gap-3 border-t border-encre/10 pt-3 text-sm md:grid-cols-2">
          <div className="space-y-1 text-xs text-brume">
            <p>E-mail : {p.email ?? "—"}</p>
            <p>Inscrit le {date(p.created_at)}</p>
            {active && <p className="text-red-800">Motif : {p.sanction_reason}</p>}
          </div>
          <div className="space-y-2">
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motif (obligatoire)" className="w-full rounded-lg border border-encre/15 bg-white px-2 py-1.5" />
            <div className="flex flex-wrap gap-2">
              <select value={hours} onChange={(e) => setHours(e.target.value)} className="rounded-lg border border-encre/15 bg-white px-2 py-1.5" aria-label="Durée">
                <option value="1">1 h</option>
                <option value="24">24 h</option>
                <option value="168">7 jours</option>
                <option value="720">30 jours</option>
              </select>
              <button disabled={pending} onClick={() => run(() => sanctionPlayer(p.id, "suspendu", Number(hours), reason), "Joueur suspendu.")} className="rounded-lg bg-ocre px-3 py-1.5 font-semibold">
                Suspendre
              </button>
              {isAdmin && (
                <button disabled={pending} onClick={() => confirm(`Bannir @${p.pseudo} définitivement ?`) && run(() => sanctionPlayer(p.id, "banni", null, reason), "Joueur banni.")} className="rounded-lg bg-red-700 px-3 py-1.5 font-semibold text-white">
                  Bannir
                </button>
              )}
              {active && (
                <button disabled={pending} onClick={() => run(() => sanctionPlayer(p.id, null, null, ""), "Sanction levée.")} className="rounded-lg bg-foret px-3 py-1.5 font-semibold text-white">
                  Lever la sanction
                </button>
              )}
            </div>
            {isAdmin && (
              <div className="flex flex-wrap gap-2">
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9-]/g, ""))}
                  placeholder="± montant FCFA"
                  inputMode="numeric"
                  className="w-36 rounded-lg border border-encre/15 bg-white px-2 py-1.5"
                />
                <button
                  disabled={pending || !amount}
                  onClick={() => run(() => adjustCash(p.id, Number(amount), reason), "Argent ajusté (tracé dans le grand livre).")}
                  className="rounded-lg bg-indigo px-3 py-1.5 font-semibold text-white"
                >
                  Ajuster l&apos;argent
                </button>
              </div>
            )}
            {message && <p className={message.ok ? "text-foret" : "text-red-700"}>{message.text}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
