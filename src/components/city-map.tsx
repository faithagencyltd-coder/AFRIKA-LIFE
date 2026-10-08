"use client";

// Carte schématique de Cotonou (D-04) : océan au sud, lac Nokoué au nord, lagune
// de Cotonou entre Dantokpa et Akpakpa. 1 unité SVG = 100 m.
import type { District } from "@/game/types";

const KIND_ICON: Record<string, string> = {
  centre: "🏙️",
  marche: "🛒",
  premium: "🍸",
  residentiel: "🏡",
  plage: "🏖️",
  populaire: "🏘️",
  industriel: "🏗️",
  carrefour: "🚦",
};

const W = 130;
const H = 72;
const sx = (x: number) => x * 10;
const sy = (y: number) => H - y * 10;

// Routes principales (paires de quartiers) et ponts sur la lagune.
const ROADS: [string, string][] = [
  ["fidjrosse", "cadjehoun"],
  ["cadjehoun", "haie_vive"],
  ["haie_vive", "ganhi"],
  ["cadjehoun", "agla"],
  ["agla", "gbegamey"],
  ["gbegamey", "cadjehoun"],
  ["gbegamey", "dantokpa"],
  ["ganhi", "dantokpa"],
  ["haie_vive", "gbegamey"],
  ["ganhi", "akpakpa"],
  ["dantokpa", "akpakpa"],
];

interface Props {
  districts: District[];
  current: string;
  selected: string | null;
  destination?: string | null;
  onSelect: (code: string) => void;
}

export function CityMap({ districts, current, selected, destination, onSelect }: Props) {
  const byCode = new Map(districts.map((d) => [d.code, d]));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full rounded-2xl bg-[#e9dcc0] shadow-inner" role="group" aria-label="Carte de Cotonou">
      {/* Lac Nokoué */}
      <path d={`M55 0 H${W} V14 Q118 18 104 13 Q90 9 80 12 Q66 14 58 7 Z`} fill="#7fb6c9" />
      <text x="92" y="7" fontSize="2.6" fill="#2f6377" textAnchor="middle" fontStyle="italic">
        Lac Nokoué
      </text>
      {/* Océan Atlantique */}
      <path d={`M0 ${H - 5} Q30 ${H - 7.5} 65 ${H - 6} T${W} ${H - 6.5} V${H} H0 Z`} fill="#4f95b8" />
      <text x="66" y={H - 1.5} fontSize="2.6" fill="#e8f4fa" fontStyle="italic">
        Océan Atlantique
      </text>
      {/* Lagune de Cotonou */}
      <path d={`M96 12 Q99 30 97 45 Q96 58 99 ${H - 6} L102 ${H - 6} Q99.5 58 100.5 45 Q102.5 30 100 12 Z`} fill="#7fb6c9" />

      {/* Routes */}
      <g stroke="#c9b48a" strokeWidth="1.1" strokeLinecap="round">
        {ROADS.map(([a, b]) => {
          const da = byCode.get(a);
          const db = byCode.get(b);
          if (!da || !db) return null;
          return <line key={`${a}-${b}`} x1={sx(da.x_km)} y1={sy(da.y_km)} x2={sx(db.x_km)} y2={sy(db.y_km)} />;
        })}
      </g>

      {/* Trajet en cours */}
      {destination && byCode.get(destination) && byCode.get(current) ? (
        <line
          x1={sx(byCode.get(current)!.x_km)}
          y1={sy(byCode.get(current)!.y_km)}
          x2={sx(byCode.get(destination)!.x_km)}
          y2={sy(byCode.get(destination)!.y_km)}
          stroke="#c4572e"
          strokeWidth="1.2"
          strokeDasharray="2 1.5"
          className="animate-[dash_1s_linear_infinite]"
        />
      ) : null}

      {districts.map((d) => {
        const isCurrent = d.code === current;
        const isSelected = d.code === selected;
        return (
          <g
            key={d.code}
            transform={`translate(${sx(d.x_km)} ${sy(d.y_km)})`}
            onClick={() => onSelect(d.code)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(d.code)}
            role="button"
            tabIndex={0}
            aria-pressed={isSelected}
            aria-label={`${d.name}${isCurrent ? " (vous êtes ici)" : ""}`}
            className="cursor-pointer outline-none"
          >
            {isCurrent && (
              <circle r="5" fill="#c4572e" opacity="0.4">
                <animate attributeName="r" values="5;9" dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.4;0" dur="2s" repeatCount="indefinite" />
              </circle>
            )}
            <circle r="4.6" fill={isCurrent ? "#c4572e" : isSelected ? "#2e3a8c" : "#fffaf0"} stroke={isSelected ? "#2e3a8c" : "#7a5c3a"} strokeWidth={isSelected ? 0.9 : 0.5} />
            <text y="1.6" fontSize="4.2" textAnchor="middle">
              {KIND_ICON[d.kind] ?? "📍"}
            </text>
            <text y="8.4" fontSize="2.7" textAnchor="middle" fontWeight={isCurrent || isSelected ? 700 : 500} fill="#3a2a1a" stroke="#f3ead6" strokeWidth="0.6" paintOrder="stroke">
              {d.name.split(" · ")[0]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
