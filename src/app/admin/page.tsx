import { createClient } from "@/lib/supabase/server";
import { fcfa } from "@/game/format";

import { FLOW_LABEL } from "./labels";

interface Economy {
  generated_at: string;
  players: { total: number; new_7d: number; active_24h: number; active_7d: number; sanctioned: number };
  money: { circulation: number; average_cash: number; median_cash: number; net_24h: number; growth_24h_pct: number | null };
  flows: { kind: string; created_7d: number; destroyed_7d: number; created_all: number; destroyed_all: number }[];
  daily: { day: string; created: number; destroyed: number }[];
  jobs: { code: string; name: string; workers: number | null; shifts: number | null; salaries: number; avg_pay: number | null }[];
  items: { code: string; name: string; icon: string; purchases: number; revenue: number }[];
  homes: { code: string; name: string; occupied: number }[];
  richest: { pseudo: string; cash: number; level: number }[];
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-papyrus p-4 ring-1 ring-encre/5">
      <p className="text-xs font-semibold text-brume">{label}</p>
      <p className="mt-1 font-mono text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-brume">{hint}</p>}
    </div>
  );
}

/** Barre de magnitude dans une cellule (une seule couleur par colonne, la valeur reste écrite). */
function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <span className="font-mono tabular-nums">{fcfa(value)}</span>
      <span className="hidden h-2 w-24 overflow-hidden rounded-full bg-encre/10 sm:block" title={fcfa(value)}>
        <span className={`block h-full rounded-full ${color}`} style={{ width: `${max > 0 ? Math.max(2, (value / max) * 100) : 0}%` }} />
      </span>
    </div>
  );
}

const n = (v: unknown) => Number(v ?? 0);

export default async function EconomyPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_economy");
  if (error) throw new Error(error.message);
  const e = data as Economy;
  // Le capital de départ (versé une fois par joueur) écraserait l'échelle : il est exclu des barres.
  const maxFlow = Math.max(1, ...e.flows.filter((f) => f.kind !== "starting_cash").map((f) => Math.max(n(f.created_all), n(f.destroyed_all))));
  const created = e.flows.reduce((s, f) => s + n(f.created_all), 0);
  const destroyed = e.flows.reduce((s, f) => s + n(f.destroyed_all), 0);
  const created7 = e.flows.filter((f) => f.kind !== "starting_cash").reduce((s, f) => s + n(f.created_7d), 0);
  const destroyed7 = e.flows.reduce((s, f) => s + n(f.destroyed_7d), 0);
  const growth = e.money.growth_24h_pct;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black">Tableau de bord économique</h1>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Joueurs" value={n(e.players.total).toLocaleString("fr-FR")} hint={`${e.players.new_7d} nouveaux sur 7 jours`} />
        <Tile label="Actifs 24 h / 7 j" value={`${e.players.active_24h} / ${e.players.active_7d}`} hint={`${e.players.sanctioned} sanctionné(s)`} />
        <Tile label="Argent en circulation" value={fcfa(n(e.money.circulation))} hint={`Moyenne ${fcfa(n(e.money.average_cash))} · médiane ${fcfa(n(e.money.median_cash))}`} />
        <Tile
          label="Masse monétaire sur 24 h"
          value={growth === null ? "—" : `${growth > 0 ? "+" : ""}${growth.toLocaleString("fr-FR")} %`}
          hint={`Solde net ${fcfa(n(e.money.net_24h))} (indicateur d'inflation)`}
        />
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Créé depuis le début" value={fcfa(created)} />
        <Tile label="Détruit depuis le début" value={fcfa(destroyed)} />
        <Tile label="Créé sur 7 j (hors capital)" value={fcfa(created7)} />
        <Tile label="Détruit sur 7 j" value={fcfa(destroyed7)} hint={created7 > 0 ? `Ratio puits / sources : ${Math.round((destroyed7 / created7) * 100)} %` : undefined} />
      </section>

      <section className="overflow-x-auto rounded-2xl bg-papyrus p-4 ring-1 ring-encre/5">
        <h2 className="font-bold">Sources et puits d&apos;argent</h2>
        <p className="text-xs text-brume">Ce qui crée de l&apos;argent virtuel (sources) et ce qui en retire (puits), par nature.</p>
        <table className="mt-3 w-full min-w-[560px] text-sm">
          <thead className="text-left text-xs text-brume">
            <tr>
              <th className="py-1 font-semibold">Nature</th>
              <th className="py-1 text-right font-semibold">Créé (total)</th>
              <th className="py-1 text-right font-semibold">Détruit (total)</th>
              <th className="py-1 text-right font-semibold">Créé 7 j</th>
              <th className="py-1 text-right font-semibold">Détruit 7 j</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-encre/5">
            {e.flows.map((f) => (
              <tr key={f.kind}>
                <td className="py-2">{FLOW_LABEL[f.kind] ?? f.kind}</td>
                <td className="py-2 text-right">
                  {n(f.created_all) > 0 ? (
                    f.kind === "starting_cash" ? (
                      <span className="font-mono tabular-nums">{fcfa(n(f.created_all))}</span>
                    ) : (
                      <Bar value={n(f.created_all)} max={maxFlow} color="bg-foret" />
                    )
                  ) : (
                    "—"
                  )}
                </td>
                <td className="py-2 text-right">{n(f.destroyed_all) > 0 ? <Bar value={n(f.destroyed_all)} max={maxFlow} color="bg-terre" /> : "—"}</td>
                <td className="py-2 text-right font-mono tabular-nums">{n(f.created_7d) > 0 ? fcfa(n(f.created_7d)) : "—"}</td>
                <td className="py-2 text-right font-mono tabular-nums">{n(f.destroyed_7d) > 0 ? fcfa(n(f.destroyed_7d)) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="overflow-x-auto rounded-2xl bg-papyrus p-4 ring-1 ring-encre/5">
          <h2 className="font-bold">Métiers</h2>
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs text-brume">
              <tr>
                <th className="py-1 font-semibold">Métier</th>
                <th className="py-1 text-right font-semibold">Employés</th>
                <th className="py-1 text-right font-semibold">Services</th>
                <th className="py-1 text-right font-semibold">Salaires versés</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-encre/5">
              {e.jobs.map((j) => (
                <tr key={j.code}>
                  <td className="py-2">{j.name}</td>
                  <td className="py-2 text-right tabular-nums">{n(j.workers)}</td>
                  <td className="py-2 text-right tabular-nums">{n(j.shifts)}</td>
                  <td className="py-2 text-right font-mono tabular-nums">{fcfa(n(j.salaries))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <div className="space-y-4">
          <section className="rounded-2xl bg-papyrus p-4 ring-1 ring-encre/5">
            <h2 className="font-bold">Objets les plus achetés</h2>
            {e.items.length === 0 ? (
              <p className="mt-2 text-sm text-brume">Aucun achat pour l&apos;instant.</p>
            ) : (
              <ul className="mt-2 divide-y divide-encre/5 text-sm">
                {e.items.slice(0, 8).map((i) => (
                  <li key={i.code} className="flex justify-between py-1.5">
                    <span>
                      {i.icon} {i.name} <span className="text-brume">× {i.purchases}</span>
                    </span>
                    <span className="font-mono tabular-nums">{fcfa(n(i.revenue))}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="rounded-2xl bg-papyrus p-4 ring-1 ring-encre/5">
            <h2 className="font-bold">Joueurs les plus riches</h2>
            <ol className="mt-2 divide-y divide-encre/5 text-sm">
              {e.richest.map((r, i) => (
                <li key={r.pseudo} className="flex justify-between py-1.5">
                  <span>
                    {i + 1}. @{r.pseudo} <span className="text-brume">· niv. {r.level}</span>
                  </span>
                  <span className="font-mono tabular-nums">{fcfa(n(r.cash))}</span>
                </li>
              ))}
            </ol>
          </section>
          <section className="rounded-2xl bg-papyrus p-4 ring-1 ring-encre/5">
            <h2 className="font-bold">Logements occupés</h2>
            <ul className="mt-2 divide-y divide-encre/5 text-sm">
              {e.homes.length === 0 && <li className="py-1.5 text-brume">Aucun.</li>}
              {e.homes.map((h) => (
                <li key={h.code} className="flex justify-between py-1.5">
                  <span>{h.name}</span>
                  <span className="tabular-nums">{h.occupied}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
      <p className="text-xs text-brume">Données calculées le {new Date(e.generated_at).toLocaleString("fr-FR")} à partir du grand livre.</p>
    </div>
  );
}
