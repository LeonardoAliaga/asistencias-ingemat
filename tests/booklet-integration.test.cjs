const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { spawnSync } = require("node:child_process"),
  { randomUUID } = require("node:crypto");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ingemat-booklets-"));
process.env.DATA_DIR = dir;
process.env.DISABLE_MIGRATION_BACKUP = "1";
const db = require("../src/database/db"),
  config = require("../src/config"),
  exams = require("../src/services/evaluations.service"),
  imports = require("../src/services/imports.service");
const {
  makePDF,
  resolveQR,
  qrPayload,
} = require("../src/services/omr-pdf.service");
const {
  bookletLayouts,
  duplexSlot,
  FORMATS,
} = require("../src/services/omr-booklet-layout");
const { adaptiveLayout } = require("../src/services/omr-adaptive-layout");
const req = { session: { username: "test", role: "admin" } },
  presets = require("../src/services/exam-presets.service").listPresets(),
  definition = presets[0].definition,
  definition126 = presets.find(
    (preset) => preset.presetId === "unmsm-126",
  ).definition;
db.prepare("INSERT INTO ciclos(nombre) VALUES(?)").run("ANUAL");
for (const [code, area] of [
  ["00123456", "A"],
  ["00234567", "C"],
  ["00345678", "D"],
  ["00456789", "E"],
])
  db.prepare(
    "INSERT INTO usuarios(codigo,nombre,apellido,rol,turno,ciclo,uid,area) VALUES(?,?,?,?,?,?,?,?)",
  ).run(
    code,
    "DEMO",
    "ALUMNO",
    "estudiante",
    "mañana",
    "ANUAL",
    randomUUID(),
    area,
  );
after(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
test("booklet layouts cover 120 questions, eight digit columns and duplex identities without overlaps", () => {
  for (const format of Object.keys(FORMATS)) {
    const pages = bookletLayouts(definition, format);
    assert.deepEqual(
      pages.flatMap((p) => p.bubbles.map((q) => q.question)),
      Array.from({ length: 120 }, (_, i) => i + 1),
    );
    assert.equal(pages[0].identification.columns.length, 8);
    assert.ok(
      pages[0].identification.columns.every(
        (c) => c.options.map((o) => o.option).join("") === "0123456789",
      ),
    );
    for (const p of pages)
      for (const b of p.bubbles) {
        assert.ok(b.y + b.options[0].radius < p.height - 20);
        assert.ok(
          b.options.every(
            (o) => o.x - o.radius > 20 && o.x + o.radius < p.width - 20,
          ),
        );
      }
  }
  assert.deepEqual(
    [0, 1, 2, 3].map((i) => duplexSlot(i, "short")),
    [1, 0, 3, 2],
  );
  assert.deepEqual(
    [0, 1, 2, 3].map((i) => duplexSlot(i, "long")),
    [2, 3, 0, 1],
  );
  assert.throws(
    () => bookletLayouts({ ...definition, totalQuestions: 200 }),
    /126 preguntas.*Automático/,
  );
});
const variants = [
  ...Object.keys(FORMATS).map((format) => [format, definition]),
  ...["auto", ...Object.keys(FORMATS)].map((format) => [format, definition126]),
];
for (const [format, examDefinition] of variants)
  test(`${examDefinition.totalQuestions} questions in ${format}: draft PDF, scanned code/area and grading through the last question`, async () => {
    const total = examDefinition.totalQuestions;
    const name = `${total}-${format}`;
    const body = {
      titulo: name,
      ciclo: "ANUAL",
      fecha: "2026-11-09",
      definition: examDefinition,
    };
    const draft = exams.saveExam(body, req);
    const spec =
      format === "auto" ? adaptiveLayout(examDefinition) : FORMATS[format];
    const bytes = await makePDF(draft, [], {
      mode: "blank",
      format,
      count: spec.perSheet,
    });
    const keys = Object.fromEntries(
      Array.from({ length: total }, (_, i) => [i + 1, "A"]),
    );
    exams.saveExam(
      { ...body, definition: { ...examDefinition, keys } },
      req,
      draft.id,
    );
    const exam = exams.readyExam(draft.id, req);
    const pdf = path.join(dir, name + ".pdf");
    fs.writeFileSync(pdf, bytes);
    const sheets = db
      .prepare("SELECT * FROM omr_sheets WHERE evaluation_id=? ORDER BY rowid")
      .all(exam.id);
    const students = db
      .prepare("SELECT codigo,area FROM usuarios ORDER BY codigo")
      .all();
    assert.equal(sheets.length, spec.perSheet);
    assert.ok(
      sheets.every(
        (sheet) => sheet.layout_id && sheet.layout_id === sheets[0].layout_id,
      ),
    );
    const printedLayouts = JSON.parse(
      db
        .prepare("SELECT definition FROM omr_layouts WHERE id=?")
        .get(sheets[0].layout_id).definition,
    );
    assert.deepEqual(
      printedLayouts.flatMap((page) =>
        page.bubbles.map((bubble) => bubble.question),
      ),
      Array.from({ length: total }, (_, i) => i + 1),
    );
    assert.equal(
      resolveQR(qrPayload(sheets[0].id, 1, sheets[0].layout_version))
        .layout_version,
      sheets[0].layout_version,
    );
    // Exercise the QR reader for older compact cartillas without saved geometry.
    if (total === 120)
      db.prepare(
        "UPDATE omr_sheets SET layout_id=NULL WHERE evaluation_id=?",
      ).run(exam.id);
    const jsonPath = path.join(dir, name + ".json"),
      photosDir = path.join(dir, name + "-photos");
    fs.writeFileSync(
      jsonPath,
      JSON.stringify({
        pdf,
        photosDir,
        layouts: printedLayouts,
        students: Object.fromEntries(sheets.map((s, i) => [s.id, students[i]])),
      }),
    );
    const code = `import sys,json,importlib.util,cv2,numpy as np
from pathlib import Path
spec=importlib.util.spec_from_file_location('r','src/omr/reader.py');r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
job=json.load(open(sys.argv[1]));out=Path(job['photosDir']);out.mkdir();number=0
physical_pages=list(r.images(job['pdf']))
assert len(physical_pages)==(2 if 'quarter' in job['pdf'] else 1)
if len(physical_pages)==2:
 import zxingcpp
 positions=[]
 for image in physical_pages:
  qrs=zxingcpp.read_barcodes(image,formats=zxingcpp.BarcodeFormat.QRCode)
  positions.append({q.text.split(':')[1]:(int(q.position.top_left.x>image.shape[1]/2)+2*int(q.position.top_left.y>image.shape[0]/2)) for q in qrs if q.valid})
 assert len(positions[0])==len(positions[1])==4
 for key,slot in positions[0].items():assert positions[1][key]==[1,0,3,2][slot]
for physical in physical_pages:
 crops,incomplete=r.split_cartillas(physical)
 assert not incomplete
 for crop in crops:
  p=r.read_page(crop,job['layouts'],out/'normalized.png')
  assert all(q['status']=='blank' for q in p['responses'].values())
  layout=next(l for l in job['layouts'] if l.get('version')==p['layoutVersion'] and l['page']==p['page'])
  student=job['students'][p['qr'].split(':')[1]]
  image=cv2.imread(str(out/'normalized.png'))
  for bubble in layout['bubbles']:
   o=bubble['options'][0];cv2.circle(image,(round(o['x']*r.SCALE),round(o['y']*r.SCALE)),round(o['radius']*r.SCALE*.95),(0,0,0),-1)
  if layout.get('identification'):
   identity=layout['identification'];assert all(c['status']=='blank' for c in p['identification']['columns'])
   for column,digit in zip(identity['columns'],student['codigo']):
    o=next(o for o in column['options'] if o['option']==digit);cv2.circle(image,(round(o['x']*r.SCALE),round(o['y']*r.SCALE)),round(o['radius']*r.SCALE*.98),(0,0,0),-1)
   o=next(o for o in identity['areas'] if o['option']==student['area']);cv2.circle(image,(round(o['x']*r.SCALE),round(o['y']*r.SCALE)),round(o['radius']*r.SCALE*(.9 if p['layoutVersion']==5 else .65)),(170,170,170),-1)
  h,w=image.shape[:2];matrix=cv2.getPerspectiveTransform(np.float32([[0,0],[w,0],[w,h],[0,h]]),np.float32([[12,9],[w-15,5],[w-6,h-10],[4,h-18]]));image=cv2.warpPerspective(image,matrix,(w,h),borderValue=(255,255,255))
  if number==1:image=np.rot90(image).copy()
  cv2.imwrite(str(out/f'photo-{number}.jpg'),image,[cv2.IMWRITE_JPEG_QUALITY,95]);number+=1
print(number)
`;
    const result = spawnSync(config.python, ["-c", code, jsonPath], {
      cwd: path.join(__dirname, ".."),
      encoding: "utf8",
      maxBuffer: 2 * 1024 * 1024,
    });
    assert.equal(result.status, 0, result.stderr);
    const files = fs
      .readdirSync(photosDir)
      .filter((f) => f.endsWith(".jpg"))
      .map((f) => ({ path: path.join(photosDir, f), originalname: f }));
    assert.equal(files.length, spec.perSheet * spec.sides);
    let batch = imports.createScan(exam.id, files, req);
    await imports.processScanQueue();
    batch = imports.batch(batch.id);
    assert.equal(
      batch.status,
      "ready",
      JSON.stringify(
        batch.result.pages.map((p) => ({
          error: p.error,
          warning: p.warning,
          identity: p.identification,
        })),
      ),
    );
    assert.equal(batch.result.rows.length, sheets.length);
    const visible = imports.batchView(batch.id);
    for (const page of visible.result.pages) {
      assert.equal(page.identifiedStudent.name, "ALUMNO DEMO");
      assert.equal(page.identifiedStudent.code, page.codigoEstudiante);
    }
    for (const row of visible.result.rows)
      assert.equal(row.identifiedStudent.code, row.codigoEstudiante);
    for (const row of batch.result.rows) {
      assert.match(row.codigoEstudiante, /^00\d{6}$/);
      assert.equal(row.preview.puntajeTotal, 2000);
      assert.equal(row.preview.correctas, 100);
      assert.deepEqual(row.respuestas[total].options, ["A"]);
      if (total === 126)
        assert.equal(
          row.preview.detail.find((q) => q.question === 126).status,
          row.area === "A" ? "correct" : "not_applicable",
        );
    }
    const frontIndex = batch.result.pages.findIndex((p) => p.identification);
    const front = batch.result.pages[frontIndex];
    batch = imports.reviewPage(
      batch.id,
      frontIndex,
      {
        reviewVersion: batch.result.reviewVersion,
        responses: front.responses,
        identification: { code: "99999999", area: "A" },
        reason: "Código ilegible revisado manualmente",
      },
      req,
    );
    assert.equal(batch.status, "review");
    assert.ok(
      batch.result.pages.some((p) => /no corresponde/.test(p.warning || "")),
    );
    assert.ok(
      imports
        .batchView(batch.id)
        .result.pages.filter((p) => p.sheetId === front.sheetId)
        .every((p) => p.identifiedStudent === null),
    );
    batch = imports.reviewPage(
      batch.id,
      frontIndex,
      {
        reviewVersion: batch.result.reviewVersion,
        responses: front.responses,
        identification: {
          code: front.identification.code,
          area: front.identification.area,
        },
        reason: "Código cotejado con el padrón",
      },
      req,
    );
    assert.equal(batch.status, "ready");
    assert.ok(
      imports
        .batchView(batch.id)
        .result.pages.filter((p) => p.sheetId === front.sheetId)
        .every((p) => p.identifiedStudent?.code === front.identification.code),
    );
    const grades = imports.commitBatch(
      batch.id,
      { reviewVersion: batch.result.reviewVersion },
      req,
    );
    assert.equal(grades.length, sheets.length);
    assert.ok(
      imports.batch(batch.id).result.pages.find((p) => p.identificationOverride)
        ?.identification.columns.length === 8,
    );
  });
