const { AppError } = require("../utils/errors");
const OPTIONS = ["A", "B", "C", "D", "E"];
const ENGINE_VERSION = "2.0.0";
function range(value, max = 200) {
  if (Array.isArray(value)) {
    if (value.length > max) throw new AppError("Demasiadas preguntas.");
    return [...new Set(value.map(Number))].sort((a, b) => a - b);
  }
  const result = [];
  for (const part of String(value || "")
    .split(/[,;\s]+/)
    .filter(Boolean)) {
    const match = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!match) throw new AppError(`Rango de preguntas inválido: ${part}`);
    const start = Number(match[1]),
      end = Number(match[2] || start);
    if (start < 1 || end < start || end > max)
      throw new AppError(`Rango fuera del cuadernillo: ${part}`);
    for (let i = start; i <= end; i++) result.push(i);
  }
  return [...new Set(result)].sort((a, b) => a - b);
}
function amount(value, fallback) {
  const n = value === undefined ? fallback : Number(value);
  if (
    !Number.isFinite(n) ||
    Math.abs(n) > 10000 ||
    (Math.round(n * 1000) !== n * 1000 &&
      Math.abs(Math.round(n * 1000) - n * 1000) > 0.00001)
  )
    throw new AppError(
      "Los puntajes deben ser finitos, de hasta tres decimales y entre -10000 y 10000.",
    );
  return n;
}
function normalizeDefinition(input, { complete = true } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new AppError("La estructura del examen no es válida.");
  const total = Number(input.totalQuestions);
  if (!Number.isInteger(total) || total < 1 || total > 200)
    throw new AppError("El cuadernillo debe contener entre 1 y 200 preguntas.");
  const scoring = {
    correct: amount(input.scoring?.correct, 20),
    wrong: Math.abs(amount(input.scoring?.wrong, 1.125)),
    blank: amount(input.scoring?.blank, 0),
  };
  const areas = (
    input.areas?.length
      ? input.areas
      : [{ code: "GENERAL", name: "General", requiredQuestions: total }]
  ).map((a) => ({
    code: String(a.code || "")
      .trim()
      .toUpperCase(),
    name: String(a.name || a.code || "")
      .trim()
      .slice(0, 100),
    requiredQuestions: Number(
      a.requiredQuestions ?? input.requiredQuestions ?? total,
    ),
  }));
  if (
    areas.length > 20 ||
    new Set(areas.map((a) => a.code)).size !== areas.length ||
    areas.some(
      (a) =>
        !a.code.match(/^[A-Z0-9_-]{1,20}$/) ||
        !Number.isInteger(a.requiredQuestions) ||
        a.requiredQuestions < 1 ||
        a.requiredQuestions > total,
    )
  )
    throw new AppError(
      "Las áreas deben ser únicas y tener una cantidad válida de preguntas evaluables.",
    );
  const rawSections = input.sections?.length
    ? input.sections
    : [
        {
          name: "General",
          questions: Array.from({ length: total }, (_, i) => i + 1),
        },
      ];
  if (rawSections.length > 60) throw new AppError("Demasiados cursos.");
  const seen = new Set();
  const sections = rawSections.map((s, index) => {
    const questions = range(s.questions ?? `${s.start}-${s.end}`, total);
    if (
      !questions.length ||
      questions.some(
        (q) => !Number.isInteger(q) || q < 1 || q > total || seen.has(q),
      )
    )
      throw new AppError(
        "Cada pregunta debe pertenecer exactamente a un curso.",
      );
    questions.forEach((q) => seen.add(q));
    const rules = {};
    for (const area of areas) {
      const raw = s.rules?.[area.code];
      const eligible =
        raw === undefined ? questions : range(raw.questions ?? [], total);
      if (eligible.some((q) => !questions.includes(q)))
        throw new AppError(
          `El área ${area.code} tiene preguntas que no pertenecen a ${s.name}.`,
        );
      const selection = raw?.selection || "fixed";
      const quota = Number(raw?.quota ?? eligible.length);
      if (
        !["fixed", "choose"].includes(selection) ||
        !Number.isInteger(quota) ||
        quota < 0 ||
        quota > eligible.length ||
        (selection === "fixed" && quota !== eligible.length)
      )
        throw new AppError(`Cupo inválido en ${s.name}, área ${area.code}.`);
      rules[area.code] = { questions: eligible, selection, quota };
    }
    return {
      id: String(s.id || `curso-${index + 1}`).slice(0, 64),
      name: String(s.name || `Curso ${index + 1}`)
        .trim()
        .slice(0, 100),
      questions,
      rules,
      scoring: {
        correct: amount(s.scoring?.correct, scoring.correct),
        wrong: Math.abs(amount(s.scoring?.wrong, scoring.wrong)),
        blank: amount(s.scoring?.blank, scoring.blank),
      },
    };
  });
  if (seen.size !== total)
    throw new AppError(
      `Los cursos cubren ${seen.size} de las ${total} preguntas del cuadernillo.`,
    );
  for (const area of areas) {
    const n = sections.reduce((sum, s) => sum + s.rules[area.code].quota, 0);
    if (n !== area.requiredQuestions)
      throw new AppError(
        `El área ${area.code} suma ${n} preguntas evaluables; se esperan ${area.requiredQuestions}.`,
      );
  }
  const keys = {};
  for (let q = 1; q <= total; q++) {
    const raw = input.keys?.[q];
    const k =
      typeof raw === "string" ? { answers: raw.split(/[,;\s]+/) } : raw || {};
    let answers = [
      ...new Set((k.answers || []).map((a) => String(a).toUpperCase())),
    ];
    if (answers.some((a) => !OPTIONS.includes(a)))
      throw new AppError(
        `La clave de la pregunta ${q} contiene alternativas inválidas.`,
      );
    const voidPolicy = k.voidPolicy || null;
    if (voidPolicy && !["credit", "exclude"].includes(voidPolicy))
      throw new AppError(`Política de anulación inválida en ${q}.`);
    let optionScores;
    if (k.optionScores) {
      optionScores = {};
      for (const opt of OPTIONS)
        optionScores[opt] = amount(k.optionScores[opt], 0);
      if (!answers.length) {
        const max = Math.max(...Object.values(optionScores));
        answers = OPTIONS.filter((o) => optionScores[o] === max);
      }
    }
    if (complete && !answers.length && !voidPolicy && !optionScores)
      throw new AppError(
        `Falta la clave de la pregunta ${q}. Puedes guardar el borrador y completarla después.`,
      );
    keys[q] = {
      answers,
      voidPolicy,
      credit: amount(
        k.credit,
        sections.find((s) => s.questions.includes(q)).scoring.correct,
      ),
      ...(optionScores ? { optionScores } : {}),
      noPenalty: !!k.noPenalty,
    };
  }
  const forms = {};
  const sourceForms =
    input.forms && Object.keys(input.forms).length
      ? input.forms
      : { A: Array.from({ length: total }, (_, i) => i + 1) };
  if (Object.keys(sourceForms).length > 10)
    throw new AppError("Se admiten hasta 10 versiones del cuadernillo.");
  for (const [name, mapping] of Object.entries(sourceForms)) {
    if (
      !/^[A-Z0-9_-]{1,20}$/.test(name) ||
      !Array.isArray(mapping) ||
      mapping.length !== total ||
      new Set(mapping).size !== total ||
      mapping.some((q) => !Number.isInteger(q) || q < 1 || q > total)
    )
      throw new AppError(
        `La versión ${name} debe ser una permutación completa de las preguntas.`,
      );
    forms[name] = mapping;
  }
  return {
    version: 2,
    totalQuestions: total,
    areas,
    sections,
    keys,
    scoring,
    forms,
    maxGrade: amount(input.maxGrade, 20),
  };
}
function normalizeResponse(value) {
  if (value === null || value === undefined || value === "")
    return { status: "blank", options: [] };
  if (typeof value === "string") {
    const options = [
      ...new Set(
        value
          .toUpperCase()
          .trim()
          .split(/[\s,;\/]+/)
          .filter(Boolean),
      ),
    ];
    if (!options.length) return { status: "blank", options: [] };
    if (options.some((a) => !OPTIONS.includes(a)))
      throw new AppError(
        "Las respuestas solo pueden contener alternativas A a E.",
      );
    return { status: options.length > 1 ? "multiple" : "single", options };
  }
  if (typeof value !== "object" || Array.isArray(value))
    throw new AppError("Formato de respuesta inválido.");
  if (value.status === "uncertain") return { status: "uncertain", options: [] };
  const r = normalizeResponse((value.options || []).join(","));
  if (
    !["single", "multiple", "blank"].includes(value.status) ||
    value.status !== r.status
  )
    throw new AppError("El estado de la respuesta no coincide con sus marcas.");
  return r;
}
function grade(definition, responses, areaCode, form = "A") {
  const def = normalizeDefinition(definition),
    area = def.areas.find(
      (a) =>
        a.code ===
        String(
          areaCode || (def.areas.length === 1 ? def.areas[0].code : ""),
        ).toUpperCase(),
    );
  if (!area) throw new AppError("Selecciona un área válida para este examen.");
  if (!def.forms[form])
    throw new AppError("Versión de cuadernillo desconocida.");
  if (!responses || typeof responses !== "object" || Array.isArray(responses))
    throw new AppError("Debes proporcionar las respuestas del estudiante.");
  const canonical = {};
  for (const [printed, value] of Object.entries(responses)) {
    const n = Number(printed);
    if (
      !Number.isInteger(n) ||
      String(n) !== printed ||
      n < 1 ||
      n > def.totalQuestions
    )
      throw new AppError(`La pregunta ${printed} no existe en el cuadernillo.`);
    canonical[def.forms[form][n - 1]] = normalizeResponse(value);
  }
  let correctas = 0,
    incorrectas = 0,
    enBlanco = 0,
    anuladas = 0,
    units = 0;
  const detail = [],
    courses = [];
  const applicable = new Set();
  for (const section of def.sections) {
    const rule = section.rules[area.code];
    let selected = rule.questions;
    if (rule.selection === "choose") {
      selected = rule.questions.filter(
        (q) => canonical[q] && canonical[q].status !== "blank",
      );
      if (selected.length > rule.quota)
        throw new AppError(
          `${section.name}: respondiste ${selected.length} preguntas y el máximo es ${rule.quota}. Revisa las marcas; el sistema no elige las mejores respuestas.`,
        );
    }
    const course = {
      name: section.name,
      correctas: 0,
      incorrectas: 0,
      enBlanco: 0,
      anuladas: 0,
      total: rule.quota,
      puntaje: 0,
    };
    let courseUnits = 0;
    for (const q of selected) {
      applicable.add(q);
      const r = canonical[q] || { status: "blank", options: [] },
        key = def.keys[q];
      let status,
        points = 0;
      if (r.status === "uncertain")
        throw new AppError(
          `La pregunta ${q} tiene una marca dudosa. Revísala antes de calificar.`,
        );
      if (key.voidPolicy) {
        status = "annulled";
        anuladas++;
        course.anuladas++;
        points = key.voidPolicy === "credit" ? key.credit : 0;
      } else if (r.status === "blank") {
        status = "blank";
        enBlanco++;
        course.enBlanco++;
        points = section.scoring.blank;
      } else if (r.status === "single" && key.optionScores) {
        status = key.answers.includes(r.options[0]) ? "correct" : "incorrect";
        points = key.optionScores[r.options[0]];
        if (status === "correct") {
          correctas++;
          course.correctas++;
        } else {
          incorrectas++;
          course.incorrectas++;
        }
      } else if (r.status === "single" && key.answers.includes(r.options[0])) {
        status = "correct";
        correctas++;
        course.correctas++;
        points = section.scoring.correct;
      } else {
        status = r.status === "multiple" ? "multiple" : "incorrect";
        incorrectas++;
        course.incorrectas++;
        points = key.noPenalty ? 0 : -section.scoring.wrong;
      }
      courseUnits += Math.round(points * 1000);
      detail.push({
        question: q,
        course: section.name,
        status,
        options: r.options,
        points,
      });
    }
    const missing = rule.quota - selected.length;
    if (missing > 0) {
      enBlanco += missing;
      course.enBlanco += missing;
      courseUnits += Math.round(section.scoring.blank * 1000) * missing;
    }
    course.puntaje = courseUnits / 1000;
    units += courseUnits;
    courses.push(course);
  }
  for (let q = 1; q <= def.totalQuestions; q++)
    if (!applicable.has(q))
      detail.push({
        question: q,
        status: "not_applicable",
        options: canonical[q]?.options || [],
        points: 0,
      });
  return {
    engineVersion: ENGINE_VERSION,
    area: area.code,
    form,
    correctas,
    incorrectas,
    enBlanco,
    anuladas,
    puntajeTotal: units / 1000,
    totalEvaluables: area.requiredQuestions,
    courses,
    detail,
  };
}
module.exports = {
  normalizeDefinition,
  normalizeResponse,
  grade,
  range,
  ENGINE_VERSION,
};
