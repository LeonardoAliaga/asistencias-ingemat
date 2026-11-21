const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { randomUUID } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ingemat-adaptive-"));
process.env.DATA_DIR = dir;
process.env.DISABLE_MIGRATION_BACKUP = "1";
const db = require("../src/database/db");
const exams = require("../src/services/evaluations.service");
const imports = require("../src/services/imports.service");
const {
  makePDF,
  resolveQR,
  qrPayload,
} = require("../src/services/omr-pdf.service");
const { adaptiveLayout } = require("../src/services/omr-adaptive-layout");
const { normalizeDefinition } = require("../src/services/grading.service");
const req = { session: { username: "test", role: "admin" } };
db.prepare("INSERT INTO ciclos(nombre) VALUES(?)").run("ANUAL");
for (let i = 1; i <= 6; i++)
  db.prepare(
    "INSERT INTO usuarios(codigo,nombre,apellido,rol,ciclo,uid) VALUES(?,?,?,'estudiante','ANUAL',?)",
  ).run(String(i).padStart(8, "0"), "DEMO", `ALUMNO ${i}`, randomUUID());
after(() => {
  db.close();
  if (!process.env.KEEP_OMR_TEST)
    fs.rmSync(dir, { recursive: true, force: true });
  else console.log("OMR artifacts:", dir);
});
const def = (n) =>
  normalizeDefinition({
    totalQuestions: n,
    keys: Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1, "A"])),
  });
test("automatic layout keeps readable bubbles and exact question ranges for 1–200 questions", () => {
  for (const n of [1, 20, 50, 75, 100, 120, 200]) {
    const plan = adaptiveLayout(def(n)),
      p = plan.pages[0];
    assert.equal(p.bubbles.length, n);
    assert.deepEqual(
      p.bubbles.map((b) => b.question),
      Array.from({ length: n }, (_, i) => i + 1),
    );
    assert.equal(p.identification.columns.length, 8);
    for (const b of p.bubbles)
      for (const o of b.options) {
        assert.equal(o.radius, 3);
        assert(o.x - o.radius > 16 && o.x + o.radius < p.width - 16);
        assert(o.y - o.radius > 160 && o.y + o.radius < p.height - 18);
      }
  }
  assert.equal(adaptiveLayout(def(50)).perSheet, 6);
  assert(adaptiveLayout(def(120)).perSheet < 6);
  const many = def(50);
  many.sections = Array.from({ length: 50 }, (_, i) => ({
    name: `Curso ${i + 1}`,
    questions: [i + 1],
  }));
  assert(adaptiveLayout(many).perSheet < 6);
});
test("fixed template preserves academic structure on creation and draft edits while allowing fresh keys", () => {
  const definition = def(50),
    templateId = randomUUID();
  db.prepare(
    "INSERT INTO exam_templates(id,name,definition,structure_fixed) VALUES(?,?,?,1)",
  ).run(templateId, "FIJA", JSON.stringify(definition));
  const body = {
    titulo: "NUEVO",
    ciclo: "ANUAL",
    templateId,
    definition: structuredClone(definition),
  };
  body.definition.keys[1] = { answers: ["B"] };
  const saved = exams.saveExam(body, req);
  assert.equal(saved.template_id, templateId);
  const changed = structuredClone(body);
  changed.definition.sections[0].name = "DIFERENTE";
  assert.throws(() => exams.saveExam(changed, req), /áreas y cursos fijos/);
  assert.throws(
    () => exams.saveExam({ ...changed, templateId: undefined }, req, saved.id),
    /áreas y cursos fijos/,
  );
  assert.equal(exams.getExam(saved.id).definition.keys[1].answers[0], "B");
});
test("real PDFs: six 50-question cards and three 100-question cards identify their exams, freeze geometry and commit atomically", async () => {
  const entries = [];
  for (const n of [50, 100]) {
    const saved = exams.saveExam(
        { titulo: `EXAMEN ${n}`, ciclo: "ANUAL", definition: def(n) },
        req,
      ),
      exam = exams.readyExam(saved.id, req),
      spec = adaptiveLayout(exam.definition);
    const pdf = path.join(dir, `${n}.pdf`);
    fs.writeFileSync(
      pdf,
      await makePDF(exam, [], {
        mode: "blank",
        format: "auto",
        count: spec.perSheet,
      }),
    );
    const sheets = db
      .prepare("SELECT * FROM omr_sheets WHERE evaluation_id=? ORDER BY rowid")
      .all(exam.id);
    assert.equal(sheets.length, spec.perSheet);
    assert(
      sheets.every(
        (s) => s.layout_version === 5 && s.layout_id === sheets[0].layout_id,
      ),
    );
    assert.equal(
      resolveQR(qrPayload(sheets[0].id, 1, 5)).evaluation_id,
      exam.id,
    );
    const stored = JSON.parse(
      db
        .prepare("SELECT definition FROM omr_layouts WHERE id=?")
        .get(sheets[0].layout_id).definition,
    )[0];
    assert.deepEqual(stored, spec.pages[0]);
    entries.push({ examId: exam.id, pdf, spec });
  }
  const input = path.join(dir, "fixture.json"),
    merged = path.join(dir, "mixed.pdf");
  fs.writeFileSync(input, JSON.stringify({ entries, merged }));
  const py = spawnSync(
    "python3",
    [
      "-c",
      `
import json,sys
import pypdfium2 as pdfium
from PIL import ImageDraw
r=json.load(open(sys.argv[1])); images=[]
for entry in r['entries']:
 p=pdfium.PdfDocument(entry['pdf']); page=p[0]; bmp=page.render(scale=300/72); im=bmp.to_pil().convert('RGB'); draw=ImageDraw.Draw(im); spec=entry['spec']; layout=spec['pages'][0]
 for i in range(spec['perSheet']):
  dx=(i%spec['cols'])*spec['width']; dy=(i//spec['cols'])*spec['height']
  options=[column['options'][int(digit)] for column,digit in zip(layout['identification']['columns'],str(i+1).zfill(8))]
  options += [b['options'][0] for b in layout['bubbles']]
  for o in options:
   x=(o['x']+dx)*300/72; y=(o['y']+dy)*300/72; radius=o['radius']*300/72*.92
   draw.ellipse((x-radius,y-radius,x+radius,y+radius),fill='black')
 images.append(im); bmp.close(); page.close(); p.close()
images[0].save(r['merged'],save_all=True,append_images=images[1:],resolution=300)
images[0].resize((794,1123)).save(r['merged']+'.png')
`,
      input,
    ],
    { encoding: "utf8" },
  );
  assert.equal(py.status, 0, py.stderr);
  const copy = path.join(dir, "upload.pdf");
  fs.copyFileSync(merged, copy);
  const batch = imports.createScan(
    "",
    [{ path: copy, originalname: "Varios-examenes.pdf" }],
    req,
  );
  assert.equal(batch.evaluation_id, "");
  await imports.processScanQueue();
  let read = imports.batchView(batch.id);
  assert.equal(
    read.status,
    "ready",
    JSON.stringify(
      read.result.pages.map((p) => ({
        error: p.error,
        warning: p.warning,
        code: p.identification?.code,
      })),
      null,
      2,
    ),
  );
  assert.equal(read.result.rows.length, 9);
  assert.equal(new Set(read.result.rows.map((r) => r.examId)).size, 2);
  assert(read.result.pages.every((p) => p.identifiedStudent && p.examTitle));
  const changed = exams.getExam(entries[1].examId);
  exams.reviseKeys(
    changed.id,
    {
      keys: { ...changed.definition.keys, 1: { answers: ["B"] } },
      reason: "Corrección de clave de prueba",
    },
    req,
  );
  assert.throws(
    () =>
      imports.commitBatch(
        batch.id,
        { reviewVersion: read.result.reviewVersion },
        req,
      ),
    /claves cambiaron/,
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) n FROM respuestas_evaluacion").get().n,
    0,
  );
  imports.refreshBatch(batch.id, req);
  read = imports.batchView(batch.id);
  const results = imports.commitBatch(
    batch.id,
    { reviewVersion: read.result.reviewVersion },
    req,
  );
  assert.equal(results.length, 9);
  assert.equal(
    db.prepare("SELECT COUNT(*) n FROM respuestas_evaluacion").get().n,
    9,
  );
  const duplicate = path.join(dir, "duplicate.pdf");
  fs.copyFileSync(merged, duplicate);
  const repeated = imports.createScan(
    "",
    [{ path: duplicate, originalname: "Duplicado.pdf" }],
    req,
  );
  await imports.processScanQueue();
  const rejected = imports.batch(repeated.id);
  assert.equal(rejected.status, "review");
  assert(rejected.result.pages.every((p) => /ya fue importada/.test(p.error)));
  const { deleteExam } = require("../src/services/exam-delete.service");
  deleteExam(entries[0].examId, "EXAMEN 50", req);
  const retained = imports.batchView(batch.id);
  assert.equal(retained.result.rows.length, 3);
  assert(retained.result.rows.every((r) => r.examId === entries[1].examId));
  assert.equal(
    db.prepare("SELECT COUNT(*) n FROM respuestas_evaluacion").get().n,
    3,
  );
  assert.equal(db.prepare("SELECT COUNT(*) n FROM imported_sheets").get().n, 3);
});

test("existing adaptive cards read across cycles and validate marked areas in rotated JPEGs", async () => {
  const definition = normalizeDefinition({
    totalQuestions: 50,
    areas: [
      { code: "A", name: "Ciencias", requiredQuestions: 50 },
      { code: "E", name: "Letras", requiredQuestions: 50 },
    ],
    sections: Array.from({ length: 5 }, (_, i) => ({
      name: `Curso ${i + 1}`,
      questions: Array.from({ length: 10 }, (_, j) => i * 10 + j + 1),
    })),
    keys: Object.fromEntries(
      Array.from({ length: 50 }, (_, i) => [i + 1, "A"]),
    ),
  });
  const saved = exams.saveExam(
      { titulo: "ÁREAS ADAPTABLES", ciclo: "ANUAL", definition },
      req,
    ),
    exam = exams.readyExam(saved.id, req),
    spec = adaptiveLayout(definition);
  assert.equal(spec.perSheet, 6);
  const pdf = path.join(dir, "areas.pdf"),
    file = path.join(dir, "areas.jpg"),
    input = path.join(dir, "areas.json");
  fs.writeFileSync(
    pdf,
    await makePDF(exam, [], { mode: "blank", format: "auto", count: 1 }),
  );
  db.prepare("INSERT INTO ciclos(nombre) VALUES(?)").run("REPASO");
  db.prepare(
    "UPDATE usuarios SET ciclo='REPASO',area='A' WHERE codigo='00000001'",
  ).run();
  const converted = exams.enableAllCycles(exam.id, req);
  assert.equal(converted.ciclo, "");
  assert.equal(converted.revision, exam.revision);
  assert.deepEqual(converted.definition, exam.definition);
  fs.writeFileSync(input, JSON.stringify({ pdf, file, layout: spec.pages[0] }));
  const py = spawnSync(
    "python3",
    [
      "-c",
      `
import json,sys,cv2,numpy as np
import pypdfium2 as pdfium
from PIL import ImageDraw
r=json.load(open(sys.argv[1])); p=pdfium.PdfDocument(r['pdf']); page=p[0]; bmp=page.render(scale=300/72); im=bmp.to_pil().convert('RGB'); draw=ImageDraw.Draw(im); l=r['layout']
options=[c['options'][int(d)] for c,d in zip(l['identification']['columns'],'00000001')]+[l['identification']['areas'][1]]+[b['options'][0] for b in l['bubbles']]
for o in options:
 x=o['x']*300/72; y=o['y']*300/72; radius=o['radius']*300/72*.92; draw.ellipse((x-radius,y-radius,x+radius,y+radius),fill='black')
a=cv2.cvtColor(np.array(im),cv2.COLOR_RGB2BGR); h,w=a.shape[:2]
m=cv2.getPerspectiveTransform(np.float32([[0,0],[w-1,0],[w-1,h-1],[0,h-1]]),np.float32([[40,25],[w-30,60],[w-60,h-15],[15,h-40]]))
a=cv2.warpPerspective(a,m,(w,h),borderValue=(255,255,255)); a=cv2.rotate(a,cv2.ROTATE_90_CLOCKWISE); cv2.imwrite(r['file'],a,[cv2.IMWRITE_JPEG_QUALITY,85]);bmp.close();page.close();p.close()
`,
      input,
    ],
    { encoding: "utf8" },
  );
  assert.equal(py.status, 0, py.stderr);
  const batch = imports.createScan(
    "",
    [{ path: file, originalname: "Áreas.jpg" }],
    req,
  );
  await imports.processScanQueue();
  let read = imports.batchView(batch.id);
  assert.equal(read.status, "review");
  assert.match(read.result.pages[0].warning, /no coincide con el perfil/);
  db.prepare(
    "UPDATE usuarios SET area='GENERAL' WHERE codigo='00000001'",
  ).run();
  imports.refreshBatch(batch.id, req);
  read = imports.batchView(batch.id);
  assert.equal(read.status, "ready", JSON.stringify(read.result));
  assert.equal(read.result.rows[0].area, "E");
  assert.equal(read.result.rows[0].identifiedStudent.cycle, "REPASO");
  assert.equal(read.result.rows[0].preview.correctas, 50);
  const page = read.result.pages[0];
  imports.reviewPage(
    batch.id,
    0,
    {
      reviewVersion: read.result.reviewVersion,
      identification: { code: "00000001", area: "A" },
      responses: page.responses,
      reason: "Área cotejada con cartilla física",
    },
    req,
  );
  read = imports.batch(batch.id);
  assert.equal(read.result.rows[0].area, "A");
  assert.equal(read.result.pages[0].identification.area, "E");
  assert.equal(read.result.pages[0].identificationOverride.area, "A");
  imports.commitBatch(
    batch.id,
    { reviewVersion: read.result.reviewVersion },
    req,
  );
  const grade = db
    .prepare(
      "SELECT ciclo,area FROM respuestas_evaluacion WHERE evaluacion_id=?",
    )
    .get(exam.id);
  assert.deepEqual(grade, { ciclo: "REPASO", area: "A" });
});
