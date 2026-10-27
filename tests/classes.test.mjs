/**
 * @file Checks the classes pack source against the ability packs and the Classic Fantasy rules.
 * Usage: npm test
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const SRC = path.join(import.meta.dirname, "..", "packs", "_source");
const MODULE_ID = "classicfantasycompendium";
const SAVES = ["death", "wand", "paralysis", "breath", "spell"];

const readDir = (dir) =>
  fs
    .readdirSync(path.join(SRC, dir), { recursive: true })
    .filter((f) => f.endsWith(".json") && !path.basename(f).startsWith("_"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(SRC, dir, f), "utf8")));

const classes = readDir("classes");
const byKey = Object.fromEntries(classes.map((c) => [c.system.key, c]));
const abilities = new Map(
  fs
    .readdirSync(SRC)
    .filter((dir) => dir.startsWith("abilities-"))
    .flatMap((dir) => readDir(dir).map((d) => [`Compendium.${MODULE_ID}.${dir}.Item.${d._id}`, d])),
);

const linkFor = (cls, name) =>
  cls.system.abilities.find((a) => abilities.get(a.uuid)?.name.toLowerCase() === name.toLowerCase());

describe("classes pack", () => {
  it("has the 7 Classic Fantasy classes with unique keys", () => {
    assert.deepEqual(Object.keys(byKey).sort(), [
      "cleric",
      "dwarf",
      "elf",
      "fighter",
      "halfling",
      "magic-user",
      "thief",
    ]);
  });

  it("marks Dwarf, Elf and Halfling as demihuman classes", () => {
    for (const c of classes) assert.equal(c.system.demihuman, ["dwarf", "elf", "halfling"].includes(c.system.key), c.name);
  });

  for (const cls of classes) {
    const { name, system: s } = cls;
    describe(name, () => {
      it("is a class item", () => assert.equal(cls.type, "class"));

      it("lists its languages", () => {
        assert.ok(Array.isArray(s.languages) && s.languages.length > 0);
        for (const lang of s.languages) assert.match(lang, /^\S/);
      });

      it("has one level row per level, starting at 0 XP and rising", () => {
        assert.equal(s.levels.length, s.maxLevel);
        assert.equal(s.levels[0].xp, 0);
        s.levels.forEach((row, i) => i && assert.ok(row.xp > s.levels[i - 1].xp, `L${i + 1} XP`));
      });

      it("has consistent THAC0, attack bonus and saves at every level", () => {
        s.levels.forEach((row, i) => {
          assert.ok(row.hd, `L${i + 1} hit dice`);
          assert.equal(row.bba, 19 - row.thac0, `L${i + 1} attack bonus`);
          if (i) assert.ok(row.thac0 <= s.levels[i - 1].thac0, `L${i + 1} THAC0 worsens`);
          for (const k of SAVES) assert.ok(row.saves[k] > 0 && row.saves[k] < 20, `L${i + 1} ${k}`);
        });
      });

      it("has a hit die, prime requisites and a title for each level", () => {
        assert.match(s.hitDie, /^1d\d+$/);
        assert.ok(s.primeReqs.length > 0);
        assert.ok(s.titles.length >= Math.min(8, s.levels.length), `${s.titles.length} titles`);
      });

      it("names a spell list exactly when it has spell slots", () => {
        const casts = s.levels.some((r) => Object.values(r.spellSlots ?? {}).some((n) => n > 0));
        assert.equal(!!s.spellList, casts);
        if (s.spellList) assert.ok(classes.some((c) => c.name === s.spellList), s.spellList);
      });

      it("links abilities that exist, at levels the class reaches", () => {
        assert.ok(s.abilities.length > 0);
        for (const link of s.abilities) {
          assert.ok(abilities.has(link.uuid), `missing ${link.uuid}`);
          assert.ok(link.level >= 1 && link.level <= s.levels.length, `${abilities.get(link.uuid).name} L${link.level}`);
        }
      });

      it("lists abilities in level order", () => {
        s.abilities.forEach((a, i) => i && assert.ok(a.level >= s.abilities[i - 1].level, abilities.get(a.uuid)?.name));
      });

      it("names every table column", () => {
        for (const table of s.tables) for (const col of table.columns) assert.ok(col.name, `${table.key}.${col.key}`);
      });

      it("describes the class without repeating its fields", () => {
        assert.ok(s.description.includes("@UUID["), "links the rules");
        assert.doesNotMatch(s.description, /<strong>(Requirements|Hit Dice|Maximum level)<\/strong>|Prime requisite/);
      });

      it("points ability roll targets at existing table columns with a row per level", () => {
        for (const table of s.tables) assert.equal(table.rows.length, s.levels.length, table.key);
        for (const { target } of s.abilities.filter((a) => a.target)) {
          const [key, col] = target.split(".");
          const table = s.tables.find((t) => t.key === key);
          assert.ok(table?.columns.some((c) => c.key === col), target);
        }
      });
    });
  }
});

describe("classes match Classic Fantasy", () => {
  it("1st level saves", () => {
    const expected = {
      cleric: [11, 12, 14, 16, 15],
      dwarf: [8, 9, 10, 13, 12],
      elf: [12, 13, 13, 15, 15],
      fighter: [12, 13, 14, 15, 16],
      halfling: [8, 9, 10, 13, 12],
      "magic-user": [13, 14, 13, 16, 15],
      thief: [13, 14, 13, 16, 15],
    };
    for (const [key, saves] of Object.entries(expected)) {
      assert.deepEqual(
        SAVES.map((k) => byKey[key].system.levels[0].saves[k]),
        saves,
        key,
      );
    }
  });

  it("XP for 2nd level and maximum levels", () => {
    const expected = {
      cleric: [1500, 14],
      dwarf: [2200, 12],
      elf: [4000, 10],
      fighter: [2000, 14],
      halfling: [2000, 8],
      "magic-user": [2500, 14],
      thief: [1200, 14],
    };
    for (const [key, [xp, max]] of Object.entries(expected)) {
      assert.equal(byKey[key].system.levels[1].xp, xp, key);
      assert.equal(byKey[key].system.levels.length, max, key);
    }
  });

  it("spell slots for casters", () => {
    assert.deepEqual(byKey.cleric.system.levels[0].spellSlots, {});
    assert.equal(byKey.cleric.system.levels[1].spellSlots["1"], 1);
    assert.equal(byKey["magic-user"].system.levels[0].spellSlots["1"], 1);
    assert.equal(byKey.elf.system.levels[0].spellSlots["1"], 1);
  });

  it("thief skills at 1st and 3rd level", () => {
    const skills = byKey.thief.system.tables.find((t) => t.key === "skills");
    assert.equal(skills.rows[0].cs, 87);
    assert.equal(skills.rows[0].hs, 10);
    assert.equal(skills.rows[2].hn, "1-3");
  });

  it("level titles", () => {
    assert.equal(byKey.thief.system.titles[0], "Apprentice");
    assert.equal(byKey.cleric.system.titles[0], "Acolyte");
  });

  it("abilities gained above 1st level", () => {
    const gates = [
      ["thief", "Read Languages", 4],
      ["thief", "Scroll Use", 10],
      ["magic-user", "After Reaching 11th Level", 11],
      ["fighter", "After Reaching 9th Level", 9],
    ];
    for (const [key, ability, level] of gates) assert.equal(linkFor(byKey[key], ability)?.level, level, ability);
  });
});
