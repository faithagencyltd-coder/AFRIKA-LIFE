import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Activity, Building, Catalog, District, GameState, Job, TransportMode, TravelQuote } from "@/game/types";

import { GameScreen } from "./game-screen";

export const metadata = { title: "En jeu" };

export interface LedgerEntry {
  id: number;
  amount: number;
  balance_after: number;
  kind: string;
  ref: string | null;
  created_at: string;
}

export default async function JeuPage() {
  const supabase = await createClient();
  // game_state() met le personnage à jour (fin d'action, besoins) avant de le renvoyer.
  const { data, error } = await supabase.rpc("game_state");
  if (error) throw new Error(`game_state : ${error.message}`);
  if (!data) redirect("/personnage");
  const state = data as GameState;
  const c = state.character;

  const districtsRes = await supabase.from("districts").select("code, name, kind, description, x_km, y_km").eq("city_code", c.city_code);
  const districts = ((districtsRes.data ?? []) as District[]).map((d) => ({ ...d, x_km: Number(d.x_km), y_km: Number(d.y_km) }));
  const districtCodes = districts.map((d) => d.code);

  const [buildings, activities, jobs, modes, quotes, ledger] = await Promise.all([
    supabase.from("buildings").select("code, district_code, name, kind, description, open_hour, close_hour, sort").in("district_code", districtCodes).order("sort"),
    supabase.from("activities").select("code, building_code, name, description, duration_minutes, price, effects, xp, sort").eq("is_active", true).order("sort"),
    supabase
      .from("jobs")
      .select("code, building_code, name, name_feminine, description, required_level, base_pay, shift_minutes, shift_start_hour, shift_end_hour, effects")
      .eq("is_active", true)
      .order("sort"),
    supabase.from("transport_modes").select("code, name, icon").order("sort"),
    supabase.rpc("travel_quotes", { p_from: c.district_code }),
    supabase.from("transactions").select("id, amount, balance_after, kind, ref, created_at").order("id", { ascending: false }).limit(8),
  ]);

  const buildingCodes = new Set(((buildings.data ?? []) as Building[]).map((b) => b.code));
  const catalog: Catalog = {
    districts,
    buildings: (buildings.data ?? []) as Building[],
    activities: ((activities.data ?? []) as Activity[])
      .filter((a) => a.building_code === null || buildingCodes.has(a.building_code))
      .map((a) => ({ ...a, price: Number(a.price) })),
    jobs: ((jobs.data ?? []) as Job[]).filter((j) => buildingCodes.has(j.building_code)).map((j) => ({ ...j, base_pay: Number(j.base_pay) })),
    modes: (modes.data ?? []) as TransportMode[],
    quotes: ((quotes.data ?? []) as TravelQuote[]).map((q) => ({ ...q, km: Number(q.km), fare: Number(q.fare) })),
  };
  const entries = ((ledger.data ?? []) as LedgerEntry[]).map((e) => ({ ...e, amount: Number(e.amount), balance_after: Number(e.balance_after) }));

  return <GameScreen state={state} catalog={catalog} ledger={entries} />;
}
