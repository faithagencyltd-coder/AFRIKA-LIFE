"use client";

import { useState, useTransition } from "react";

import { fcfa } from "@/game/format";
import { setPrice } from "@/server/admin-actions";

export function PriceRow({ kind, item, editable }: { kind: string; item: { code: string; name: string; value: number }; editable: boolean }) {
  const [value, setValue] = useState(String(item.value));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const changed = Number(value) !== item.value;
  return (
    <li className="flex items-center justify-between gap-2 py-1.5 text-sm">
      <span className="min-w-0 truncate" title={item.code}>
        {item.name}
      </span>
      {editable ? (
        <span className="flex shrink-0 items-center gap-1">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            aria-label={`Prix : ${item.name}`}
            className="w-28 rounded-lg border border-encre/15 bg-white px-2 py-1 text-right font-mono"
          />
          <button
            disabled={!changed || pending}
            onClick={() =>
              start(async () => {
                const r = await setPrice(kind, item.code, Number(value));
                setError(r.ok ? null : r.error);
              })
            }
            className="rounded-lg bg-indigo px-2 py-1 text-xs font-semibold text-white disabled:opacity-30"
          >
            OK
          </button>
          {error && <span className="text-xs text-red-700">{error}</span>}
        </span>
      ) : (
        <span className="font-mono tabular-nums">{fcfa(item.value)}</span>
      )}
    </li>
  );
}
