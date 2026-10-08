"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { fr } from "@/i18n/fr";

export type AuthState = { error?: string; info?: string } | undefined;

const credentials = z.object({
  email: z.email("Adresse e-mail invalide."),
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères.").max(72),
});

/** Messages de Supabase Auth traduits pour le joueur. */
function translate(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "E-mail ou mot de passe incorrect.";
  if (m.includes("email not confirmed")) return "Confirmez d'abord votre adresse avec le lien reçu par e-mail.";
  if (m.includes("already registered") || m.includes("already been registered")) return "Un compte existe déjà avec cet e-mail.";
  if (m.includes("password")) return "Mot de passe trop faible : au moins 8 caractères, mélangez lettres et chiffres.";
  if (m.includes("rate limit") || m.includes("too many")) return "Trop de tentatives. Patientez quelques minutes.";
  return "Connexion impossible pour le moment. Réessayez.";
}

/** Adresse du site pour les liens de retour (e-mail, Google). */
async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : publicEnv.siteUrl;
}

export async function signIn(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: translate(error.message) };
  redirect("/jeu");
}

export async function signUp(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  if (form.get("adult") !== "on") return { error: "Le jeu est réservé aux personnes de 18 ans et plus." };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: `${await origin()}/auth/confirm` },
  });
  if (error) return { error: translate(error.message) };
  // Confirmation par e-mail désactivée (développement local) : session immédiate.
  if (data.session) redirect("/personnage");
  return { info: fr.auth.checkEmail };
}

export async function signInWithGoogle(): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${await origin()}/auth/callback` },
  });
  if (error || !data.url) redirect("/connexion?erreur=google");
  redirect(data.url);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
