/**
 * @file convert.test.ts
 * @brief Tests for the Angband gamedata text-to-JSON converter.
 */

import { describe, expect, it } from "vitest";
import { parseGamedata } from "./convert.js";

describe("parseGamedata", () => {
  it("parses a simple record with basic fields", () => {
    const input = `
# comment line
name:HIT
cut:1
stun:1
miss:1
phys:1
msg:MON_HIT
act:hits {target}
`;
    const records = parseGamedata(input);
    expect(records).toHaveLength(1);
    expect(records[0]!.name).toBe("HIT");
    expect(records[0]!.cut).toBe("1");
    expect(records[0]!.stun).toBe("1");
    expect(records[0]!.miss).toBe("1");
    expect(records[0]!.phys).toBe("1");
    expect(records[0]!.msg).toBe("MON_HIT");
    expect(records[0]!.act).toBe("hits {target}");
  });

  it("parses multiple records separated by name directives", () => {
    const input = `
name:TOUCH
cut:0
stun:0

name:PUNCH
cut:0
stun:1
`;
    const records = parseGamedata(input);
    expect(records).toHaveLength(2);
    expect(records[0]!.name).toBe("TOUCH");
    expect(records[0]!.cut).toBe("0");
    expect(records[1]!.name).toBe("PUNCH");
    expect(records[1]!.stun).toBe("1");
  });

  it("concatenates multi-line desc fields with newlines", () => {
    const input = `
name:Filthy Street Urchin
desc:A grubby little kid who looks
desc:at you with doleful eyes.
`;
    const records = parseGamedata(input);
    expect(records).toHaveLength(1);
    expect(records[0]!.desc).toBe(
      "A grubby little kid who looks\nat you with doleful eyes."
    );
  });

  it("collects flags into arrays and splits on pipe", () => {
    const input = `
name:arrow:Arrow~
flags:HATES_ACID | HATES_FIRE
flags:SHOW_DICE
`;
    const records = parseGamedata(input);
    expect(records).toHaveLength(1);
    expect(records[0]!.flags).toEqual([
      "HATES_ACID",
      "HATES_FIRE",
      "SHOW_DICE",
    ]);
  });

  it("collects single flag values into arrays", () => {
    const input = `
name:bolt:Bolt~
flags:HATES_ACID
flags:SHOW_DICE
`;
    const records = parseGamedata(input);
    expect(records).toHaveLength(1);
    expect(records[0]!.flags).toEqual(["HATES_ACID", "SHOW_DICE"]);
  });

  it("ignores empty lines and comment lines", () => {
    const input = `
# This is a comment

# Another comment

name:TEST
value:42

# comment between records

name:TEST2
value:99
`;
    const records = parseGamedata(input);
    expect(records).toHaveLength(2);
    expect(records[0]!.name).toBe("TEST");
    expect(records[0]!.value).toBe("42");
    expect(records[1]!.name).toBe("TEST2");
    expect(records[1]!.value).toBe("99");
  });

  it("handles default lines as a special record", () => {
    const input = `
default:break-chance:10
default:max-stack:40

name:chest:Chest~
flags:HATES_ACID | HATES_FIRE
`;
    const records = parseGamedata(input);
    // defaults record should be at position 0
    expect(records[0]!._type).toBe("defaults");
    expect(records[0]!["break-chance"]).toBe("10");
    expect(records[0]!["max-stack"]).toBe("40");
    // regular record follows
    expect(records[1]!.name).toBe("chest:Chest~");
  });

  it("promotes repeated non-special directives to arrays", () => {
    const input = `
name:INSULT
act:insults {target}!
act:insults {oftarget} mother!
act:gives {target} the finger!
`;
    const records = parseGamedata(input);
    expect(records).toHaveLength(1);
    expect(records[0]!.act).toEqual([
      "insults {target}!",
      "insults {oftarget} mother!",
      "gives {target} the finger!",
    ]);
  });

  it("handles name fields with sub-values (colon-separated)", () => {
    const input = `
name:shot:Shot~
graphics:light umber
break:0
`;
    const records = parseGamedata(input);
    expect(records).toHaveLength(1);
    // The full value after "name:" is preserved as-is
    expect(records[0]!.name).toBe("shot:Shot~");
    expect(records[0]!.graphics).toBe("light umber");
    expect(records[0]!.break).toBe("0");
  });

  it("skips conditional (?:) lines", () => {
    const input = `
name:TEST
?:OPT(birth_percent_damage)
melee-dam:100
`;
    const records = parseGamedata(input);
    expect(records).toHaveLength(1);
    expect(records[0]!.name).toBe("TEST");
    expect(records[0]!["melee-dam"]).toBe("100");
  });

  it("returns empty array for empty input", () => {
    expect(parseGamedata("")).toEqual([]);
    expect(parseGamedata("# only comments\n# nothing else")).toEqual([]);
  });

  it("handles values directives with bracket notation", () => {
    const input = `
name:Test Armor
values:RES_ACID[40] | RES_FIRE[30]
`;
    const records = parseGamedata(input);
    expect(records).toHaveLength(1);
    expect(records[0]!.values).toEqual(["RES_ACID[40]", "RES_FIRE[30]"]);
  });
});
