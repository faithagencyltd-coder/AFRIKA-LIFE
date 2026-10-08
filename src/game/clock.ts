// Horloge partagée du jeu (docs/ARCHITECTURE.md §6.1). Calcul identique à game_minute() en SQL :
// minute = start_game_minute + (instant − world_epoch) × time_scale.
import type { Clock } from "./types.ts";

export const MINUTES_PER_DAY = 1440;

/** Minute de jeu absolue à un instant réel (ms depuis 1970). */
export function gameMinuteAt(clock: Pick<Clock, "world_epoch" | "time_scale" | "start_game_minute">, realMs: number): number {
  const elapsedRealMinutes = (realMs - Date.parse(clock.world_epoch)) / 60_000;
  return clock.start_game_minute + Math.floor(elapsedRealMinutes * clock.time_scale);
}

export type DayPeriod = "nuit" | "matin" | "après-midi" | "soir";

export interface GameTime {
  day: number;
  hour: number;
  minute: number;
  /** « 07:05 » */
  hhmm: string;
  period: DayPeriod;
}

export function splitGameMinute(absoluteMinute: number): GameTime {
  const m = Math.max(0, absoluteMinute);
  const day = Math.floor(m / MINUTES_PER_DAY) + 1;
  const inDay = m % MINUTES_PER_DAY;
  const hour = Math.floor(inDay / 60);
  const minute = inDay % 60;
  const period: DayPeriod = hour < 6 ? "nuit" : hour < 12 ? "matin" : hour < 18 ? "après-midi" : hour < 22 ? "soir" : "nuit";
  return { day, hour, minute, hhmm: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, period };
}

/** Un lieu est-il ouvert ? Même règle que building_is_open() en SQL. */
export function isOpenAt(openHour: number, closeHour: number, absoluteMinute: number): boolean {
  const hour = Math.floor((absoluteMinute % MINUTES_PER_DAY) / 60);
  if (openHour === 0 && closeHour === 24) return true;
  if (openHour < closeHour) return hour >= openHour && hour < closeHour;
  return hour >= openHour || hour < closeHour;
}

/** Un service de travail peut-il commencer maintenant (début et fin dans la fenêtre) ? */
export function canStartShift(startHour: number, endHour: number, shiftMinutes: number, absoluteMinute: number): boolean {
  const inDay = absoluteMinute % MINUTES_PER_DAY;
  return inDay >= startHour * 60 && inDay + shiftMinutes <= endHour * 60;
}

/** Durée réelle (ms) d'une durée de jeu (minutes). */
export function realMsForGameMinutes(gameMinutes: number, timeScale: number): number {
  return (gameMinutes / timeScale) * 60_000;
}

/** « 1 h 05 », « 30 min » — durée de jeu lisible. */
export function formatGameDuration(gameMinutes: number): string {
  const h = Math.floor(gameMinutes / 60);
  const m = Math.round(gameMinutes % 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

/** « 6 min 12 s », « 45 s » — temps réel restant. */
export function formatRealRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const min = Math.floor(total / 60);
  const s = total % 60;
  return min === 0 ? `${s} s` : `${min} min ${String(s).padStart(2, "0")} s`;
}
