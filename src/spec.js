// Reel spec: JSON Schema (also sent to Claude as the structured-output format) + a small validator.
"use strict";

const SLIDE_TYPES = ["title", "big", "bullets", "cta"];

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["slug", "brand", "slides"],
  properties: {
    slug: { type: "string", description: "file name, lowercase-with-dashes" },
    brand: {
      type: "object",
      additionalProperties: false,
      required: ["name"],
      properties: {
        name: { type: "string" },
        initials: { type: "string" },
        url: { type: "string" },
      },
    },
    slides: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "seconds"],
        properties: {
          type: { type: "string", enum: SLIDE_TYPES },
          seconds: { type: "number", description: "3.5 to 6" },
          kicker: { type: "string", description: "small label above the title, 1-3 words" },
          title: { type: "string" },
          highlight: { type: "string", description: "title slide only: one huge word" },
          subtitle: { type: "string" },
          lines: { type: "array", items: { type: "string" } },
          items: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label"],
              properties: { label: { type: "string" }, detail: { type: "string" } },
            },
          },
        },
      },
    },
  },
};

function validateSpec(spec) {
  const errors = [];
  if (!spec || typeof spec !== "object") return ["spec must be an object"];
  if (!spec.brand || !spec.brand.name) errors.push("brand.name is required");
  if (!Array.isArray(spec.slides) || spec.slides.length === 0) return [...errors, "slides must be a non-empty array"];
  if (spec.slides.length > 12) errors.push("max 12 slides (Reels over ~60 s lose viewers)");
  spec.slides.forEach((s, i) => {
    const at = `slides[${i}]`;
    if (!SLIDE_TYPES.includes(s.type)) errors.push(`${at}.type must be one of ${SLIDE_TYPES.join(", ")}`);
    if (s.seconds !== undefined && (s.seconds < 1.5 || s.seconds > 10)) errors.push(`${at}.seconds must be 1.5-10`);
    if (["title", "big"].includes(s.type) && !s.title) errors.push(`${at}.title is required for ${s.type}`);
    if (s.type === "bullets" && !(s.items || []).length) errors.push(`${at}.items is required for bullets`);
    if ((s.items || []).length > 4) errors.push(`${at}.items: max 4 (they must fit the safe area)`);
  });
  return errors;
}

module.exports = { schema, validateSpec, SLIDE_TYPES };
