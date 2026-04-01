#!/usr/bin/env npx tsx
/**
 * @file busho-player.ts
 * @brief 武将AIプレイヤー — ai-server経由でAngbandを自律プレイする
 *
 * 学習した戦術をログに記録し、スキルとして保存可能にする。
 */

const API = process.env.API ?? "http://localhost:3000";

// ── 方向定数 (numpad) ──
const DIR = { SW: 1, S: 2, SE: 3, W: 4, STAY: 5, E: 6, NW: 7, N: 8, NE: 9 };
const ALL_DIRS = [1, 2, 3, 4, 6, 7, 8, 9]; // 5(stay)除外

// ── コマンドタイプ ──
const CMD = {
  WALK: 0, RUN: 1, OPEN: 2, CLOSE: 3, TUNNEL: 4, DISARM: 5, ALTER: 6,
  ATTACK: 7, CAST: 8, FIRE: 9, THROW: 10, USE: 11, EAT: 12, QUAFF: 13,
  READ: 14, AIM: 15, ZAP: 16, PICKUP: 17, DROP: 18, EQUIP: 19, UNEQUIP: 20,
  BROWSE: 21, REST: 22, SEARCH: 23, GO_UP: 24, GO_DOWN: 25,
  STUDY: 28,
};

// ── 地形定数 ──
const FEAT = {
  FLOOR: 1, CLOSED_DOOR: 2, OPEN_DOOR: 3, BROKEN_DOOR: 4,
  UP_STAIR: 5, DOWN_STAIR: 6,
  SECRET: 15, RUBBLE: 16, MAGMA: 17, QUARTZ: 18,
  MAGMA_K: 19, QUARTZ_K: 20, GRANITE: 21, PERM: 22,
  LAVA: 23, PASS_RUBBLE: 24,
};
const PASSABLE_FEATS = new Set([FEAT.FLOOR, FEAT.OPEN_DOOR, FEAT.BROKEN_DOOR, FEAT.UP_STAIR, FEAT.DOWN_STAIR, FEAT.LAVA, FEAT.PASS_RUBBLE]);
const DIGGABLE_FEATS = new Set([FEAT.CLOSED_DOOR, FEAT.SECRET, FEAT.RUBBLE, FEAT.MAGMA, FEAT.QUARTZ, FEAT.MAGMA_K, FEAT.QUARTZ_K, FEAT.GRANITE]);

// ── TVal定数 (list-tvals.h準拠) ──
const TVAL = {
  SCROLL: 25, POTION: 26, FOOD: 28,
  // 装備品 (正確な値)
  DIGGING: 6, HAFTED: 7, POLEARM: 8, SWORD: 9,
  BOOTS: 10, GLOVES: 11, HELM: 12, CROWN: 13, SHIELD: 14, CLOAK: 15,
  SOFT_ARMOR: 16, HARD_ARMOR: 17, DRAG_ARMOR: 18,
  LIGHT: 19, AMULET: 20, RING: 21,
  BOW: 5, ARROW: 3, BOLT: 4,
  // 魔法書 (装備対象外)
  MAGIC_BOOK: 30, PRAYER_BOOK: 31, NATURE_BOOK: 32, SHADOW_BOOK: 33, OTHER_BOOK: 34,
};

// 装備可能なtval
const WEAPON_TVALS = new Set([TVAL.SWORD, TVAL.POLEARM, TVAL.HAFTED, TVAL.DIGGING]);
const ARMOR_TVALS = new Set([TVAL.SOFT_ARMOR, TVAL.HARD_ARMOR, TVAL.DRAG_ARMOR]);
const HEAD_TVALS = new Set([TVAL.HELM, TVAL.CROWN]);
const EQUIPPABLE_TVALS = new Set([
  TVAL.SWORD, TVAL.POLEARM, TVAL.HAFTED, TVAL.DIGGING,
  TVAL.SOFT_ARMOR, TVAL.HARD_ARMOR, TVAL.DRAG_ARMOR,
  TVAL.BOW, TVAL.SHIELD, TVAL.HELM, TVAL.CROWN, TVAL.GLOVES, TVAL.BOOTS,
  TVAL.CLOAK, TVAL.RING, TVAL.AMULET, TVAL.LIGHT,
]);

// ── ObjectFlag定数 (重要なもののみ) ──
const OF = {
  SUST_STR: 1, SUST_INT: 2, SUST_WIS: 3, SUST_DEX: 4, SUST_CON: 5,
  PROT_FEAR: 6, PROT_BLIND: 7, PROT_CONF: 8, PROT_STUN: 9,
  SLOW_DIGEST: 10, FEATHER: 11, REGEN: 12, TELEPATHY: 13, SEE_INVIS: 14,
  FREE_ACT: 15, HOLD_LIFE: 16,
};
// ── ObjectModifier定数 ──
const OMOD = {
  STR: 0, INT: 1, WIS: 2, DEX: 3, CON: 4,
  STEALTH: 5, SPEED: 9, BLOWS: 10, LIGHT: 13,
};
// ── Element定数 ──
const ELEM = { ACID: 0, ELEC: 1, FIRE: 2, COLD: 3, POIS: 4 };
// Element name → ELEM index mapping (for resistance lookup)
const ELEM_NAME_TO_IDX: Record<string, number> = {
  ACID: 0, ELEC: 1, FIRE: 2, COLD: 3, POIS: 4,
  LIGHT: 5, DARK: 6, SOUND: 7, SHARD: 8, NEXUS: 9,
  NETHER: 10, CHAOS: 11, DISEN: 12,
};

// ── スレイ/ブランドマッピング ──
// Slay index → { raceKey, multiplier }
// raceKey matches monster field names from ai-server
const SLAY_TABLE: { raceKey: string; mult: number }[] = [
  { raceKey: "isEvil", mult: 2 },    // 0: EVIL_2
  { raceKey: "isAnimal", mult: 2 },   // 1: ANIMAL_2
  { raceKey: "isOrc", mult: 3 },      // 2: ORC_3
  { raceKey: "isTroll", mult: 3 },    // 3: TROLL_3
  { raceKey: "isGiant", mult: 3 },    // 4: GIANT_3
  { raceKey: "isDemon", mult: 3 },    // 5: DEMON_3
  { raceKey: "isDragon", mult: 3 },   // 6: DRAGON_3
  { raceKey: "isUndead", mult: 3 },   // 7: UNDEAD_3
  { raceKey: "isDemon", mult: 5 },    // 8: DEMON_5
  { raceKey: "isDragon", mult: 5 },   // 9: DRAGON_5
  { raceKey: "isUndead", mult: 5 },   // 10: UNDEAD_5
];

// Brand index → { element, immunity key, multiplier }
const BRAND_TABLE: { elem: string; imKey: string; mult: number }[] = [
  { elem: "ACID", imKey: "imAcid", mult: 3 },  // 0: ACID_3
  { elem: "ELEC", imKey: "imElec", mult: 3 },  // 1: ELEC_3
  { elem: "FIRE", imKey: "imFire", mult: 3 },  // 2: FIRE_3
  { elem: "COLD", imKey: "imCold", mult: 3 },  // 3: COLD_3
  { elem: "POIS", imKey: "imPois", mult: 3 },  // 4: POIS_3
  { elem: "ACID", imKey: "imAcid", mult: 2 },  // 5: ACID_2
  { elem: "ELEC", imKey: "imElec", mult: 2 },  // 6: ELEC_2
  { elem: "FIRE", imKey: "imFire", mult: 2 },  // 7: FIRE_2
  { elem: "COLD", imKey: "imCold", mult: 2 },  // 8: COLD_2
  { elem: "POIS", imKey: "imPois", mult: 2 },  // 9: POIS_2
];

/**
 * 特定モンスターに対する武器の実効DPS計算
 * スレイ/ブランドのマルチプライヤーを考慮
 */
function weaponDpsVsMonster(
  weapon: { dd?: number; ds?: number; toH: number; toD: number; brands?: number[]; slays?: number[] },
  playerToD: number,
  monster: Record<string, any>,
): number {
  const baseDmg = (weapon.dd ?? 1) * ((weapon.ds ?? 4) + 1) / 2 + weapon.toD + playerToD;

  // 最大スレイマルチプライヤーを検索
  let bestMult = 1;
  if (weapon.slays) {
    for (const slayIdx of weapon.slays) {
      const slay = SLAY_TABLE[slayIdx];
      if (slay && monster[slay.raceKey]) {
        bestMult = Math.max(bestMult, slay.mult);
      }
    }
  }

  // ブランドマルチプライヤー（モンスター耐性で無効化）
  if (weapon.brands) {
    for (const brandIdx of weapon.brands) {
      const brand = BRAND_TABLE[brandIdx];
      if (brand && !monster[brand.imKey]) {
        bestMult = Math.max(bestMult, brand.mult);
      }
    }
  }

  return baseDmg * bestMult;
}

/**
 * インベントリから特定モンスターに最適な武器を選ぶ
 * 現装備より実効DPSが高い武器があればそのスロットを返す
 */
function findBestWeaponForMonster(
  inventory: any[], equipment: any[], playerToD: number, monster: Record<string, any>,
): { slot: number; name: string; dps: number; currentDps: number } | null {
  const currentWeapon = equipment.find((e: any) => WEAPON_TVALS.has(e.tval));
  if (!currentWeapon) return null;

  const currentDps = weaponDpsVsMonster(currentWeapon, playerToD, monster);

  let bestSlot = -1;
  let bestDps = currentDps;
  let bestName = "";

  for (const item of inventory) {
    if (!WEAPON_TVALS.has(item.tval)) continue;
    const dps = weaponDpsVsMonster(item, playerToD, monster);
    if (dps > bestDps * 1.3) { // 30%以上のDPS増加がある場合のみスワップ（頻繁な交換防止）
      bestDps = dps;
      bestSlot = item.slot;
      bestName = item.name;
    }
  }

  if (bestSlot === -1) return null;
  return { slot: bestSlot, name: bestName, dps: bestDps, currentDps };
}

// 装備品のパワースコア計算 (フラグ・耐性・修正値を考慮)
function itemPower(item: {
  tval: number; toH: number; toD: number; toA: number;
  ac?: number; dd?: number; ds?: number;
  flags?: number[]; modifiers?: number[];
  resists?: { elem: number; level: number }[];
  brands?: number[]; slays?: number[];
}): number {
  let score = 0;

  if (WEAPON_TVALS.has(item.tval)) {
    // 武器: ダメージダイス + 命中/ダメージボーナス
    const avgDmg = (item.dd ?? 1) * ((item.ds ?? 4) + 1) / 2;
    score = avgDmg + item.toH * 2 + item.toD * 3;
    // ブランド/スレイは大きなボーナス
    if (item.brands && item.brands.length > 0) score += item.brands.length * 10;
    if (item.slays && item.slays.length > 0) score += item.slays.length * 8;
  } else {
    // 防具: AC + ボーナス
    score = (item.ac ?? 0) + item.toA * 2 + item.toH + item.toD;
  }

  // フラグボーナス
  const flags = new Set(item.flags ?? []);
  if (flags.has(OF.FREE_ACT)) score += 15;
  if (flags.has(OF.SEE_INVIS)) score += 12;
  if (flags.has(OF.HOLD_LIFE)) score += 10;
  if (flags.has(OF.REGEN)) score += 8;
  if (flags.has(OF.PROT_CONF)) score += 8;
  if (flags.has(OF.PROT_BLIND)) score += 8;
  if (flags.has(OF.PROT_FEAR)) score += 5;
  if (flags.has(OF.FEATHER)) score += 3;
  if (flags.has(OF.SLOW_DIGEST)) score += 3;
  if (flags.has(OF.TELEPATHY)) score += 20;
  for (let i = OF.SUST_STR; i <= OF.SUST_CON; i++) {
    if (flags.has(i)) score += 3;
  }

  // 耐性ボーナス (base elements特に重要)
  for (const r of item.resists ?? []) {
    if (r.level > 0) {
      if (r.elem <= ELEM.COLD) score += 15; // base4 resist
      else if (r.elem === ELEM.POIS) score += 12;
      else score += 8; // high resist
    }
  }

  // 修正値ボーナス
  const mods = item.modifiers ?? [];
  if (mods[OMOD.SPEED] && mods[OMOD.SPEED] > 0) score += mods[OMOD.SPEED] * 20;
  if (mods[OMOD.STR] && mods[OMOD.STR] > 0) score += mods[OMOD.STR] * 5;
  if (mods[OMOD.DEX] && mods[OMOD.DEX] > 0) score += mods[OMOD.DEX] * 4;
  if (mods[OMOD.CON] && mods[OMOD.CON] > 0) score += mods[OMOD.CON] * 5;
  if (mods[OMOD.STEALTH] && mods[OMOD.STEALTH] > 0) score += mods[OMOD.STEALTH] * 3;
  if (mods[OMOD.BLOWS] && mods[OMOD.BLOWS] > 0) score += mods[OMOD.BLOWS] * 15;

  return score;
}

// ── モンスター脅威度評価 ──
function monsterThreat(mon: {
  level: number; speed: number; hp: number; maxhp: number;
  isUnique?: boolean; breathElements?: string[]; hasSummon?: boolean;
  freqSpell?: number; freqInnate?: number;
}, playerLevel: number, playerResists?: Set<string>): number {
  // 高い値 = 危険
  let threat = mon.level;
  if (mon.speed > 110) threat += (mon.speed - 110) * 3; // 速い敵は非常に危険
  if (mon.level > playerLevel * 2) threat += 20; // レベル差が大きい
  if (mon.level > playerLevel * 3) threat += 30; // 極端なレベル差
  // ユニーク補正
  if (mon.isUnique) threat += 15;
  // ブレス攻撃 — 耐性なしの属性ブレスは非常に危険
  if (mon.breathElements && mon.breathElements.length > 0) {
    let unresisted = 0;
    for (const elem of mon.breathElements) {
      if (playerResists && playerResists.has(elem)) continue;
      unresisted++;
    }
    threat += unresisted * 10; // 耐性なしブレス1種につき+10
    if (unresisted === 0 && mon.breathElements.length > 0) {
      threat -= 5; // 全ブレスに耐性あり → 脅威低下
    }
  }
  // 召喚持ちは長期戦で危険
  if (mon.hasSummon) threat += 10;
  // 高頻度スペル使い
  if ((mon.freqSpell ?? 0) >= 33) threat += 5;
  if ((mon.freqInnate ?? 0) >= 33) threat += 5;
  return threat;
}

function isDangerousMonster(mon: {
  level: number; speed: number; hp: number; maxhp: number; name: string;
  isUnique?: boolean; breathElements?: string[]; hasSummon?: boolean;
  isBreeder?: boolean; freqSpell?: number; freqInnate?: number;
}, playerLevel: number, depth: number, playerResists?: Set<string>): boolean {
  // 速度130+は「速い+強い」の組み合わせが危険 (低レベル高速モンスターは戦える)
  if (mon.speed >= 130 && (mon.level >= playerLevel * 0.7 || mon.level >= 15)) return true;

  // 低レベルでは脅威判定を緩和 (CL5未満は基本的に戦う)
  if (playerLevel < 5) {
    // CL5未満は本当に強い敵だけ避ける
    if (mon.level > playerLevel * 4 && mon.level >= 10) return true;
    return false;
  }

  // ユニーク判定: サーバーフラグ優先、フォールバックで名前ヒューリスティック
  const isUnique = mon.isUnique ?? (
    mon.name.includes(",") ||
    (mon.name[0] === mon.name[0]?.toUpperCase() && !mon.name.startsWith("the ") && !mon.name.startsWith("a ") && !mon.name.startsWith("an "))
  );

  // 耐性なしブレス持ちは非常に危険 (ブレスダメージはHPの1/3)
  const hasUnresistedBreath = (mon.breathElements?.length ?? 0) > 0 &&
    mon.breathElements!.some(elem => !playerResists || !playerResists.has(elem));

  // 召喚持ちは数的不利を作られるため危険
  const isSummoner = mon.hasSummon ?? false;

  // 高頻度スペル使い (1/3以上) は遠距離から攻撃してくる
  const isFreqCaster = ((mon.freqSpell ?? 0) >= 33) || ((mon.freqInnate ?? 0) >= 33);

  // DL20+ではさらに慎重に (ユニークは基本的に危険)
  if (depth >= 20) {
    if (isUnique) return true; // DL20+ではユニーク全部危険
    if (mon.speed > 120) return true;
    if (mon.level > playerLevel * 1.5 && mon.level >= 10) return true;
    if (mon.maxhp > 200 && mon.level > playerLevel + 3) return true;
    // 耐性なしブレス持ちで格上 → 危険
    if (hasUnresistedBreath && mon.level >= playerLevel) return true;
    // 召喚持ちは同レベル以上で危険
    if (isSummoner && mon.level >= playerLevel) return true;
    return false;
  }
  // DL15+ではより慎重に
  if (depth >= 15) {
    if (isUnique && mon.level > playerLevel) return true;
    if (isUnique && mon.maxhp > 200) return true;
    if (mon.speed > 120 && mon.level > playerLevel) return true;
    if (mon.level > playerLevel * 2.0 && mon.level >= 10) return true;
    // 耐性なしブレス持ちで格上 → 危険
    if (hasUnresistedBreath && mon.level > playerLevel + 2) return true;
    // 召喚持ちで格上
    if (isSummoner && mon.level > playerLevel + 3) return true;
    return false;
  }

  if (isUnique && mon.level > playerLevel + 5) return true;
  // ユニークでHP200超え → 1 blowでは倒せない消耗戦になる
  if (isUnique && mon.maxhp > 150 && mon.level > playerLevel) return true;
  if (mon.speed > 120 && mon.level > playerLevel + 3) return true;
  if (mon.level > playerLevel * 2.5 && mon.level >= 10) return true;
  // 耐性なしブレスは浅層でも大ダメージ
  if (hasUnresistedBreath && mon.level > playerLevel + 5) return true;
  // 高HPモンスター (非ユニーク含む) は消耗戦で危険
  if (mon.maxhp > 300 && mon.level > playerLevel + 3) return true;
  return false;
}

// 同じスロットカテゴリか判定
function sameEquipCategory(tval1: number, tval2: number): boolean {
  if (WEAPON_TVALS.has(tval1) && WEAPON_TVALS.has(tval2)) return true;
  if (ARMOR_TVALS.has(tval1) && ARMOR_TVALS.has(tval2)) return true;
  if (HEAD_TVALS.has(tval1) && HEAD_TVALS.has(tval2)) return true;
  return tval1 === tval2;
}

// ── 学習記録 ──
interface LessonLog {
  turn: number;
  depth: number;
  event: string;
  lesson: string;
}

const lessons: LessonLog[] = [];
let totalKills = 0;
let maxDepthReached = 0;
let maxLevelReached = 1;
let healingsUsed = 0;
let fleeAttempts = 0;
let deathCause = "";

// ── 録画システム ──
const RECORD_PATH = "/tmp/busho-replay.jsonl";
let recordEnabled = true;
let frameNumber = 0;
const recordedFrames: string[] = [];

function recordFrame(state: any, event?: string) {
  if (!recordEnabled) return;
  const p = state.player;
  // プレイヤー周辺のみ記録 (壁は省略 — 再生時に推定)
  const viewR = 30;
  const cx = p.x, cy = p.y;
  const tiles = (state.map?.tiles ?? [])
    .filter((t: any) => {
      if (Math.abs(t.x - cx) > viewR || Math.abs(t.y - cy) > viewR / 2) return false;
      // 壁(21)は省略 — 空タイルが壁扱いになるのでビューアで復元可能
      if (t.feat === 21 && !t.hasObj) return false;
      return true;
    })
    .map((t: any) => {
      const dx = t.x - cx, dy = t.y - cy;
      const flags = (t.lit ? 1 : 0) | (t.hasObj ? 2 : 0);
      return [dx, dy, t.feat, flags];
    });
  const mons = (state.monsters ?? [])
    .filter((m: any) => m.distance <= 20)
    .map((m: any) => [m.x - cx, m.y - cy, m.name[0], m.hp, m.maxhp, m.name, m.level]);
  const frame: any = {
    f: frameNumber++,
    t: state.turn,
    d: state.depth,
    px: p.x, py: p.y,
    hp: p.hp, mhp: p.maxHp,
    cl: p.level, ac: p.ac ?? 0,
    food: p.timed?.food ?? 0,
    dead: state.dead || false,
    tiles, mons,
  };
  if (event) frame.ev = event;
  const msgs = (state.messages ?? []).slice(-2);
  if (msgs.length > 0) frame.msg = msgs.join(" | ").substring(0, 100);
  recordedFrames.push(JSON.stringify(frame));
}

async function flushRecording() {
  const fs = await import("node:fs");
  fs.writeFileSync(RECORD_PATH, recordedFrames.join("\n"));
  console.log(`  録画保存: ${RECORD_PATH} (${recordedFrames.length}フレーム)`);
}

// ── HTTP ヘルパー ──
let cmdDebug = false;
let lastKnownState: any = null; // 直前のstate (confused検出用)
async function sendCommand(cmd: Record<string, unknown>): Promise<any> {
  // 混乱中のREAD/CASTは必ず失敗する → RESTに差し替えて無限ループ防止
  if (lastKnownState?.player?.timed?.confused > 0 && (cmd.type === CMD.READ || cmd.type === CMD.CAST)) {
    console.log(`  [CMD-GUARD] confused中のREAD/CASTをRESTに差し替え`);
    cmd = { type: CMD.REST };
  }
  if (cmdDebug) console.log(`    >> CMD: ${JSON.stringify(cmd)}`);
  for (let retry = 0; retry < 5; retry++) {
    const res = await fetch(`${API}/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cmd),
    });
    const data = await res.json();
    if (res.status === 503) {
      // Game loop not ready yet, wait and retry
      await new Promise(r => setTimeout(r, 100));
      continue;
    }
    if (res.status !== 200) {
      // Return refreshed state on error
      const s = await getState();
      lastKnownState = s;
      return s;
    }
    lastKnownState = data;
    return data;
  }
  // All retries failed — return refreshed state, don't loop
  const s = await getState();
  lastKnownState = s;
  return s;
}

async function getState(): Promise<any> {
  const res = await fetch(`${API}/state`);
  return res.json();
}

// ── 戦術判断 ──

function findTile(tiles: any[], feat: number): { x: number; y: number } | null {
  const match = tiles.find((t: any) => t.feat === feat);
  return match ? { x: match.x, y: match.y } : null;
}

function directionTo(px: number, py: number, tx: number, ty: number): number {
  const dx = Math.sign(tx - px);
  const dy = Math.sign(ty - py);
  // numpad: (dx,dy) → direction
  const map: Record<string, number> = {
    "-1,-1": 7, "0,-1": 8, "1,-1": 9,
    "-1,0": 4,  "0,0": 5,  "1,0": 6,
    "-1,1": 1,  "0,1": 2,  "1,1": 3,
  };
  return map[`${dx},${dy}`] ?? 5;
}

function distanceTo(px: number, py: number, tx: number, ty: number): number {
  return Math.max(Math.abs(tx - px), Math.abs(ty - py));
}

function isPassable(tiles: any[], x: number, y: number): boolean {
  const t = tiles.find((t: any) => t.x === x && t.y === y);
  if (!t) return false;
  return PASSABLE_FEATS.has(t.feat);
}

function findHealingPotion(inventory: any[]): number | null {
  // CLW, CSW, CCW の順で探す (sval小さい方が弱い回復)
  const potions = inventory
    .filter((item: any) => item.tval === TVAL.POTION && item.name.includes("Cure") && item.qty > 0)
    .sort((a: any, b: any) => a.sval - b.sval);
  return potions.length > 0 ? potions[0].slot : null;
}

function findStrongHealingPotion(inventory: any[]): number | null {
  const potions = inventory
    .filter((item: any) => item.tval === TVAL.POTION && item.name.includes("Cure") && item.qty > 0)
    .sort((a: any, b: any) => b.sval - a.sval); // 強い順
  return potions.length > 0 ? potions[0].slot : null;
}

/**
 * 段階的回復ポーション選択 — HP残量に応じて適切な強さのポーションを選ぶ
 * - HP 60%+ (軽傷): CLW優先
 * - HP 40-60% (中傷): CSW → CCW
 * - HP 20-40% (重傷): CCW → Healing
 * - HP <20% (致命): *Healing* → Healing → CCW
 */
function findTieredHealingPotion(inventory: any[], hpPct: number): number | null {
  const allPotions = inventory
    .filter((item: any) => item.tval === TVAL.POTION && item.qty > 0);

  const clw = allPotions.filter((p: any) => p.name === "Cure Light Wounds");
  const csw = allPotions.filter((p: any) => p.name === "Cure Serious Wounds");
  const ccw = allPotions.filter((p: any) => p.name === "Cure Critical Wounds");
  const healing = allPotions.filter((p: any) => p.name === "Healing");
  const starHealing = allPotions.filter((p: any) => p.name === "*Healing*");
  const life = allPotions.filter((p: any) => p.name === "Life");

  if (hpPct < 0.2) {
    // 致命: 最強を使う
    return (starHealing[0]?.slot ?? life[0]?.slot ?? healing[0]?.slot ?? ccw[0]?.slot ?? csw[0]?.slot) ?? null;
  } else if (hpPct < 0.4) {
    // 重傷: Healing → CCW
    return (healing[0]?.slot ?? ccw[0]?.slot ?? csw[0]?.slot ?? clw[0]?.slot) ?? null;
  } else if (hpPct < 0.6) {
    // 中傷: CCW → CSW
    return (ccw[0]?.slot ?? csw[0]?.slot ?? clw[0]?.slot) ?? null;
  } else {
    // 軽傷: CLW → CSW
    return (clw[0]?.slot ?? csw[0]?.slot ?? ccw[0]?.slot) ?? null;
  }
}

/**
 * Teleport Level scroll — 緊急フロア脱出 (召喚群れなど)
 */
function findTeleportLevelScroll(inventory: any[]): number | null {
  const scroll = inventory.find((item: any) =>
    item.tval === TVAL.SCROLL && item.name.includes("Teleport Level") && item.qty > 0
  );
  return scroll ? scroll.slot : null;
}

function findPhaseScroll(inventory: any[]): number | null {
  const scroll = inventory.find((item: any) =>
    item.tval === TVAL.SCROLL && item.name.includes("Phase Door") && item.qty > 0
  );
  return scroll ? scroll.slot : null;
}

function findTeleportScroll(inventory: any[]): number | null {
  const scroll = inventory.find((item: any) =>
    item.tval === TVAL.SCROLL && item.name.includes("Teleportation") && item.qty > 0
  );
  return scroll ? scroll.slot : null;
}

function findSpeedPotion(inventory: any[]): number | null {
  const potion = inventory.find((item: any) =>
    item.tval === TVAL.POTION && item.name.includes("Speed") && item.qty > 0
  );
  return potion ? potion.slot : null;
}

function findRecallScroll(inventory: any[]): number | null {
  const scroll = inventory.find((item: any) =>
    item.tval === TVAL.SCROLL && item.name.includes("Word of Recall") && item.qty > 0
  );
  return scroll ? scroll.slot : null;
}

function findFood(inventory: any[]): number | null {
  const food = inventory.find((item: any) =>
    item.tval === TVAL.FOOD && item.qty > 0
  );
  return food ? food.slot : null;
}

// ── スペル関連 ──
interface SpellInfo {
  name: string;
  index: number;
  level: number;
  mana: number;
  failRate: number;
  learned: boolean;
  realm: string;
}

// スペル名でカテゴリ分類 (名前ベースで判断、effect解析不要)
const HEAL_SPELLS = ["Cure Light Wounds", "Cure Serious Wounds", "Cure Critical Wounds",
  "Cure Mortal Wounds", "Healing", "Minor Healing", "Major Healing"];
const BUFF_SPELLS = ["Bless", "Heroism", "Berserker", "Haste Self", "Protection from Evil",
  "Shield", "Resist Heat and Cold", "Resist Fire", "Resist Cold", "Resist Poison",
  "Resistance", "Globe of Invulnerability"];
const ESCAPE_SPELLS = ["Phase Door", "Teleport Self", "Teleport Other", "Portal",
  "Dimension Door", "Word of Recall"];
const DETECT_SPELLS = ["Detect Evil", "Detect Monsters", "Detect Traps", "Detect Doors",
  "Detect Stairs", "Detection", "Clairvoyance", "Sense Surroundings",
  "Detect Life", "Treasure Detection"];
const ATTACK_SPELLS = ["Magic Missile", "Stinking Cloud", "Lightning Bolt", "Frost Bolt",
  "Fire Bolt", "Fire Ball", "Frost Ball", "Acid Bolt", "Cloud Kill",
  "Ice Storm", "Meteor Swarm", "Rift", "Mana Storm",
  "Orb of Draining", "Holy Word", "Annihilation"];
// 方向が必要なスペル (ボルト/ビーム系)
const DIRECTIONAL_SPELLS = ["Magic Missile", "Lightning Bolt", "Frost Bolt", "Fire Bolt",
  "Acid Bolt", "Orb of Draining", "Stinking Cloud"];

function findCastableSpell(spells: SpellInfo[], names: string[], playerLevel: number, sp: number): SpellInfo | null {
  // 学習済み・レベル足りる・マナ足りる・失敗率80%未満のスペルを探す
  return spells.find(s =>
    s.learned && s.level <= playerLevel && s.mana <= sp && s.failRate < 80 &&
    names.some(n => s.name.includes(n))
  ) ?? null;
}

function findBestHealSpell(spells: SpellInfo[], playerLevel: number, sp: number, emergency: boolean): SpellInfo | null {
  const castable = spells.filter(s =>
    s.learned && s.level <= playerLevel && s.mana <= sp && s.failRate < 80 &&
    HEAL_SPELLS.some(n => s.name.includes(n))
  );
  if (castable.length === 0) return null;
  // 緊急時は最強(mana最大)を選択、通常時は最弱(mana最小)で節約
  castable.sort((a, b) => emergency ? b.mana - a.mana : a.mana - b.mana);
  return castable[0]!;
}

function findStudyableSpell(spells: SpellInfo[], playerLevel: number): SpellInfo | null {
  // 未学習で、レベルが足りているスペルを優先度順に探す
  // 優先: 回復 > 逃走 > 検知 > バフ > 攻撃
  const priorityLists = [HEAL_SPELLS, ESCAPE_SPELLS, DETECT_SPELLS, BUFF_SPELLS, ATTACK_SPELLS];
  for (const nameList of priorityLists) {
    const candidate = spells.find(s =>
      !s.learned && s.level <= playerLevel &&
      nameList.some(n => s.name.includes(n))
    );
    if (candidate) return candidate;
  }
  // どのカテゴリにも属さない → レベルが低い順で任意のスペルを学習
  return spells.find(s => !s.learned && s.level <= playerLevel) ?? null;
}

let spellsUsed = 0;
let spellsLearned = 0;

let lastRecordedState: any = null; // addLessonからの録画用
function addLesson(turn: number, depth: number, event: string, lesson: string) {
  lessons.push({ turn, depth, event, lesson });
  console.log(`  [学習] ${event}: ${lesson}`);
  if (lastRecordedState) recordFrame(lastRecordedState, `${event}: ${lesson.substring(0, 60)}`);
}

// ── 斜め移動制限チェック ──
// Angband: 斜め移動は、両隣の基本方向が壁なら不可
function canMoveDiag(passableSet: Set<string>, fx: number, fy: number, dx: number, dy: number): boolean {
  if (dx === 0 || dy === 0) return true; // 基本方向は常にOK
  // 斜め移動: 両隣のカーディナル方向をチェック
  const cardH = passableSet.has(`${fx + dx},${fy}`);
  const cardV = passableSet.has(`${fx},${fy + dy}`);
  return cardH || cardV; // 少なくとも1つが通行可能ならOK
}

// ── BFS パスファインディング ──
function bfsNextStep(
  tiles: any[], px: number, py: number, tx: number, ty: number
): number | null {
  if (px === tx && py === ty) return null;

  // タイルをマップ化
  const passableSet = new Set<string>();
  for (const t of tiles) {
    if (PASSABLE_FEATS.has(t.feat)) {
      passableSet.add(`${t.x},${t.y}`);
    }
  }

  const queue: { x: number; y: number; firstDir: number }[] = [];
  const visitedBFS = new Set<string>();
  visitedBFS.add(`${px},${py}`);

  // 最初の1歩の8方向を展開
  const offsets: [number, number, number][] = [
    [-1, 1, 1], [0, 1, 2], [1, 1, 3],
    [-1, 0, 4], [1, 0, 6],
    [-1, -1, 7], [0, -1, 8], [1, -1, 9],
  ];

  for (const [dx, dy, dir] of offsets) {
    const nx = px + dx;
    const ny = py + dy;
    const key = `${nx},${ny}`;
    if (!passableSet.has(key)) continue;
    if (visitedBFS.has(key)) continue;
    if (!canMoveDiag(passableSet, px, py, dx, dy)) continue;
    if (nx === tx && ny === ty) return dir;
    visitedBFS.add(key);
    queue.push({ x: nx, y: ny, firstDir: dir });
  }

  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const [dx, dy] of offsets) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      const key = `${nx},${ny}`;
      if (!passableSet.has(key)) continue;
      if (visitedBFS.has(key)) continue;
      if (!canMoveDiag(passableSet, cur.x, cur.y, dx, dy)) continue;
      if (nx === tx && ny === ty) return cur.firstDir;
      visitedBFS.add(key);
      queue.push({ x: nx, y: ny, firstDir: cur.firstDir });
    }
  }

  return null; // 到達不能
}

// ── Dijkstra: 掘削を考慮したパスファインディング ──
// 壁を掘って通れるルートを探す (BFS到達不能な階段用)
function dijkstraNextStepWithDigging(
  tiles: any[], px: number, py: number, tx: number, ty: number
): { dir: number; needsDig: boolean } | null {
  if (px === tx && py === ty) return null;

  // タイルをマップ化 (feat値付き)
  const tileMap = new Map<string, number>();
  for (const t of tiles) {
    tileMap.set(`${t.x},${t.y}`, t.feat);
  }

  // コスト: 通行可能=1, ドア=2, 瓦礫=3, マグマ/石英=5, 花崗岩=10, 秘密ドア=2, 永久壁=不可
  function moveCost(feat: number): number {
    if (PASSABLE_FEATS.has(feat)) return 1;
    if (feat === FEAT.CLOSED_DOOR || feat === FEAT.SECRET) return 2;
    if (feat === FEAT.RUBBLE) return 3;
    if (feat === FEAT.MAGMA || feat === FEAT.MAGMA_K) return 5;
    if (feat === FEAT.QUARTZ || feat === FEAT.QUARTZ_K) return 5;
    if (feat === FEAT.GRANITE) return 10;
    return 9999; // PERM or unknown
  }

  const offsets: [number, number, number][] = [
    [-1, 1, 1], [0, 1, 2], [1, 1, 3],
    [-1, 0, 4], [1, 0, 6],
    [-1, -1, 7], [0, -1, 8], [1, -1, 9],
  ];

  // Dijkstra with priority queue (simple sorted array for small maps)
  const dist = new Map<string, number>();
  const firstStep = new Map<string, { dir: number; needsDig: boolean }>();
  const startKey = `${px},${py}`;
  dist.set(startKey, 0);

  // Priority queue entries: [cost, x, y]
  const pq: [number, number, number][] = [[0, px, py]];

  while (pq.length > 0) {
    // Extract min cost
    let minIdx = 0;
    for (let i = 1; i < pq.length; i++) {
      if (pq[i]![0] < pq[minIdx]![0]) minIdx = i;
    }
    const [cost, cx, cy] = pq.splice(minIdx, 1)[0]!;
    const curKey = `${cx},${cy}`;

    if (cost > (dist.get(curKey) ?? Infinity)) continue;

    for (const [dx, dy, dir] of offsets) {
      const nx = cx + dx, ny = cy + dy;
      const nkey = `${nx},${ny}`;
      const feat = tileMap.get(nkey);
      if (feat === undefined) continue; // off-map
      const mc = moveCost(feat);
      if (mc >= 9999) continue; // impassable

      const newCost = cost + mc;
      if (newCost >= (dist.get(nkey) ?? Infinity)) continue;
      dist.set(nkey, newCost);

      // Track first step from start
      if (cx === px && cy === py) {
        const needsDig = !PASSABLE_FEATS.has(feat);
        firstStep.set(nkey, { dir, needsDig });
      } else {
        firstStep.set(nkey, firstStep.get(curKey)!);
      }

      if (nx === tx && ny === ty) {
        return firstStep.get(nkey)!;
      }

      pq.push([newCost, nx, ny]);
    }
  }
  return null; // truly unreachable (permanent walls)
}

// ── BFS: 最寄り未踏タイルへの最初の1歩 ──
function bfsNextUnvisited(
  tiles: any[], px: number, py: number, visited: Set<string>
): number | null {
  const passableSet = new Set<string>();
  for (const t of tiles) {
    if (PASSABLE_FEATS.has(t.feat)) {
      passableSet.add(`${t.x},${t.y}`);
    }
  }

  const queue: { x: number; y: number; firstDir: number }[] = [];
  const seen = new Set<string>();
  seen.add(`${px},${py}`);

  const offsets: [number, number, number][] = [
    [-1, 1, 1], [0, 1, 2], [1, 1, 3],
    [-1, 0, 4], [1, 0, 6],
    [-1, -1, 7], [0, -1, 8], [1, -1, 9],
  ];

  for (const [dx, dy, dir] of offsets) {
    const nx = px + dx;
    const ny = py + dy;
    const key = `${nx},${ny}`;
    if (!passableSet.has(key) && !tiles.find((t: any) => t.x === nx && t.y === ny && t.feat === FEAT.CLOSED_DOOR)) continue;
    if (seen.has(key)) continue;
    if (!canMoveDiag(passableSet, px, py, dx, dy)) continue;
    if (!visited.has(key)) return dir; // 隣接未踏 → 直行
    seen.add(key);
    queue.push({ x: nx, y: ny, firstDir: dir });
  }

  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const [dx, dy] of offsets) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      const key = `${nx},${ny}`;
      if (!passableSet.has(key)) continue;
      if (seen.has(key)) continue;
      if (!canMoveDiag(passableSet, cur.x, cur.y, dx, dy)) continue;
      if (!visited.has(key)) return cur.firstDir; // 最寄り未踏発見
      seen.add(key);
      queue.push({ x: nx, y: ny, firstDir: cur.firstDir });
    }
  }

  return null; // 全タイル訪問済 or 到達不能
}

// ── 探索済み管理 ──
const visited = new Set<string>();
let lastX = -1, lastY = -1;
let stuckCount = 0;
let noProgressCount = 0;  // 新タイル訪問なしの連続行動数
let lastVisitedSize = 0;

// ── 孤立ループ検知 ──
let lastTeleportArea = ""; // 直前テレポート後のBFS到達範囲ハッシュ
let teleportLoopCount = 0; // 同じエリアへの連続テレポート回数
let descentTeleportCount = 0; // 降下テレポート回数 (同じ階でのリトライ制限)
let supplyWoRUsedThisLevel = false; // 補給WoR使用済みフラグ (同一階ループ防止)
let levelEntryDetected = false; // 各階で検知スペルを使ったか
const unreachableItems = new Set<string>(); // BFS到達不能なアイテムタイル
const fleeCountByMonster = new Map<string, number>(); // 敵名ごとの逃走回数
const forceFightMonsters = new Set<string>(); // 逃走不可能 → 戦うしかないモンスター

function getAreaHash(tiles: any[], px: number, py: number): string {
  // BFS到達範囲の最小座標をハッシュとして使う（同じ孤立部屋なら同じ値）
  const passableSet = new Set<string>();
  for (const t of tiles) {
    if (PASSABLE_FEATS.has(t.feat)) passableSet.add(`${t.x},${t.y}`);
  }
  const reachable: string[] = [];
  const queue = [`${px},${py}`];
  const seen = new Set<string>(queue);
  while (queue.length > 0) {
    const key = queue.shift()!;
    reachable.push(key);
    const [cx, cy] = key.split(",").map(Number);
    for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]) {
      const nk = `${cx+dx},${cy+dy}`;
      if (passableSet.has(nk) && !seen.has(nk)) {
        seen.add(nk);
        queue.push(nk);
      }
    }
  }
  reachable.sort();
  // 最初の3タイル+サイズでハッシュ（高速かつ十分ユニーク）
  return `${reachable.length}:${reachable.slice(0, 3).join(";")}`;
}

// ── 退避モード (逃走後のHP回復優先) ──
let retreatMode = false;        // 退避中フラグ
let retreatStartTurn = 0;       // 退避開始ターン
const RETREAT_HP_THRESHOLD = 0.8; // HP80%以上で退避解除
const RETREAT_MAX_TURNS = 30;    // 最大30ターンで強制解除

// ── 探索効率追跡 ──
let explorationRateWindow: number[] = []; // 直近の探索率（200アクション毎）

// ── 町での不要品売却 ──
// StoreType: 1=Armory, 2=Weapon, 0=General
const SELL_STORE_FOR_TVAL: Record<number, number[]> = {
  [TVAL.SWORD]: [2], [TVAL.POLEARM]: [2], [TVAL.HAFTED]: [2], [TVAL.DIGGING]: [2],
  [TVAL.BOW]: [2],
  [TVAL.SOFT_ARMOR]: [1], [TVAL.HARD_ARMOR]: [1], [TVAL.DRAG_ARMOR]: [1],
  [TVAL.SHIELD]: [1], [TVAL.BOOTS]: [1], [TVAL.GLOVES]: [1],
  [TVAL.HELM]: [1], [TVAL.CROWN]: [1], [TVAL.CLOAK]: [1],
  [TVAL.LIGHT]: [0], [TVAL.RING]: [5], [TVAL.AMULET]: [5],
  [TVAL.ARROW]: [2], [TVAL.BOLT]: [2],
};

// 保持すべきアイテムかチェック (消耗品 or 現装備より良い装備)
function shouldKeepItem(item: any, equipment: any[]): boolean {
  // 消耗品は常に保持
  if ([TVAL.SCROLL, TVAL.POTION, TVAL.FOOD].includes(item.tval)) return true;
  // 魔法書は保持
  if ([30, 31, 32, 33, 34].includes(item.tval)) return true;
  // 装備品: 現装備より良いなら保持
  if (EQUIPPABLE_TVALS.has(item.tval)) {
    const currentEquip = equipment.find((e: any) => sameEquipCategory(e.tval, item.tval));
    if (!currentEquip) return true; // 空スロット → 装備候補として保持
    return itemPower(item) > itemPower(currentEquip);
  }
  return false; // それ以外は売却可
}

async function sellJunk(state: any) {
  const equip = state.player.equipment ?? [];
  let totalSold = 0;
  let totalGold = 0;

  for (let attempt = 0; attempt < 20; attempt++) {
    const freshState = await getState();
    const inv = freshState.player.inventory;
    const equip2 = freshState.player.equipment ?? [];

    // 売却候補を探す (逆順: 後ろから売ることでインデックスがずれない)
    let soldThisRound = false;
    for (let i = inv.length - 1; i >= 0; i--) {
      const item = inv[i];
      if (!item || item.qty <= 0) continue;
      if (shouldKeepItem(item, equip2)) continue;

      const stores = SELL_STORE_FOR_TVAL[item.tval] ?? [0]; // default: General
      for (const storeType of stores) {
        try {
          const res = await fetch(`${API}/sell`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ storeType, itemSlot: i }),
          });
          const result = await res.json();
          if (result.success) {
            totalSold++;
            totalGold += result.price;
            console.log(`  [売却] ${item.name} → store${storeType} (${result.price}G)`);
            soldThisRound = true;
            break; // sold successfully, re-fetch inventory
          }
        } catch (e) {
          console.log(`  [sellJunk] ERROR: ${e}`);
        }
      }
      if (soldThisRound) break; // re-fetch inventory after each sale
    }
    if (!soldThisRound) break; // nothing left to sell
  }
  if (totalSold > 0) {
    console.log(`  [売却合計] ${totalSold}個売却、${totalGold}G獲得`);
  }
}

// ── 町での補給 ──
// StoreType: 0=General, 3=Temple, 4=Alchemy, 5=Magic, 6=BlackMarket
async function buySupplies(state: any) {
  const p = state.player;
  const gold = p.gold;
  if (gold < 50) return;

  let totalBought = 0;
  let currentGold = gold;
  const MAX_PURCHASES = 40;

  // Shopping list: name match, valid tvals (to avoid buying staves/wands), store IDs
  // tval 25=scroll, 26=potion, 28=food
  const shoppingList = [
    { name: "Cure Critical Wounds", tvals: [26], target: 30, stores: [3, 5] },
    { name: "Phase Door", tvals: [25], target: 20, stores: [3, 5] },
    { name: "Teleportation", tvals: [25], target: 12, stores: [3, 5, 6] },
    { name: "Word of Recall", tvals: [25], target: 5, stores: [3, 5] },
    { name: null as string | null, tvals: [28], target: 10, stores: [0] }, // any food (tval=28)
  ];

  for (const item of shoppingList) {
    // Re-count current inventory each round
    const freshState = await getState();
    const inv = freshState.player.inventory;
    let current: number;
    if (item.name) {
      current = inv.filter((i: any) => i.name?.includes(item.name) && i.qty > 0)
        .reduce((s: number, i: any) => s + i.qty, 0);
    } else {
      current = inv.filter((i: any) => item.tvals.includes(i.tval) && i.qty > 0)
        .reduce((s: number, i: any) => s + i.qty, 0);
    }
    const needed = item.target - current;
    if (needed <= 0) continue;
    console.log(`  [補給] ${item.name ?? "Food"}: ${current}/${item.target} (need ${needed})`);


    let bought = 0;
    // Retry loop: re-fetch store after each purchase (indices shift)
    for (let attempt = 0; attempt < needed && totalBought < MAX_PURCHASES; attempt++) {
      let purchasedThisAttempt = false;
      for (const storeType of item.stores) {
        if (purchasedThisAttempt) break;
        try {
          const stRes = await getState();
          currentGold = stRes.player.gold;
          const stores = stRes.stores;
          if (!stores || !stores[storeType]) continue;

          const matching = stores[storeType].stock
            .filter((s: any) => {
              if (!item.tvals.includes(s.tval)) return false;
              if (s.price > currentGold || s.price <= 0) return false;
              if (item.name) return s.name?.includes(item.name);
              return true; // food: any tval match
            })
            .sort((a: any, b: any) => a.price - b.price);

          if (matching.length === 0) continue;
          const stockItem = matching[0];

          const res = await fetch(`${API}/buy`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ storeType, itemIndex: stockItem.index }),
          });
          const result = await res.json();
          if (result.success) {
            bought++;
            totalBought++;
            currentGold = result.state?.player?.gold ?? (currentGold - stockItem.price);
            console.log(`  [購入] ${stockItem.name} (${stockItem.price}G) store${storeType} 残金${currentGold}G [${bought}/${needed}]`);
            purchasedThisAttempt = true;
          }
        } catch (e) {
          console.log(`  [buySupplies] ERROR: ${e}`);
        }
      }
      if (!purchasedThisAttempt) break; // no more available in any store
    }
    if (bought > 0) {
      console.log(`  [補給] ${item.name ?? "Food"}: ${bought}個購入`);
    }
  }
  if (totalBought > 0) {
    addLesson(0, 0, "町補給", `${totalBought}個購入。残金${currentGold}G`);
  }
}

// ── 町での装備品購入 ──
// StoreType: 1=Armory, 2=Weapon
async function buyEquipment(state: any) {
  const p = state.player;
  let currentGold = p.gold;
  if (currentGold < 100) return;

  const equip = p.equipment ?? [];
  let totalUpgrades = 0;

  // 武器店(2)と防具店(1)をチェック
  for (const storeType of [2, 1]) {
    const freshState = await getState();
    currentGold = freshState.player.gold;
    if (currentGold < 100) break;
    const stores = freshState.stores;
    if (!stores || !stores[storeType]) continue;

    const stock = stores[storeType].stock;
    const currentEquip = freshState.player.equipment ?? [];

    for (const stockItem of stock) {
      if (stockItem.price > currentGold || stockItem.price <= 0) continue;
      if (!EQUIPPABLE_TVALS.has(stockItem.tval)) continue;

      // 現装備と比較
      const stockPower = itemPower(stockItem);
      const currentSlotEquip = currentEquip.find((e: any) => sameEquipCategory(e.tval, stockItem.tval));
      const currentPower = currentSlotEquip ? itemPower(currentSlotEquip) : 0;

      // 20%以上パワーアップ or 空スロットでパワー正
      if (stockPower > currentPower * 1.2 || (!currentSlotEquip && stockPower > 10)) {
        // 高すぎるものは買わない（ゴールドの60%以上は使わない）
        if (stockItem.price > currentGold * 0.6) continue;

        try {
          const res = await fetch(`${API}/buy`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ storeType, itemIndex: stockItem.index }),
          });
          const result = await res.json();
          if (result.success) {
            totalUpgrades++;
            currentGold = result.state?.player?.gold ?? (currentGold - stockItem.price);
            console.log(`  [装備購入] ${stockItem.name} (power=${stockPower} > ${currentPower}, ${stockItem.price}G) 残金${currentGold}G`);

            // 購入後に即装備
            const newState = await getState();
            const newInv = newState.player.inventory;
            const boughtItem = newInv.find((i: any) =>
              i.tval === stockItem.tval && i.name === stockItem.name
            );
            if (boughtItem) {
              await sendCommand({ type: CMD.EQUIP, itemIndex: boughtItem.slot });
              console.log(`  [装備] ${boughtItem.name}を装備`);
            }
            break; // 再取得が必要なのでストアループを抜ける
          }
        } catch (e) {
          console.log(`  [buyEquipment] ERROR: ${e}`);
        }
      }
    }
  }
  if (totalUpgrades > 0) {
    addLesson(0, 0, "装備購入", `${totalUpgrades}個装備品購入。残金${currentGold}G`);
  }
}

// ── メインAIループ ──
async function playGame() {
  console.log("=== 武将AI プレイ開始 ===\n");

  // サーバー起動待ち
  for (let retry = 0; retry < 10; retry++) {
    try {
      await getState();
      break;
    } catch {
      console.log("サーバー起動待ち...");
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  let state = await getState();
  let turnLimit = 500000;
  let actionCount = 0;
  let killsThisLevel = 0;
  let turnsOnLevel = 0;
  let levelEntryTurn = 0;
  const MAX_TURNS_PER_LEVEL = 3000; // 最大ターン数超えたら降下OK (5000→3000で速度UP)

  // 深度別の最低撃破数（浅層でしっかりレベリング、深層は探索・降下重視）
  function minKillsForDepth(depth: number): number {
    if (depth <= 1) return 0;  // DL0-1: 即降下OK
    if (depth <= 3) return 2;  // DL2-3: 2体
    if (depth <= 6) return 4;  // DL4-6: 4体 (安全にレベリング)
    if (depth <= 10) return 6; // DL7-10: 6体
    if (depth <= 15) return 8; // DL11-15: 8体 (ここでCL15+を目指す)
    if (depth <= 20) return 5; // DL16-20: 5体
    return 3;                  // DL21+: 3体 (深層は速めに降下)
  }

  let lastKnownDepth = state.depth;

  // 初期フレーム録画
  recordFrame(state, "start");

  while (!state.dead && !state.won && state.turn < turnLimit && actionCount < 100000) {
    actionCount++;
    // 録画 (10アクション毎 + イベント時)
    lastRecordedState = state;
    if (actionCount % 10 === 0) recordFrame(state);
    const p = state.player;
    const { x: px, y: py } = p;
    const tiles = state.map.tiles;
    const monsters = state.monsters;
    const inv = p.inventory;
    const hpPct = p.hp / p.maxHp;
    // Player resistances from calcBonuses (race + equipment)
    const playerResists = new Set<string>();
    for (const r of (p as any).resistances ?? []) {
      if (r.level > 0) playerResists.add(r.elem);
    }
    const dirOffsets: Record<number, [number, number]> = {
      1: [-1, 1], 2: [0, 1], 3: [1, 1], 4: [-1, 0], 6: [1, 0],
      7: [-1, -1], 8: [0, -1], 9: [1, -1],
    };

    // Detect level change (WoR, stairs, etc.) and reset exploration state
    if (state.depth !== lastKnownDepth) {
      console.log(`  [深度変更] DL${lastKnownDepth} → DL${state.depth} (WoR/階段)`);
      visited.clear(); lastVisitedSize = 0; noProgressCount = 0; stuckCount = 0;
      killsThisLevel = 0; levelEntryTurn = state.turn; explorationRateWindow = [];
      levelEntryDetected = false; unreachableItems.clear();
      teleportLoopCount = 0; lastTeleportArea = ""; descentTeleportCount = 0; supplyWoRUsedThisLevel = false; fleeCountByMonster.clear(); forceFightMonsters.clear(); retreatMode = false;
      if (state.depth > maxDepthReached) maxDepthReached = state.depth;
      lastKnownDepth = state.depth;

      // Town: buy supplies before returning to dungeon
      if (state.depth === 0 && maxDepthReached >= 5) {
        const inv2 = state.player.inventory;
        const cureQty = inv2.filter((i: any) => i.name?.includes("Cure")).reduce((s: number, i: any) => s + i.qty, 0);
        const phaseQty = inv2.filter((i: any) => i.name?.includes("Phase Door")).reduce((s: number, i: any) => s + i.qty, 0);
        console.log(`  [町到着] Gold:${state.player.gold} Cure:${cureQty} Phase:${phaseQty}`);
        await sellJunk(state); // 先に不要品を売却してゴールド確保
        state = await getState();
        await buyEquipment(state); // 装備品を先に購入（ゴールド消費前）
        state = await getState();
        await buySupplies(state);
        state = await getState(); // refresh state after purchases
        // 町帰還で逃走カウンターリセット (ダンジョンに戻ると新しいモンスター配置)
        fleeCountByMonster.clear();
      }

      // Fast return: if recalled to town (DL0) and maxDepth is deep, use WoR to jump back
      if (state.depth === 0 && maxDepthReached >= 5 && !(state.player.wordRecall > 0)) {
        const recallSlot = findRecallScroll(state.player.inventory);
        if (recallSlot !== null) {
          addLesson(state.turn, state.depth, "WoR帰還",
            `町で補給完了。WoRでDL${maxDepthReached}方面へ帰還`);
          state = await sendCommand({ type: CMD.READ, itemIndex: recallSlot });
          continue;
        }
      }
    }

    visited.add(`${px},${py}`);
    if (visited.size > lastVisitedSize) {
      noProgressCount = 0;
      lastVisitedSize = visited.size;
    } else {
      noProgressCount++;
    }
    const levelDebug = turnsOnLevel < 300; // 各フロア最初の300ターンはデバッグ

    // === 最最最優先: ブリーダー群れ検知 → 即フロア脱出 ===
    // サーバーからのisBreederフラグで正確に検知 (フォールバック: 20体以上)
    const hasBreeder = monsters.some((m: any) => m.isBreeder && m.distance <= 10);
    if (monsters.length >= 20 || (hasBreeder && monsters.length >= 10)) {
      // 20体以上 = ブリーダー群れ。戦っても増殖するだけ → 即脱出
      const onDown = tiles.find((t: any) => t.x === px && t.y === py && t.feat === FEAT.DOWN_STAIR);
      const onUp = tiles.find((t: any) => t.x === px && t.y === py && t.feat === FEAT.UP_STAIR);
      if (onDown) {
        addLesson(state.turn, state.depth, "群れ脱出",
          `モンスター${monsters.length}体検知！ブリーダー群れ。階段で即脱出`);
        state = await sendCommand({ type: CMD.GO_DOWN });
        visited.clear(); lastVisitedSize = 0; noProgressCount = 0; stuckCount = 0;
        killsThisLevel = 0; levelEntryTurn = state.turn; explorationRateWindow = [];
        levelEntryDetected = false; unreachableItems.clear();
        teleportLoopCount = 0; lastTeleportArea = ""; fleeCountByMonster.clear();
        if (state.depth > maxDepthReached) maxDepthReached = state.depth;
        continue;
      } else if (onUp && state.depth > 1) {
        addLesson(state.turn, state.depth, "群れ脱出",
          `モンスター${monsters.length}体！上階段で脱出`);
        state = await sendCommand({ type: CMD.GO_UP });
        visited.clear(); lastVisitedSize = 0; noProgressCount = 0; stuckCount = 0;
        killsThisLevel = 0; levelEntryTurn = state.turn; explorationRateWindow = [];
        levelEntryDetected = false; unreachableItems.clear();
        continue;
      }
      // 階段上にいない → テレポートで逃走
      const teleSlot = findTeleportScroll(inv);
      if (teleSlot !== null) {
        addLesson(state.turn, state.depth, "群れ脱出",
          `モンスター${monsters.length}体！Teleportで脱出`);
        state = await sendCommand({ type: CMD.READ, itemIndex: teleSlot });
        stuckCount = 0; noProgressCount = 0; visited.clear(); lastVisitedSize = 0;
        continue;
      }
      // WoR
      if (state.depth > 0 && !(p.wordRecall > 0)) {
        const recallSlot = findRecallScroll(inv);
        if (recallSlot !== null) {
          addLesson(state.turn, state.depth, "群れ脱出",
            `モンスター${monsters.length}体！WoRで帰還`);
          state = await sendCommand({ type: CMD.READ, itemIndex: recallSlot });
          continue;
        }
      }
    }

    // === 最最優先: 極端な停滞 → 強制脱出 ===
    if (noProgressCount >= 500) {
      // 500回停滞 → visited クリアで探索リセット (同じパターンを打破)
      addLesson(state.turn, state.depth, "停滞リセット",
        `${noProgressCount}回停滞。visitedクリアして探索再開`);
      visited.clear();
      lastVisitedSize = 0;
      noProgressCount = 0;
      continue;
    }
    if (noProgressCount >= 100) {
      // 100回連続で新タイル訪問なし → 孤立部屋。階段があれば降下、なければ壁を掘る
      const forceDown = tiles.find((t: any) => t.x === px && t.y === py && t.feat === FEAT.DOWN_STAIR);
      const forceUp = tiles.find((t: any) => t.x === px && t.y === py && t.feat === FEAT.UP_STAIR);
      if (forceDown) {
        addLesson(state.turn, state.depth, "強制降下",
          `${noProgressCount}回連続停滞。条件無視で強制降下`);
        state = await sendCommand({ type: CMD.GO_DOWN });
        visited.clear(); lastVisitedSize = 0; noProgressCount = 0; stuckCount = 0;
        killsThisLevel = 0; levelEntryTurn = state.turn; explorationRateWindow = []; levelEntryDetected = false; unreachableItems.clear();
        teleportLoopCount = 0; lastTeleportArea = "";
        if (state.depth > maxDepthReached) maxDepthReached = state.depth;
        continue;
      } else if (forceUp) {
        state = await sendCommand({ type: CMD.GO_UP });
        visited.clear(); lastVisitedSize = 0; noProgressCount = 0; stuckCount = 0;
        killsThisLevel = 0; levelEntryTurn = state.turn; explorationRateWindow = []; levelEntryDetected = false; unreachableItems.clear();
        continue;
      }
      // 階段上にいない → 壁を掘って脱出 (方向を少しずつ変える)
      // noProgressCountをインデックスとして使い、8方向を順番に試す
      const tryDirIndex = (noProgressCount - 100) % ALL_DIRS.length;
      const visStair = findTile(tiles, FEAT.DOWN_STAIR) ?? findTile(tiles, FEAT.UP_STAIR);
      let tunnelDir: number;
      if (visStair && noProgressCount < 150) {
        // 最初の50回は階段方向へ
        tunnelDir = directionTo(px, py, visStair.x, visStair.y);
      } else {
        // その後は8方向をローテーション
        tunnelDir = ALL_DIRS[tryDirIndex]!;
      }
      const [tdx, tdy] = dirOffsets[tunnelDir] ?? [0, 0];
      const targetTile = tiles.find((t: any) => t.x === px + tdx && t.y === py + tdy);
      if (targetTile && PASSABLE_FEATS.has(targetTile.feat)) {
        state = await sendCommand({ type: CMD.WALK, direction: tunnelDir });
      } else {
        state = await sendCommand({ type: CMD.TUNNEL, direction: tunnelDir });
      }
      continue;
    }

    // === 最優先: 進捗なし脱出 (全priorityより上) ===
    if (noProgressCount >= 50) {
      const totalPassable = tiles.filter((t: any) => PASSABLE_FEATS.has(t.feat)).length;
      const unvisitedCount = totalPassable - visited.size;
      if (unvisitedCount > 10) {
        // テレポートは50回停滞時のみ (30→50で節約)
        const teleSlot = findTeleportScroll(inv);
        if (teleSlot !== null) {
          addLesson(state.turn, state.depth, "進行停止脱出",
            `${noProgressCount}回進捗なし@(${px},${py})。visited=${visited.size}/${totalPassable}。Teleport`);
          state = await sendCommand({ type: CMD.READ, itemIndex: teleSlot });
          stuckCount = 0; noProgressCount = 0;
          continue;
        }
        // Phase Doorは70回停滞時のみ (節約)
        if (noProgressCount >= 70) {
          const phaseSlot = findPhaseScroll(inv);
          if (phaseSlot !== null) {
            state = await sendCommand({ type: CMD.READ, itemIndex: phaseSlot });
            stuckCount = 0; noProgressCount = 0;
            continue;
          }
        }
        // スクロールなし → 降下 or 階段方向へ直進
        const onDown = tiles.find((t: any) => t.x === px && t.y === py && t.feat === FEAT.DOWN_STAIR);
        if (onDown) {
          state = await sendCommand({ type: CMD.GO_DOWN });
          visited.clear(); lastVisitedSize = 0; noProgressCount = 0; stuckCount = 0;
          killsThisLevel = 0; levelEntryTurn = state.turn; explorationRateWindow = []; levelEntryDetected = false; unreachableItems.clear();
          teleportLoopCount = 0; lastTeleportArea = "";
          if (state.depth > maxDepthReached) maxDepthReached = state.depth;
          continue;
        }
        // Word of Recall — スクロール/階段なしの最終手段 (noProgress >= 80)
        if (noProgressCount >= 80 && state.depth > 0 && !(p.wordRecall > 0)) {
          const recallSlot = findRecallScroll(inv);
          if (recallSlot !== null) {
            addLesson(state.turn, state.depth, "WoR脱出",
              `${noProgressCount}回停滞、スクロール枯渇。Word of Recallで帰還`);
            state = await sendCommand({ type: CMD.READ, itemIndex: recallSlot });
            // WoRはカウントダウン後に発動 — しばらく待つ
            continue;
          }
        }
        // 階段が見えるなら直進 (BFS到達不能でもdirectionToで歩く)
        const visibleStair = findTile(tiles, FEAT.DOWN_STAIR) ?? findTile(tiles, FEAT.UP_STAIR);
        if (visibleStair) {
          const stairDir = directionTo(px, py, visibleStair.x, visibleStair.y);
          const [sdx, sdy] = dirOffsets[stairDir] ?? [0, 0];
          const pathTile = tiles.find((t: any) => t.x === px + sdx && t.y === py + sdy);
          if (pathTile && PASSABLE_FEATS.has(pathTile.feat)) {
            state = await sendCommand({ type: CMD.WALK, direction: stairDir });
          } else {
            state = await sendCommand({ type: CMD.TUNNEL, direction: stairDir });
          }
          // noProgressCountをリセットしない — 位置が変わればvisitedで自動リセット
          continue;
        }
      }
    }

    // === スペル情報取得 ===
    const spells: SpellInfo[] = p.spells ?? [];
    const sp = p.sp ?? 0;
    const maxSp = p.maxSp ?? 0;
    const canCastSpells = spells.length > 0 && sp > 0;
    const newSpellSlots = p.newSpells ?? 0;

    // === 退避モード管理 ===
    if (retreatMode) {
      const retreatTurns = state.turn - retreatStartTurn;
      if (hpPct >= RETREAT_HP_THRESHOLD || retreatTurns > RETREAT_MAX_TURNS) {
        retreatMode = false;
      }
    }

    // === 退避モード: HP回復優先（逃走直後） ===
    // 逃走後はHPを回復しきるまで戦闘を避け、回復に専念する
    if (retreatMode && monsters.filter((m: any) => m.distance <= 1).length === 0) {
      if (hpPct < RETREAT_HP_THRESHOLD) {
        // 着地先が危険（敵が近い+HP低い）→ もう一回Teleport
        const nearThreat = monsters.filter((m: any) => m.distance <= 3).length;
        if (hpPct < 0.4 && nearThreat > 0 && state.depth >= 15) {
          const retreatTele = findTeleportScroll(inv);
          if (retreatTele !== null) {
            addLesson(state.turn, state.depth, "退避再テレポート",
              `退避中HP${Math.round(hpPct*100)}%に敵${nearThreat}体接近。再Teleport`);
            state = await sendCommand({ type: CMD.READ, itemIndex: retreatTele });
            stuckCount = 0; noProgressCount = 0; visited.clear(); lastVisitedSize = 0;
            continue;
          }
        }
        // 回復スペル
        if (canCastSpells) {
          const healSpell = findBestHealSpell(spells, p.level, sp, false);
          if (healSpell) {
            spellsUsed++; healingsUsed++;
            state = await sendCommand({ type: CMD.CAST, spellIndex: healSpell.index, direction: 5 });
            continue;
          }
        }
        // 回復ポーション（段階的）
        const healSlot = findTieredHealingPotion(inv, hpPct);
        if (healSlot !== null) {
          healingsUsed++;
          state = await sendCommand({ type: CMD.QUAFF, itemIndex: healSlot });
          continue;
        }
        // 回復手段なし → REST（敵が近くにいなければ）
        if (monsters.filter((m: any) => m.distance <= 4).length === 0) {
          state = await sendCommand({ type: CMD.REST, turns: 5 });
          continue;
        }
        // 敵が中距離にいる → 退避解除して通常行動
        retreatMode = false;
      }
    }

    // === 定期ログ + 探索効率追跡 ===
    if (actionCount % 200 === 0) {
      const passableTiles = tiles.filter((t: any) => PASSABLE_FEATS.has(t.feat)).length;
      const unvisited = tiles.filter((t: any) => PASSABLE_FEATS.has(t.feat) && !visited.has(`${t.x},${t.y}`)).length;
      const explorationPct = passableTiles > 0 ? Math.round((1 - unvisited / passableTiles) * 100) : 100;
      explorationRateWindow.push(explorationPct);
      if (explorationRateWindow.length > 5) explorationRateWindow.shift();
      const spInfo = maxSp > 0 ? ` SP:${sp}/${maxSp}` : "";
      const digInfo = p.digging ? ` dig:${p.digging}` : "";
      const worInfo = p.wordRecall > 0 ? ` WoR:${p.wordRecall}` : "";
      const resInfo = playerResists.size > 0 ? ` res:${[...playerResists].join(",")}` : "";
      // Nearby threats summary
      const uniqueNear = monsters.filter((m: any) => m.isUnique && m.distance <= 10);
      const breathNear = monsters.filter((m: any) => (m.breathElements?.length ?? 0) > 0 && m.distance <= 10);
      const summonNear = monsters.filter((m: any) => m.hasSummon && m.distance <= 10);
      let threatInfo = "";
      if (uniqueNear.length > 0) threatInfo += ` UNIQ:${uniqueNear.map((m: any) => m.name).join(",")}`;
      if (breathNear.length > 0) threatInfo += ` BR:${breathNear.length}`;
      if (summonNear.length > 0) threatInfo += ` SUM:${summonNear.length}`;
      console.log(`  [状態] A${actionCount} T${state.turn} | DL${state.depth} CL${p.level} | HP:${p.hp}/${p.maxHp}${spInfo} | pos:(${px},${py}) | K:${totalKills}(L${killsThisLevel}) | P${passableTiles}/U${unvisited}(${explorationPct}%) | mon:${monsters.length} food:${p.timed.food}${digInfo}${worInfo}${resInfo}${threatInfo}`);
    }

    // === 優先度0: 状態異常対処 (混乱/盲目/麻痺) ===
    const isConfused = p.timed.confused > 0;
    const isBlind = p.timed.blind > 0;
    const isParalyzed = p.timed.paralyzed > 0;
    if (isConfused || isBlind || isParalyzed) {
      const status = isConfused ? "混乱" : isBlind ? "盲目" : "麻痺";
      const nearbyEnemies = monsters.filter((m: any) => m.distance <= 2);
      if (nearbyEnemies.length > 0 && p.timed.confused > 0) {
        // 混乱+敵が近い → ポーション飲む (混乱中でもquaffは可能)
        const healSlot = findHealingPotion(inv);
        if (healSlot !== null) {
          addLesson(state.turn, state.depth, "状態異常", `${status}中+敵${nearbyEnemies.length}体接近。回復薬で耐える`);
          healingsUsed++;
          state = await sendCommand({ type: CMD.QUAFF, itemIndex: healSlot });
          continue;
        }
        // 回復薬なし → ランダム歩行で逃走試行 (混乱中の移動はランダム方向)
        const rdir = ALL_DIRS[Math.floor(Math.random() * ALL_DIRS.length)];
        state = await sendCommand({ type: CMD.WALK, direction: rdir });
        continue;
      }
      // 敵がいない or 盲目/麻痺 → RESTで回復待ち
      if (actionCount % 50 === 0) {
        addLesson(state.turn, state.depth, "状態異常", `${status}中。RESTで回復待ち`);
      }
      state = await sendCommand({ type: CMD.REST });
      continue;
    }

    // === 優先度0.5: スペル学習 (新スペル枠があれば即学習) ===
    if (newSpellSlots > 0 && spells.length > 0) {
      const toStudy = findStudyableSpell(spells, p.level);
      if (toStudy) {
        spellsLearned++;
        addLesson(state.turn, state.depth, "スペル学習",
          `${toStudy.name} (Lv${toStudy.level}, MP${toStudy.mana})を学習。残り枠${newSpellSlots - 1}`);
        state = await sendCommand({ type: CMD.STUDY, spellIndex: toStudy.index });
        continue;
      }
    }

    // === 優先度1: 食事 (飢餓防止) ===
    if (p.timed.food < 2000) {
      const foodSlot = findFood(inv);
      if (foodSlot !== null) {
        addLesson(state.turn, state.depth, "食事", `食料値${p.timed.food}で食事。飢餓は最優先対処`);
        state = await sendCommand({ type: CMD.EAT, itemIndex: foodSlot });
        continue;
      }
    }

    // === 優先度1.5: 検知スペル (新フロアで1回使用) ===
    if (!levelEntryDetected && canCastSpells && actionCount > 1) {
      const detectSpell = findCastableSpell(spells, DETECT_SPELLS, p.level, sp);
      if (detectSpell) {
        spellsUsed++;
        levelEntryDetected = true;
        addLesson(state.turn, state.depth, "検知",
          `新フロアで${detectSpell.name}を使用。周囲の状況把握`);
        state = await sendCommand({ type: CMD.CAST, spellIndex: detectSpell.index, direction: 5 });
        continue;
      }
    }

    // === 優先度1.8: 補給帰還 (回復薬が危険域ならWoRで町へ) ===
    // supplyWoRUsed: 同じ階で1回のみ (ループ防止)
    if (state.depth >= 10 && !(p.wordRecall > 0) && !supplyWoRUsedThisLevel
        && monsters.filter((m: any) => m.distance <= 3).length === 0) {
      const cureQty2 = inv.filter((i: any) => i.name?.includes("Cure") && i.qty > 0)
        .reduce((s: number, i: any) => s + i.qty, 0);
      const minCureForDepth = state.depth >= 20 ? 8 : state.depth >= 15 ? 5 : 3;
      if (cureQty2 < minCureForDepth) {
        const recallSlot2 = findRecallScroll(inv);
        if (recallSlot2 !== null) {
          supplyWoRUsedThisLevel = true;
          addLesson(state.turn, state.depth, "補給帰還",
            `回復薬${cureQty2}個 < 最低${minCureForDepth}。WoRで補給帰還`);
          state = await sendCommand({ type: CMD.READ, itemIndex: recallSlot2 });
          continue;
        }
      }
    }

    // === 優先度2: 緊急回復+逃走 (深層は閾値引き上げ) ===
    const isExtremeDeep = state.depth >= 20;
    const isVeryDeep = state.depth >= 15;
    const isDeep = state.depth >= 10;
    const emergencyHpThreshold = isExtremeDeep ? 0.5 : isVeryDeep ? 0.4 : isDeep ? 0.35 : 0.3;
    const fleeHpThreshold = isExtremeDeep ? 0.65 : isVeryDeep ? 0.55 : isDeep ? 0.5 : 0.3;

    // HP危険域 → 敵がいれば逃走優先、敵がいなければ回復
    if (hpPct < emergencyHpThreshold) {
      const nearbyEnemies = monsters.filter((m: any) => m.distance <= 3);

      // 敵がいる場合: 逃走 > 回復 (forceFight対象は逃走しない)
      const anyNearbyForceFight = nearbyEnemies.some((m: any) => forceFightMonsters.has(m.name));
      if (nearbyEnemies.length > 0 && hpPct < fleeHpThreshold && !anyNearbyForceFight) {
        // 持続追跡者チェック — 同じ敵から繰り返し逃走ならTeleport優先
        const closestEnemy = nearbyEnemies.sort((a: any, b: any) => a.distance - b.distance)[0];
        const emFleeCount = closestEnemy ? (fleeCountByMonster.get(closestEnemy.name) || 0) : 0;
        if (closestEnemy) fleeCountByMonster.set(closestEnemy.name, emFleeCount + 1);
        const emergencyPersistent = emFleeCount >= 3;

        // 持続追跡者 → Phase Door無駄、Teleport/階段優先
        // 安全弁: 10回以上逃走 → forceFight登録して戦闘に移行
        // 除外: 速度130+、ユニーク+HP200超、ユニーク+格上 (消耗戦で確実に死ぬ)
        const isTooStrongToFight = closestEnemy && (
          (closestEnemy.speed >= 130 && (closestEnemy.level >= p.level * 0.7 || closestEnemy.level >= 15)) ||
          (closestEnemy.isUnique && closestEnemy.maxhp > 200) ||
          (closestEnemy.isUnique && closestEnemy.level > p.level + 3)
        );
        if (emFleeCount >= 10 && closestEnemy && !isTooStrongToFight) {
          forceFightMonsters.add(closestEnemy.name);
          fleeCountByMonster.delete(closestEnemy.name);
          // 回復してから戦闘 (逃走せずに下のヒーリングコードへ)
        }

        if (emergencyPersistent) {
          // 5回以上逃走 → Teleport/階段で距離を取る (WoRは使わない — 同深度に戻るとループ)
          if (emFleeCount >= 5) {
            const onDown = tiles.find((t: any) => t.x === px && t.y === py && t.feat === FEAT.DOWN_STAIR);
            const onUp = tiles.find((t: any) => t.x === px && t.y === py && t.feat === FEAT.UP_STAIR);
            if (onDown) {
              fleeAttempts++; retreatMode = true; retreatStartTurn = state.turn;
              state = await sendCommand({ type: CMD.GO_DOWN });
              visited.clear(); lastVisitedSize = 0; noProgressCount = 0; stuckCount = 0;
              killsThisLevel = 0; levelEntryTurn = state.turn; explorationRateWindow = [];
              levelEntryDetected = false; unreachableItems.clear();
              teleportLoopCount = 0; lastTeleportArea = ""; fleeCountByMonster.clear();
              if (state.depth > maxDepthReached) maxDepthReached = state.depth;
              continue;
            }
            if (onUp && state.depth > 1) {
              fleeAttempts++; retreatMode = true; retreatStartTurn = state.turn;
              state = await sendCommand({ type: CMD.GO_UP });
              visited.clear(); lastVisitedSize = 0; noProgressCount = 0; stuckCount = 0;
              killsThisLevel = 0; levelEntryTurn = state.turn; explorationRateWindow = [];
              levelEntryDetected = false; unreachableItems.clear();
              fleeCountByMonster.clear();
              continue;
            }
          }
          // Teleportで距離を取る
          const teleSlotP = findTeleportScroll(inv);
          if (teleSlotP !== null) {
            fleeAttempts++; retreatMode = true; retreatStartTurn = state.turn;
            state = await sendCommand({ type: CMD.READ, itemIndex: teleSlotP });
            stuckCount = 0; noProgressCount = 0; visited.clear(); lastVisitedSize = 0;
            continue;
          }
        }

        // パスウォール持ち or DL18+ or 速度120+敵ではPhase Doorでは追いつかれる → Teleport優先
        const hasPassWallChaser = nearbyEnemies.some((m: any) => m.hasPassWall);
        const hasFastChaser = nearbyEnemies.some((m: any) => m.speed >= 120);
        const preferTeleport = hasPassWallChaser || hasFastChaser || state.depth >= 18;

        // 逃走スペル (Phase Door/Teleport Self)
        if (canCastSpells) {
          const escSpell = findCastableSpell(spells, ESCAPE_SPELLS, p.level, sp);
          if (escSpell) {
            fleeAttempts++; retreatMode = true; retreatStartTurn = state.turn;
            spellsUsed++;
            addLesson(state.turn, state.depth, "魔法逃走",
              `HP${Math.round(hpPct*100)}%、${escSpell.name}で逃走`);
            state = await sendCommand({ type: CMD.CAST, spellIndex: escSpell.index, direction: 5 });
            if (escSpell.name.includes("Teleport")) {
              stuckCount = 0; noProgressCount = 0;
            }
            continue;
          }
        }
        // DL18+ or パスウォール持ち → Teleport優先 (Phase Doorは短距離で再遭遇しやすい)
        if (preferTeleport) {
          const teleSlotDeep = findTeleportScroll(inv);
          if (teleSlotDeep !== null) {
            fleeAttempts++; retreatMode = true; retreatStartTurn = state.turn;
            addLesson(state.turn, state.depth, "深層逃走",
              `HP${Math.round(hpPct*100)}%、DL${state.depth}。Teleportで確実に距離を取る`);
            state = await sendCommand({ type: CMD.READ, itemIndex: teleSlotDeep });
            stuckCount = 0; noProgressCount = 0;
            visited.clear(); lastVisitedSize = 0;
            continue;
          }
        }
        // 速度130+の敵 → 階段/WoR優先 (Teleportでも追いつかれる)
        const hasVeryFastEnemy = nearbyEnemies.some((m: any) => m.speed >= 130);
        if (hasVeryFastEnemy) {
          const onStairDown = tiles.find((t: any) => t.x === px && t.y === py && t.feat === FEAT.DOWN_STAIR);
          const onStairUp = tiles.find((t: any) => t.x === px && t.y === py && t.feat === FEAT.UP_STAIR);
          if (onStairDown) {
            fleeAttempts++; retreatMode = true; retreatStartTurn = state.turn;
            state = await sendCommand({ type: CMD.GO_DOWN });
            visited.clear(); lastVisitedSize = 0; noProgressCount = 0; stuckCount = 0;
            killsThisLevel = 0; levelEntryTurn = state.turn; explorationRateWindow = [];
            levelEntryDetected = false; unreachableItems.clear();
            teleportLoopCount = 0; lastTeleportArea = ""; descentTeleportCount = 0; fleeCountByMonster.clear();
            if (state.depth > maxDepthReached) maxDepthReached = state.depth;
            continue;
          }
          if (onStairUp) {
            fleeAttempts++; retreatMode = true; retreatStartTurn = state.turn;
            state = await sendCommand({ type: CMD.GO_UP });
            visited.clear(); lastVisitedSize = 0; noProgressCount = 0; stuckCount = 0;
            fleeCountByMonster.clear();
            continue;
          }
        }
        // 速度120+の敵が近くにいるならTeleport優先 (Phase Doorでは追いつかれる)
        const hasNearbyFastEnemy = nearbyEnemies.some((m: any) => m.speed >= 120);
        if (hasNearbyFastEnemy || state.depth >= 18) {
          const teleSlotFast = findTeleportScroll(inv);
          if (teleSlotFast !== null) {
            fleeAttempts++; retreatMode = true; retreatStartTurn = state.turn;
            addLesson(state.turn, state.depth, "早期逃走",
              `HP${Math.round(hpPct*100)}%、高速敵あり。Teleportで確実離脱`);
            state = await sendCommand({ type: CMD.READ, itemIndex: teleSlotFast });
            stuckCount = 0; noProgressCount = 0; visited.clear(); lastVisitedSize = 0;
            continue;
          }
        }
        const phaseSlot = findPhaseScroll(inv);
        if (phaseSlot !== null) {
          fleeAttempts++; retreatMode = true; retreatStartTurn = state.turn;
          addLesson(state.turn, state.depth, "早期逃走",
            `HP${Math.round(hpPct*100)}%、敵${nearbyEnemies.length}体(dist<=3)。Phase Doorで退避`);
          state = await sendCommand({ type: CMD.READ, itemIndex: phaseSlot });
          continue;
        }
        const teleSlot = findTeleportScroll(inv);
        if (teleSlot !== null) {
          fleeAttempts++; retreatMode = true; retreatStartTurn = state.turn;
          addLesson(state.turn, state.depth, "緊急逃走",
            `HP危険域、Teleportationで脱出。生存最優先`);
          state = await sendCommand({ type: CMD.READ, itemIndex: teleSlot });
          stuckCount = 0; noProgressCount = 0;
          visited.clear(); lastVisitedSize = 0;
          continue;
        }
      }

      // 回復スペル → 回復薬 (スペルがあれば薬を温存)
      if (canCastSpells) {
        const healSpell = findBestHealSpell(spells, p.level, sp, true);
        if (healSpell) {
          spellsUsed++;
          healingsUsed++;
          addLesson(state.turn, state.depth, "緊急回復スペル",
            `HP${Math.round(hpPct*100)}%。${healSpell.name}(MP${healSpell.mana})で回復`);
          state = await sendCommand({ type: CMD.CAST, spellIndex: healSpell.index, direction: 5 });
          continue;
        }
      }
      const healSlot = findStrongHealingPotion(inv);
      if (healSlot !== null) {
        healingsUsed++;
        addLesson(state.turn, state.depth, "緊急回復",
          `HP${p.hp}/${p.maxHp}(${Math.round(hpPct*100)}%)で回復薬使用`);
        state = await sendCommand({ type: CMD.QUAFF, itemIndex: healSlot });
        continue;
      }

      // 回復薬なし → 逃走 (速度120+敵にはTeleport優先)
      const hasFastNearby = monsters.some((m: any) => m.distance <= 5 && m.speed >= 120);
      if ((hasFastNearby || state.depth >= 18) && monsters.length > 0) {
        const teleSlotFlee = findTeleportScroll(inv);
        if (teleSlotFlee !== null) {
          fleeAttempts++; retreatMode = true; retreatStartTurn = state.turn;
          addLesson(state.turn, state.depth, "逃走",
            `HP${Math.round(hpPct*100)}%、回復薬なし、高速敵あり。Teleportで脱出`);
          state = await sendCommand({ type: CMD.READ, itemIndex: teleSlotFlee });
          stuckCount = 0; noProgressCount = 0; visited.clear(); lastVisitedSize = 0;
          continue;
        }
      }
      const phaseSlot = findPhaseScroll(inv);
      if (phaseSlot !== null && monsters.length > 0) {
        fleeAttempts++; retreatMode = true; retreatStartTurn = state.turn;
        addLesson(state.turn, state.depth, "逃走",
          `HP${Math.round(hpPct*100)}%、回復薬なし、敵${monsters.length}体。Phase Doorで退避`);
        state = await sendCommand({ type: CMD.READ, itemIndex: phaseSlot });
        continue;
      }
      const teleSlot2 = findTeleportScroll(inv);
      if (teleSlot2 !== null && monsters.length > 0) {
        fleeAttempts++; retreatMode = true; retreatStartTurn = state.turn;
        state = await sendCommand({ type: CMD.READ, itemIndex: teleSlot2 });
        stuckCount = 0; noProgressCount = 0;
        visited.clear(); lastVisitedSize = 0;
        continue;
      }
    }

    // === 優先度3: 戦術的回復 (HP低下 かつ敵なし) ===
    const tacticalHealThreshold = isExtremeDeep ? 0.75 : isVeryDeep ? 0.65 : 0.6;
    if (hpPct < tacticalHealThreshold && monsters.filter((m: any) => m.distance <= 2).length === 0) {
      // 回復スペル優先 (薬を節約)
      if (canCastSpells) {
        const healSpell = findBestHealSpell(spells, p.level, sp, false);
        if (healSpell) {
          spellsUsed++;
          healingsUsed++;
          state = await sendCommand({ type: CMD.CAST, spellIndex: healSpell.index, direction: 5 });
          continue;
        }
      }
      // 段階的ポーション: HP残量に応じた適切な強さを選択
      const healSlot = findTieredHealingPotion(inv, hpPct);
      if (healSlot !== null) {
        healingsUsed++;
        state = await sendCommand({ type: CMD.QUAFF, itemIndex: healSlot });
        continue;
      }
      // 回復薬なし → RESTで自然回復 (MPも回復)
      if (hpPct < 0.5) {
        state = await sendCommand({ type: CMD.REST, turns: 10 });
        continue;
      }
    }

    // === 優先度3.5: バフスペル (敵が近くにいて戦闘前) ===
    if (canCastSpells && monsters.filter((m: any) => m.distance <= 3).length > 0) {
      const buffSpell = findCastableSpell(spells, BUFF_SPELLS, p.level, sp);
      if (buffSpell && sp >= buffSpell.mana * 2) { // MPに余裕がある場合のみ
        spellsUsed++;
        addLesson(state.turn, state.depth, "バフ",
          `敵接近中。${buffSpell.name}(MP${buffSpell.mana})でバフ`);
        state = await sendCommand({ type: CMD.CAST, spellIndex: buffSpell.index, direction: 5 });
        continue;
      }
    }

    // === 優先度3.6: 速度ポーション (危険敵接近時 or 多数敵 or 召喚/ブレス持ち) ===
    if (!(p.timed?.fast > 0)) {  // まだ加速されていない
      const nearEnemyCount = monsters.filter((m: any) => m.distance <= 3).length;
      const hasDangerNear = monsters.some((m: any) =>
        m.distance <= 5 && isDangerousMonster(m, p.level, state.depth, playerResists)
      );
      // 速度120+の敵が距離8以内 → 早めに加速 (blood falcon等の高速群れ対策)
      const hasFastMonsterNear = monsters.some((m: any) =>
        m.distance <= 8 && m.speed >= 120
      );
      // 召喚持ちは素早く倒さないと数が増える
      const hasSummonerNear = monsters.some((m: any) => m.hasSummon && m.distance <= 5);
      // DL30+では敵が近くにいるだけで加速（生存最優先）
      const isUltraDeep = state.depth >= 30;
      if ((hasDangerNear || hasFastMonsterNear || nearEnemyCount >= 3 || hasSummonerNear) && isDeep
          || (isUltraDeep && nearEnemyCount >= 1)) {
        const speedSlot = findSpeedPotion(inv);
        if (speedSlot !== null) {
          addLesson(state.turn, state.depth, "加速",
            `危険な状況（敵${nearEnemyCount}体近接）。Speed potionで加速`);
          state = await sendCommand({ type: CMD.QUAFF, itemIndex: speedSlot });
          continue;
        }
      }
    }

    // === 優先度3.8: 遠距離攻撃スペル (距離2-6の敵にボルト/ビーム) ===
    if (canCastSpells) {
      const adjacentCount = monsters.filter((m: any) => m.distance <= 1).length;
      const rangedTargets = monsters.filter((m: any) =>
        m.distance >= 2 && m.distance <= 6 && !isDangerousMonster(m, p.level, state.depth, playerResists)
      );
      if (rangedTargets.length > 0 && adjacentCount === 0) {
        const atkSpell = findCastableSpell(spells, ATTACK_SPELLS, p.level, sp);
        if (atkSpell && sp >= atkSpell.mana) {
          // 召喚持ちは優先排除 (増殖前に倒す)、次に近い敵を狙う
          const target = rangedTargets.sort((a: any, b: any) => {
            const aSummon = a.hasSummon ? -10 : 0;
            const bSummon = b.hasSummon ? -10 : 0;
            return (a.distance + aSummon) - (b.distance + bSummon);
          })[0];
          const dir = directionTo(px, py, target.x, target.y);
          spellsUsed++;
          state = await sendCommand({ type: CMD.CAST, spellIndex: atkSpell.index, direction: dir });
          const newMonsters = state.monsters;
          if (newMonsters.length < monsters.length) {
            totalKills++;
            killsThisLevel++;
            console.log(`  [遠距離撃破] Turn ${state.turn} DL${state.depth} CL${state.player.level} - ${atkSpell.name}→${target.name}(dist${target.distance}) (累計${totalKills})`);
          }
          continue;
        }
      }
    }

    // === 優先度3.7: 危険モンスター回避 (隣接前に逃走判定) ===
    const dangerDetectRange = isVeryDeep ? 6 : 5;
    const dangerFleeRange = isVeryDeep ? 4 : 3;
    const nearDangerous = monsters.filter((m: any) =>
      m.distance <= dangerDetectRange && isDangerousMonster(m, p.level, state.depth, playerResists) && !forceFightMonsters.has(m.name)
    );
    if (nearDangerous.length > 0 && nearDangerous[0].distance <= dangerFleeRange) {
      const dangerMon = nearDangerous[0];
      const monFleeCount = fleeCountByMonster.get(dangerMon.name) || 0;
      fleeCountByMonster.set(dangerMon.name, monFleeCount + 1);

      // forceFight禁止: 速度130+、ユニーク+高HP、ユニーク+格上
      const isTooFastToFight = dangerMon.speed >= 130 && (dangerMon.level >= p.level * 0.7 || dangerMon.level >= 15);
      const isTooToughToFight = (dangerMon.isUnique && dangerMon.maxhp > 200) ||
        (dangerMon.isUnique && dangerMon.level > p.level + 3);

      // 6回以上逃走 → もう逃げるのは無駄。forceFight登録して戦闘に移行 (強敵は除外)
      if (monFleeCount >= 6 && !isTooFastToFight && !isTooToughToFight) {
        forceFightMonsters.add(dangerMon.name);
        fleeCountByMonster.delete(dangerMon.name);
        // 下のisDangerousチェックを再評価 → 戦闘に移行 (逃走しない)
      }

      // 同じ敵から2回以上逃走 → Phase Doorは無駄、Teleportation or 階段脱出
      // 速度130+は常にpersistent扱い (forceFightに入れないため)
      const isPersistentChaser = (monFleeCount >= 2 || isTooFastToFight) && !forceFightMonsters.has(dangerMon.name);

      if (isPersistentChaser) {
        // 速度130+は階段/WoR優先 (Teleportでも追いつかれる)
        if (isTooFastToFight) {
          // 1st: 足元に階段があれば即降下
          const onDownFast = tiles.find((t: any) => t.x === px && t.y === py && t.feat === FEAT.DOWN_STAIR);
          const onUpFast = tiles.find((t: any) => t.x === px && t.y === py && t.feat === FEAT.UP_STAIR);
          if (onDownFast) {
            fleeAttempts++; retreatMode = true; retreatStartTurn = state.turn;
            addLesson(state.turn, state.depth, "高速敵脱出",
              `${dangerMon.name}(spd${dangerMon.speed})。階段降下で階層脱出`);
            state = await sendCommand({ type: CMD.GO_DOWN });
            visited.clear(); lastVisitedSize = 0; noProgressCount = 0; stuckCount = 0;
            killsThisLevel = 0; levelEntryTurn = state.turn; explorationRateWindow = [];
            levelEntryDetected = false; unreachableItems.clear();
            teleportLoopCount = 0; lastTeleportArea = ""; descentTeleportCount = 0; fleeCountByMonster.clear();
            if (state.depth > maxDepthReached) maxDepthReached = state.depth;
            continue;
          }
          if (onUpFast) {
            fleeAttempts++; retreatMode = true; retreatStartTurn = state.turn;
            addLesson(state.turn, state.depth, "高速敵脱出",
              `${dangerMon.name}(spd${dangerMon.speed})。階段上昇で階層脱出`);
            state = await sendCommand({ type: CMD.GO_UP });
            visited.clear(); lastVisitedSize = 0; noProgressCount = 0; stuckCount = 0;
            killsThisLevel = 0; levelEntryTurn = state.turn; explorationRateWindow = [];
            fleeCountByMonster.clear();
            continue;
          }
          // 2nd: WoRで帰還 (Teleportより確実)
          if (monFleeCount >= 2 && state.depth > 0 && !(p.wordRecall > 0)) {
            const recallSlotFast = findRecallScroll(inv);
            if (recallSlotFast !== null) {
              fleeAttempts++; retreatMode = true; retreatStartTurn = state.turn;
              addLesson(state.turn, state.depth, "高速敵脱出",
                `${dangerMon.name}(spd${dangerMon.speed})から${monFleeCount+1}回逃走。WoR帰還`);
              state = await sendCommand({ type: CMD.READ, itemIndex: recallSlotFast });
              continue;
            }
          }
          // 3rd: Teleport (最終手段 — 1回だけ。追いつかれたら次はWoR)
          if (monFleeCount < 2) {
            const teleSlotFast = findTeleportScroll(inv);
            if (teleSlotFast !== null) {
              fleeAttempts++; retreatMode = true; retreatStartTurn = state.turn;
              addLesson(state.turn, state.depth, "高速敵回避",
                `${dangerMon.name}(spd${dangerMon.speed})。Teleport(1回限り)で距離確保`);
              state = await sendCommand({ type: CMD.READ, itemIndex: teleSlotFast });
              stuckCount = 0; noProgressCount = 0; visited.clear(); lastVisitedSize = 0;
              continue;
            }
          }
        }
        // 通常の persistent chaser: Teleportで距離を取る
        const teleSlotChaser = findTeleportScroll(inv);
        if (teleSlotChaser !== null) {
          fleeAttempts++; retreatMode = true; retreatStartTurn = state.turn;
          addLesson(state.turn, state.depth, "追跡者脱出",
            `${dangerMon.name}(Lv${dangerMon.level})から${monFleeCount+1}回目。Teleportで脱出`);
          state = await sendCommand({ type: CMD.READ, itemIndex: teleSlotChaser });
          stuckCount = 0; noProgressCount = 0; visited.clear(); lastVisitedSize = 0;
          continue;
        }
        // Teleportなし → 階段で脱出
        const onDownStair = tiles.find((t: any) => t.x === px && t.y === py && t.feat === FEAT.DOWN_STAIR);
        if (onDownStair) {
          fleeAttempts++; retreatMode = true; retreatStartTurn = state.turn;
          addLesson(state.turn, state.depth, "追跡者脱出",
            `${dangerMon.name}から${monFleeCount+1}回目。階段で脱出`);
          state = await sendCommand({ type: CMD.GO_DOWN });
          visited.clear(); lastVisitedSize = 0; noProgressCount = 0; stuckCount = 0;
          killsThisLevel = 0; levelEntryTurn = state.turn; explorationRateWindow = [];
          levelEntryDetected = false; unreachableItems.clear();
          teleportLoopCount = 0; lastTeleportArea = ""; descentTeleportCount = 0; fleeCountByMonster.clear();
          if (state.depth > maxDepthReached) maxDepthReached = state.depth;
          continue;
        }
        // 5回以上逃走+Teleportなし → WoRで完全離脱
        if (monFleeCount >= 5 && state.depth > 0 && !(p.wordRecall > 0)) {
          const recallSlot = findRecallScroll(inv);
          if (recallSlot !== null) {
            fleeAttempts++; retreatMode = true; retreatStartTurn = state.turn;
            addLesson(state.turn, state.depth, "追跡者脱出",
              `${dangerMon.name}から${monFleeCount+1}回目。WoRで帰還`);
            state = await sendCommand({ type: CMD.READ, itemIndex: recallSlot });
            continue;
          }
        }
      }

      // 通常の危険敵逃走
      if (canCastSpells) {
        const escSpell = findCastableSpell(spells, ESCAPE_SPELLS, p.level, sp);
        if (escSpell) {
          fleeAttempts++; retreatMode = true; retreatStartTurn = state.turn;
          spellsUsed++;
          const breathInfo = dangerMon.breathElements?.length ? ` BR:${dangerMon.breathElements.join("/")}` : "";
          const summonInfo = dangerMon.hasSummon ? " +SUM" : "";
          addLesson(state.turn, state.depth, "危険敵回避",
            `${dangerMon.name}(Lv${dangerMon.level},spd${dangerMon.speed}${breathInfo}${summonInfo})接近。${escSpell.name}で退避`);
          state = await sendCommand({ type: CMD.CAST, spellIndex: escSpell.index, direction: 5 });
          if (escSpell.name.includes("Teleport")) { stuckCount = 0; noProgressCount = 0; }
          continue;
        }
      }
      // 速度120+の敵はPhase Door(2マス)では逃げきれない → Teleport優先
      const dangerIsFast = dangerMon.speed >= 120;
      if (dangerIsFast || state.depth >= 18) {
        const teleSlotFast = findTeleportScroll(inv);
        if (teleSlotFast !== null) {
          fleeAttempts++; retreatMode = true; retreatStartTurn = state.turn;
          addLesson(state.turn, state.depth, "危険敵回避",
            `${dangerMon.name}(Lv${dangerMon.level},spd${dangerMon.speed})接近。Teleportで確実離脱`);
          state = await sendCommand({ type: CMD.READ, itemIndex: teleSlotFast });
          stuckCount = 0; noProgressCount = 0; visited.clear(); lastVisitedSize = 0;
          continue;
        }
      }
      const phaseSlot = findPhaseScroll(inv);
      if (phaseSlot !== null) {
        fleeAttempts++; retreatMode = true; retreatStartTurn = state.turn;
        addLesson(state.turn, state.depth, "危険敵回避",
          `${dangerMon.name}(Lv${dangerMon.level},spd${dangerMon.speed})接近。Phase Doorで退避`);
        state = await sendCommand({ type: CMD.READ, itemIndex: phaseSlot });
        continue;
      }
      const teleSlot = findTeleportScroll(inv);
      if (teleSlot !== null) {
        fleeAttempts++; retreatMode = true; retreatStartTurn = state.turn;
        addLesson(state.turn, state.depth, "危険敵回避",
          `${dangerMon.name}(Lv${dangerMon.level})接近。Teleportで脱出`);
        state = await sendCommand({ type: CMD.READ, itemIndex: teleSlot });
        stuckCount = 0; noProgressCount = 0; visited.clear(); lastVisitedSize = 0;
        continue;
      }
      // 逃走手段なし → 戦うしかない
    }

    // === 優先度4: 隣接敵との戦闘 ===
    const adjacentMonsters = monsters.filter((m: any) => m.distance <= 1);
    if (adjacentMonsters.length > 0) {
      // ターゲット選択: 召喚/ブレス持ちを優先排除、次に最弱
      const target = adjacentMonsters.sort((a: any, b: any) => {
        // 召喚持ちは最優先で排除（放置すると増殖）
        const aSummon = a.hasSummon ? -1000 : 0;
        const bSummon = b.hasSummon ? -1000 : 0;
        // ブレス持ちは次に優先
        const aBreath = (a.breathElements?.length ?? 0) > 0 ? -500 : 0;
        const bBreath = (b.breathElements?.length ?? 0) > 0 ? -500 : 0;
        // 1体なら最弱狙い、複数なら脅威度優先
        if (adjacentMonsters.length === 1) return a.hp - b.hp;
        return (a.hp + aSummon + aBreath) - (b.hp + bSummon + bBreath);
      })[0];
      const dir = directionTo(px, py, target.x, target.y);

      // === 回廊戦闘: 複数敵に囲まれそうなら狭い場所に退避 ===
      // 2体以上隣接 + 開けた場所にいる → 隣の回廊に1歩移動
      // DL15+でのみ有効（浅層では不要、移動コストがもったいない）
      if (adjacentMonsters.length >= 3 && hpPct >= 0.5 && state.depth >= 15) {
        // 現在地の通行可能な隣接タイル数を数える
        let openNeighbors = 0;
        for (const d of ALL_DIRS) {
          const [dx, dy] = dirOffsets[d]!;
          if (isPassable(tiles, px + dx, py + dy)) openNeighbors++;
        }
        // 4つ以上開けている(部屋の中)→ 2-3の狭い場所を探す
        if (openNeighbors >= 4) {
          let bestCorridorDir = -1;
          let bestCorridorOpenness = 99;
          for (const d of ALL_DIRS) {
            const [dx, dy] = dirOffsets[d]!;
            const nx = px + dx, ny = py + dy;
            if (!isPassable(tiles, nx, ny)) continue;
            // 敵のいる方向には移動しない
            if (adjacentMonsters.some((m: any) => m.x === nx && m.y === ny)) continue;
            // その先の開き具合を計算
            let neighborOpen = 0;
            for (const d2 of ALL_DIRS) {
              const [dx2, dy2] = dirOffsets[d2]!;
              if (isPassable(tiles, nx + dx2, ny + dy2)) neighborOpen++;
            }
            if (neighborOpen <= 3 && neighborOpen < bestCorridorOpenness) {
              bestCorridorOpenness = neighborOpen;
              bestCorridorDir = d;
            }
          }
          if (bestCorridorDir !== -1) {
            addLesson(state.turn, state.depth, "回廊退避",
              `隣接敵${adjacentMonsters.length}体@開けた場所(${openNeighbors}隣接)。狭い場所(${bestCorridorOpenness}隣接)へ移動`);
            state = await sendCommand({ type: CMD.WALK, direction: bestCorridorDir });
            continue;
          }
        }
      }

      // === スレイ/ブランド対応の武器スワップ ===
      // ターゲットに対して現武器よりDPSが30%以上高い武器がインベントリにあればスワップ
      const weaponSwap = findBestWeaponForMonster(inv, p.equipment ?? [], p.toD ?? 0, target);
      if (weaponSwap) {
        addLesson(state.turn, state.depth, "武器スワップ",
          `${target.name}に対し${weaponSwap.name}へ交換 (DPS ${Math.round(weaponSwap.currentDps)}→${Math.round(weaponSwap.dps)})`);
        state = await sendCommand({ type: CMD.EQUIP, itemIndex: weaponSwap.slot });
        continue; // 装備変更でターン消費、次ターンで攻撃
      }

      // 戦闘予測: 自分のDPS vs 被ダメ推定 (2体以上の時のみ)
      let combatUnwinnable = false;
      if (adjacentMonsters.length >= 2) {
        const weapon = (p.equipment ?? []).find((e: any) => WEAPON_TVALS.has(e.tval));
        // スレイ/ブランド考慮のDPS計算（ターゲットに対する実効ダメージ）
        const avgWeaponDmg = weapon ? weaponDpsVsMonster(weapon, p.toD ?? 0, target) : (p.level / 2 + 3);
        const totalEnemyHp = adjacentMonsters.reduce((s: number, m: any) => s + m.hp, 0);
        const turnsToKill = Math.ceil(totalEnemyHp / Math.max(avgWeaponDmg, 1));
        // ブレス持ちの追加ダメージを考慮 (HPの1/6が基本ダメージ、耐性ありなら1/3に軽減)
        let breathBonus = 0;
        for (const m of adjacentMonsters) {
          if (m.breathElements && m.breathElements.length > 0) {
            const hasResist = m.breathElements.every((e: string) => playerResists.has(e));
            breathBonus += hasResist ? m.maxhp / 18 : m.maxhp / 6;
          }
        }
        const estimatedDmgTaken = (adjacentMonsters.length * (target.level * 1.5 + 3) + breathBonus) * turnsToKill * 0.3;
        combatUnwinnable = estimatedDmgTaken > p.hp * 0.9;
      }

      // 敵が多い場合は逃走検討（ただしforceFight対象は除外）
      const hasDangerousAdjacent = adjacentMonsters.some((m: any) => isDangerousMonster(m, p.level, state.depth, playerResists));
      const anyForceFight = adjacentMonsters.some((m: any) => forceFightMonsters.has(m.name));
      const shouldFlee = !anyForceFight && (
        (adjacentMonsters.length >= 2 && hpPct < 0.6) || adjacentMonsters.length >= 3 || (hasDangerousAdjacent && hpPct < 0.7)
        || (isVeryDeep && adjacentMonsters.length >= 1 && hpPct < 0.4)
        || (isExtremeDeep && adjacentMonsters.length >= 2 && hpPct < 0.65) // DL20+: 2体で65%以下は逃走
        || (combatUnwinnable && hpPct < 0.6)
      );
      if (shouldFlee) {
        // 持続追跡者チェック — 隣接戦闘でも繰り返し逃走ならTeleport優先
        const adjFleeCount = fleeCountByMonster.get(target.name) || 0;
        fleeCountByMonster.set(target.name, adjFleeCount + 1);

        if (adjFleeCount >= 3) {
          // 5回以上 → 階段かWoRで完全離脱
          if (adjFleeCount >= 5) {
            const onDown = tiles.find((t: any) => t.x === px && t.y === py && t.feat === FEAT.DOWN_STAIR);
            const onUp = tiles.find((t: any) => t.x === px && t.y === py && t.feat === FEAT.UP_STAIR);
            if (onDown) {
              fleeAttempts++; retreatMode = true; retreatStartTurn = state.turn;
              state = await sendCommand({ type: CMD.GO_DOWN });
              visited.clear(); lastVisitedSize = 0; noProgressCount = 0; stuckCount = 0;
              killsThisLevel = 0; levelEntryTurn = state.turn; explorationRateWindow = [];
              fleeCountByMonster.clear();
              if (state.depth > maxDepthReached) maxDepthReached = state.depth;
              continue;
            }
            if (onUp && state.depth > 1) {
              fleeAttempts++; retreatMode = true; retreatStartTurn = state.turn;
              state = await sendCommand({ type: CMD.GO_UP });
              visited.clear(); lastVisitedSize = 0; noProgressCount = 0; stuckCount = 0;
              killsThisLevel = 0; levelEntryTurn = state.turn; explorationRateWindow = [];
              fleeCountByMonster.clear();
              continue;
            }
          }
          // 10回以上 → もう逃げても無駄。forceFight登録して戦闘に移行 (強敵は除外)
          const adjTooStrong = (target.speed >= 130 && (target.level >= p.level * 0.7 || target.level >= 15)) ||
            (target.isUnique && target.maxhp > 200) || (target.isUnique && target.level > p.level + 3);
          if (adjFleeCount >= 10 && !adjTooStrong) {
            forceFightMonsters.add(target.name);
            fleeCountByMonster.delete(target.name);
            // shouldFleeが次回からfalseになるので、以降は戦闘に落ちる
          }
          // 3-9回 → Teleport
          if (adjFleeCount < 10) {
            const teleSlot = findTeleportScroll(inv);
            if (teleSlot !== null) {
              fleeAttempts++; retreatMode = true; retreatStartTurn = state.turn;
              addLesson(state.turn, state.depth, "追跡者包囲脱出",
                `${target.name}から${adjFleeCount+1}回目。Teleportで完全脱出`);
              state = await sendCommand({ type: CMD.READ, itemIndex: teleSlot });
              stuckCount = 0; noProgressCount = 0; visited.clear(); lastVisitedSize = 0;
              continue;
            }
          }
        }

        // 速度120+敵 or DL18+では包囲時もTeleport優先
        const hasFastAdjacent = adjacentMonsters.some((m: any) => m.speed >= 120);
        if (hasFastAdjacent || state.depth >= 18) {
          const teleSlotSurr = findTeleportScroll(inv);
          if (teleSlotSurr !== null) {
            fleeAttempts++; retreatMode = true; retreatStartTurn = state.turn;
            addLesson(state.turn, state.depth, "包囲逃走",
              `隣接敵${adjacentMonsters.length}体(高速敵あり)、HP${Math.round(hpPct*100)}%。Teleportで脱出`);
            state = await sendCommand({ type: CMD.READ, itemIndex: teleSlotSurr });
            stuckCount = 0; noProgressCount = 0; visited.clear(); lastVisitedSize = 0;
            continue;
          }
        }
        const phaseSlot = findPhaseScroll(inv);
        if (phaseSlot !== null) {
          fleeAttempts++; retreatMode = true; retreatStartTurn = state.turn;
          addLesson(state.turn, state.depth, "包囲逃走",
            `隣接敵${adjacentMonsters.length}体、HP${Math.round(hpPct*100)}%。Phase Doorで退避`);
          state = await sendCommand({ type: CMD.READ, itemIndex: phaseSlot });
          continue;
        }
        // Phase Doorなし → Teleportation (深層はより早く脱出)
        const teleFleePct = isVeryDeep ? 0.6 : 0.4;
        if (hpPct < teleFleePct) {
          const teleSlot = findTeleportScroll(inv);
          if (teleSlot !== null) {
            fleeAttempts++; retreatMode = true; retreatStartTurn = state.turn;
            addLesson(state.turn, state.depth, "緊急包囲脱出",
              `隣接敵${adjacentMonsters.length}体、HP${Math.round(hpPct*100)}%。Teleportで緊急脱出`);
            state = await sendCommand({ type: CMD.READ, itemIndex: teleSlot });
            stuckCount = 0; noProgressCount = 0;
            visited.clear(); lastVisitedSize = 0;
            continue;
          }
        }
      }

      // 戦闘中回復: HP低下時に回復してから殴る (DL10+では必須)
      const combatHealThreshold = isExtremeDeep ? 0.65 : isVeryDeep ? 0.55 : isDeep ? 0.5 : 0.4;
      if (hpPct < combatHealThreshold && adjacentMonsters.length <= 2) {
        // 回復スペルがあればスペル優先
        if (canCastSpells) {
          const healSpell = findBestHealSpell(spells, p.level, sp, true);
          if (healSpell) {
            spellsUsed++;
            healingsUsed++;
            state = await sendCommand({ type: CMD.CAST, spellIndex: healSpell.index, direction: 5 });
            continue;
          }
        }
        // 戦闘中は段階的ポーション（HP残量に応じた適切な強さ）
        const healSlot = findTieredHealingPotion(inv, hpPct);
        if (healSlot !== null) {
          healingsUsed++;
          state = await sendCommand({ type: CMD.QUAFF, itemIndex: healSlot });
          continue;
        }
      }

      // 攻撃スペルがあれば使う (隣接敵に方向指定)
      if (canCastSpells) {
        const atkSpell = findCastableSpell(spells, ATTACK_SPELLS, p.level, sp);
        if (atkSpell && sp >= atkSpell.mana) {
          spellsUsed++;
          state = await sendCommand({ type: CMD.CAST, spellIndex: atkSpell.index, direction: dir });
          const newMonsters = state.monsters;
          if (newMonsters.length < monsters.length) {
            totalKills++;
            killsThisLevel++;
            console.log(`  [魔法撃破] Turn ${state.turn} DL${state.depth} CL${state.player.level} - ${atkSpell.name}で撃破 (累計${totalKills}) HP:${state.player.hp}/${state.player.maxHp}`);
          }
          continue;
        }
      }

      state = await sendCommand({ type: CMD.WALK, direction: dir });

      // 戦闘結果チェック
      const newMonsters = state.monsters;
      if (newMonsters.length < monsters.length) {
        totalKills++;
        killsThisLevel++;
        console.log(`  [戦闘] Turn ${state.turn} DL${state.depth} CL${state.player.level} - 撃破 (累計${totalKills}, 階${killsThisLevel}) HP:${state.player.hp}/${state.player.maxHp}`);
      }
      continue;
    }

    // === 優先度4.5: 足元アイテム拾い + 装備最適化 (安全時のみ) ===
    // 条件: 隣接敵なし + 近接敵(dist<=3)も少ない + 降下急いでない
    const nearMonCount = monsters.filter((m: any) => m.distance <= 3).length;
    if (adjacentMonsters.length === 0 && nearMonCount <= 1) {
      const currentTile2 = tiles.find((t: any) => t.x === px && t.y === py);
      if (currentTile2?.hasObj) {
        // Pack full check: skip pickup if inventory is full (23 slots max)
        const MAX_PACK = 23;
        if (inv.length >= MAX_PACK) {
          // Don't try to pick up — move on to avoid stuck loop
          // (future: drop lowest-value item to make room)
        } else {
        const prevInvCount = inv.length;
        state = await sendCommand({ type: CMD.PICKUP });
        const newInv = state.player.inventory;
        if (newInv.length > prevInvCount) {
          for (const item of newInv.slice(prevInvCount)) {
            console.log(`  [拾得] ${item.name} (tval=${item.tval}, ac=${item.ac ?? 0})`);
          }
        }
        // 装備比較: 拾ったものが現装備より良ければ即装備
        const equip2 = state.player.equipment ?? [];
        for (const invItem of state.player.inventory) {
          if (!EQUIPPABLE_TVALS.has(invItem.tval)) continue;
          const invPower2 = itemPower(invItem);
          const currentEquip2 = equip2.find((e: any) => sameEquipCategory(e.tval, invItem.tval));
          if (!currentEquip2 && invPower2 > 0) {
            addLesson(state.turn, state.depth, "装備",
              `${invItem.name}を装備 (power=${invPower2}, 空スロット)`);
            state = await sendCommand({ type: CMD.EQUIP, itemIndex: invItem.slot });
            break;
          }
          if (currentEquip2 && invPower2 > itemPower(currentEquip2)) {
            addLesson(state.turn, state.depth, "装備変更",
              `${invItem.name}(power=${invPower2}) > ${currentEquip2.name}(power=${itemPower(currentEquip2)})。交換`);
            state = await sendCommand({ type: CMD.EQUIP, itemIndex: invItem.slot });
            break;
          }
        }
        continue;
      }
      } // end pack full else
    }

    // === 優先度5: 接近中の敵への対応 (BFS到達可能 + 安全な敵のみ) ===
    // noProgressCount高い時はスキップ (脱出を優先)
    // 退避モード中はスキップ (HP回復を優先、敵に近づかない)
    const nearbyMonsters = monsters.filter((m: any) =>
      m.distance <= 6 && !isDangerousMonster(m, p.level, state.depth, playerResists)
    );
    if (nearbyMonsters.length > 0 && stuckCount < 5 && noProgressCount < 50 && !retreatMode) {
      const closest = nearbyMonsters.sort((a: any, b: any) => a.distance - b.distance)[0];

      // 接近中に武器スワップ（距離2-3で余裕がある時）
      if (closest.distance >= 2) {
        const preSwap = findBestWeaponForMonster(inv, p.equipment ?? [], p.toD ?? 0, closest);
        if (preSwap) {
          addLesson(state.turn, state.depth, "先行武器スワップ",
            `${closest.name}(dist${closest.distance})接近中。${preSwap.name}へ交換 (DPS ${Math.round(preSwap.currentDps)}→${Math.round(preSwap.dps)})`);
          state = await sendCommand({ type: CMD.EQUIP, itemIndex: preSwap.slot });
          continue;
        }
      }

      // BFSで到達可能か確認（壁越しの敵は無視）
      const approachDir = bfsNextStep(tiles, px, py, closest.x, closest.y);
      if (approachDir !== null) {
        const beforeX = px, beforeY = py;
        state = await sendCommand({ type: CMD.WALK, direction: approachDir });
        if (state.player.x === beforeX && state.player.y === beforeY) {
          stuckCount++; // 歩けなかった → stuckCount上昇
        }
        continue;
      }
      // 到達不能 → 無視して探索に移行
    }

    // === 優先度6: アイテム拾い + 装備最適化 ===
    // 6a: 近くのフロアアイテムに向かう (敵がいない場合のみ、停滞中はスキップ)
    if (monsters.filter((m: any) => m.distance <= 3).length === 0 && noProgressCount < 50) {
      const itemTiles = tiles.filter((t: any) =>
        t.hasObj && (t.x !== px || t.y !== py) &&
        !unreachableItems.has(`${t.x},${t.y}`)
      );
      if (itemTiles.length > 0) {
        // 最寄りのアイテムタイルへBFS
        const sorted = itemTiles
          .map((t: any) => ({ ...t, dist: distanceTo(px, py, t.x, t.y) }))
          .sort((a: any, b: any) => a.dist - b.dist);
        for (const target of sorted) {
          if (target.dist > 50) break; // 遠すぎるものは無視
          const itemDir = bfsNextStep(tiles, px, py, target.x, target.y);
          if (itemDir !== null) {
            state = await sendCommand({ type: CMD.WALK, direction: itemDir });
            break;
          }
          // BFS到達不能 → このアイテムを無視リストに追加
          unreachableItems.add(`${target.x},${target.y}`);
        }
        if (state.player.x !== px || state.player.y !== py) continue;
      }
    }

    // 6b: 足元アイテム拾い + 装備比較
    const currentTile = tiles.find((t: any) => t.x === px && t.y === py);
    if (currentTile?.hasObj && inv.length < 23) {
      // フロアにアイテムあり → 拾う (pack full時はスキップ)
      const prevInvCount = inv.length;
      state = await sendCommand({ type: CMD.PICKUP });
      const newInv = state.player.inventory;
      if (newInv.length > prevInvCount) {
        const newItems = newInv.slice(prevInvCount);
        for (const item of newItems) {
          console.log(`  [拾得] ${item.name} (tval=${item.tval}, toH=${item.toH}, toD=${item.toD}, ac=${item.ac ?? 0})`);
        }
      }
      // 拾った後に装備比較
      const equip = state.player.equipment ?? [];
      const updatedInv = state.player.inventory;
      for (const invItem of updatedInv) {
        if (!EQUIPPABLE_TVALS.has(invItem.tval)) continue;
        const invPower = itemPower(invItem);
        // 同カテゴリの現装備を探す
        const currentEquip = equip.find((e: any) => sameEquipCategory(e.tval, invItem.tval));
        if (!currentEquip && invPower > 0) {
          // 空スロット → power正なら装備
          addLesson(state.turn, state.depth, "装備",
            `${invItem.name}を装備 (power=${invPower}, 空スロット)`);
          state = await sendCommand({ type: CMD.EQUIP, itemIndex: invItem.slot });
          continue;
        }
        if (!currentEquip) continue; // power <= 0 → 装備しない
        const equipPower = itemPower(currentEquip);
        if (invPower > equipPower) {
          addLesson(state.turn, state.depth, "装備変更",
            `${invItem.name}(power=${invPower}) > ${currentEquip.name}(power=${equipPower})。交換`);
          state = await sendCommand({ type: CMD.EQUIP, itemIndex: invItem.slot });
        }
      }
      continue;
    }

    // === 優先度7: 階段降下 ===
    turnsOnLevel = state.turn - levelEntryTurn;
    const healingPotions = inv.filter((item: any) => item.tval === TVAL.POTION && item.name.includes("Cure") && item.qty > 0);
    const totalHealingQty = healingPotions.reduce((sum: number, item: any) => sum + item.qty, 0);
    const hasHealing = totalHealingQty > 0;
    const enoughKills = killsThisLevel >= minKillsForDepth(state.depth) || state.depth === 0 || turnsOnLevel > MAX_TURNS_PER_LEVEL;

    // 探索効率停滞チェック: 直近3回の探索率変化が2%以下
    const descentPassable = tiles.filter((t: any) => PASSABLE_FEATS.has(t.feat)).length;
    const descentUnvisited = tiles.filter((t: any) => PASSABLE_FEATS.has(t.feat) && !visited.has(`${t.x},${t.y}`)).length;
    const currentExplorationPct = descentPassable > 0 ? Math.round((1 - descentUnvisited / descentPassable) * 100) : 100;
    const explorationStalled = explorationRateWindow.length >= 3 && (() => {
      if (turnsOnLevel < 1000) return false; // 最低1000ターンは探索する
      const last3 = explorationRateWindow.slice(-3);
      const change = Math.abs(last3[last3.length - 1]! - last3[0]!);
      return change <= 2 && last3[0]! >= 50; // 50%以上探索で停滞
    })();
    // 低探索率フロア早期降下: 探索率<15%で1500ターン以上 → 小部屋/孤立フロアなので降りる
    // 探索率が極端に低い場合はkillsもCLも待たない (そのフロアで稼げない)
    const lowExplorationEarlyDescent = currentExplorationPct < 15 && turnsOnLevel > 1500 && state.depth > 0;

    // If overleveled, skip kill requirement — rush deeper
    // DL20でCL22+, DL10でCL15+でオーバーレベル判定
    const overlevelThreshold = state.depth >= 20 ? 1.1 : state.depth >= 10 ? 1.3 : 2;
    const overleveled = p.level >= state.depth * overlevelThreshold && state.depth > 0;

    // 長時間同じ階にいたら強制降下 — 深度でスケール (v8: 閾値引き上げ)
    const tooLongThreshold = overleveled ? 1500 :
      state.depth >= 20 ? 4000 :
      state.depth >= 10 ? 5000 :
      state.depth >= 5 ? 6000 : 8000;
    const tooLongOnLevel = turnsOnLevel > tooLongThreshold;

    // 深層では回復薬を十分持っていないと降下しない
    const minHealingForDescent = state.depth >= 40 ? 15 : state.depth >= 30 ? 10 : state.depth >= 15 ? 6 : state.depth >= 12 ? 4 : state.depth >= 8 ? 2 : 1;
    const healingOk = totalHealingQty >= minHealingForDescent;

    // 逃走手段チェック (深層では必須)
    const phaseCount = inv.filter((item: any) => item.tval === TVAL.SCROLL && item.name.includes("Phase Door") && item.qty > 0)
      .reduce((s: number, i: any) => s + i.qty, 0);
    const teleCount = inv.filter((item: any) => item.tval === TVAL.SCROLL && item.name.includes("Teleportation") && item.qty > 0)
      .reduce((s: number, i: any) => s + i.qty, 0);
    const minPhaseForEscape = state.depth >= 15 ? 5 : 3;
    const minTeleForEscape = state.depth >= 15 ? 3 : state.depth >= 10 ? 1 : 0;
    const hasEscapeMeans = (phaseCount >= minPhaseForEscape || teleCount >= 2 ||
      (canCastSpells && findCastableSpell(spells, ESCAPE_SPELLS, p.level, sp) !== null))
      && teleCount >= minTeleForEscape;
    const escapeOk = state.depth < 8 || hasEscapeMeans || tooLongOnLevel;

    // 耐性カバレッジ: ソフトゲート — 耐性不足時は最低撃破数/滞在ターンを引き上げ
    // 完全ブロックだと耐性装備が出ないSeedで詰む
    const BASE_ELEMS = ["ACID", "ELEC", "FIRE", "COLD"];
    const baseResistCount = BASE_ELEMS.filter(e => playerResists.has(e)).length;
    const hasPoisRes = playerResists.has("POIS");
    const resistTarget = state.depth < 20 ? 0 :
      state.depth < 30 ? 2 :
      state.depth < 40 ? 4 : 4;  // 目標耐性数
    const resistDeficit = Math.max(0, resistTarget - baseResistCount - (hasPoisRes ? 0 : (state.depth >= 30 ? 1 : 0)));
    // 耐性不足1つにつき追加3000ターン滞在 (探索/レベリングで補填)
    const resistPenaltyTurns = resistDeficit * 3000;
    const resistOk = resistDeficit === 0;

    // CLが低すぎる場合は降下を控える (DLとCLの乖離チェック — 深層ではより厳しく)
    // DL30+で比率引き上げ。DL30でCL24必要(0.8), DL20でCL16(0.8), DL10でCL8(0.75)
    const minClRatio = state.depth >= 30 ? 0.8 : state.depth >= 20 ? 0.8 : state.depth >= 10 ? 0.75 : 0.6;
    const clOk = p.level >= Math.floor(state.depth * minClRatio) || state.depth <= 3;

    // tooLongOnLevelでもclOkは必須 (レベル不足での降下は死因上位)
    // ただし超長期滞在(2x閾値)ではCLチェックも緩和
    const veryLongOnLevel = turnsOnLevel > tooLongThreshold * 2;
    const clCheck = clOk || veryLongOnLevel;
    // 耐性ソフトゲート: 不足分×3000ターン追加滞在で降下許可
    const resistCheck = resistOk || turnsOnLevel > resistPenaltyTurns;
    const readyToDescend = hpPct >= 0.7 && healingOk && escapeOk && resistCheck &&
      ((clCheck && (enoughKills || explorationStalled || tooLongOnLevel || overleveled)) || lowExplorationEarlyDescent);

    if (readyToDescend) {
      const downStair = findTile(tiles, FEAT.DOWN_STAIR);
      if (downStair) {
        const onStair = tiles.find((t: any) => t.x === px && t.y === py && t.feat === FEAT.DOWN_STAIR);
        if (onStair) {
          addLesson(state.turn, state.depth, "降下",
            `DL${state.depth}→DL${state.depth+1}。HP${Math.round(hpPct*100)}%、撃破${killsThisLevel}体、耐性${baseResistCount}/4+毒${hasPoisRes ? "○" : "×"}。降下`);
          state = await sendCommand({ type: CMD.GO_DOWN });
          if (state.depth > maxDepthReached) {
            maxDepthReached = state.depth;
            console.log(`  [到達] 最深部更新: DL${maxDepthReached}`);
          }
          visited.clear(); lastVisitedSize = 0; noProgressCount = 0;
          stuckCount = 0; explorationRateWindow = [];
          killsThisLevel = 0;
          levelEntryTurn = state.turn;
          teleportLoopCount = 0; lastTeleportArea = "";
          continue;
        } else {
          // BFSで階段への最短経路を計算
          const nextDir = bfsNextStep(tiles, px, py, downStair.x, downStair.y);
          if (nextDir !== null) {
            state = await sendCommand({ type: CMD.WALK, direction: nextDir });
            continue;
          }
          // 階段がBFS到達不能 → 掘削パスファインディングで壁を掘る
          const digPath = dijkstraNextStepWithDigging(tiles, px, py, downStair.x, downStair.y);
          const stairDist = distanceTo(px, py, downStair.x, downStair.y);
          // 掘削で向かう (テレポ失敗を避けるため閾値緩和)
          if (digPath && stairDist <= 60) {
            if (digPath.needsDig) {
              state = await sendCommand({ type: CMD.TUNNEL, direction: digPath.dir });
            } else {
              state = await sendCommand({ type: CMD.WALK, direction: digPath.dir });
            }
            continue;
          }
          // 遠い or Dijkstraでも到達不能 → テレポート (最大3回/階、超えたら掘削 or 探索続行)
          if (descentTeleportCount < 3) {
            const teleSlot = findTeleportScroll(inv);
            if (teleSlot !== null) {
              descentTeleportCount++;
              addLesson(state.turn, state.depth, "降下テレポート",
                `階段が遠い/到達不能(dist=${stairDist})。テレポートで再配置 (${descentTeleportCount}/3)`);
              state = await sendCommand({ type: CMD.READ, itemIndex: teleSlot });
              stuckCount = 0; noProgressCount = 0;
              continue;
            }
          }
          // テレポ回数切れ or テレポスクロールなし → 掘削 or 方向歩行
          if (digPath) {
            if (digPath.needsDig) {
              state = await sendCommand({ type: CMD.TUNNEL, direction: digPath.dir });
            } else {
              state = await sendCommand({ type: CMD.WALK, direction: digPath.dir });
            }
            continue;
          }
          // Dijkstraも失敗 → 階段方向へ直進 (壁を掘りながら)
          {
            const stairDir = directionTo(px, py, downStair.x, downStair.y);
            const [sdx, sdy] = dirOffsets[stairDir] ?? [0, 0];
            const targetT = tiles.find((t: any) => t.x === px + sdx && t.y === py + sdy);
            if (targetT && PASSABLE_FEATS.has(targetT.feat)) {
              state = await sendCommand({ type: CMD.WALK, direction: stairDir });
            } else {
              state = await sendCommand({ type: CMD.TUNNEL, direction: stairDir });
            }
            continue;
          }
        }
      } else if (tooLongOnLevel || overleveled) {
        // 階段が見えない → テレポートで探す
        const teleSlot = findTeleportScroll(inv);
        if (teleSlot !== null) {
          addLesson(state.turn, state.depth, "階段探索テレポート",
            `階段未発見+長期滞在${turnsOnLevel}T。テレポートで移動`);
          state = await sendCommand({ type: CMD.READ, itemIndex: teleSlot });
          stuckCount = 0; noProgressCount = 0;
          continue;
        }
      }
    }
    // 降下条件未達 → 探索・戦闘を優先（階段に向かわない）

    // === 優先度8: 探索 ===
    if (px === lastX && py === lastY) {
      stuckCount++;
    } else {
      stuckCount = 0;
    }
    lastX = px;
    lastY = py;

    // === stuckCount >= 20 → 強制テレポート脱出 ===
    if (stuckCount >= 20) {
      const teleSlot = findTeleportScroll(inv);
      if (teleSlot !== null) {
        addLesson(state.turn, state.depth, "強制脱出",
          `${stuckCount}回スタック@(${px},${py})。Teleportで強制脱出`);
        state = await sendCommand({ type: CMD.READ, itemIndex: teleSlot });
        stuckCount = 0;
        visited.clear(); lastVisitedSize = 0; noProgressCount = 0;
        continue;
      }
      const phaseSlot = findPhaseScroll(inv);
      if (phaseSlot !== null) {
        state = await sendCommand({ type: CMD.READ, itemIndex: phaseSlot });
        stuckCount = 0;
        visited.clear(); lastVisitedSize = 0; noProgressCount = 0;
        continue;
      }
      // スクロール切れ → 降下 or 上昇
      const onDown = tiles.find((t: any) => t.x === px && t.y === py && t.feat === FEAT.DOWN_STAIR);
      if (onDown) {
        state = await sendCommand({ type: CMD.GO_DOWN });
        visited.clear(); lastVisitedSize = 0; noProgressCount = 0; stuckCount = 0;
        killsThisLevel = 0; levelEntryTurn = state.turn; explorationRateWindow = []; levelEntryDetected = false; unreachableItems.clear();
        teleportLoopCount = 0; lastTeleportArea = "";
        if (state.depth > maxDepthReached) maxDepthReached = state.depth;
        continue;
      }
    }

    // === 隣接の閉ドアを開ける/壊す (最優先) ===
    let doorHandled = false;
    for (const dir of ALL_DIRS) {
      const [dx, dy] = dirOffsets[dir]!;
      const t = tiles.find((tt: any) => tt.x === px + dx && tt.y === py + dy);
      if (t?.feat === FEAT.CLOSED_DOOR) {
        if (levelDebug) console.log(`  [DOOR] dir${dir}@(${px+dx},${py+dy}) stuck=${stuckCount}`);
        if (stuckCount > 3) {
          state = await sendCommand({ type: CMD.TUNNEL, direction: dir });
        } else {
          state = await sendCommand({ type: CMD.OPEN, direction: dir });
        }
        // ドア開いた後の確認
        const newT = state.map.tiles.find((tt: any) => tt.x === px + dx && tt.y === py + dy);
        if (levelDebug && newT) console.log(`    → feat now: ${newT.feat}`);
        doorHandled = true;
        break;
      }
    }
    if (doorHandled) continue;

    // === BFSで最寄りの未踏タイルへ移動 ===
    const bfsExploreDir = bfsNextUnvisited(tiles, px, py, visited);
    if (levelDebug) {
      // 隣接タイルの情報
      const adjInfo = ALL_DIRS.map(d => {
        const [dx, dy] = dirOffsets[d]!;
        const t = tiles.find((tt: any) => tt.x === px + dx && tt.y === py + dy);
        return t ? `d${d}:f${t.feat}` : `d${d}:?`;
      }).join(" ");
      console.log(`  [EXPLORE] pos=(${px},${py}) bfs=${bfsExploreDir} stuck=${stuckCount} adj=[${adjInfo}]`);
    }
    if (bfsExploreDir !== null) {
      const oldPos = `${px},${py}`;
      state = await sendCommand({ type: CMD.WALK, direction: bfsExploreDir });
      const newPos = `${state.player.x},${state.player.y}`;
      if (levelDebug && oldPos !== newPos) {
        console.log(`  [MOVE] ${oldPos} → ${newPos}`);
      }
      if (oldPos === newPos && stuckCount <= 2) {
        console.log(`  [STUCK!] WALK dir=${bfsExploreDir} @${oldPos} stuck=${stuckCount} msgs: ${state.messages.slice(-3).join(" | ")}`);
      }
    } else {
      // BFSで到達可能な未踏タイルなし → 孤立部屋チェック
      const totalPassable = tiles.filter((t: any) => PASSABLE_FEATS.has(t.feat)).length;
      const unvisitedCount = tiles.filter((t: any) => PASSABLE_FEATS.has(t.feat) && !visited.has(`${t.x},${t.y}`)).length;

      if (unvisitedCount > 10) {
        // 孤立ループ検知: テレポート後に同じエリアに着地していないか
        const currentArea = getAreaHash(tiles, px, py);
        if (currentArea === lastTeleportArea) {
          teleportLoopCount++;
        } else {
          teleportLoopCount = 0;
        }

        // 3回同じエリアにテレポートした → 階段で脱出
        if (teleportLoopCount >= 2) {
          addLesson(state.turn, state.depth, "孤立ループ脱出",
            `同エリアに${teleportLoopCount+1}回テレポート。階段で脱出に切替`);
          teleportLoopCount = 0;
          lastTeleportArea = "";
          // 階段を探して降下/上昇
          const downOnMe = tiles.find((t: any) => t.x === px && t.y === py && t.feat === FEAT.DOWN_STAIR);
          const upOnMe = tiles.find((t: any) => t.x === px && t.y === py && t.feat === FEAT.UP_STAIR);
          if (downOnMe) {
            state = await sendCommand({ type: CMD.GO_DOWN });
            visited.clear(); lastVisitedSize = 0; noProgressCount = 0; stuckCount = 0;
            killsThisLevel = 0; levelEntryTurn = state.turn; explorationRateWindow = []; levelEntryDetected = false; unreachableItems.clear();
            if (state.depth > maxDepthReached) maxDepthReached = state.depth;
            continue;
          } else if (upOnMe) {
            state = await sendCommand({ type: CMD.GO_UP });
            visited.clear(); lastVisitedSize = 0; noProgressCount = 0; stuckCount = 0;
            killsThisLevel = 0; levelEntryTurn = state.turn; explorationRateWindow = []; levelEntryDetected = false; unreachableItems.clear();
            continue;
          }
          // 階段の上にいない → BFSで最寄りの階段へ
          const anyStair = tiles.find((t: any) => t.feat === FEAT.DOWN_STAIR || t.feat === FEAT.UP_STAIR);
          if (anyStair) {
            const stairDir = bfsNextStep(tiles, px, py, anyStair.x, anyStair.y);
            if (stairDir !== null) {
              state = await sendCommand({ type: CMD.WALK, direction: stairDir });
              continue;
            }
          }
          // 階段到達不能 → 壁を掘る
          const randomDir = ALL_DIRS[Math.floor(Math.random() * ALL_DIRS.length)];
          state = await sendCommand({ type: CMD.TUNNEL, direction: randomDir });
          continue;
        }

        // 通常の孤立脱出: テレポート
        const teleSlot = findTeleportScroll(inv);
        if (teleSlot !== null) {
          addLesson(state.turn, state.depth, "孤立脱出",
            `到達${totalPassable - unvisitedCount}、未到達${unvisitedCount}。Teleportで脱出`);
          lastTeleportArea = currentArea;
          state = await sendCommand({ type: CMD.READ, itemIndex: teleSlot });
          stuckCount = 0;
          visited.clear(); lastVisitedSize = 0; noProgressCount = 0;
          continue;
        }
        // Phase Door fallback
        const phaseSlot = findPhaseScroll(inv);
        if (phaseSlot !== null) {
          lastTeleportArea = currentArea;
          state = await sendCommand({ type: CMD.READ, itemIndex: phaseSlot });
          stuckCount = 0;
          visited.clear(); lastVisitedSize = 0; noProgressCount = 0;
          continue;
        }
        // スクロール切れ → 壁を掘って脱出
        const randomDir = ALL_DIRS[Math.floor(Math.random() * ALL_DIRS.length)];
        state = await sendCommand({ type: CMD.TUNNEL, direction: randomDir });
      } else {
        // 全タイル訪問済 → 降下
        const downStair = findTile(tiles, FEAT.DOWN_STAIR);
        if (downStair) {
          const onStair = tiles.find((t: any) => t.x === px && t.y === py && t.feat === FEAT.DOWN_STAIR);
          if (onStair) {
            addLesson(state.turn, state.depth, "探索完了降下", `全タイル訪問。降下`);
            state = await sendCommand({ type: CMD.GO_DOWN });
            visited.clear(); lastVisitedSize = 0; noProgressCount = 0; stuckCount = 0;
            killsThisLevel = 0; levelEntryTurn = state.turn; explorationRateWindow = []; levelEntryDetected = false; unreachableItems.clear();
            teleportLoopCount = 0; lastTeleportArea = "";
            if (state.depth > maxDepthReached) maxDepthReached = state.depth;
            continue;
          }
          const nextDir = bfsNextStep(tiles, px, py, downStair.x, downStair.y);
          if (nextDir !== null) {
            state = await sendCommand({ type: CMD.WALK, direction: nextDir });
            continue;
          }
        }
        // フォールバック: ランダムWALK
        state = await sendCommand({ type: CMD.WALK, direction: ALL_DIRS[Math.floor(Math.random() * ALL_DIRS.length)] });
      }
    }

    // === レベルアップ検知 ===
    if (p.level > maxLevelReached) {
      maxLevelReached = p.level;
      addLesson(state.turn, state.depth, "レベルアップ",
        `CL${maxLevelReached}到達。HP${p.maxHp}、AC${p.ac}、EXP${p.exp}`);
    }

    // (ログは先頭で出力済み)
  }

  // === ゲーム終了 ===
  const finalState = await getState();
  const fp = finalState.player;

  if (finalState.dead) {
    // 死因分析
    const lastMsgs = finalState.messages;
    deathCause = lastMsgs.find((m: string) => m.includes("killed") || m.includes("die")) || "不明";
    addLesson(finalState.turn, finalState.depth, "死亡",
      `DL${finalState.depth}でCL${fp.level}が死亡。HP${fp.hp}/${fp.maxHp}。死因: ${deathCause}`);
  }

  console.log("\n=== 武将AI プレイ結果 ===");
  console.log(`  最終Turn: ${finalState.turn}`);
  console.log(`  最深部: DL${maxDepthReached}`);
  console.log(`  最高レベル: CL${maxLevelReached}`);
  console.log(`  総撃破数: ${totalKills}`);
  console.log(`  回復薬使用: ${healingsUsed}`);
  console.log(`  逃走回数: ${fleeAttempts}`);
  console.log(`  スペル使用: ${spellsUsed}`);
  console.log(`  スペル学習: ${spellsLearned}`);
  console.log(`  種族/職業: ${fp.race}/${fp.class}`);
  console.log(`  死亡: ${finalState.dead ? `はい (${deathCause})` : "いいえ"}`);
  console.log(`  行動回数: ${actionCount}`);

  // 最終フレーム + 録画保存
  recordFrame(finalState, finalState.dead ? `死亡: ${deathCause}` : "生存");
  await flushRecording();

  // === 学習記録をJSON出力 ===
  const report = {
    summary: {
      finalTurn: finalState.turn,
      maxDepth: maxDepthReached,
      maxLevel: maxLevelReached,
      totalKills,
      healingsUsed,
      fleeAttempts,
      spellsUsed,
      spellsLearned,
      race: fp.race,
      class: fp.class,
      dead: finalState.dead,
      deathCause,
      actions: actionCount,
    },
    lessons,
    tactics: extractTactics(),
  };

  const reportPath = "/tmp/busho-play-report.json";
  const fs = await import("node:fs");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n  レポート保存: ${reportPath}`);

  return report;
}

function extractTactics(): Record<string, string> {
  return {
    "survival_priority": "HP30%以下で即座に回復。回復薬がなければ逃走。生存が最優先",
    "healing_strategy": "緊急時は最強の回復薬、戦術的回復時は最弱の回復薬を使用。資源節約",
    "combat_approach": "隣接敵は最弱から倒す。3体以上に囲まれたら逃走。危険敵(Lv2x以上,速度120超)は接近前に回避",
    "descent_conditions": "HP70%+回復薬+逃走手段+CL/DL比率チェック。無謀な降下は死因の上位",
    "exploration_pattern": "未踏地を優先して移動。スタック検知でランダム方向転換",
    "food_management": "food < 2000で即食事。飢餓はHP回復を阻害し間接的な死因になる",
    "flee_decision": "HP危険域+回復不能=Phase Door。さらに危険ならTeleportation。危険敵はdist3で先制逃走",
    "rest_vs_potion": "敵なし+HP50%以下→REST。敵あり+HP低→回復薬。状況で使い分け",
    "spell_priority": "回復スペル→薬温存。逃走スペル→スクロール温存。攻撃スペル→隣接敵に使用。検知→新フロア到着時",
    "spell_learning": "優先順: 回復 > 逃走 > 検知 > バフ > 攻撃。新枠があれば即学習",
    "equipment_scoring": "耐性(base4=+15,高級=+8),フラグ(FREE_ACT+15,SEE_INVIS+12,TELEPATHY+20),SPEED修正(+20/pt)",
    "threat_assessment": "Lv>2xPL or spd>120+LvOverPL → 危険判定。接近前にPhase/Teleportで回避",
  };
}

// ── 実行 ──
playGame().catch(console.error);
