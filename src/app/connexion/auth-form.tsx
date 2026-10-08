"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { fr } from "@/i18n/fr";
import { signIn, signInWithGoogle, signUp } from "@/server/auth-actions";

type Mode = "signIn" | "signUp";

export function AuthForm({ initialMode, initialError }: { initialMode: Mode; initialError?: string }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [signInState, signInAction, signingIn] = useActionState(signIn, undefined);
  const [signUpState, signUpAction, signingUp] = useActionState(signUp, undefined);
  const state = mode === "signIn" ? signInState : signUpState;
  const pending = signingIn || signingUp;
  const error = state?.error ?? initialError;

  return (
    <div className="w-full max-w-sm rounded-3xl bg-papyrus p-6 shadow-xl ring-1 ring-encre/5">
      <Link href="/" className="text-lg font-black text-terre">
        {fr.app.name}
      </Link>
      <h1 className="mt-4 text-2xl font-black">{mode === "signIn" ? "Content de te revoir" : "Commence ta nouvelle vie"}</h1>

      <div className="mt-5 grid grid-cols-2 rounded-xl bg-sable p-1 text-sm font-semibold">
        {(["signIn", "signUp"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-lg py-2 transition ${mode === m ? "bg-papyrus shadow-sm" : "text-brume"}`}
            aria-pressed={mode === m}
          >
            {m === "signIn" ? fr.auth.signIn : fr.auth.signUp}
          </button>
        ))}
      </div>

      <form action={mode === "signIn" ? signInAction : signUpAction} className="mt-5 space-y-3">
        <label className="block text-sm font-medium">
          {fr.auth.email}
          <input name="email" type="email" required autoComplete="email" className="mt-1 w-full rounded-xl border border-encre/15 bg-white px-3 py-2.5" />
        </label>
        <label className="block text-sm font-medium">
          {fr.auth.password}
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={mode === "signIn" ? "current-password" : "new-password"}
            className="mt-1 w-full rounded-xl border border-encre/15 bg-white px-3 py-2.5"
          />
        </label>
        {mode === "signUp" && (
          <label className="flex items-start gap-2 text-sm">
            <input name="adult" type="checkbox" required className="mt-1" />
            <span>J&apos;ai 18 ans ou plus et j&apos;accepte les règles du jeu (respect, pas de triche).</span>
          </label>
        )}
        {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        {state?.info && <p role="status" className="rounded-xl bg-green-50 px-3 py-2 text-sm text-green-800">{state.info}</p>}
        <button disabled={pending} className="w-full rounded-xl bg-terre py-3 font-bold text-white transition hover:bg-terre-fonce disabled:opacity-60">
          {pending ? "Un instant…" : mode === "signIn" ? fr.auth.signIn : fr.auth.signUp}
        </button>
      </form>

      <div className="my-4 flex items-center gap-3 text-xs text-brume">
        <span className="h-px flex-1 bg-encre/10" />
        ou
        <span className="h-px flex-1 bg-encre/10" />
      </div>
      <form action={signInWithGoogle}>
        <button className="flex w-full items-center justify-center gap-2 rounded-xl border border-encre/15 bg-white py-3 font-semibold">
          <span aria-hidden className="text-lg font-black text-indigo">G</span>
          {fr.auth.google}
        </button>
      </form>
    </div>
  );
}
