// Avatar SVG en couches (CdC §6, D-04) : peau, visage, coiffure, tenue, chaussures, accessoire.
import { useId } from "react";

import { colorOf } from "@/game/appearance";
import type { Appearance, Gender } from "@/game/types";

const HAIR = "#1a1210";
const GOLD = "#e0b44c";
const JEAN = "#3b5b8c";
const DARK = "#2b2724";

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + amount * 255)));
  const r = f(n >> 16);
  const g = f((n >> 8) & 0xff);
  const b = f(n & 0xff);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

interface Props {
  appearance: Appearance;
  gender: Gender;
  size?: number;
  className?: string;
  title?: string;
}

export function Avatar({ appearance, gender, size = 160, className, title }: Props) {
  const uid = useId().replace(/:/g, "");
  const skin = colorOf("skin", appearance.skin);
  const skinDark = shade(skin, -0.08);
  const cloth = colorOf("outfit_color", appearance.outfit_color);
  const clothDark = shade(cloth, -0.12);
  const accent = appearance.outfit_color === "ocre" ? "#2e3a8c" : GOLD;
  const wax = `wax-${uid}`;
  const { outfit, hair, face, accessory, shoes } = appearance;
  const shoulder = gender === "femme" ? 25 : 29;
  const fabric = outfit === "chemise_wax" || outfit === "robe_wax" || outfit === "ensemble_pagne" ? `url(#${wax})` : cloth;

  // Bas du corps : couleur des jambes selon la tenue.
  const legColor = outfit === "tshirt_jean" ? JEAN : outfit === "costume" ? clothDark : outfit === "chemise_wax" ? DARK : outfit === "maillot" ? skin : cloth;

  return (
    <svg viewBox="0 0 120 200" width={size} height={(size * 200) / 120} className={className} role="img" aria-label={title ?? "Avatar"}>
      {title ? <title>{title}</title> : null}
      <defs>
        <pattern id={wax} width="14" height="14" patternUnits="userSpaceOnUse">
          <rect width="14" height="14" fill={cloth} />
          <circle cx="7" cy="7" r="4.2" fill="none" stroke={accent} strokeWidth="1.6" />
          <circle cx="7" cy="7" r="1.4" fill={accent} />
          <circle cx="0" cy="0" r="2" fill={clothDark} />
          <circle cx="14" cy="14" r="2" fill={clothDark} />
        </pattern>
      </defs>

      {/* Ombre au sol */}
      <ellipse cx="60" cy="193" rx="34" ry="5" fill="#000" opacity="0.12" />

      {/* Cheveux (arrière) */}
      {hair === "afro" && <circle cx="60" cy="40" r="31" fill={HAIR} />}
      {hair === "locks" && (
        <g fill={HAIR}>
          {[34, 41, 48, 72, 79, 86].map((x, i) => (
            <rect key={x} x={x - 3} y={30} width={6} height={i % 2 ? 58 : 50} rx={3} />
          ))}
        </g>
      )}
      {hair === "tresses" && (
        <g stroke={HAIR} strokeWidth="3.4" strokeLinecap="round">
          {[37, 43, 77, 83].map((x) => (
            <line key={x} x1={x} y1={34} x2={x + (x < 60 ? -2 : 2)} y2={98} />
          ))}
        </g>
      )}

      {/* Jambes */}
      <rect x="45" y="126" width="13" height="58" rx="5" fill={legColor} />
      <rect x="62" y="126" width="13" height="58" rx="5" fill={legColor} />
      {outfit === "maillot" && (
        <g>
          <rect x="43" y="124" width="34" height="26" rx="5" fill="#f4f4f4" />
          <rect x="45" y="166" width="13" height="16" fill={cloth} />
          <rect x="62" y="166" width="13" height="16" fill={cloth} />
        </g>
      )}

      {/* Chaussures */}
      <Shoes kind={shoes} skin={skin} />

      {/* Bras */}
      <g>
        <rect x={60 - shoulder - 7} y="80" width="11" height="54" rx="5.5" fill={outfit === "tshirt_jean" || outfit === "maillot" || outfit === "robe_wax" ? skin : clothDark} />
        <rect x={60 + shoulder - 4} y="80" width="11" height="54" rx="5.5" fill={outfit === "tshirt_jean" || outfit === "maillot" || outfit === "robe_wax" ? skin : clothDark} />
        {(outfit === "tshirt_jean" || outfit === "maillot") && (
          <>
            <rect x={60 - shoulder - 8} y="78" width="13" height="18" rx="5" fill={cloth} />
            <rect x={60 + shoulder - 5} y="78" width="13" height="18" rx="5" fill={cloth} />
          </>
        )}
        <circle cx={60 - shoulder - 1.5} cy="135" r="5.5" fill={skin} />
        <circle cx={60 + shoulder + 1.5} cy="135" r="5.5" fill={skin} />
      </g>

      {/* Buste / tenue */}
      {outfit === "boubou" || outfit === "basin_brode" ? (
        <path d={`M${60 - shoulder - 4} 80 Q60 72 ${60 + shoulder + 4} 80 L${60 + shoulder + 16} 168 Q60 174 ${60 - shoulder - 16} 168 Z`} fill={cloth} />
      ) : outfit === "robe_wax" ? (
        <path d={`M${60 - shoulder + 2} 80 Q60 74 ${60 + shoulder - 2} 80 L${60 + shoulder - 6} 120 L${60 + shoulder + 8} 162 Q60 168 ${60 - shoulder - 8} 162 L${60 - shoulder + 6} 120 Z`} fill={fabric} />
      ) : outfit === "ensemble_pagne" ? (
        <>
          <path d={`M${60 - shoulder + 4} 124 L${60 + shoulder - 4} 124 L${60 + shoulder} 182 Q60 186 ${60 - shoulder} 182 Z`} fill={fabric} />
          <path d={`M${60 - shoulder} 80 Q60 74 ${60 + shoulder} 80 L${60 + shoulder - 3} 128 L${60 - shoulder + 3} 128 Z`} fill={fabric} />
        </>
      ) : (
        <path d={`M${60 - shoulder} 80 Q60 74 ${60 + shoulder} 80 L${60 + shoulder - 4} 130 L${60 - shoulder + 4} 130 Z`} fill={fabric} />
      )}
      {outfit === "boubou" && (
        <path d="M50 80 Q60 96 70 80" fill="none" stroke={accent} strokeWidth="2.5" />
      )}
      {outfit === "basin_brode" && (
        <g fill="none" stroke={GOLD} strokeLinecap="round">
          <path d="M48 80 Q60 104 72 80" strokeWidth="3" />
          <path d="M52 84 Q60 98 68 84" strokeWidth="1.4" />
          <path d="M60 100 L60 124 M54 108 L66 108 M55 116 L65 116" strokeWidth="1.6" />
          <circle cx="60" cy="127" r="3" strokeWidth="1.4" />
          <path d="M40 160 Q60 166 80 160" strokeWidth="1.6" />
        </g>
      )}
      {outfit === "costume" && (
        <g>
          <path d="M52 78 L60 104 L68 78 Z" fill="#f4f1ea" />
          <path d="M58.5 84 L61.5 84 L62.5 104 L60 108 L57.5 104 Z" fill={appearance.outfit_color === "bordeaux" ? DARK : "#7a1f3d"} />
          <path d="M52 78 L60 112 L56 130" fill="none" stroke={shade(cloth, -0.25)} strokeWidth="1.5" />
          <path d="M68 78 L60 112 L64 130" fill="none" stroke={shade(cloth, -0.25)} strokeWidth="1.5" />
        </g>
      )}
      {outfit === "maillot" && (
        <g>
          <rect x="57" y="78" width="6" height="52" fill="#f4f4f4" opacity="0.9" />
          <text x="60" y="113" textAnchor="middle" fontSize="15" fontWeight="700" fill="#f4f4f4" stroke={clothDark} strokeWidth="0.6">
            10
          </text>
        </g>
      )}
      {outfit === "tshirt_jean" && <path d="M53 78 Q60 86 67 78" fill="none" stroke={clothDark} strokeWidth="2" />}

      {/* Cou */}
      <rect x="53.5" y="64" width="13" height="16" rx="5" fill={skinDark} />
      {accessory === "chaine" && <path d="M51 78 Q60 92 69 78" fill="none" stroke={GOLD} strokeWidth="2" />}

      {/* Oreilles */}
      <circle cx="39" cy="46" r="5" fill={skinDark} />
      <circle cx="81" cy="46" r="5" fill={skinDark} />
      {accessory === "boucles" && (
        <g fill="none" stroke={GOLD} strokeWidth="1.8">
          <circle cx="38" cy="55" r="3.2" />
          <circle cx="82" cy="55" r="3.2" />
        </g>
      )}

      {/* Tête */}
      <Head face={face} skin={skin} />

      {/* Visage */}
      <g>
        <path d="M45 39 Q50 36 55 39" fill="none" stroke={HAIR} strokeWidth="2" strokeLinecap="round" />
        <path d="M65 39 Q70 36 75 39" fill="none" stroke={HAIR} strokeWidth="2" strokeLinecap="round" />
        <ellipse cx="50" cy="46" rx="3" ry="3.6" fill="#1b1310" />
        <ellipse cx="70" cy="46" rx="3" ry="3.6" fill="#1b1310" />
        <circle cx="51" cy="44.8" r="1" fill="#fff" />
        <circle cx="71" cy="44.8" r="1" fill="#fff" />
        <path d="M57 55 Q60 58 63 55" fill="none" stroke={shade(skin, -0.2)} strokeWidth="1.8" strokeLinecap="round" />
        <path d="M52 62 Q60 67 68 62" fill="none" stroke="#4a1e1a" strokeWidth="2.2" strokeLinecap="round" />
      </g>

      {/* Cheveux (avant) */}
      <HairFront hair={hair} cloth={cloth} clothDark={clothDark} />

      {/* Accessoires */}
      {accessory === "lunettes" && (
        <g fill="rgba(255,255,255,0.15)" stroke="#111" strokeWidth="1.8">
          <circle cx="50" cy="46" r="6.5" />
          <circle cx="70" cy="46" r="6.5" />
          <line x1="56.5" y1="46" x2="63.5" y2="46" />
        </g>
      )}
      {accessory === "casquette" && hair !== "foulard" && (
        <g>
          <path d="M37 32 Q60 4 83 32 Z" fill={appearance.outfit_color === "blanc" ? "#2e3a8c" : "#f2efe8"} />
          <path d="M60 30 Q86 28 96 34 Q80 36 60 34 Z" fill={appearance.outfit_color === "blanc" ? "#1e2766" : "#d8d3c8"} />
        </g>
      )}
      {accessory === "chapeau" && hair !== "foulard" && (
        <g>
          <ellipse cx="60" cy="25" rx="32" ry="6" fill="#e8d7a8" stroke="#b89d5c" strokeWidth="0.8" />
          <path d="M42 25 Q42 6 60 6 Q78 6 78 25 Z" fill="#efe1b8" stroke="#b89d5c" strokeWidth="0.8" />
          <rect x="42.5" y="18" width="35" height="5" fill="#23211f" />
        </g>
      )}
      {accessory === "montre" && <rect x={60 + shoulder - 3} y="124" width="9" height="5" rx="1.5" fill={GOLD} />}
    </svg>
  );
}

function Head({ face, skin }: { face: string; skin: string }) {
  switch (face) {
    case "rond":
      return <circle cx="60" cy="46" r="22" fill={skin} />;
    case "carre":
      return <rect x="38.5" y="23" width="43" height="46" rx="11" fill={skin} />;
    case "long":
      return <ellipse cx="60" cy="45" rx="19" ry="26" fill={skin} />;
    default:
      return <ellipse cx="60" cy="46" rx="20.5" ry="24" fill={skin} />;
  }
}

function HairFront({ hair, cloth, clothDark }: { hair: string; cloth: string; clothDark: string }) {
  switch (hair) {
    case "ras":
      return <path d="M39.5 40 Q42 20 60 19 Q78 20 80.5 40 Q78 28 60 27 Q42 28 39.5 40 Z" fill={HAIR} opacity="0.85" />;
    case "degrade":
      return <path d="M39 40 Q38 16 60 15 Q82 16 81 40 Q79 26 60 25 Q41 26 39 40 Z" fill={HAIR} />;
    case "afro":
      return <path d="M38 38 Q40 18 60 17 Q80 18 82 38 Q76 26 60 26 Q44 26 38 38 Z" fill={HAIR} />;
    case "locks":
    case "tresses":
      return (
        <g>
          <path d="M38 40 Q38 17 60 16 Q82 17 82 40 Q77 26 60 25 Q43 26 38 40 Z" fill={HAIR} />
          {hair === "tresses" && <path d="M50 18 L48 27 M60 16 L60 26 M70 18 L72 27" stroke="#3a2a24" strokeWidth="1" />}
        </g>
      );
    case "bantu":
      return (
        <g fill={HAIR}>
          <path d="M39 38 Q40 21 60 20 Q80 21 81 38 Q76 28 60 28 Q44 28 39 38 Z" />
          {[
            [44, 22],
            [60, 15],
            [76, 22],
            [51, 17],
            [69, 17],
          ].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="5.5" />
          ))}
        </g>
      );
    case "chignon":
      return (
        <g fill={HAIR}>
          <circle cx="60" cy="13" r="10" />
          <path d="M38 40 Q38 18 60 17 Q82 18 82 40 Q77 27 60 26 Q43 27 38 40 Z" />
        </g>
      );
    case "foulard":
      return (
        <g>
          <path d="M34 36 Q32 6 60 6 Q90 4 88 34 Q78 26 60 27 Q42 26 34 36 Z" fill={cloth} />
          <path d="M44 12 Q60 2 80 14 Q70 18 60 14 Q50 12 44 12 Z" fill={clothDark} />
          <path d="M80 12 Q98 4 96 22 Q90 16 84 22 Z" fill={cloth} />
          <path d="M38 30 Q60 18 84 28" fill="none" stroke={clothDark} strokeWidth="1.5" />
        </g>
      );
    default:
      return null;
  }
}

function Shoes({ kind, skin }: { kind: string; skin: string }) {
  const y = 184;
  switch (kind) {
    case "baskets":
      return (
        <g>
          <path d={`M42 ${y - 4} h17 v6 h-20 q0 -6 3 -6 Z`} fill="#f4f4f4" stroke="#bbb" strokeWidth="0.8" />
          <path d={`M61 ${y - 4} h17 q3 0 3 6 h-20 Z`} fill="#f4f4f4" stroke="#bbb" strokeWidth="0.8" />
          <rect x="39" y={y + 1.5} width="20" height="2" fill="#c4572e" />
          <rect x="61" y={y + 1.5} width="20" height="2" fill="#c4572e" />
        </g>
      );
    case "mocassins":
      return (
        <g fill="#5a3422">
          <ellipse cx="50" cy={y + 1} rx="11" ry="4.5" />
          <ellipse cx="70" cy={y + 1} rx="11" ry="4.5" />
        </g>
      );
    case "claquettes":
      return (
        <g>
          <ellipse cx="50" cy={y + 2} rx="10" ry="3" fill="#222" />
          <ellipse cx="70" cy={y + 2} rx="10" ry="3" fill="#222" />
          <rect x="43" y={y - 3} width="14" height="4" rx="2" fill="#2f7d4f" />
          <rect x="63" y={y - 3} width="14" height="4" rx="2" fill="#2f7d4f" />
          <ellipse cx="50" cy={y - 1} rx="7" ry="2" fill={skin} />
          <ellipse cx="70" cy={y - 1} rx="7" ry="2" fill={skin} />
        </g>
      );
    default:
      return (
        <g>
          <ellipse cx="50" cy={y + 2} rx="10" ry="3" fill="#8a5a2b" />
          <ellipse cx="70" cy={y + 2} rx="10" ry="3" fill="#8a5a2b" />
          <path d={`M44 ${y} L56 ${y - 3} M64 ${y - 3} L76 ${y}`} stroke="#8a5a2b" strokeWidth="2.5" />
        </g>
      );
  }
}
