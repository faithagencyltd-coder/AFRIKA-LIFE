import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { canStartShift, formatGameDuration, formatRealRemaining, gameMinuteAt, isOpenAt, realMsForGameMinutes, splitGameMinute } from "../../src/game/clock.ts";

const clock = { world_epoch: "2026-10-01T00:00:00Z", time_scale: 15, start_game_minute: 420 };
const at = (iso: string) => Date.parse(iso);

describe("Horloge du jeu", () => {
  test("même calcul que game_minute() en SQL", () => {
    assert.equal(gameMinuteAt(clock, at("2026-10-01T00:00:00Z")), 420);
    assert.equal(gameMinuteAt(clock, at("2026-10-01T00:04:00Z")), 480);
    // Une journée de jeu = 96 minutes réelles.
    assert.equal(gameMinuteAt(clock, at("2026-10-01T01:36:00Z")), 420 + 1440);
  });

  test("jour, heure, période", () => {
    assert.deepEqual(splitGameMinute(420), { day: 1, hour: 7, minute: 0, hhmm: "07:00", period: "matin" });
    assert.equal(splitGameMinute(1440 * 2 + 14 * 60 + 5).hhmm, "14:05");
    assert.equal(splitGameMinute(1440 * 2 + 14 * 60 + 5).day, 3);
    assert.equal(splitGameMinute(23 * 60).period, "nuit");
    assert.equal(splitGameMinute(19 * 60).period, "soir");
  });

  test("ouverture des lieux : même règle que building_is_open()", () => {
    assert.equal(isOpenAt(6, 19, 18 * 60 + 59), true);
    assert.equal(isOpenAt(6, 19, 19 * 60), false);
    assert.equal(isOpenAt(18, 2, 1440 + 60), true);
    assert.equal(isOpenAt(18, 2, 12 * 60), false);
    assert.equal(isOpenAt(0, 24, 3 * 60), true);
  });

  test("fenêtre de service : début et fin dans les horaires", () => {
    assert.equal(canStartShift(6, 19, 120, 17 * 60), true);
    assert.equal(canStartShift(6, 19, 120, 17 * 60 + 1), false);
    assert.equal(canStartShift(6, 19, 120, 5 * 60 + 59), false);
  });

  test("durées", () => {
    assert.equal(realMsForGameMinutes(480, 15), 32 * 60_000);
    assert.equal(formatGameDuration(30), "30 min");
    assert.equal(formatGameDuration(120), "2 h");
    assert.equal(formatGameDuration(65), "1 h 05");
    assert.equal(formatRealRemaining(372_000), "6 min 12 s");
    assert.equal(formatRealRemaining(45_000), "45 s");
    assert.equal(formatRealRemaining(-5), "0 s");
  });
});
