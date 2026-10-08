"use server";

// Actions d'administration : chaque fonction SQL revérifie le rôle (admin / modérateur).
import { refresh } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/game/types";

async function call(fn: string, args: Record<string, unknown>): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, args);
  if (error) {
    if (error.code === "P0001") return { ok: false, error: error.message };
    console.error(`[admin] ${fn} :`, error.code, error.message);
    return { ok: false, error: "Opération impossible pour le moment." };
  }
  refresh();
  return { ok: true };
}

const uuid = z.uuid();

export async function sanctionPlayer(character: string, kind: "suspendu" | "banni" | null, hours: number | null, reason: string): Promise<ActionResult> {
  if (!uuid.safeParse(character).success) return { ok: false, error: "Joueur invalide." };
  if (hours !== null && (!Number.isInteger(hours) || hours < 1 || hours > 24 * 365)) return { ok: false, error: "Durée invalide." };
  return call("admin_sanction", { p_character: character, p_kind: kind, p_hours: hours, p_reason: reason.slice(0, 300) });
}

export async function adjustCash(character: string, amount: number, reason: string): Promise<ActionResult> {
  if (!uuid.safeParse(character).success || !Number.isInteger(amount)) return { ok: false, error: "Valeurs invalides." };
  return call("admin_adjust_cash", { p_character: character, p_amount: amount, p_reason: reason.slice(0, 300) });
}

export async function setPrice(kind: string, code: string, value: number): Promise<ActionResult> {
  if (!/^[a-z_]+$/.test(kind) || !/^[a-z0-9_:]+$/.test(code) || !Number.isInteger(value)) return { ok: false, error: "Valeurs invalides." };
  return call("admin_set_price", { p_kind: kind, p_code: code, p_value: value });
}
