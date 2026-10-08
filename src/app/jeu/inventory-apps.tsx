"use client";

import { useState } from "react";

import { Avatar } from "@/components/avatar";
import { APPEARANCE, APPEARANCE_CATEGORIES } from "@/game/appearance";
import { formatGameDuration } from "@/game/clock";
import type { AppearanceCategory, Item, ItemCategory } from "@/game/types";
import { changeLook, consumeItem } from "@/server/game-actions";

import { EffectChips } from "./effect-chips";
import type { GameContext } from "./game-screen";

export const CATEGORY_LABEL: Record<ItemCategory, string> = {
  nourriture: "Nourriture",
  ingredient: "Ingrédients",
  vetement: "Vêtements",
  meuble: "Meubles et équipements",
  telephone: "Téléphones",
};

/** Quantité possédée d'un objet. */
export function owned(ctx: GameContext, item: string): number {
  return ctx.state.inventory.find((i) => i.code === item)?.quantity ?? 0;
}

export function itemNames(ctx: GameContext, codes: string[]): string {
  return codes.map((c) => ctx.catalog.items.find((i) => i.code === c)?.name ?? c).join(" ou ");
}

/** Application « Sac » : tout ce que possède le personnage. */
export function BagApp({ ctx }: { ctx: GameContext }) {
  const entries = ctx.state.inventory
    .map((e) => ({ ...e, item: ctx.catalog.items.find((i) => i.code === e.code) }))
    .filter((e): e is { code: string; quantity: number; item: Item } => Boolean(e.item));
  const groups = (Object.keys(CATEGORY_LABEL) as ItemCategory[])
    .map((cat) => ({ cat, list: entries.filter((e) => e.item.category === cat) }))
    .filter((g) => g.list.length > 0);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">🎒 Mon sac</h1>
      {groups.length === 0 && <p className="text-sm text-brume">Votre sac est vide. Les marchés et boutiques vendent de tout.</p>}
      {groups.map(({ cat, list }) => (
        <section key={cat} className="rounded-2xl bg-papyrus p-4 ring-1 ring-encre/5">
          <h2 className="font-bold">{CATEGORY_LABEL[cat]}</h2>
          <ul className="mt-2 divide-y divide-encre/5">
            {list.map(({ item, quantity }) => (
              <li key={item.code} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    <span aria-hidden>{item.icon}</span> {item.name} {quantity > 1 && <span className="text-brume">× {quantity}</span>}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-brume">
                    {item.use_minutes ? (
                      <>
                        <span>⏱ {formatGameDuration(item.use_minutes)}</span>
                        <EffectChips effects={item.effects} />
                      </>
                    ) : (
                      <span>{item.description}</span>
                    )}
                  </div>
                </div>
                {item.use_minutes ? (
                  <button
                    disabled={ctx.busy || ctx.pending}
                    onClick={() => ctx.run(() => consumeItem(item.code))}
                    className="shrink-0 rounded-xl bg-terre px-3 py-2 text-sm font-bold text-white disabled:bg-encre/20"
                  >
                    Consommer
                  </button>
                ) : item.category === "vetement" ? (
                  <button onClick={() => ctx.open("wardrobe")} className="shrink-0 rounded-xl px-3 py-2 text-sm font-semibold text-indigo ring-1 ring-indigo/30">
                    Porter
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="text-xs text-brume">Les meubles et équipements sont installés automatiquement dans votre logement.</p>
    </div>
  );
}

/** Application « Garde-robe » : changer d'apparence ; les pièces achetées s'ajoutent. */
export function WardrobeApp({ ctx }: { ctx: GameContext }) {
  const [category, setCategory] = useState<AppearanceCategory>("outfit");
  const c = ctx.state.character;
  const ownsOption = (cat: AppearanceCategory, code: string) =>
    ctx.catalog.items.some((i) => i.appearance_category === cat && i.appearance_code === code && owned(ctx, i.code) > 0);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">👗 Garde-robe</h1>
      <div className="flex justify-center rounded-3xl bg-gradient-to-b from-ocre/25 to-terre/20 p-4">
        <Avatar appearance={c.appearance} gender={c.gender} size={120} />
      </div>
      <div className="-mx-1 flex gap-1 overflow-x-auto pb-1">
        {APPEARANCE_CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            aria-pressed={category === cat}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ${category === cat ? "bg-encre text-white" : "text-brume"}`}
          >
            {APPEARANCE[cat].label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {APPEARANCE[category].options.map((o) => {
          const shopOnly = o.starter === false;
          const locked = shopOnly && !ownsOption(category, o.code);
          const current = c.appearance[category] === o.code;
          return (
            <button
              key={o.code}
              disabled={locked || current || ctx.pending}
              onClick={() => ctx.run(() => changeLook(category, o.code))}
              aria-pressed={current}
              className={`relative flex flex-col items-center gap-1 rounded-xl p-2 text-xs font-semibold ring-1 disabled:cursor-default ${
                current ? "bg-ocre/20 ring-2 ring-terre" : "bg-white ring-encre/10"
              } ${locked ? "opacity-50" : ""}`}
            >
              {o.color ? (
                <span className="h-9 w-9 rounded-full ring-1 ring-encre/20" style={{ background: o.color }} />
              ) : (
                <Avatar appearance={{ ...c.appearance, [category]: o.code }} gender={c.gender} size={44} />
              )}
              {o.label}
              {shopOnly && <span className="text-[10px] font-normal text-brume">{locked ? "🔒 en boutique" : "✨ acheté"}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
