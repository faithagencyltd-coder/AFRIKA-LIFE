import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type {
  Activity,
  Building,
  Catalog,
  District,
  GameNotification,
  GameState,
  Home,
  HomeActivity,
  Goal,
  Item,
  Job,
  LedgerEntry,
  Mission,
  ShopItem,
  TransportMode,
  TravelQuote,
} from "@/game/types";

import { GameScreen } from "./game-screen";

export const metadata = { title: "En jeu" };

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

  const [buildings, activities, jobs, modes, quotes, ledger, homes, homeActivities, notifications, items, shopItems, missions, goals] = await Promise.all([
    supabase.from("buildings").select("code, district_code, name, kind, description, open_hour, close_hour, sort").in("district_code", districtCodes).order("sort"),
    supabase.from("activities").select("code, building_code, name, description, duration_minutes, price, effects, xp, sort, required_items").eq("is_active", true).order("sort"),
    supabase
      .from("jobs")
      .select("code, building_code, name, name_feminine, description, required_level, base_pay, shift_minutes, shift_start_hour, shift_end_hour, effects")
      .eq("is_active", true)
      .order("sort"),
    supabase.from("transport_modes").select("code, name, icon").order("sort"),
    supabase.rpc("travel_quotes", { p_from: c.district_code }),
    supabase.from("transactions").select("id, amount, balance_after, kind, ref, created_at").order("id", { ascending: false }).limit(8),
    supabase
      .from("homes")
      .select("code, district_code, name, category, description, comfort, capacity, required_level, rent_per_week, price, upkeep_per_week")
      .eq("is_active", true)
      .in("district_code", districtCodes)
      .order("sort"),
    supabase
      .from("home_activities")
      .select("code, name, description, min_comfort, duration_minutes, price, effects, xp, required_items, consumes_item")
      .order("sort"),
    supabase.from("notifications").select("id, kind, message, created_at, read_at").order("id", { ascending: false }).limit(15),
    supabase
      .from("items")
      .select("code, name, category, icon, description, use_minutes, effects, appearance_category, appearance_code, max_stack")
      .eq("is_active", true)
      .order("sort"),
    supabase.from("shop_items").select("building_code, item_code, price, stock_max, stock, restocked_day"),
    supabase.from("missions").select("code, title, description, icon, target, reward_cash, reward_xp").order("sort"),
    supabase.from("goals").select("code, title, icon, objective_type, target").order("sort"),
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
    homes: ((homes.data ?? []) as Home[]).map((h) => ({
      ...h,
      rent_per_week: Number(h.rent_per_week),
      price: h.price === null ? null : Number(h.price),
      upkeep_per_week: Number(h.upkeep_per_week),
    })),
    homeActivities: ((homeActivities.data ?? []) as HomeActivity[]).map((a) => ({ ...a, price: Number(a.price) })),
    items: (items.data ?? []) as Item[],
    shopItems: ((shopItems.data ?? []) as ShopItem[])
      .filter((si) => buildingCodes.has(si.building_code))
      .map((si) => ({ ...si, price: Number(si.price), restocked_day: Number(si.restocked_day) })),
    missions: ((missions.data ?? []) as Mission[]).map((m) => ({ ...m, target: Number(m.target), reward_cash: Number(m.reward_cash) })),
    goals: ((goals.data ?? []) as Goal[]).map((g) => ({ ...g, target: Number(g.target) })),
  };
  const entries = ((ledger.data ?? []) as LedgerEntry[]).map((e) => ({ ...e, amount: Number(e.amount), balance_after: Number(e.balance_after) }));

  return <GameScreen state={state} catalog={catalog} ledger={entries} notifications={(notifications.data ?? []) as GameNotification[]} />;
}
