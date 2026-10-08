import { formatGameDuration, formatRealRemaining, isOpenAt, MINUTES_PER_DAY } from "@/game/clock";
import { fcfa } from "@/game/format";
import { fr } from "@/i18n/fr";
import { buyHome, doHomeActivity, leaveHome, payHomeArrears, rentHome } from "@/server/game-actions";

import { EffectChips } from "./effect-chips";
import type { GameContext } from "./game-screen";
import { itemNames, owned } from "./inventory-apps";

export function Stars({ value, max = 5, dimmed = 0 }: { value: number; max?: number; dimmed?: number }) {
  return (
    <span aria-label={`Confort ${value} sur ${max}`} className="tracking-tight">
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < value ? "text-ocre" : i < value + dimmed ? "text-red-300" : "text-encre/15"}>
          ★
        </span>
      ))}
    </span>
  );
}

/** Activités à domicile, verrouillées selon le confort. */
export function HomeActivities({ ctx }: { ctx: GameContext }) {
  const home = ctx.state.home;
  if (!home) return null;
  const atHome = ctx.state.character.district_code === home.district_code;
  return (
    <ul className="divide-y divide-encre/5">
      {ctx.catalog.homeActivities.map((a) => {
        const byItem = !!a.required_items?.some((code) => owned(ctx, code) > 0);
        const locked = home.effective_comfort < a.min_comfort && !byItem;
        const lacking = a.consumes_item && owned(ctx, a.consumes_item) === 0 ? a.consumes_item : null;
        return (
          <li key={a.code} className={`flex items-center justify-between gap-3 py-2.5 ${locked ? "opacity-55" : ""}`}>
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {locked && "🔒 "}
                {a.name}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-brume">
                <span>⏱ {formatGameDuration(a.duration_minutes)}</span>
                {locked ? (
                  <span>
                    confort {a.min_comfort} requis{a.required_items && ` ou ${itemNames(ctx, a.required_items)}`}
                  </span>
                ) : (
                  <EffectChips effects={a.effects} />
                )}
                {!locked && a.consumes_item && (
                  <span className={lacking ? "font-semibold text-red-700" : ""}>
                    utilise 1 {itemNames(ctx, [a.consumes_item])} ({owned(ctx, a.consumes_item)})
                  </span>
                )}
              </div>
            </div>
            <button
              disabled={locked || !!lacking || !atHome || ctx.busy || ctx.pending || a.price > ctx.state.character.cash}
              onClick={() => ctx.run(() => doHomeActivity(a.code))}
              className="shrink-0 rounded-xl bg-terre px-3 py-2 text-sm font-bold text-white disabled:bg-encre/20"
            >
              {a.price > 0 ? fcfa(a.price) : fr.game.free}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function HomeTab({ ctx }: { ctx: GameContext }) {
  const { state, catalog, minute, now } = ctx;
  const home = state.home;
  const c = state.character;
  const agency = catalog.buildings.find((b) => b.kind === "agence");
  const districtName = (code: string) => catalog.districts.find((d) => d.code === code)?.name ?? code;
  const agencyOpen = agency ? isOpenAt(agency.open_hour, agency.close_hour, minute) : false;
  const atAgency = agency?.district_code === c.district_code && agencyOpen;

  let dueText = "";
  if (home) {
    const ms = Date.parse(home.next_due_at) - now;
    const gameDays = Math.max(0, (ms / 60_000) * state.clock.time_scale) / MINUTES_PER_DAY;
    dueText = `dans ${gameDays >= 1 ? `${Math.floor(gameDays)} j de jeu` : "moins d'un jour de jeu"} (${formatRealRemaining(ms)} réelles)`;
  }

  return (
    <div className="space-y-4">
      {home ? (
        <section className="rounded-2xl bg-papyrus p-4 ring-1 ring-encre/5">
          <p className="text-xs font-semibold uppercase tracking-wider text-brume">
            {home.tenure === "owned" ? "Propriétaire" : "Locataire"} · {fr.game.homeCategories[home.category]}
          </p>
          <h1 className="text-xl font-black">{home.name}</h1>
          <p className="text-sm text-brume">
            {districtName(home.district_code)} · <Stars value={home.effective_comfort} dimmed={home.comfort - home.effective_comfort} />
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl bg-sable px-3 py-2">
              <p className="text-[11px] text-brume">{home.tenure === "owned" ? "Charges / semaine" : "Loyer / semaine"}</p>
              <p className="font-bold">{fcfa(home.periodic_charge)}</p>
            </div>
            <div className="rounded-xl bg-sable px-3 py-2">
              <p className="text-[11px] text-brume">{home.tenure === "owned" ? "Valeur de revente" : "Caution"}</p>
              <p className="font-bold">{fcfa(home.tenure === "owned" ? (home.resale_value ?? 0) : home.deposit)}</p>
            </div>
          </div>
          <p className="mt-2 text-xs text-brume">Prochain prélèvement {dueText}. Gardez assez d&apos;argent sur vous.</p>

          {home.arrears > 0 && (
            <div role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-900">
              <p className="font-bold">
                Arriérés : {fcfa(home.arrears)}
                {home.tenure === "rental" && ` · avertissement ${home.missed}/${home.max_missed}`}
              </p>
              <p className="text-xs">
                Coupure en cours : le confort baisse d&apos;une étoile.
                {home.tenure === "rental" && " Au dernier avertissement, c'est l'expulsion et la caution est perdue."}
              </p>
              <button
                disabled={ctx.pending || home.arrears > c.cash}
                onClick={() => ctx.run(() => payHomeArrears(), "Arriérés réglés. Le confort est rétabli.")}
                className="mt-2 rounded-xl bg-red-700 px-3 py-2 font-bold text-white disabled:opacity-50"
              >
                Régler {fcfa(home.arrears)}
              </button>
            </div>
          )}

          <h2 className="mt-4 font-bold">🏠 Chez moi</h2>
          {c.district_code !== home.district_code && (
            <button onClick={() => ctx.goToMap(home.district_code)} className="mt-1 text-sm font-semibold text-indigo underline">
              Rentrer à {districtName(home.district_code)} pour en profiter
            </button>
          )}
          <HomeActivities ctx={ctx} />

          <button
            disabled={ctx.busy || ctx.pending}
            onClick={() =>
              confirm(
                home.tenure === "owned"
                  ? `Vendre ce logement pour ${fcfa(home.resale_value ?? 0)} ?`
                  : `Rendre ce logement ? La caution (${fcfa(home.deposit)}) vous sera remboursée, arriérés déduits.`,
              ) && ctx.run(() => leaveHome(), home.tenure === "owned" ? "Logement vendu." : "Logement rendu, caution remboursée.")
            }
            className="mt-3 text-xs text-brume underline disabled:opacity-50"
          >
            {home.tenure === "owned" ? "Vendre ce logement" : "Rendre ce logement"}
          </button>
        </section>
      ) : (
        <section className="rounded-2xl bg-ocre/15 p-4">
          <h1 className="text-lg font-black">Trouve ton premier logement</h1>
          <p className="text-sm">
            Une chambre coûte bien moins cher que l&apos;auberge, et tu y dors gratuitement. Les contrats se signent à l&apos;agence immobilière.
          </p>
        </section>
      )}

      <section className="rounded-2xl bg-papyrus p-4 ring-1 ring-encre/5">
        <h2 className="font-bold">Annonces · {agency?.name}</h2>
        {!atAgency && agency && (
          <div className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-indigo/5 p-3 text-sm">
            <p>
              Pour signer, rendez-vous à l&apos;agence ({districtName(agency.district_code)}, {agency.open_hour}h – {agency.close_hour}h)
              {agency.district_code === c.district_code && !agencyOpen && " : fermée pour le moment"}.
            </p>
            {agency.district_code !== c.district_code && (
              <button onClick={() => ctx.goToMap(agency.district_code)} className="shrink-0 rounded-xl bg-indigo px-3 py-2 font-bold text-white">
                Y aller
              </button>
            )}
          </div>
        )}
        <ul className="mt-2 divide-y divide-encre/5">
          {catalog.homes.map((h) => {
            const locked = c.level < h.required_level;
            const mine = home?.code === h.code;
            const disabled = !atAgency || locked || mine || ctx.busy || ctx.pending;
            return (
              <li key={h.code} className="py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-terre">{fr.game.homeCategories[h.category]}</p>
                    <p className="font-semibold">{h.name}</p>
                    <p className="text-xs text-brume">
                      {districtName(h.district_code)} · <Stars value={h.comfort} /> · {h.capacity} pers.
                    </p>
                    {h.description && <p className="mt-0.5 text-xs text-brume">{h.description}</p>}
                  </div>
                  {locked && <span className="shrink-0 rounded-full bg-encre/10 px-2 py-1 text-xs font-semibold text-brume">🔒 Niv. {h.required_level}</span>}
                  {mine && <span className="shrink-0 rounded-full bg-foret/10 px-2 py-1 text-xs font-semibold text-foret">Chez vous</span>}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    disabled={disabled || h.rent_per_week * 2 > c.cash}
                    onClick={() => ctx.run(() => rentHome(h.code), "Contrat signé ! Bienvenue chez vous.")}
                    className="rounded-xl bg-terre px-3 py-2 text-left text-sm font-bold text-white disabled:bg-encre/20"
                  >
                    Louer · {fcfa(h.rent_per_week)}/sem.
                    <span className="block text-[11px] font-normal opacity-90">{fcfa(h.rent_per_week * 2)} à la signature (caution incluse)</span>
                  </button>
                  {h.price !== null && (
                    <button
                      disabled={disabled || h.price > c.cash}
                      onClick={() => confirm(`Acheter « ${h.name} » pour ${fcfa(h.price!)} ?`) && ctx.run(() => buyHome(h.code), "Félicitations, vous êtes propriétaire !")}
                      className="rounded-xl bg-papyrus px-3 py-2 text-left text-sm font-bold ring-1 ring-encre/15 disabled:opacity-50"
                    >
                      Acheter · {fcfa(h.price)}
                      <span className="block text-[11px] font-normal text-brume">puis {fcfa(h.upkeep_per_week)}/sem. de charges</span>
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
