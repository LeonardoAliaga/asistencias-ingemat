const W = 841.89,
  H = 595.28;
function layouts(total) {
  const pages = [];
  for (let first = 1; first <= total; first += 120) {
    const count = Math.min(120, total - first + 1),
      cols = Math.ceil(count / 25),
      colWidth = (W - 70) / cols;
    const bubbles = [];
    for (let local = 0; local < count; local++) {
      const col = Math.floor(local / 25),
        row = local % 25;
      bubbles.push({
        question: first + local,
        labelX: 35 + col * colWidth + 8,
        y: 145 + row * 15.6,
        options: ["A", "B", "C", "D", "E"].map((option, i) => ({
          option,
          x: 35 + col * colWidth + 36 + i * 19,
          y: 145 + row * 15.6,
          radius: 5,
        })),
      });
    }
    pages.push({
      version: 2,
      page: pages.length + 1,
      width: W,
      height: H,
      markers: [
        { id: 0, x: 30, y: 30, size: 24 },
        { id: 1, x: W - 30, y: 30, size: 24 },
        { id: 2, x: W - 30, y: H - 30, size: 24 },
        { id: 3, x: 30, y: H - 30, size: 24 },
      ],
      qr: { x: 700, y: 47, size: 82 },
      bubbles,
    });
  }
  return pages;
}
module.exports = { layouts };
