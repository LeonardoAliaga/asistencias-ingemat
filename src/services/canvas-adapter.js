const { createCanvas, GlobalFonts } = require("@napi-rs/canvas");
module.exports = {
  createCanvas,
  registerFont: (file, options) =>
    GlobalFonts.registerFromPath(file, options.family),
};
