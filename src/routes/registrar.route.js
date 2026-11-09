const express = require("express");
const { register } = require("../services/attendance.service");
const router = express.Router();
router.post("/", (req, res) => res.json(register(req.body.codigo, req)));
module.exports = router;
