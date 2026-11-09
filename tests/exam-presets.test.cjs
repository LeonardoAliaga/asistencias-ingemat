const { test } = require("node:test");
const assert = require("node:assert/strict");
const { listPresets } = require("../src/services/exam-presets.service");
const {
  normalizeDefinition,
  grade,
} = require("../src/services/grading.service");

// Independent transcription of the printed "Responde" tables (A, B, C, D, E).
const expected = [
  ["Sección Actitudinal", 1, [10, 10, 10, 10, 10]],
  ["Habilidad Verbal", 11, [10, 10, 10, 10, 10]],
  ["Habilidad Lógico-Matemática", 21, [10, 10, 10, 10, 10]],
  ["Aritmética", 31, [4, 4, 4, 4, 2]],
  ["Geometría", 35, [3, 4, 4, 4, 2]],
  ["Álgebra", 39, [3, 4, 4, 4, 2]],
  ["Trigonometría", 43, [2, 3, 3, 2, 2]],
  ["Lenguaje", 46, [7, 6, 7, 8, 8]],
  ["Literatura", 54, [4, 4, 4, 4, 6]],
  ["Psicología", 60, [6, 4, 4, 6, 6]],
  ["Educación Cívica", 66, [4, 4, 4, 4, 4]],
  ["Historia del Perú", 70, [3, 2, 3, 3, 5]],
  ["Historia Universal", 75, [2, 2, 2, 3, 5]],
  ["Geografía", 80, [4, 4, 4, 4, 5]],
  ["Economía", 85, [4, 4, 4, 8, 5]],
  ["Filosofía", 93, [4, 4, 4, 4, 6]],
  ["Física", 99, [5, 7, 7, 4, 4]],
  ["Química", 106, [7, 7, 6, 4, 4]],
  ["Biología", 113, [8, 7, 6, 4, 4]],
];
const seq = (start, count) =>
  Array.from({ length: count }, (_, i) => start + i);
test("repaso preset matches every course and fixed area range in the supplied PDFs", () => {
  const preset = listPresets().find((p) => p.isDefault);
  assert.equal(preset.id, "builtin:repaso-unmsm");
  const d = preset.definition;
  assert.equal(d.totalQuestions, 120);
  assert.equal(d.sections.length, 19);
  assert.deepEqual(
    d.sections.flatMap((s) => s.questions),
    seq(1, 120),
  );
  assert.deepEqual(d.scoring, { correct: 20, wrong: 1.125, blank: 0 });
  for (const [index, [name, start, counts]] of expected.entries()) {
    const s = d.sections[index];
    assert.equal(s.name, name);
    const physicalEnd = index === 18 ? 120 : expected[index + 1][1] - 1;
    assert.deepEqual(s.questions, seq(start, physicalEnd - start + 1));
    for (const [i, code] of [..."ABCDE"].entries()) {
      assert.deepEqual(
        s.rules[code],
        {
          questions: seq(start, counts[i]),
          selection: "fixed",
          quota: counts[i],
        },
        `${name}, área ${code}`,
      );
    }
  }
  for (const area of d.areas) {
    assert.equal(area.requiredQuestions, 100);
    assert.equal(
      d.sections.reduce((n, s) => n + s.rules[area.code].quota, 0),
      100,
    );
  }
});
test("preset has no invented keys and cannot be prepared until keys are supplied", () => {
  const d = listPresets()[0].definition;
  assert.ok(
    Object.values(d.keys).every(
      (k) => k.answers.length === 0 && !k.optionScores && !k.voidPolicy,
    ),
  );
  assert.throws(() => normalizeDefinition(d), /Falta la clave/);
  assert.equal(normalizeDefinition(d, { complete: false }).totalQuestions, 120);
});
test("each area grades 100 applicable questions and ignores all 20 outside its profile", () => {
  const d = listPresets()[0].definition;
  // Synthetic keys only for this test; the shipped preset stays blank.
  d.keys = Object.fromEntries(seq(1, 120).map((q) => [q, "A"]));
  for (const area of d.areas) {
    const eligible = new Set(
      d.sections.flatMap((s) => s.rules[area.code].questions),
    );
    const answers = Object.fromEntries(
      seq(1, 120).map((q) => [q, eligible.has(q) ? "A" : "B"]),
    );
    const result = grade(d, answers, area.code);
    assert.equal(result.correctas, 100);
    assert.equal(result.incorrectas, 0);
    assert.equal(result.enBlanco, 0);
    assert.equal(result.puntajeTotal, 2000);
    assert.equal(
      result.detail.filter((q) => q.status === "not_applicable").length,
      20,
    );
    assert.equal(grade(d, {}, area.code).enBlanco, 100);
    assert.equal(
      grade(d, Object.fromEntries(seq(1, 120).map((q) => [q, "B"])), area.code)
        .puntajeTotal,
      -112.5,
    );
  }
});
test("editing a returned preset never mutates future defaults", () => {
  const first = listPresets();
  first[0].definition.sections[0].rules.A.questions.pop();
  first[0].definition.keys[1].answers.push("C");
  assert.equal(
    listPresets()[0].definition.sections[0].rules.A.questions.length,
    10,
  );
  assert.deepEqual(listPresets()[0].definition.keys[1].answers, []);
});
