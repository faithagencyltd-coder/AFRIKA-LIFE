import { createClient } from "@/lib/supabase/server";

import { PriceRow } from "./price-row";

const GROUPS = [
  ["activities", "Activités (repas, loisirs, services)"],
  ["shop", "Boutiques"],
  ["rents", "Loyers hebdomadaires"],
  ["jobs", "Salaires de base (par service, niveau 1)"],
] as const;

type Prices = Record<(typeof GROUPS)[number][0], { code: string; name: string; value: number }[]>;

export default async function PricesPage() {
  const supabase = await createClient();
  const [{ data, error }, { data: role }] = await Promise.all([supabase.rpc("admin_prices"), supabase.rpc("admin_role")]);
  if (error) throw new Error(error.message);
  const prices = data as Prices;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">Prix et salaires</h1>
      <p className="text-sm text-brume">
        Un changement s&apos;applique aux nouvelles actions ; une action déjà payée garde son prix. Chaque modification est inscrite au journal.
        {role !== "admin" && " (Lecture seule : rôle modérateur.)"}
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {GROUPS.map(([kind, label]) => (
          <section key={kind} className="rounded-2xl bg-papyrus p-4 ring-1 ring-encre/5">
            <h2 className="font-bold">{label}</h2>
            <ul className="mt-2 divide-y divide-encre/5">
              {(prices[kind] ?? []).map((p) => (
                <PriceRow key={p.code} kind={kind} item={{ ...p, value: Number(p.value) }} editable={role === "admin"} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
