import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { City, Country } from "@/game/types";

import { CharacterCreator } from "./character-creator";

export const metadata = { title: "Ton personnage" };

export default async function PersonnagePage() {
  const supabase = await createClient();
  const { data: state } = await supabase.rpc("game_state");
  if (state) redirect("/jeu");

  const [countries, cities] = await Promise.all([
    supabase.from("countries").select("code, name, flag, is_open").order("sort"),
    supabase.from("cities").select("code, country_code, name, is_open, release_label").order("sort"),
  ]);

  return (
    <main className="motif-wax min-h-dvh">
      <CharacterCreator countries={(countries.data ?? []) as Country[]} cities={(cities.data ?? []) as City[]} />
    </main>
  );
}
