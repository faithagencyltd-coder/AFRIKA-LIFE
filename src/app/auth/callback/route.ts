import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/** Retour de Google (OAuth, PKCE) : échange du code contre une session. */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/jeu", request.url));
  }
  return NextResponse.redirect(new URL("/connexion?erreur=google", request.url));
}
