const { test } = require("node:test");
const assert = require("node:assert/strict");
const { attendanceReportCaption, studentReportCaption } = require("../src/services/whatsapp-report-captions.service");

test("manual attendance captions vary but are stable for the same request id", () => {
  const captions = new Set();
  for (let i = 0; i < 24; i++) {
    const requestId = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
    const data = { cycle: "ANUAL", date: "2026-11-10", shift: "mañana", requestId };
    const caption = attendanceReportCaption(data);
    assert.equal(caption, attendanceReportCaption(data));
    assert(caption.includes("ANUAL"));
    assert(caption.includes("2026-11-10"));
    captions.add(caption);
  }
  assert(captions.size > 1);
});
test("manual student report caption keeps identifying data", () => {
  const options = { name: "Pérez Ana", code: "EST0001", period: "Semana 1", requestId: "00000000-0000-4000-8000-000000000001" };
  const message = studentReportCaption(options);
  assert.equal(studentReportCaption(options), message);
  assert(message.includes("Pérez Ana"));
  assert(message.includes("EST0001"));
  assert(message.includes("Semana 1"));
});
