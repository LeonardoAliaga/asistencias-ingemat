const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeDefinition,
  grade,
  range,
} = require("../src/services/grading.service");
function definition(extra = {}) {
  return {
    totalQuestions: 4,
    areas: [
      { code: "A", name: "Salud", requiredQuestions: 2 },
      { code: "C", name: "Ingeniería", requiredQuestions: 2 },
    ],
    sections: [
      {
        name: "Matemática",
        questions: [1, 2],
        rules: { A: { questions: [1] }, C: { questions: [1, 2] } },
      },
      {
        name: "Biología",
        questions: [3, 4],
        rules: { A: { questions: [3] }, C: { questions: [] } },
      },
    ],
    keys: { 1: "A", 2: "B", 3: "C", 4: "D" },
    scoring: { correct: 20, wrong: 1.125, blank: 0 },
    ...extra,
  };
}
test("area rules grade only applicable questions and preserve exact decimal penalties", () => {
  const r = grade(definition(), { 1: "A", 2: "B", 3: "A", 4: "D" }, "A");
  assert.equal(r.puntajeTotal, 18.875);
  assert.equal(r.correctas, 1);
  assert.equal(r.incorrectas, 1);
  assert.equal(r.enBlanco, 0);
  assert.equal(r.detail.filter((d) => d.status === "not_applicable").length, 2);
  assert.equal(r.courses.length, 2);
});
test("invalid area never falls back to a general key", () =>
  assert.throws(() => grade(definition(), {}, "Z"), /área válida/));
test("missing key and incomplete area totals prevent validation", () => {
  assert.throws(
    () => normalizeDefinition(definition({ keys: { 1: "A" } })),
    /Falta la clave/,
  );
  const d = definition();
  d.areas[0].requiredQuestions = 3;
  assert.throws(() => normalizeDefinition(d), /suma 2/);
});
test("a draft can save missing keys but still validates its structure", () => {
  assert.equal(
    normalizeDefinition(definition({ keys: {} }), { complete: false }).keys[1]
      .answers.length,
    0,
  );
  assert.throws(
    () =>
      normalizeDefinition(
        definition({ sections: [{ name: "Mal", questions: [1, 2] }] }),
        { complete: false },
      ),
    /cubren/,
  );
});
test("question cannot belong to two courses", () => {
  const d = definition();
  d.sections[1].questions = [2, 3, 4];
  assert.throws(() => normalizeDefinition(d), /exactamente/);
});
test("choose quota counts missing choices as blank and rejects excess without selecting best", () => {
  const d = {
    totalQuestions: 4,
    areas: [{ code: "A", name: "A", requiredQuestions: 2 }],
    sections: [
      {
        name: "Matemática",
        questions: [1, 2, 3, 4],
        rules: {
          A: { questions: [1, 2, 3, 4], selection: "choose", quota: 2 },
        },
      },
    ],
    keys: { 1: "A", 2: "B", 3: "C", 4: "D" },
  };
  const r = grade(d, { 2: "B" }, "A");
  assert.equal(r.correctas, 1);
  assert.equal(r.enBlanco, 1);
  assert.throws(() => grade(d, { 1: "A", 2: "B", 3: "C" }, "A"), /máximo es 2/);
});
test("multiple answers are invalid; uncertain reads block grading", () => {
  const d = definition();
  assert.equal(grade(d, { 1: "A/B", 3: "C" }, "A").incorrectas, 1);
  assert.throws(
    () => grade(d, { 1: { status: "uncertain", options: [] } }, "A"),
    /dudosa/,
  );
});
test("no penalty, annulment and per-option scores are distinct", () => {
  const d = definition();
  d.keys[1] = { answers: ["A"], noPenalty: true };
  d.keys[3] = {
    answers: ["C"],
    optionScores: { A: 5, B: 10, C: 20, D: 15, E: 0 },
  };
  assert.equal(grade(d, { 1: "E", 3: "D" }, "A").puntajeTotal, 15);
  d.keys[1] = { answers: [], voidPolicy: "credit", credit: 20 };
  const r = grade(d, { 3: "C" }, "A");
  assert.equal(r.anuladas, 1);
  assert.equal(r.puntajeTotal, 40);
});
test("version maps printed question numbers into the canonical order", () => {
  const d = definition();
  d.forms = { B: [3, 4, 1, 2] };
  assert.equal(grade(d, { 1: "C", 3: "A" }, "A", "B").puntajeTotal, 40);
  assert.throws(() => grade(d, {}, "A", "A"), /Versión/);
});
test("out-of-range input, non-finite points and invalid options are rejected", () => {
  assert.throws(() => grade(definition(), { 5: "A" }, "A"), /no existe/);
  assert.throws(() => grade(definition(), { 1: "F" }, "A"), /alternativas/);
  assert.throws(
    () => normalizeDefinition(definition({ scoring: { correct: Infinity } })),
    /finitos/,
  );
  assert.throws(() => range("1-99999"), /fuera/);
  assert.throws(() => range("2-1"), /fuera/);
});
test("120 printed questions can yield exactly 100 graded questions per profile", () => {
  const keys = Object.fromEntries(
    Array.from({ length: 120 }, (_, i) => [i + 1, "A"]),
  );
  const d = {
    totalQuestions: 120,
    areas: [
      { code: "A", name: "A", requiredQuestions: 100 },
      { code: "C", name: "C", requiredQuestions: 100 },
    ],
    sections: [
      {
        name: "Todos",
        questions: range("1-120"),
        rules: {
          A: { questions: range("1-100") },
          C: { questions: range("21-120") },
        },
      },
    ],
    keys,
  };
  const r = grade(
    d,
    Object.fromEntries(range("1-120").map((q) => [q, "A"])),
    "C",
  );
  assert.equal(r.correctas, 100);
  assert.equal(r.puntajeTotal, 2000);
});
