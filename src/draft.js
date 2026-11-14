// Ask Claude to draft a reel spec for a topic (structured output = always valid JSON for render.js).
// Usage: node src/draft.js "What is MCP?" --brand "D2Logix" --url d2logix.com --lang "Roman Urdu" > reel.json
"use strict";
const Anthropic = require("@anthropic-ai/sdk");
const { schema, validateSpec } = require("./spec");

const SYSTEM = `You script short vertical explainer reels (Instagram Reels / TikTok / YouTube Shorts), 25-45 seconds.
Structure: a hook slide ("title" with a one-word highlight), 4-6 teaching slides ("big" or "bullets"), then a "cta" slide.
Rules: one idea per slide; at most ~12 words per title line; bullets max 4 items with short labels;
use only well-established facts; no invented statistics; seconds per slide 3.5-6.`;

function parseArgs(argv) {
  const opts = { topic: "", brand: "My Brand", url: "", lang: "English" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--brand") opts.brand = argv[++i];
    else if (a === "--url") opts.url = argv[++i];
    else if (a === "--lang") opts.lang = argv[++i];
    else opts.topic = (opts.topic + " " + a).trim();
  }
  return opts;
}

async function draft({ topic, brand, url, lang }, client = new Anthropic()) {
  const response = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default", // retry on Anthropic's recommended model if the request is declined
    output_config: { effort: "medium", format: { type: "json_schema", schema } },
    system: SYSTEM,
    messages: [{
      role: "user",
      content: `Topic: ${topic}\nLanguage: ${lang}\nBrand name: ${brand}\nBrand URL: ${url || "(none)"}\nWrite the reel spec.`,
    }],
  });
  if (response.stop_reason === "refusal") throw new Error("Claude declined this topic.");
  const block = response.content.find((b) => b.type === "text");
  const spec = JSON.parse(block.text);
  spec.brand = { ...spec.brand, name: brand, ...(url ? { url } : {}) };
  const errors = validateSpec(spec);
  if (errors.length) throw new Error("Draft failed validation:\n- " + errors.join("\n- "));
  return spec;
}

module.exports = { draft, parseArgs, SYSTEM };

if (require.main === module) {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.topic) { console.error('usage: node src/draft.js "topic" [--brand X] [--url Y] [--lang Z]'); process.exit(2); }
  draft(opts)
    .then((spec) => process.stdout.write(JSON.stringify(spec, null, 2) + "\n"))
    .catch((e) => { console.error(e.message); process.exit(1); });
}
