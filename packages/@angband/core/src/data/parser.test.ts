/**
 * Tests for data/parser.ts
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Parser, ParseError, parseErrorStr } from "./parser.js";
import type { RandomValue } from "../z/rand.js";

describe("Parser", () => {
  let parser: Parser;

  beforeEach(() => {
    parser = new Parser();
  });

  // ── Registration ──

  describe("register", () => {
    it("should register a simple directive", () => {
      expect(parser.register("name str name", () => ParseError.NONE)).toBe(true);
    });

    it("should register a directive with multiple fields", () => {
      expect(
        parser.register("info int level int speed int hp", () => ParseError.NONE),
      ).toBe(true);
    });

    it("should register optional fields", () => {
      expect(
        parser.register("stats int str ?int dex", () => ParseError.NONE),
      ).toBe(true);
    });

    it("should reject mandatory field after optional", () => {
      expect(
        parser.register("bad ?int opt int req", () => ParseError.NONE),
      ).toBe(false);
    });

    it("should reject field after str (str consumes rest of line)", () => {
      expect(
        parser.register("bad str text int extra", () => ParseError.NONE),
      ).toBe(false);
    });

    it("should reject invalid type name", () => {
      expect(
        parser.register("bad bogus field", () => ParseError.NONE),
      ).toBe(false);
    });

    it("should reject type without name", () => {
      expect(
        parser.register("bad int", () => ParseError.NONE),
      ).toBe(false);
    });

    it("should supersede earlier registration for same directive", () => {
      let called = "";
      parser.register("name str val", () => { called = "first"; return ParseError.NONE; });
      parser.register("name str val", () => { called = "second"; return ParseError.NONE; });
      parser.parseLine("name:test");
      expect(called).toBe("second");
    });
  });

  // ── Blank lines and comments ──

  describe("blank lines and comments", () => {
    it("should skip empty lines", () => {
      expect(parser.parseLine("")).toBe(ParseError.NONE);
    });

    it("should skip whitespace-only lines", () => {
      expect(parser.parseLine("   \t  ")).toBe(ParseError.NONE);
    });

    it("should skip comment lines", () => {
      expect(parser.parseLine("# This is a comment")).toBe(ParseError.NONE);
    });

    it("should skip indented comment lines", () => {
      expect(parser.parseLine("  # indented comment")).toBe(ParseError.NONE);
    });
  });

  // ── Conditional directives ──

  describe("conditional directives", () => {
    it("should silently skip ?:expr lines", () => {
      expect(parser.parseLine("?:IFD_SOME_FLAG")).toBe(ParseError.NONE);
    });
  });

  // ── Basic key:value parsing ──

  describe("basic parsing", () => {
    it("should parse a str field", () => {
      let captured = "";
      parser.register("name str name", (p) => {
        captured = p.getString("name");
        return ParseError.NONE;
      });
      expect(parser.parseLine("name:Filthy Street Urchin")).toBe(ParseError.NONE);
      expect(captured).toBe("Filthy Street Urchin");
    });

    it("should parse a sym field", () => {
      let captured = "";
      parser.register("type sym type", (p) => {
        captured = p.getSym("type");
        return ParseError.NONE;
      });
      expect(parser.parseLine("type:player")).toBe(ParseError.NONE);
      expect(captured).toBe("player");
    });

    it("should parse an int field", () => {
      let captured = 0;
      parser.register("depth int depth", (p) => {
        captured = p.getInt("depth");
        return ParseError.NONE;
      });
      expect(parser.parseLine("depth:42")).toBe(ParseError.NONE);
      expect(captured).toBe(42);
    });

    it("should parse a negative int", () => {
      let captured = 0;
      parser.register("adjust int val", (p) => {
        captured = p.getInt("val");
        return ParseError.NONE;
      });
      expect(parser.parseLine("adjust:-5")).toBe(ParseError.NONE);
      expect(captured).toBe(-5);
    });

    it("should parse a uint field", () => {
      let captured = 0;
      parser.register("count uint count", (p) => {
        captured = p.getUint("count");
        return ParseError.NONE;
      });
      expect(parser.parseLine("count:100")).toBe(ParseError.NONE);
      expect(captured).toBe(100);
    });

    it("should parse a char field", () => {
      let captured = "";
      parser.register("glyph char ch", (p) => {
        captured = p.getChar("ch");
        return ParseError.NONE;
      });
      expect(parser.parseLine("glyph:@")).toBe(ParseError.NONE);
      expect(captured).toBe("@");
    });

    it("should parse a rand field (simple number)", () => {
      let captured: RandomValue | null = null;
      parser.register("power rand power", (p) => {
        captured = p.getRand("power");
        return ParseError.NONE;
      });
      expect(parser.parseLine("power:10")).toBe(ParseError.NONE);
      expect(captured).not.toBeNull();
      expect(captured!.base).toBe(10);
      expect(captured!.dice).toBe(0);
      expect(captured!.sides).toBe(0);
      expect(captured!.m_bonus).toBe(0);
    });

    it("should parse a rand field (dice notation)", () => {
      let captured: RandomValue | null = null;
      parser.register("damage rand dmg", (p) => {
        captured = p.getRand("dmg");
        return ParseError.NONE;
      });
      expect(parser.parseLine("damage:2d6")).toBe(ParseError.NONE);
      expect(captured).not.toBeNull();
      expect(captured!.base).toBe(0);
      expect(captured!.dice).toBe(2);
      expect(captured!.sides).toBe(6);
    });

    it("should parse a rand field (full notation)", () => {
      let captured: RandomValue | null = null;
      parser.register("damage rand dmg", (p) => {
        captured = p.getRand("dmg");
        return ParseError.NONE;
      });
      expect(parser.parseLine("damage:5+2d6M4")).toBe(ParseError.NONE);
      expect(captured).not.toBeNull();
      expect(captured!.base).toBe(5);
      expect(captured!.dice).toBe(2);
      expect(captured!.sides).toBe(6);
      expect(captured!.m_bonus).toBe(4);
    });

    it("should parse a rand field (implied 1 die)", () => {
      let captured: RandomValue | null = null;
      parser.register("damage rand dmg", (p) => {
        captured = p.getRand("dmg");
        return ParseError.NONE;
      });
      expect(parser.parseLine("damage:d6")).toBe(ParseError.NONE);
      expect(captured!.dice).toBe(1);
      expect(captured!.sides).toBe(6);
    });

    it("should parse a rand field (negative value)", () => {
      let captured: RandomValue | null = null;
      parser.register("power rand power", (p) => {
        captured = p.getRand("power");
        return ParseError.NONE;
      });
      expect(parser.parseLine("power:-5")).toBe(ParseError.NONE);
      expect(captured!.base).toBe(-5);
    });
  });

  // ── Multiple fields on one line ──

  describe("multiple fields", () => {
    it("should parse multiple colon-separated fields", () => {
      let level = 0;
      let speed = 0;
      let hp = 0;
      parser.register("info int level int speed int hp", (p) => {
        level = p.getInt("level");
        speed = p.getInt("speed");
        hp = p.getInt("hp");
        return ParseError.NONE;
      });
      expect(parser.parseLine("info:20:110:500")).toBe(ParseError.NONE);
      expect(level).toBe(20);
      expect(speed).toBe(110);
      expect(hp).toBe(500);
    });

    it("should parse sym followed by str (str gets rest of line)", () => {
      let tval = "";
      let name = "";
      parser.register("name sym tval str name", (p) => {
        tval = p.getSym("tval");
        name = p.getString("name");
        return ParseError.NONE;
      });
      expect(parser.parseLine("name:chest:Chest~")).toBe(ParseError.NONE);
      expect(tval).toBe("chest");
      expect(name).toBe("Chest~");
    });

    it("should handle str field containing colons", () => {
      let text = "";
      parser.register("desc str text", (p) => {
        text = p.getString("text");
        return ParseError.NONE;
      });
      expect(parser.parseLine("desc:attack method : attack effect : damage")).toBe(ParseError.NONE);
      expect(text).toBe("attack method : attack effect : damage");
    });

    it("should parse char followed by other fields", () => {
      let ch = "";
      let color = "";
      parser.register("display char ch sym color", (p) => {
        ch = p.getChar("ch");
        color = p.getSym("color");
        return ParseError.NONE;
      });
      expect(parser.parseLine("display:@:White")).toBe(ParseError.NONE);
      expect(ch).toBe("@");
      expect(color).toBe("White");
    });
  });

  // ── Optional fields ──

  describe("optional fields", () => {
    it("should allow missing optional fields", () => {
      let name = "";
      let bonus = -1;
      let hasBonus = false;
      parser.register("item sym name ?int bonus", (p) => {
        name = p.getSym("name");
        hasBonus = p.hasValue("bonus");
        if (hasBonus) bonus = p.getInt("bonus");
        return ParseError.NONE;
      });

      expect(parser.parseLine("item:sword")).toBe(ParseError.NONE);
      expect(name).toBe("sword");
      expect(hasBonus).toBe(false);
    });

    it("should parse present optional fields", () => {
      let name = "";
      let bonus = 0;
      parser.register("item sym name ?int bonus", (p) => {
        name = p.getSym("name");
        if (p.hasValue("bonus")) bonus = p.getInt("bonus");
        return ParseError.NONE;
      });

      expect(parser.parseLine("item:sword:5")).toBe(ParseError.NONE);
      expect(name).toBe("sword");
      expect(bonus).toBe(5);
    });
  });

  // ── Error handling ──

  describe("error handling", () => {
    it("should return UNDEFINED_DIRECTIVE for unknown directives", () => {
      expect(parser.parseLine("unknown:value")).toBe(ParseError.UNDEFINED_DIRECTIVE);
      const state = parser.getState();
      expect(state.error).toBe(ParseError.UNDEFINED_DIRECTIVE);
      expect(state.msg).toBe("unknown");
    });

    it("should return MISSING_FIELD for missing mandatory fields", () => {
      parser.register("info int level int speed", () => ParseError.NONE);
      expect(parser.parseLine("info:42")).toBe(ParseError.MISSING_FIELD);
      const state = parser.getState();
      expect(state.error).toBe(ParseError.MISSING_FIELD);
      expect(state.msg).toBe("speed");
    });

    it("should return NOT_NUMBER for non-numeric int field", () => {
      parser.register("depth int depth", () => ParseError.NONE);
      expect(parser.parseLine("depth:abc")).toBe(ParseError.NOT_NUMBER);
    });

    it("should return NOT_NUMBER for negative uint field", () => {
      parser.register("count uint count", () => ParseError.NONE);
      expect(parser.parseLine("count:-5")).toBe(ParseError.NOT_NUMBER);
    });

    it("should return NOT_RANDOM for invalid rand field", () => {
      parser.register("damage rand dmg", () => ParseError.NONE);
      expect(parser.parseLine("damage:abc")).toBe(ParseError.NOT_RANDOM);
    });

    it("should return FIELD_TOO_LONG for multi-char in char field", () => {
      parser.register("display char ch sym color", () => ParseError.NONE);
      expect(parser.parseLine("display:@@:White")).toBe(ParseError.FIELD_TOO_LONG);
    });

    it("should return MISSING_FIELD for line without colon", () => {
      parser.register("name str name", () => ParseError.NONE);
      expect(parser.parseLine("no-colon-here")).toBe(ParseError.MISSING_FIELD);
    });

    it("should propagate errors returned by hook functions", () => {
      parser.register("bad str text", () => ParseError.GENERIC);
      expect(parser.parseLine("bad:something")).toBe(ParseError.GENERIC);
    });

    it("should track line numbers", () => {
      parser.register("name str name", () => ParseError.NONE);
      parser.parseLine("# comment");
      parser.parseLine("");
      parser.parseLine("name:test");
      const state = parser.getState();
      expect(state.line).toBe(3);
    });
  });

  // ── parseErrorStr ──

  describe("parseErrorStr", () => {
    it("should return description for known errors", () => {
      expect(parseErrorStr(ParseError.NONE)).toBe("(none)");
      expect(parseErrorStr(ParseError.UNDEFINED_DIRECTIVE)).toBe("undefined directive");
      expect(parseErrorStr(ParseError.NOT_NUMBER)).toBe("not a number");
    });
  });

  // ── Parser state and priv ──

  describe("priv", () => {
    it("should store and retrieve private data", () => {
      const data = { monsters: [] as string[] };
      parser.priv = data;
      expect(parser.priv).toBe(data);
    });

    it("should be accessible from hook functions", () => {
      const data = { names: [] as string[] };
      parser.priv = data;
      parser.register("name str name", (p) => {
        (p.priv as typeof data).names.push(p.getString("name"));
        return ParseError.NONE;
      });

      parser.parseLine("name:Alpha");
      parser.parseLine("name:Beta");
      expect(data.names).toEqual(["Alpha", "Beta"]);
    });
  });

  describe("setState", () => {
    it("should allow hooks to set custom error state", () => {
      parser.register("check int val", (p) => {
        const val = p.getInt("val");
        if (val > 100) {
          p.setState(2, "value out of range");
          return ParseError.INVALID_VALUE;
        }
        return ParseError.NONE;
      });

      expect(parser.parseLine("check:999")).toBe(ParseError.INVALID_VALUE);
      const state = parser.getState();
      expect(state.msg).toBe("value out of range");
      expect(state.col).toBe(2);
    });
  });

  // ── Multi-line / full file parsing ──

  describe("parseString (multi-line)", () => {
    it("should parse multiple lines", () => {
      const data = { items: [] as { name: string; level: number }[] };
      parser.priv = data;

      let current: { name: string; level: number } | null = null;

      parser.register("name str name", (p) => {
        current = { name: p.getString("name"), level: 0 };
        (p.priv as typeof data).items.push(current);
        return ParseError.NONE;
      });
      parser.register("depth int level", (p) => {
        if (current) current.level = p.getInt("level");
        return ParseError.NONE;
      });

      const input = [
        "# A small data file",
        "",
        "name:Sword",
        "depth:5",
        "",
        "name:Shield",
        "depth:10",
      ].join("\n");

      expect(parser.parseString(input)).toBe(ParseError.NONE);
      expect(data.items).toEqual([
        { name: "Sword", level: 5 },
        { name: "Shield", level: 10 },
      ]);
    });

    it("should stop at the first error", () => {
      parser.register("name str name", () => ParseError.NONE);

      const input = [
        "name:Good",
        "bad:line",
        "name:Never Reached",
      ].join("\n");

      expect(parser.parseString(input)).toBe(ParseError.UNDEFINED_DIRECTIVE);
      const state = parser.getState();
      expect(state.line).toBe(2);
    });

    it("should handle Windows line endings (CRLF)", () => {
      const names: string[] = [];
      parser.register("name str name", (p) => {
        names.push(p.getString("name"));
        return ParseError.NONE;
      });

      const input = "name:Alpha\r\nname:Beta\r\n";
      expect(parser.parseString(input)).toBe(ParseError.NONE);
      expect(names).toEqual(["Alpha", "Beta"]);
    });
  });

  // ── Real-world test: small monster-like data ──

  describe("real-world: monster data parsing", () => {
    interface Monster {
      name: string;
      base: string;
      color: string;
      speed: number;
      hp: number;
      depth: number;
      rarity: number;
      experience: number;
      blows: Array<{ method: string; effect: string; damage: string }>;
      flags: string[];
      desc: string;
    }

    it("should parse a small inline sample of monster data", () => {
      const monsters: Monster[] = [];
      let current: Monster | null = null;

      parser.register("name str name", (p) => {
        current = {
          name: p.getString("name"),
          base: "",
          color: "",
          speed: 110,
          hp: 0,
          depth: 0,
          rarity: 1,
          experience: 0,
          blows: [],
          flags: [],
          desc: "",
        };
        monsters.push(current);
        return ParseError.NONE;
      });

      parser.register("base str base", (p) => {
        if (current) current.base = p.getString("base");
        return ParseError.NONE;
      });

      parser.register("color sym color", (p) => {
        if (current) current.color = p.getSym("color");
        return ParseError.NONE;
      });

      parser.register("speed int speed", (p) => {
        if (current) current.speed = p.getInt("speed");
        return ParseError.NONE;
      });

      parser.register("hit-points int hp", (p) => {
        if (current) current.hp = p.getInt("hp");
        return ParseError.NONE;
      });

      parser.register("depth int depth", (p) => {
        if (current) current.depth = p.getInt("depth");
        return ParseError.NONE;
      });

      parser.register("rarity int rarity", (p) => {
        if (current) current.rarity = p.getInt("rarity");
        return ParseError.NONE;
      });

      parser.register("experience int exp", (p) => {
        if (current) current.experience = p.getInt("exp");
        return ParseError.NONE;
      });

      parser.register("blow sym method sym effect str damage", (p) => {
        if (current) {
          current.blows.push({
            method: p.getSym("method"),
            effect: p.getSym("effect"),
            damage: p.getString("damage"),
          });
        }
        return ParseError.NONE;
      });

      parser.register("flags str flags", (p) => {
        if (current) {
          const raw = p.getString("flags");
          const flags = raw.split("|").map(s => s.trim()).filter(Boolean);
          current.flags.push(...flags);
        }
        return ParseError.NONE;
      });

      parser.register("desc str text", (p) => {
        if (current) {
          if (current.desc.length > 0) current.desc += " ";
          current.desc += p.getString("text");
        }
        return ParseError.NONE;
      });

      const input = `
# Test monster data

name:Filthy Street Urchin
base:townsfolk
color:s
speed:110
hit-points:3
depth:0
rarity:1
experience:0
blow:HIT:HURT:1d2
flags:MALE
desc:A disheveled child, darting through
desc:the shadows.

name:Scrawny Cat
base:feline
color:u
speed:120
hit-points:1
depth:1
rarity:1
experience:1
blow:CLAW:HURT:1d1
blow:BITE:HURT:1d1
flags:ANIMAL | FRIENDS
desc:A thin, mangy alley cat.
`;

      expect(parser.parseString(input)).toBe(ParseError.NONE);
      expect(monsters).toHaveLength(2);

      const urchin = monsters[0]!;
      expect(urchin.name).toBe("Filthy Street Urchin");
      expect(urchin.base).toBe("townsfolk");
      expect(urchin.color).toBe("s");
      expect(urchin.speed).toBe(110);
      expect(urchin.hp).toBe(3);
      expect(urchin.depth).toBe(0);
      expect(urchin.experience).toBe(0);
      expect(urchin.blows).toEqual([{ method: "HIT", effect: "HURT", damage: "1d2" }]);
      expect(urchin.flags).toEqual(["MALE"]);
      expect(urchin.desc).toBe("A disheveled child, darting through the shadows.");

      const cat = monsters[1]!;
      expect(cat.name).toBe("Scrawny Cat");
      expect(cat.speed).toBe(120);
      expect(cat.hp).toBe(1);
      expect(cat.blows).toHaveLength(2);
      expect(cat.flags).toEqual(["ANIMAL", "FRIENDS"]);
    });
  });

  // ── Real-world test: object_base-like data ──

  describe("real-world: object_base data parsing", () => {
    interface ObjectBase {
      tval: string;
      name: string;
      graphics: string;
      breakChance: number;
      maxStack: number;
      flags: string[];
    }

    it("should parse object_base.txt-like data with defaults", () => {
      const bases: ObjectBase[] = [];
      let current: ObjectBase | null = null;

      const defaults = {
        breakChance: 0,
        maxStack: 40,
      };

      parser.register("default sym field str value", (p) => {
        const field = p.getSym("field");
        const value = p.getString("value");
        switch (field) {
          case "break-chance":
            defaults.breakChance = parseInt(value, 10);
            break;
          case "max-stack":
            defaults.maxStack = parseInt(value, 10);
            break;
        }
        return ParseError.NONE;
      });

      parser.register("name sym tval str name", (p) => {
        current = {
          tval: p.getSym("tval"),
          name: p.getString("name"),
          graphics: "",
          breakChance: defaults.breakChance,
          maxStack: defaults.maxStack,
          flags: [],
        };
        bases.push(current);
        return ParseError.NONE;
      });

      parser.register("graphics str color", (p) => {
        if (current) current.graphics = p.getString("color");
        return ParseError.NONE;
      });

      parser.register("break int chance", (p) => {
        if (current) current.breakChance = p.getInt("chance");
        return ParseError.NONE;
      });

      parser.register("flags str flags", (p) => {
        if (current) {
          const raw = p.getString("flags");
          const flags = raw.split("|").map(s => s.trim()).filter(Boolean);
          current.flags.push(...flags);
        }
        return ParseError.NONE;
      });

      const input = `
# Object bases
default:break-chance:10
default:max-stack:40

name:chest:Chest~
graphics:slate
# max-stack:1
flags:HATES_ACID | HATES_FIRE

name:shot:Shot~
graphics:light umber
break:0
# max-stack:40
flags:SHOW_DICE

name:arrow:Arrow~
graphics:light umber
break:35
flags:HATES_ACID | HATES_FIRE
flags:SHOW_DICE
`;

      expect(parser.parseString(input)).toBe(ParseError.NONE);
      expect(bases).toHaveLength(3);

      const chest = bases[0]!;
      expect(chest.tval).toBe("chest");
      expect(chest.name).toBe("Chest~");
      expect(chest.graphics).toBe("slate");
      expect(chest.breakChance).toBe(10);  // default
      expect(chest.flags).toEqual(["HATES_ACID", "HATES_FIRE"]);

      const shot = bases[1]!;
      expect(shot.breakChance).toBe(0);
      expect(shot.flags).toEqual(["SHOW_DICE"]);

      const arrow = bases[2]!;
      expect(arrow.breakChance).toBe(35);
      expect(arrow.flags).toEqual(["HATES_ACID", "HATES_FIRE", "SHOW_DICE"]);
    });
  });

  // ── Random value parsing edge cases ──

  describe("random value parsing (via rand field)", () => {
    let captured: RandomValue | null;

    beforeEach(() => {
      captured = null;
      parser.register("r rand val", (p) => {
        captured = p.getRand("val");
        return ParseError.NONE;
      });
    });

    it("should parse plain number: 42", () => {
      expect(parser.parseLine("r:42")).toBe(ParseError.NONE);
      expect(captured!.base).toBe(42);
      expect(captured!.dice).toBe(0);
    });

    it("should parse XdY: 3d8", () => {
      expect(parser.parseLine("r:3d8")).toBe(ParseError.NONE);
      expect(captured!.dice).toBe(3);
      expect(captured!.sides).toBe(8);
    });

    it("should parse base+XdY: 10+3d8", () => {
      expect(parser.parseLine("r:10+3d8")).toBe(ParseError.NONE);
      expect(captured!.base).toBe(10);
      expect(captured!.dice).toBe(3);
      expect(captured!.sides).toBe(8);
    });

    it("should parse base+XdYMZ: 5+2d6M10", () => {
      expect(parser.parseLine("r:5+2d6M10")).toBe(ParseError.NONE);
      expect(captured!.base).toBe(5);
      expect(captured!.dice).toBe(2);
      expect(captured!.sides).toBe(6);
      expect(captured!.m_bonus).toBe(10);
    });

    it("should parse d-only: d6 (implicit 1 die)", () => {
      expect(parser.parseLine("r:d6")).toBe(ParseError.NONE);
      expect(captured!.dice).toBe(1);
      expect(captured!.sides).toBe(6);
    });

    it("should parse negative: -3", () => {
      expect(parser.parseLine("r:-3")).toBe(ParseError.NONE);
      expect(captured!.base).toBe(-3);
    });

    it("should parse negative dice: -2d6", () => {
      expect(parser.parseLine("r:-2d6")).toBe(ParseError.NONE);
      // Negative: base = -(0) - 0 - 2*(6+1) = -14
      expect(captured!.base).toBe(-14);
      expect(captured!.dice).toBe(2);
      expect(captured!.sides).toBe(6);
    });

    it("should reject garbage: abc", () => {
      expect(parser.parseLine("r:abc")).toBe(ParseError.NOT_RANDOM);
    });

    it("should parse zero: 0", () => {
      expect(parser.parseLine("r:0")).toBe(ParseError.NONE);
      expect(captured!.base).toBe(0);
    });
  });

  // ── Accessor error handling ──

  describe("value accessor errors", () => {
    it("should throw when accessing non-existent value", () => {
      parser.register("test int val", (p) => {
        expect(() => p.getInt("nonexistent")).toThrow("no value named");
        return ParseError.NONE;
      });
      parser.parseLine("test:5");
    });

    it("should throw when accessing wrong type", () => {
      parser.register("test int val", (p) => {
        expect(() => p.getString("val")).toThrow("Expected str");
        return ParseError.NONE;
      });
      parser.parseLine("test:5");
    });
  });
});
