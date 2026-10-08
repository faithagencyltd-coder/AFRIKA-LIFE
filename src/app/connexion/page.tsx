import { AuthForm } from "./auth-form";

export const metadata = { title: "Connexion" };

const ERRORS: Record<string, string> = {
  google: "La connexion avec Google a échoué. Réessayez ou utilisez votre e-mail.",
  lien: "Ce lien de confirmation est invalide ou expiré. Connectez-vous pour en recevoir un nouveau.",
};

export default async function ConnexionPage({ searchParams }: { searchParams: Promise<{ erreur?: string; mode?: string }> }) {
  const { erreur, mode } = await searchParams;
  return (
    <main className="motif-wax flex min-h-dvh items-center justify-center px-4 py-10">
      <AuthForm initialMode={mode === "inscription" ? "signUp" : "signIn"} initialError={erreur ? ERRORS[erreur] : undefined} />
    </main>
  );
}
