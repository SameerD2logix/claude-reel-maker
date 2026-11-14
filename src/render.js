// Render a reel spec (JSON) into 1080x1920 slides and an MP4 (H.264 + silent AAC, Instagram/TikTok ready).
// Usage: node src/render.js examples/what-is-mcp.json out/
// Needs: npm install (sharp) and ffmpeg on PATH.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const sharp = require("sharp");
const { validateSpec } = require("./spec");

const W = 1080, H = 1920, FPS = 30, FADE = 0.45;
const FONT = "Inter, DejaVu Sans, Arial, sans-serif";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function theme(brand) {
  const c = brand.colors || {};
  return { bg1: c.bg1 || "#03140b", bg2: c.bg2 || "#0b1120", a1: c.accent1 || "#10D9A0", a2: c.accent2 || "#A3E635",
           text: c.text || "#ffffff", muted: c.muted || "#c7d2cc", ink: c.ink || "#03140b" };
}

function defs(t) {
  return `<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.bg1}"/><stop offset="1" stop-color="${t.bg2}"/></linearGradient>
  <linearGradient id="acc" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${t.a1}"/><stop offset="1" stop-color="${t.a2}"/></linearGradient>
  <radialGradient id="glow"><stop offset="0" stop-color="${t.a1}" stop-opacity="0.3"/><stop offset="1" stop-color="${t.a1}" stop-opacity="0"/></radialGradient>
  <pattern id="dots" width="40" height="40" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="2" fill="#fff" fill-opacity="0.05"/></pattern></defs>`;
}

// Text helpers. Reels UI covers ~250 px at the top and ~450 px at the bottom: content stays in y 280-1460.
const text = (x, y, size, fill, s, weight = 800, anchor = "start") =>
  `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}"${size > 70 ? ' letter-spacing="-2"' : ""}>${esc(s)}</text>`;
const lines = (arr, y, size, fill, weight = 800, gap = 1.15) => arr.map((l, k) => text(90, y + k * size * gap, size, fill, l, weight)).join("");

function wrap(s, maxChars) {
  const out = [];
  let cur = "";
  for (const word of String(s).split(/\s+/)) {
    if ((cur + " " + word).trim().length > maxChars && cur) { out.push(cur); cur = word; } else cur = (cur + " " + word).trim();
  }
  if (cur) out.push(cur);
  return out;
}

function slideBody(s, t, brand) {
  const kicker = s.kicker ? text(90, 520, 34, "url(#acc)", s.kicker.toUpperCase(), 800) : "";
  switch (s.type) {
    case "title":
      return kicker + lines(wrap(s.title, 16), 680, 100, t.text) +
        (s.highlight ? text(90, 1340, 190, "url(#acc)", s.highlight, 900) : "");
    case "big":
      return kicker + lines(wrap(s.title, 12), 700, 128, t.text) +
        lines((s.lines || []).flatMap((l) => wrap(l, 30)), 1150, 46, t.muted, 500, 1.35);
    case "bullets": {
      const head = s.title ? lines(wrap(s.title, 20), 660, 84, t.text) : "";
      const items = (s.items || []).slice(0, 4).map((it, k) => {
        const y = 860 + k * 170;
        return `<circle cx="112" cy="${y - 16}" r="12" fill="url(#acc)"/>` + text(150, y, 50, t.text, it.label) +
          (it.detail ? text(150, y + 62, 36, t.muted, it.detail, 500) : "");
      }).join("");
      return kicker + head + items;
    }
    case "cta":
      return `<rect x="390" y="560" width="300" height="300" rx="76" fill="url(#acc)"/>` +
        text(540, 760, 150, t.ink, brand.initials || brand.name.slice(0, 2), 900, "middle") +
        text(540, 1060, 88, t.text, s.title || `Follow ${brand.name}`, 900, "middle") +
        (s.subtitle ? text(540, 1150, 42, t.muted, s.subtitle, 600, "middle") : "") +
        (brand.url ? `<rect x="240" y="1230" width="600" height="96" rx="48" fill="url(#acc)"/>` + text(540, 1293, 44, t.ink, brand.url, 800, "middle") : "");
    default:
      throw new Error(`unknown slide type: ${s.type}`);
  }
}

function slideSvg(spec, i) {
  const t = theme(spec.brand);
  const n = spec.slides.length;
  const seg = (W - 180 - (n - 1) * 10) / n;
  const bars = spec.slides.map((_, k) =>
    `<rect x="${90 + k * (seg + 10)}" y="290" width="${seg}" height="8" rx="4" fill="${k <= i ? "url(#acc)" : "#fff"}" fill-opacity="${k <= i ? 1 : 0.15}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${defs(t)}
  <rect width="${W}" height="${H}" fill="url(#bg)"/><rect width="${W}" height="${H}" fill="url(#dots)"/>
  <circle cx="960" cy="420" r="520" fill="url(#glow)"/><circle cx="80" cy="1600" r="420" fill="url(#glow)"/>
  ${bars}${text(90, 374, 34, t.text, spec.brand.name, 800)}
  ${slideBody(spec.slides[i], t, spec.brand)}</svg>`;
}

function ffmpegArgs(files, durations, out) {
  const args = ["-hide_banner", "-loglevel", "error", "-y"];
  files.forEach((f) => args.push("-i", f));
  args.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");
  const parts = durations.map((d, i) =>
    `[${i}:v]scale=1296:2304,zoompan=z='min(zoom+0.0004,1.05)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${Math.round(d * FPS)}:s=${W}x${H}:fps=${FPS},format=yuv420p,setsar=1[v${i}]`);
  let prev = "v0", t = durations[0];
  for (let i = 1; i < durations.length; i++) {
    const label = i === durations.length - 1 ? "vout" : `x${i}`;
    parts.push(`[${prev}][v${i}]xfade=transition=fade:duration=${FADE}:offset=${(t - FADE).toFixed(2)}[${label}]`);
    t += durations[i] - FADE;
    prev = label;
  }
  if (durations.length === 1) parts.push("[v0]null[vout]");
  args.push("-filter_complex", parts.join(";"), "-map", "[vout]", "-map", `${files.length}:a`, "-t", t.toFixed(2),
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-r", String(FPS),
    "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", out);
  return { args, seconds: t };
}

async function render(spec, outDir) {
  const errors = validateSpec(spec);
  if (errors.length) throw new Error("Invalid spec:\n- " + errors.join("\n- "));
  fs.mkdirSync(outDir, { recursive: true });
  const files = [];
  for (let i = 0; i < spec.slides.length; i++) {
    const f = path.join(outDir, `slide-${String(i + 1).padStart(2, "0")}.png`);
    await sharp(Buffer.from(slideSvg(spec, i))).png().toFile(f);
    files.push(f);
  }
  const video = path.join(outDir, `${spec.slug || "reel"}.mp4`);
  const { args, seconds } = ffmpegArgs(files, spec.slides.map((s) => s.seconds || 4.5), video);
  const r = spawnSync("ffmpeg", args, { stdio: "inherit" });
  if (r.status !== 0) throw new Error("ffmpeg failed (is it installed?)");
  return { slides: files, video, seconds };
}

module.exports = { render, slideSvg, ffmpegArgs, wrap };

if (require.main === module) {
  const [specPath, outDir = "out"] = process.argv.slice(2);
  if (!specPath) { console.error("usage: node src/render.js spec.json [outDir]"); process.exit(2); }
  render(JSON.parse(fs.readFileSync(specPath, "utf8")), outDir)
    .then((r) => console.log(`✓ ${r.slides.length} slides, ${r.seconds.toFixed(1)} s → ${r.video}`))
    .catch((e) => { console.error(e.message); process.exit(1); });
}
