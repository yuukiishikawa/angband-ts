/**
 * Tests for data/loader.ts and data/registry.ts
 */
import { describe, it, expect } from "vitest";
import {
  loadBlowMethods,
  loadBlowEffects,
  loadObjectBases,
  DataLoadError,
} from "./loader.js";
import { createGameData, loadAllGameData } from "./registry.js";

// ── Sample data (snippets from real Angband gamedata files) ──

const BLOW_METHODS_SAMPLE = `
# File blow_methods.txt

# Methods for monster blows

name:HIT
cut:1
stun:1
miss:1
phys:1
msg:MON_HIT
act:hits {target}
desc:hit

name:TOUCH
cut:0
stun:0
miss:1
phys:0
msg:MON_TOUCH
act:touches {target}
desc:touch

name:INSULT
cut:0
stun:0
miss:0
phys:0
msg:MON_INSULT
act:insults {target}!
act:insults {oftarget} mother!
act:gives {target} the finger!
desc:insult
`;

const BLOW_EFFECTS_SAMPLE = `
# File blow_effects.txt

name:NONE
power:0
eval:0
lore-color-base:Dark

name:HURT
power:40
eval:0
desc:attack
lore-color-base:Light Green
lash-type:MISSILE

name:POISON
power:20
eval:10
desc:poison
lore-color-base:Orange
lore-color-resist:Light Green
effect-type:element
resist:POIS
lash-type:POIS

name:ACID
power:20
eval:20
desc:shoot acid
lore-color-base:Orange
lore-color-resist:Yellow
lore-color-immune:Light Green
lash-type:ACID
`;

const OBJECT_BASE_SAMPLE = `
# Object base data

default:break-chance:10
default:max-stack:40

name:chest:Chest~
graphics:slate
flags:HATES_ACID | HATES_FIRE

name:shot:Shot~
graphics:light umber
break:0
flags:SHOW_DICE

name:arrow:Arrow~
graphics:light umber
break:35
flags:HATES_ACID | HATES_FIRE
flags:SHOW_DICE

name:gold
graphics:light yellow
`;

// ── Blow method loader tests ──

describe("loadBlowMethods", () => {
  it("should parse all blow method records", () => {
    const methods = loadBlowMethods(BLOW_METHODS_SAMPLE);
    expect(methods).toHaveLength(3);
  });

  it("should parse boolean fields correctly", () => {
    const methods = loadBlowMethods(BLOW_METHODS_SAMPLE);
    const hit = methods[0]!;
    expect(hit.name).toBe("HIT");
    expect(hit.cut).toBe(true);
    expect(hit.stun).toBe(true);
    expect(hit.miss).toBe(true);
    expect(hit.phys).toBe(true);

    const touch = methods[1]!;
    expect(touch.name).toBe("TOUCH");
    expect(touch.cut).toBe(false);
    expect(touch.stun).toBe(false);
    expect(touch.miss).toBe(true);
    expect(touch.phys).toBe(false);
  });

  it("should parse message type", () => {
    const methods = loadBlowMethods(BLOW_METHODS_SAMPLE);
    expect(methods[0]!.msgt).toBe("MON_HIT");
    expect(methods[1]!.msgt).toBe("MON_TOUCH");
  });

  it("should collect multiple action messages", () => {
    const methods = loadBlowMethods(BLOW_METHODS_SAMPLE);
    const insult = methods[2]!;
    expect(insult.name).toBe("INSULT");
    expect(insult.messages).toHaveLength(3);
    expect(insult.messages[0]).toBe("insults {target}!");
    expect(insult.messages[1]).toBe("insults {oftarget} mother!");
    expect(insult.messages[2]).toBe("gives {target} the finger!");
  });

  it("should parse description", () => {
    const methods = loadBlowMethods(BLOW_METHODS_SAMPLE);
    expect(methods[0]!.desc).toBe("hit");
    expect(methods[2]!.desc).toBe("insult");
  });

  it("should return empty array for empty input", () => {
    const methods = loadBlowMethods("# empty file\n");
    expect(methods).toHaveLength(0);
  });

  it("should throw DataLoadError on invalid input", () => {
    expect(() => loadBlowMethods("unknown:bad")).toThrow(DataLoadError);
  });
});

// ── Blow effect loader tests ──

describe("loadBlowEffects", () => {
  it("should parse all blow effect records", () => {
    const effects = loadBlowEffects(BLOW_EFFECTS_SAMPLE);
    expect(effects).toHaveLength(4);
  });

  it("should parse power and eval", () => {
    const effects = loadBlowEffects(BLOW_EFFECTS_SAMPLE);
    const none = effects[0]!;
    expect(none.name).toBe("NONE");
    expect(none.power).toBe(0);
    expect(none.eval).toBe(0);

    const hurt = effects[1]!;
    expect(hurt.name).toBe("HURT");
    expect(hurt.power).toBe(40);
    expect(hurt.eval).toBe(0);
  });

  it("should parse description", () => {
    const effects = loadBlowEffects(BLOW_EFFECTS_SAMPLE);
    expect(effects[0]!.desc).toBe("");
    expect(effects[1]!.desc).toBe("attack");
    expect(effects[2]!.desc).toBe("poison");
  });

  it("should parse lore colors", () => {
    const effects = loadBlowEffects(BLOW_EFFECTS_SAMPLE);
    const acid = effects[3]!;
    expect(acid.loreColorBase).toBe("Orange");
    expect(acid.loreColorResist).toBe("Yellow");
    expect(acid.loreColorImmune).toBe("Light Green");
  });

  it("should parse effect type and resist", () => {
    const effects = loadBlowEffects(BLOW_EFFECTS_SAMPLE);
    const poison = effects[2]!;
    expect(poison.effectType).toBe("element");
    expect(poison.resist).toBe("POIS");
  });

  it("should parse lash type", () => {
    const effects = loadBlowEffects(BLOW_EFFECTS_SAMPLE);
    expect(effects[1]!.lashType).toBe("MISSILE");
    expect(effects[3]!.lashType).toBe("ACID");
  });

  it("should handle records with missing optional fields gracefully", () => {
    const effects = loadBlowEffects(BLOW_EFFECTS_SAMPLE);
    const none = effects[0]!;
    expect(none.loreColorResist).toBe("");
    expect(none.loreColorImmune).toBe("");
    expect(none.effectType).toBe("");
    expect(none.resist).toBe("");
    expect(none.lashType).toBe("");
  });

  it("should return empty array for empty input", () => {
    const effects = loadBlowEffects("");
    expect(effects).toHaveLength(0);
  });
});

// ── Object base loader tests ──

describe("loadObjectBases", () => {
  it("should parse all object base records", () => {
    const bases = loadObjectBases(OBJECT_BASE_SAMPLE);
    expect(bases).toHaveLength(4);
  });

  it("should apply default values", () => {
    const bases = loadObjectBases(OBJECT_BASE_SAMPLE);
    const chest = bases[0]!;
    expect(chest.breakChance).toBe(10);
    expect(chest.maxStack).toBe(40);
  });

  it("should parse tval and name", () => {
    const bases = loadObjectBases(OBJECT_BASE_SAMPLE);
    expect(bases[0]!.tval).toBe("chest");
    expect(bases[0]!.name).toBe("Chest~");
    expect(bases[1]!.tval).toBe("shot");
    expect(bases[1]!.name).toBe("Shot~");
  });

  it("should override default break chance", () => {
    const bases = loadObjectBases(OBJECT_BASE_SAMPLE);
    const shot = bases[1]!;
    expect(shot.breakChance).toBe(0);

    const arrow = bases[2]!;
    expect(arrow.breakChance).toBe(35);
  });

  it("should parse graphics color", () => {
    const bases = loadObjectBases(OBJECT_BASE_SAMPLE);
    expect(bases[0]!.graphics).toBe("slate");
    expect(bases[1]!.graphics).toBe("light umber");
  });

  it("should collect flags across multiple flag lines", () => {
    const bases = loadObjectBases(OBJECT_BASE_SAMPLE);
    const arrow = bases[2]!;
    expect(arrow.flags).toEqual(["HATES_ACID", "HATES_FIRE", "SHOW_DICE"]);
  });

  it("should handle name without display name (e.g. gold)", () => {
    const bases = loadObjectBases(OBJECT_BASE_SAMPLE);
    const gold = bases[3]!;
    expect(gold.tval).toBe("gold");
    expect(gold.name).toBe("");
    expect(gold.flags).toEqual([]);
  });

  it("should return empty array for empty input", () => {
    const bases = loadObjectBases("# nothing here\n");
    expect(bases).toHaveLength(0);
  });

  it("should throw on malformed data", () => {
    expect(() => loadObjectBases("break:not_a_number")).toThrow(DataLoadError);
  });
});

// ── DataLoadError tests ──

describe("DataLoadError", () => {
  it("should contain line, col, and code fields", () => {
    try {
      loadBlowMethods("badline:no:such:directive");
    } catch (e) {
      expect(e).toBeInstanceOf(DataLoadError);
      const err = e as DataLoadError;
      expect(err.line).toBe(1);
      expect(err.code).toBeDefined();
      expect(err.message).toContain("line 1");
    }
  });
});

// ── Registry tests ──

describe("createGameData", () => {
  it("should create an empty registry", () => {
    const data = createGameData();
    expect(data.blowMethods).toEqual([]);
    expect(data.blowEffects).toEqual([]);
    expect(data.objectBases).toEqual([]);
  });
});

describe("loadAllGameData", () => {
  it("should load all data from a file map", () => {
    const files = new Map<string, string>();
    files.set("blow_methods.txt", BLOW_METHODS_SAMPLE);
    files.set("blow_effects.txt", BLOW_EFFECTS_SAMPLE);
    files.set("object_base.txt", OBJECT_BASE_SAMPLE);

    const data = loadAllGameData(files);
    expect(data.blowMethods).toHaveLength(3);
    expect(data.blowEffects).toHaveLength(4);
    expect(data.objectBases).toHaveLength(4);
  });

  it("should ignore unknown files", () => {
    const files = new Map<string, string>();
    files.set("unknown_file.txt", "whatever content");

    const data = loadAllGameData(files);
    expect(data.blowMethods).toEqual([]);
    expect(data.blowEffects).toEqual([]);
    expect(data.objectBases).toEqual([]);
  });

  it("should load partial data when only some files are provided", () => {
    const files = new Map<string, string>();
    files.set("blow_methods.txt", BLOW_METHODS_SAMPLE);

    const data = loadAllGameData(files);
    expect(data.blowMethods).toHaveLength(3);
    expect(data.blowEffects).toEqual([]);
    expect(data.objectBases).toEqual([]);
  });
});
