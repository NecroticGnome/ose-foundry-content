/**
 * @file Quench tests for the class items. Registered only when Quench is active.
 */
const MODULE_ID = "classicfantasycompendium";
const PREFIX = "CF Class Test";

const pack = () => game.packs.get(`${MODULE_ID}.classes`);
const fromPack = async (name) => pack().getDocument(pack().index.getName(name)._id);
const classNames = () => [...pack().index].map((e) => e.name).sort();

const createActor = (name) =>
  Actor.create({
    name: `${PREFIX} ${name}`,
    type: "character",
    system: { scores: Object.fromEntries(["str", "int", "wis", "dex", "con", "cha"].map((k) => [k, { value: 10 }])) },
  });

const embed = async (actor, doc, system = {}) => {
  const data = game.items.fromCompendium(doc);
  Object.assign(data.system, system);
  const [item] = await actor.createEmbeddedDocuments("Item", [data]);
  return item;
};

const linkedNames = async (item, upTo) => {
  const links = item.system.abilities.filter((a) => a.level <= upTo);
  return (await Promise.all(links.map((a) => fromUuid(a.uuid)))).map((d) => d.name).sort();
};

const abilityNames = (actor) =>
  actor.items
    .filter((i) => i.type === "ability")
    .map((i) => i.name)
    .sort();

const abilityNamed = (actor, pattern) => actor.items.find((i) => i.type === "ability" && pattern.test(i.name));

Hooks.on("quenchReady", (quench) => {
  quench.registerBatch(
    `${MODULE_ID}.classes`,
    (context) => {
      const { describe, it, expect, before, after, afterEach } = context;
      const { DialogV2 } = foundry.applications.api;
      const scope = () => game.system.id;
      let confirm;
      let prompted;
      let messages;

      before(async () => {
        // Answer "yes" to every offer to add abilities.
        confirm = DialogV2.confirm;
        DialogV2.confirm = async () => true;
        prompted = game.settings.get(scope(), "promptAddClassAbilities");
        await game.settings.set(scope(), "promptAddClassAbilities", true);
        messages = new Set(game.messages.map((m) => m.id));
      });

      afterEach(async () => {
        await Actor.deleteDocuments(game.actors.filter((a) => a.name.startsWith(PREFIX)).map((a) => a.id));
      });

      after(async () => {
        DialogV2.confirm = confirm;
        await game.settings.set(scope(), "promptAddClassAbilities", prompted);
        await ChatMessage.deleteDocuments(game.messages.filter((m) => !messages.has(m.id)).map((m) => m.id));
      });

      describe("Adding a class grants its 1st level abilities", () => {
        for (const name of classNames()) {
          it(name, async () => {
            const actor = await createActor(name);
            const cls = await embed(actor, await fromPack(name));
            await actor.offerAbilities(cls, 1, { upTo: true });
            expect(abilityNames(actor)).to.deep.equal(await linkedNames(cls, 1));
            for (const ability of actor.items.filter((i) => i.type === "ability")) {
              expect(ability.getFlag(scope(), "grantedBy")).to.deep.equal({ type: "class", key: cls.system.key });
            }
          });
        }
      });

      describe("Levelling up to the top of the table", () => {
        for (const name of classNames()) {
          it(name, async function () {
            this.timeout(60000);
            const actor = await createActor(name);
            const cls = await embed(actor, await fromPack(name));
            await actor.offerAbilities(cls, 1, { upTo: true });
            const { levels, titles } = cls.system;
            const hp = actor.system.hp.max;
            for (let level = 2; level <= levels.length; level++) {
              await actor.levelUp(cls);
              expect(cls.system.level).to.equal(level);
            }
            const top = levels.at(-1);
            expect(actor.system.details.level).to.equal(levels.length);
            expect(actor.system.hp.max).to.be.at.least(hp + levels.length - 1);
            expect(actor.system.thac0.value).to.equal(top.thac0);
            for (const [save, value] of Object.entries(top.saves)) expect(actor.system.saves[save].value).to.equal(value);
            // Past the end of the list, the last title carries on.
            expect(cls.system.title).to.equal(titles[Math.min(levels.length, titles.length) - 1]);
            expect(abilityNames(actor)).to.deep.equal(await linkedNames(cls, levels.length));
          });
        }
      });

      describe("Thief", () => {
        it("takes skill targets from the class table as it levels", async function () {
          this.timeout(20000);
          const actor = await createActor("Thief");
          const cls = await embed(actor, await fromPack("Thief"));
          await actor.offerAbilities(cls, 1, { upTo: true });
          const hide = abilityNamed(actor, /hide in shadows/i);
          expect(hide.system.rollTarget).to.equal(10);
          expect(hide.getFlag(scope(), "classTarget")).to.deep.equal({ classKey: "thief", target: "skills.hs" });
          await actor.levelUp(cls);
          expect(hide.system.rollTarget).to.equal(15);
          await actor.levelUp(cls);
          // Hear noise is "1–3" on 1d6 at 3rd level.
          expect(abilityNamed(actor, /hear noise/i).system.rollTarget).to.equal(3);
        });

        it("gains Read Languages at 4th level", async function () {
          this.timeout(20000);
          const actor = await createActor("Thief");
          const cls = await embed(actor, await fromPack("Thief"), { level: 3 });
          await actor.offerAbilities(cls, 3, { upTo: true });
          expect(abilityNamed(actor, /read languages/i)).to.equal(undefined);
          await actor.levelUp(cls);
          expect(abilityNamed(actor, /read languages/i)).to.not.equal(undefined);
        });
      });

      describe("Spellcasting", () => {
        it("gives an elf magic-user spell slots", async () => {
          const actor = await createActor("Elf");
          await embed(actor, await fromPack("Elf"));
          expect(actor.system.spells.enabled).to.equal(true);
          expect(actor.system.spells.slots[1].max).to.equal(1);
        });

        it("gives a cleric no spells until 2nd level", async () => {
          const actor = await createActor("Cleric");
          const cls = await embed(actor, await fromPack("Cleric"));
          expect(actor.system.spells.slots[1]?.max ?? 0).to.equal(0);
          await actor.levelUp(cls);
          expect(actor.system.spells.slots[1].max).to.equal(1);
        });
      });
    },
    { displayName: "OSE Classic Fantasy: Class items" },
  );
});
