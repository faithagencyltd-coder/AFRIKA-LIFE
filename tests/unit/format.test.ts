import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { fcfa, jobName, signed } from "../../src/game/format.ts";
import { effectEntries, mostUrgentNeed, needLevel } from "../../src/game/needs.ts";

describe("Formats", () => {
  test("montants en FCFA", () => {
    assert.equal(fcfa(500000), "500 000 FCFA");
    assert.equal(fcfa(100), "100 FCFA");
    assert.equal(fcfa(-1500), "−1 500 FCFA");
  });

  test("métier accordé", () => {
    const job = { name: "Vendeur au marché", name_feminine: "Vendeuse au marché" };
    assert.equal(jobName(job, "femme"), "Vendeuse au marché");
    assert.equal(jobName(job, "homme"), "Vendeur au marché");
    assert.equal(jobName({ name: "Maçon", name_feminine: null }, "femme"), "Maçon");
  });

  test("effets signés", () => {
    assert.equal(signed(40), "+40");
    assert.equal(signed(-12), "−12");
    assert.equal(signed(-18.26), "−18,3");
  });
});

describe("Besoins", () => {
  test("niveaux et urgence", () => {
    assert.deepEqual([needLevel(10), needLevel(20), needLevel(50), needLevel(90)], ["critique", "bas", "correct", "bon"]);
    assert.equal(mostUrgentNeed({ hunger: 50, energy: 30, hygiene: 70, fun: 60, social: 80, bladder: 40 }), "energy");
  });

  test("effets triés dans l'ordre des besoins", () => {
    assert.deepEqual(effectEntries({ social: 5, hunger: 40, fun: 0 }), [
      { key: "hunger", value: 40 },
      { key: "social", value: 5 },
    ]);
  });
});
