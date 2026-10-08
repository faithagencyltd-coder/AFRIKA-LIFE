import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isSupabaseConfigured, publicEnv } from "@/lib/env";

/** Pages réservées aux joueurs connectés. */
const PROTECTED = ["/jeu", "/personnage", "/admin"];

const isProtected = (pathname: string) => PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/** Rafraîchit la session Supabase et redirige selon l'état de connexion. */
export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isSupabaseConfigured()) {
    if (pathname === "/configuration" || pathname === "/") return NextResponse.next();
    return NextResponse.redirect(new URL("/configuration", request.url));
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  // getClaims() vérifie la signature du jeton : ne jamais se fier à getSession() seul.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  if (!signedIn && isProtected(pathname)) {
    return NextResponse.redirect(new URL("/connexion", request.url));
  }
  if (signedIn && pathname === "/connexion") {
    return NextResponse.redirect(new URL("/jeu", request.url));
  }
  return response;
}
