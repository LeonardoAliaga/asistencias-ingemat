const express = require("express");
const crypto = require("node:crypto");
const { handleStatus } = require("../services/notifications.service");
const router = express.Router();
router.get("/", (req, res) => {
  if (
    process.env.WHATSAPP_VERIFY_TOKEN &&
    req.query["hub.mode"] === "subscribe" &&
    req.query["hub.verify_token"] === process.env.WHATSAPP_VERIFY_TOKEN
  )
    return res
      .type("text/plain")
      .send(String(req.query["hub.challenge"] || ""));
  res.sendStatus(403);
});
router.post("/", (req, res) => {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !req.rawBody) return res.sendStatus(403);
  const expected = Buffer.from(
    "sha256=" +
      crypto.createHmac("sha256", secret).update(req.rawBody).digest("hex"),
  );
  const provided = Buffer.from(req.get("x-hub-signature-256") || "");
  if (
    expected.length !== provided.length ||
    !crypto.timingSafeEqual(expected, provided)
  )
    return res.sendStatus(403);
  for (const entry of req.body.entry || [])
    for (const change of entry.changes || [])
      for (const event of change.value?.statuses || []) handleStatus(event);
  res.sendStatus(200);
});
module.exports = router;
