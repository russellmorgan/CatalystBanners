// Approximate ink bounding box of an SVG by scanning all path "d" data.
// Treats curve control points as bounds contributors (good enough for ±1px).
const fs = require("fs");
const file = process.argv[2];
const s = fs.readFileSync(file, "utf8");

let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
const counts = { rel: 0, cmds: 0 };

for (const m of s.matchAll(/\sd="([^"]+)"/g)) {
  const d = m[1];
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
  let i = 0, cmd = "", x = 0, y = 0, sx = 0, sy = 0;
  const pt = (px, py) => {
    if (px < minX) minX = px; if (px > maxX) maxX = px;
    if (py < minY) minY = py; if (py > maxY) maxY = py;
  };
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) { cmd = tokens[i++]; counts.cmds++; if (cmd === cmd.toLowerCase() && cmd !== "z") counts.rel++; }
    const rel = cmd === cmd.toLowerCase();
    const n = () => parseFloat(tokens[i++]);
    switch (cmd.toUpperCase()) {
      case "M": case "L": case "T": {
        const nx = n(), ny = n();
        x = rel ? x + nx : nx; y = rel ? y + ny : ny; pt(x, y);
        if (cmd.toUpperCase() === "M") { sx = x; sy = y; cmd = rel ? "l" : "L"; }
        break;
      }
      case "H": { const nx = n(); x = rel ? x + nx : nx; pt(x, y); break; }
      case "V": { const ny = n(); y = rel ? y + ny : ny; pt(x, y); break; }
      case "C": {
        for (let k = 0; k < 3; k++) { const nx = n(), ny = n(); const px = rel ? x + nx : nx, py = rel ? y + ny : ny; pt(px, py); if (k === 2) { x = px; y = py; } }
        break;
      }
      case "S": case "Q": {
        for (let k = 0; k < 2; k++) { const nx = n(), ny = n(); const px = rel ? x + nx : nx, py = rel ? y + ny : ny; pt(px, py); if (k === 1) { x = px; y = py; } }
        break;
      }
      case "A": { n(); n(); n(); n(); n(); const nx = n(), ny = n(); x = rel ? x + nx : nx; y = rel ? y + ny : ny; pt(x, y); break; }
      case "Z": x = sx; y = sy; break;
      default: i++; // skip unknown
    }
  }
}

const vb = s.match(/viewBox="([^"]+)"/);
console.log("viewBox:", vb ? vb[1] : "n/a");
console.log("ink bbox: x", minX.toFixed(1), "-", maxX.toFixed(1), " y", minY.toFixed(1), "-", maxY.toFixed(1));
console.log("relative cmds:", counts.rel, "of", counts.cmds);
