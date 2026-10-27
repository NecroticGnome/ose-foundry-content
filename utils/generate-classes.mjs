/**
 * Generates class items for the `classes` pack from utils/classic-classes.json.
 *
 * Usage: node ./utils/generate-classes.mjs && npm run build:db -- classes
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const MODULE_ID = "classicfantasycompendium";
const SRC = "packs/_source";
const OUT = path.join(SRC, "classes");

const stableId = (seed) => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = createHash("sha256").update(seed).digest();
  return Array.from({ length: 16 }, (_, i) => alphabet[bytes[i] % alphabet.length]).join("");
};

// Generated JSON stays plain ASCII: hyphens and straight quotes rather than typographic characters.
const ASCII = [
  [/\s*\u2014\s*/g, " - "],
  [/[\u2013\u2212]/g, "-"],
  [/[\u2018\u2019\u2032]/g, "'"],
  [/[\u201C\u201D\u2033]/g, '"'],
  [/\u00BD/g, " 1/2"],
  [/\u00A0/g, " "],
];
const ascii = (text) => ASCII.reduce((out, [pattern, plain]) => out.replace(pattern, plain), text);
const asciiJson = (value) => JSON.stringify(value, (_, v) => (typeof v === "string" ? ascii(v) : v), 2);

// Full column names, shown when hovering over a table's short header.
const COLUMN_NAMES = {
  skills: {
    cs: "Climb sheer surfaces",
    tr: "Find or remove treasure traps",
    hn: "Hear noise",
    hs: "Hide in shadows",
    ms: "Move silently",
    ol: "Open locks",
    pp: "Pick pockets",
  },
  turning: {
    1: "1 HD",
    2: "2 HD",
    "2s": "2 HD with a special ability",
    3: "3 HD",
    4: "4 HD",
    5: "5 HD",
    6: "6 HD",
    "7-9": "7-9 HD",
  },
};

// What turning table results mean (Classic Fantasy, Turning the Undead).
const TURNING_LEGEND = [
  { value: "-", text: "The turning fails." },
  {
    value: "#",
    text: "If the 2d6 turning roll is higher or equal, the turning attempt succeeds. Effects as per T.",
  },
  {
    value: "T",
    text: "The turning succeeds. 2d6 HD of undead flee from the area if possible, and will not harm the cleric.",
  },
  {
    value: "D",
    text: "The turning succeeds. 2d6 HD of undead are destroyed - instantly and permanently annihilated.",
  },
];
// The SRD's class page: its introduction and a link to it.
const SRD = JSON.parse(fs.readFileSync(path.join(SRC, "classic-fantasy-srd", "chapter-3-classes.json"), "utf8"));
const describe = (name) => {
  const page = SRD.pages.find((p) => p.name === name);
  if (!page) return "";
  const paragraphs = (page.text?.content ?? "").match(/<p>(?:(?!<\/p>).)*<\/p>/gs) ?? [];
  const link = `<p>@UUID[Compendium.${MODULE_ID}.classic-fantasy-srd.JournalEntry.${SRD._id}.JournalEntryPage.${page._id}]{${name}}</p>`;
  return `${paragraphs[0] ?? ""}${link}`;
};

// Table cell a skill ability's roll target follows, e.g. "Hide in Shadows (HS)" → skills.hs.
const linkTarget = (tables, name) => {
  const abbr = /\(([A-Z]{2})\)\s*$/.exec(name)?.[1]?.toLowerCase();
  for (const table of tables ?? []) {
    const col = table.columns.find((c) => c.key === abbr);
    if (col) return `${table.key}.${col.key}`;
  }
  return "";
};

// Level progression abilities are replaced by the class item's own table.
const abilityLinks = (slug, tables) => {
  const pack = `abilities-${slug}`;
  const dir = path.join(SRC, pack);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")))
    .filter((doc) => doc.type === "ability" && !/level progression/i.test(doc.name))
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name))
    .map((doc) => ({
      uuid: `Compendium.${MODULE_ID}.${pack}.Item.${doc._id}`,
      level: Number(
        /Level (\d+)/i.exec(doc.system?.requirements ?? "")?.[1] ??
          /(\d+)(?:st|nd|rd|th) level/i.exec(doc.name)?.[1] ??
          1,
      ),
      target: linkTarget(tables, doc.name),
    }))
    .sort((a, b) => a.level - b.level);
};

const classes = JSON.parse(fs.readFileSync("utils/classic-classes.json", "utf8"));
fs.mkdirSync(OUT, { recursive: true });
for (const [slug, cls] of Object.entries(classes)) {
  const _id = stableId(`${MODULE_ID}.classes.${slug}`);
  const item = {
    _id,
    _key: `!items!${_id}`,
    name: cls.name,
    type: "class",
    img: "icons/sundries/books/book-red-exclamation.webp",
    folder: null,
    sort: 0,
    flags: {},
    effects: [],
    ownership: { default: 0 },
    system: {
      ...cls.system,
      languages: String(cls.system.languages ?? "")
        .split(",")
        .map((l) => l.trim())
        .filter(Boolean),
      description: describe(cls.name),
      tables: (cls.system.tables ?? []).map((table) => ({
        ...table,
        // Headed by the key in capitals; name is the readable version.
        columns: table.columns.map((c) => ({ key: c.key, name: COLUMN_NAMES[table.key]?.[c.key] ?? c.key.toUpperCase() })),
        ...(table.key === "turning" ? { legend: TURNING_LEGEND } : {}),
      })),
      abilities: abilityLinks(slug, cls.system.tables),
      level: 1,
      xp: 0,
      xpBonusOverride: null,
      // Race and class in one.
      demihuman: ["dwarf", "elf", "halfling"].includes(slug),
    },
  };
  fs.writeFileSync(path.join(OUT, `${slug}.json`), `${asciiJson(item)}\n`);
}
console.log(`Wrote ${Object.keys(classes).length} classes to ${OUT}`);
