"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { validateSpec } = require("../src/spec");
const { slideSvg, ffmpegArgs, wrap } = require("../src/render");
const { draft, parseArgs } = require("../src/draft");

const example = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "examples", "what-is-mcp.json"), "utf8"));

test("example spec is valid", () => assert.deepEqual(validateSpec(example), []));

test("validator reports useful errors", () => {
  const errs = validateSpec({ brand: {}, slides: [{ type: "big" }, { type: "bullets", items: [1, 2, 3, 4, 5] }, { type: "x" }] });
  const all = errs.join(" | ");
  assert.match(all, /brand.name/);
  assert.match(all, /slides\[0\].title is required/);
  assert.match(all, /max 4/);
  assert.match(all, /slides\[2\].type/);
});

test("wrap splits long titles", () => {
  assert.deepEqual(wrap("Claude ko apne tools se kaise jorein?", 16), ["Claude ko apne", "tools se kaise", "jorein?"]);
});

test("svg escapes text and draws one progress bar per slide", () => {
  const spec = { brand: { name: "A&B" }, slides: [{ type: "big", title: "<x>" }, { type: "cta" }] };
  const svg = slideSvg(spec, 0);
  assert.match(svg, /A&amp;B/);
  assert.match(svg, /&lt;x&gt;/);
  assert.equal((svg.match(/y="290"/g) || []).length, 2);
});

test("crossfade offsets add up", () => {
  const { args, seconds } = ffmpegArgs(["a.png", "b.png", "c.png"], [4, 5, 3], "o.mp4");
  assert.equal(seconds.toFixed(2), (12 - 2 * 0.45).toFixed(2));
  const graph = args[args.indexOf("-filter_complex") + 1];
  assert.match(graph, /offset=3\.55\[x1\]/);
  assert.match(graph, /offset=8\.10\[vout\]/);
});

test("draft sends the schema and validates the reply", async () => {
  let sent;
  const fake = { beta: { messages: { create: async (req) => { sent = req; return { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(example) }] }; } } } };
  const spec = await draft(parseArgs(["What", "is", "MCP?", "--brand", "Acme", "--url", "acme.dev"]), fake);
  assert.equal(sent.model, "claude-opus-5-5");
  assert.equal(sent.output_config.format.type, "json_schema");
  assert.equal(spec.brand.name, "Acme");
  assert.match(sent.messages[0].content, /Topic: What is MCP\?/);
});

test("renders a real MP4 when ffmpeg is available", { skip: !hasFfmpeg() }, async () => {
  const { render } = require("../src/render");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reel-"));
  const spec = { slug: "t", brand: { name: "Test" }, slides: [{ type: "big", title: "Hello", seconds: 2 }, { type: "cta", seconds: 2 }] };
  const r = await render(spec, dir);
  assert.ok(fs.statSync(r.video).size > 10_000);
  assert.equal(r.slides.length, 2);
});

function hasFfmpeg() {
  try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); return true; } catch { return false; }
}
