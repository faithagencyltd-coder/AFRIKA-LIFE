"use server";

// Actions de jeu : de simples appels aux fonctions SQL du moteur (le serveur décide de tout).
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import type { ActionResult, Appearance } from "@/game/types";

const code = z.string().regex(/^[a-z0-9_]{1,40}$/);

async function call(fn: string, args?: Record<string, unknown>): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, args);
  if (error) {
    // P0001 : refus du moteur, message rédigé pour le joueur. Sinon : erreur technique.
    if (error.code === "P0001") return { ok: false, error: error.message };
    console.error(`[jeu] ${fn} :`, error.code, error.message);
    return { ok: false, error: "Le serveur n'a pas pu traiter l'action. Réessayez dans un instant." };
  }
  refresh();
  return { ok: true };
}

export async function doActivity(activity: string): Promise<ActionResult> {
  if (!code.safeParse(activity).success) return { ok: false, error: "Activité inconnue." };
  return call("start_activity", { p_code: activity });
}

export async function travelTo(district: string, mode: string): Promise<ActionResult> {
  if (!code.safeParse(district).success || !code.safeParse(mode).success) return { ok: false, error: "Trajet invalide." };
  return call("travel_to", { p_district: district, p_mode: mode });
}

export async function applyForJob(job: string): Promise<ActionResult> {
  if (!code.safeParse(job).success) return { ok: false, error: "Métier inconnu." };
  return call("apply_for_job", { p_job: job });
}

export async function quitJob(): Promise<ActionResult> {
  return call("quit_job");
}

export async function startWork(): Promise<ActionResult> {
  return call("start_work");
}

export async function rentHome(home: string): Promise<ActionResult> {
  if (!code.safeParse(home).success) return { ok: false, error: "Logement inconnu." };
  return call("rent_home", { p_home: home });
}

export async function buyHome(home: string): Promise<ActionResult> {
  if (!code.safeParse(home).success) return { ok: false, error: "Logement inconnu." };
  return call("buy_home", { p_home: home });
}

export async function leaveHome(): Promise<ActionResult> {
  return call("leave_home");
}

export async function payHomeArrears(): Promise<ActionResult> {
  return call("pay_home_arrears");
}

export async function doHomeActivity(activity: string): Promise<ActionResult> {
  if (!code.safeParse(activity).success) return { ok: false, error: "Activité inconnue." };
  return call("start_home_activity", { p_code: activity });
}

export async function buyItem(building: string, item: string, quantity = 1): Promise<ActionResult> {
  if (!code.safeParse(building).success || !code.safeParse(item).success || !Number.isInteger(quantity)) {
    return { ok: false, error: "Achat invalide." };
  }
  return call("buy_item", { p_building: building, p_item: item, p_quantity: quantity });
}

export async function consumeItem(item: string): Promise<ActionResult> {
  if (!code.safeParse(item).success) return { ok: false, error: "Objet inconnu." };
  return call("use_item", { p_item: item });
}

export async function changeLook(category: string, option: string): Promise<ActionResult> {
  if (!code.safeParse(category).success || !code.safeParse(option).success) return { ok: false, error: "Option inconnue." };
  return call("change_look", { p_category: category, p_code: option });
}

export async function markNotificationsRead(): Promise<ActionResult> {
  return call("mark_notifications_read");
}

const characterInput = z.object({
  firstName: z.string().trim().min(1).max(30),
  pseudo: z.string().trim().min(3).max(20),
  gender: z.enum(["homme", "femme"]),
  age: z.number().int().min(18).max(60),
  city: z.string().regex(/^[a-z0-9_]+$/),
  appearance: z.record(z.string(), z.string().regex(/^[a-z0-9_]+$/)),
});

export async function createCharacter(input: {
  firstName: string;
  pseudo: string;
  gender: string;
  age: number;
  city: string;
  appearance: Appearance;
}): Promise<ActionResult> {
  const parsed = characterInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Vérifiez les informations du personnage." };
  const v = parsed.data;
  const result = await call("create_character", {
    p_first_name: v.firstName,
    p_pseudo: v.pseudo,
    p_gender: v.gender,
    p_age: v.age,
    p_city_code: v.city,
    p_appearance: v.appearance,
  });
  if (!result.ok) return result;
  redirect("/jeu");
}
