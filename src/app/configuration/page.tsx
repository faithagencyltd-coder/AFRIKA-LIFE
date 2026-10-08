import { missingSupabaseEnv } from "@/lib/env";

export const metadata = { title: "Configuration" };

export default function ConfigurationPage() {
  const missing = missingSupabaseEnv();
  return (
    <main className="mx-auto max-w-lg space-y-4 px-5 py-16">
      <h1 className="text-2xl font-black">Configuration requise</h1>
      {missing.length === 0 ? (
        <p>La configuration Supabase est complète.</p>
      ) : (
        <>
          <p className="text-brume">Le serveur du jeu n&apos;est pas encore relié à sa base de données. Variables à définir :</p>
          <ul className="list-inside list-disc font-mono text-sm">
            {missing.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
          <p className="text-sm text-brume">
            En local : copiez <code>.env.example</code> en <code>.env.local</code>. Sur Vercel : Settings › Environment Variables, puis
            redéployez.
          </p>
        </>
      )}
    </main>
  );
}
