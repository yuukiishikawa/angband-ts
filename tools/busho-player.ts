#!/usr/bin/env npx tsx
/**
 * @file busho-player.ts
 * @brief 武将AIプレイヤー — ai-server経由でAngbandを自律プレイする
 *
 * 学習した戦術をログに記録し、スキルとして保存可能にする。
 */

const API = "http://localhost:3000";

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
const FEAT = { FLOOR: 1, CLOSED_DOOR: 2, OPEN_DOOR: 3, UP_STAIR: 5, DOWN_STAIR: 6 };
const PASSABLE_FEATS = new Set([FEAT.FLOOR, FEAT.OPEN_DOOR, FEAT.UP_STAIR, FEAT.DOWN_STAIR]);

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
function monsterThreat(mon: { level: number; speed: number; hp: number; maxhp: number }, playerLevel: number): number {
  // 高い値 = 危険
  let threat = mon.level;
  if (mon.speed > 110) threat += (mon.speed - 110) * 3; // 速い敵は非常に危険
  if (mon.level > playerLevel * 2) threat += 20; // レベル差が大きい
  if (mon.level > playerLevel * 3) threat += 30; // 極端なレベル差
  return threat;
}

function isDangerousMonster(mon: { level: number; speed: number; hp: number; maxhp: number; name: string }, playerLevel: number, depth: number): boolean {
  // 低レベルでは脅威判定を緩和 (CL5未満は基本的に戦う)
  if (playerLevel < 5) {
    // CL5未満は本当に強い敵だけ避ける
    if (mon.level > playerLevel * 4 && mon.level >= 10) return true;
    if (mon.speed >= 130 && mon.level > playerLevel * 2) return true;
    return false;
  }
  // ユニークモンスター名パターン (大文字始まりで"the"なし)
  const isUnique = mon.name[0] === mon.name[0]?.toUpperCase() && !mon.name.startsWith("the ") && !mon.name.startsWith("a ");

  // DL15+ではより慎重に (閾値を引き下げ)
  if (depth >= 15) {
    if (isUnique && mon.level > playerLevel + 5) return true;  // +8→+5
    if (mon.speed > 120 && mon.level > playerLevel) return true;  // 高速+格上
    if (mon.level > playerLevel * 2.0 && mon.level >= 10) return true;  // 2.5→2.0
    return false;
  }

  if (isUnique && mon.level > playerLevel + 8) return true;
  if (mon.speed > 120 && mon.level > playerLevel + 3) return true;
  if (mon.level > playerLevel * 2.5 && mon.level >= 10) return true;
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
async function sendCommand(cmd: Record<string, unknown>): Promise<any> {
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
      await new Promise(r => setTimeout(r, 50));
      continue;
    }
    if (res.status !== 200) {
      console.log(`  [ERROR] ${res.status}: ${JSON.stringify(data)}`);
      // Return current state on error
      return await getState();
    }
    return data;
  }
  console.log(`  [ERROR] 5 retries failed for cmd: ${JSON.stringify(cmd)}`);
  return await getState();
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
let levelEntryDetected = false; // 各階で検知スペルを使ったか
const unreachableItems = new Set<string>(); // BFS到達不能なアイテムタイル
const fleeCountByMonster = new Map<string, number>(); // 敵名ごとの逃走回数

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

// ── 探索効率追跡 ──
let explorationRateWindow: number[] = []; // 直近の探索率（200アクション毎）

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

  // 深度別の最低撃破数（浅層は敵が少ないので緩和）
  function minKillsForDepth(depth: number): number {
    if (depth <= 1) return 0;  // DL0-1: 即降下OK
    if (depth <= 3) return 1;  // DL2-3: 1体
    if (depth <= 6) return 2;  // DL4-6: 2体 (3→2)
    if (depth <= 15) return 3; // DL7-15: 3体 (5→3)
    return 2;                  // DL16+: 2体 (深層は速やかに降下)
  }

  let lastKnownDepth = state.depth;

  // 初期フレーム録画
  recordFrame(state, "start");

  while (!state.dead && !state.won && state.turn < turnLimit && actionCount < 50000) {
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
      teleportLoopCount = 0; lastTeleportArea = ""; fleeCountByMonster.clear();
      if (state.depth > maxDepthReached) maxDepthReached = state.depth;
      lastKnownDepth = state.depth;

      // Fast return: if recalled to town (DL0) and maxDepth is deep, use WoR to jump back
      if (state.depth === 0 && maxDepthReached >= 5 && !(p.wordRecall > 0)) {
        const recallSlot = findRecallScroll(inv);
        if (recallSlot !== null) {
          addLesson(state.turn, state.depth, "WoR帰還",
            `町に帰還。WoRでDL${maxDepthReached}方面へ即帰還`);
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
    if (monsters.length >= 20) {
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
      console.log(`  [状態] A${actionCount} T${state.turn} | DL${state.depth} CL${p.level} | HP:${p.hp}/${p.maxHp}${spInfo} | pos:(${px},${py}) | K:${totalKills}(L${killsThisLevel}) | P${passableTiles}/U${unvisited}(${explorationPct}%) | mon:${monsters.length} food:${p.timed.food}${digInfo}${worInfo}${resInfo}`);
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

    // === 優先度2: 緊急回復+逃走 (深層は閾値引き上げ) ===
    const isVeryDeep = state.depth >= 15;
    const isDeep = state.depth >= 10;
    const emergencyHpThreshold = isVeryDeep ? 0.4 : isDeep ? 0.35 : 0.3;
    const fleeHpThreshold = isVeryDeep ? 0.55 : isDeep ? 0.5 : 0.3;

    // HP危険域 → 敵がいれば逃走優先、敵がいなければ回復
    if (hpPct < emergencyHpThreshold) {
      const nearbyEnemies = monsters.filter((m: any) => m.distance <= 3);

      // 敵がいる場合: 逃走 > 回復
      if (nearbyEnemies.length > 0 && hpPct < fleeHpThreshold) {
        // 逃走スペル (Phase Door/Teleport Self)
        if (canCastSpells) {
          const escSpell = findCastableSpell(spells, ESCAPE_SPELLS, p.level, sp);
          if (escSpell) {
            fleeAttempts++;
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
        const phaseSlot = findPhaseScroll(inv);
        if (phaseSlot !== null) {
          fleeAttempts++;
          addLesson(state.turn, state.depth, "早期逃走",
            `HP${Math.round(hpPct*100)}%、敵${nearbyEnemies.length}体(dist<=3)。DL${state.depth}では早期逃走`);
          state = await sendCommand({ type: CMD.READ, itemIndex: phaseSlot });
          continue;
        }
        const teleSlot = findTeleportScroll(inv);
        if (teleSlot !== null) {
          fleeAttempts++;
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

      // 回復薬なし → 逃走
      const phaseSlot = findPhaseScroll(inv);
      if (phaseSlot !== null && monsters.length > 0) {
        fleeAttempts++;
        addLesson(state.turn, state.depth, "逃走",
          `HP${Math.round(hpPct*100)}%、回復薬なし、敵${monsters.length}体。Phase Doorで退避`);
        state = await sendCommand({ type: CMD.READ, itemIndex: phaseSlot });
        continue;
      }
      const teleSlot2 = findTeleportScroll(inv);
      if (teleSlot2 !== null && monsters.length > 0) {
        fleeAttempts++;
        state = await sendCommand({ type: CMD.READ, itemIndex: teleSlot2 });
        stuckCount = 0; noProgressCount = 0;
        visited.clear(); lastVisitedSize = 0;
        continue;
      }
    }

    // === 優先度3: 戦術的回復 (HP低下 かつ敵なし) ===
    const tacticalHealThreshold = isVeryDeep ? 0.65 : 0.6;
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
      const healSlot = findHealingPotion(inv);
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

    // === 優先度3.6: 速度ポーション (危険敵接近時 or 多数敵) ===
    if (!(p.timed?.fast > 0)) {  // まだ加速されていない
      const nearEnemyCount = monsters.filter((m: any) => m.distance <= 3).length;
      const hasDangerNear = monsters.some((m: any) =>
        m.distance <= 5 && isDangerousMonster(m, p.level, state.depth)
      );
      if ((hasDangerNear || nearEnemyCount >= 3) && isDeep) {
        const speedSlot = findSpeedPotion(inv);
        if (speedSlot !== null) {
          addLesson(state.turn, state.depth, "加速",
            `危険な状況（敵${nearEnemyCount}体近接）。Speed potionで加速`);
          state = await sendCommand({ type: CMD.QUAFF, itemIndex: speedSlot });
          continue;
        }
      }
    }

    // === 優先度3.7: 危険モンスター回避 (隣接前に逃走判定) ===
    const dangerDetectRange = isVeryDeep ? 6 : 5;
    const dangerFleeRange = isVeryDeep ? 4 : 3;
    const nearDangerous = monsters.filter((m: any) =>
      m.distance <= dangerDetectRange && isDangerousMonster(m, p.level, state.depth)
    );
    if (nearDangerous.length > 0 && nearDangerous[0].distance <= dangerFleeRange) {
      const dangerMon = nearDangerous[0];
      const monFleeCount = fleeCountByMonster.get(dangerMon.name) || 0;
      fleeCountByMonster.set(dangerMon.name, monFleeCount + 1);

      // 同じ敵から3回以上逃走 → Phase Doorは無駄、Teleportation or 階段脱出
      const isPersistentChaser = monFleeCount >= 3;

      if (isPersistentChaser) {
        // 階段があれば即脱出 (フロア変更で確実に逃れる)
        const stairDown = findTile(tiles, FEAT.DOWN_STAIR);
        const onDownStair = tiles.find((t: any) => t.x === px && t.y === py && t.feat === FEAT.DOWN_STAIR);
        if (onDownStair) {
          fleeAttempts++;
          addLesson(state.turn, state.depth, "追跡者脱出",
            `${dangerMon.name}から${monFleeCount+1}回目の逃走。階段で別階へ脱出`);
          state = await sendCommand({ type: CMD.GO_DOWN });
          visited.clear(); lastVisitedSize = 0; noProgressCount = 0; stuckCount = 0;
          killsThisLevel = 0; levelEntryTurn = state.turn; explorationRateWindow = [];
          levelEntryDetected = false; unreachableItems.clear();
          teleportLoopCount = 0; lastTeleportArea = ""; fleeCountByMonster.clear();
          if (state.depth > maxDepthReached) maxDepthReached = state.depth;
          continue;
        }
        // WoR for persistent chasers at deep levels
        if (state.depth > 0 && !(p.wordRecall > 0)) {
          const recallSlot = findRecallScroll(inv);
          if (recallSlot !== null) {
            fleeAttempts++;
            addLesson(state.turn, state.depth, "追跡者脱出",
              `${dangerMon.name}から${monFleeCount+1}回目の逃走。WoRで帰還`);
            state = await sendCommand({ type: CMD.READ, itemIndex: recallSlot });
            continue;
          }
        }
        // Teleportation as fallback for persistent chasers
        const teleSlotChaser = findTeleportScroll(inv);
        if (teleSlotChaser !== null) {
          fleeAttempts++;
          addLesson(state.turn, state.depth, "追跡者脱出",
            `${dangerMon.name}(Lv${dangerMon.level})から${monFleeCount+1}回目。Teleportで脱出`);
          state = await sendCommand({ type: CMD.READ, itemIndex: teleSlotChaser });
          stuckCount = 0; noProgressCount = 0; visited.clear(); lastVisitedSize = 0;
          continue;
        }
      }

      // 通常の危険敵逃走
      if (canCastSpells) {
        const escSpell = findCastableSpell(spells, ESCAPE_SPELLS, p.level, sp);
        if (escSpell) {
          fleeAttempts++;
          spellsUsed++;
          addLesson(state.turn, state.depth, "危険敵回避",
            `${dangerMon.name}(Lv${dangerMon.level},spd${dangerMon.speed})接近。${escSpell.name}で退避`);
          state = await sendCommand({ type: CMD.CAST, spellIndex: escSpell.index, direction: 5 });
          if (escSpell.name.includes("Teleport")) { stuckCount = 0; noProgressCount = 0; }
          continue;
        }
      }
      const phaseSlot = findPhaseScroll(inv);
      if (phaseSlot !== null) {
        fleeAttempts++;
        addLesson(state.turn, state.depth, "危険敵回避",
          `${dangerMon.name}(Lv${dangerMon.level},spd${dangerMon.speed})接近。Phase Doorで退避`);
        state = await sendCommand({ type: CMD.READ, itemIndex: phaseSlot });
        continue;
      }
      const teleSlot = findTeleportScroll(inv);
      if (teleSlot !== null) {
        fleeAttempts++;
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
      // 複数の隣接敵 → 最弱を狙う
      const target = adjacentMonsters.sort((a: any, b: any) => a.hp - b.hp)[0];
      const dir = directionTo(px, py, target.x, target.y);

      // 敵が多い場合は逃走検討（2体+HP60%以下、または3体以上、または危険敵）
      const hasDangerousAdjacent = adjacentMonsters.some((m: any) => isDangerousMonster(m, p.level, state.depth));
      const shouldFlee = (adjacentMonsters.length >= 2 && hpPct < 0.6) || adjacentMonsters.length >= 3 || (hasDangerousAdjacent && hpPct < 0.7)
        || (isVeryDeep && adjacentMonsters.length >= 1 && hpPct < 0.4);  // DL15+: 1体でもHP40%以下なら逃走
      if (shouldFlee) {
        const phaseSlot = findPhaseScroll(inv);
        if (phaseSlot !== null) {
          fleeAttempts++;
          addLesson(state.turn, state.depth, "包囲逃走",
            `隣接敵${adjacentMonsters.length}体、HP${Math.round(hpPct*100)}%。包囲は危険、即逃走`);
          state = await sendCommand({ type: CMD.READ, itemIndex: phaseSlot });
          continue;
        }
        // Phase Doorなし → Teleportation (深層はより早く脱出)
        const teleFleePct = isVeryDeep ? 0.6 : 0.4;
        if (hpPct < teleFleePct) {
          const teleSlot = findTeleportScroll(inv);
          if (teleSlot !== null) {
            fleeAttempts++;
            addLesson(state.turn, state.depth, "緊急包囲脱出",
              `隣接敵${adjacentMonsters.length}体、HP${Math.round(hpPct*100)}%。Teleportで緊急脱出`);
            state = await sendCommand({ type: CMD.READ, itemIndex: teleSlot });
            stuckCount = 0; noProgressCount = 0;
            visited.clear(); lastVisitedSize = 0;
            continue;
          }
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

    // === 優先度5: 接近中の敵への対応 (BFS到達可能 + 安全な敵のみ) ===
    // noProgressCount高い時はスキップ (脱出を優先)
    const nearbyMonsters = monsters.filter((m: any) =>
      m.distance <= 6 && !isDangerousMonster(m, p.level, state.depth)
    );
    if (nearbyMonsters.length > 0 && stuckCount < 5 && noProgressCount < 50) {
      const closest = nearbyMonsters.sort((a: any, b: any) => a.distance - b.distance)[0];
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
    if (currentTile?.hasObj) {
      // フロアにアイテムあり → 拾う
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
        if (!currentEquip) {
          // 空スロット → 装備
          addLesson(state.turn, state.depth, "装備",
            `${invItem.name}を装備 (power=${invPower}, 空スロット)`);
          state = await sendCommand({ type: CMD.EQUIP, itemIndex: invItem.slot });
          continue;
        }
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
    const explorationStalled = explorationRateWindow.length >= 3 && (() => {
      if (turnsOnLevel < 1000) return false; // 最低1000ターンは探索する
      const last3 = explorationRateWindow.slice(-3);
      const change = Math.abs(last3[last3.length - 1]! - last3[0]!);
      return change <= 2 && last3[0]! >= 50; // 50%以上探索で停滞
    })();

    // If overleveled (CL >= DL*2), skip kill requirement — rush deeper
    const overleveled = p.level >= state.depth * 2 && state.depth > 0;

    // 長時間同じ階にいたら強制降下 — 深度でスケール
    const tooLongThreshold = overleveled ? 1000 :
      state.depth >= 20 ? 2000 :
      state.depth >= 10 ? 3000 :
      state.depth >= 5 ? 5000 : 8000;
    const tooLongOnLevel = turnsOnLevel > tooLongThreshold;

    // 深層では回復薬を十分持っていないと降下しない（ただし強制降下時は緩和）
    const minHealingForDescent = tooLongOnLevel ? 1 : (state.depth >= 15 ? 8 : state.depth >= 12 ? 5 : state.depth >= 8 ? 3 : 1);
    const healingOk = totalHealingQty >= minHealingForDescent;

    // 逃走手段チェック (深層では必須)
    const phaseCount = inv.filter((item: any) => item.tval === TVAL.SCROLL && item.name.includes("Phase Door") && item.qty > 0)
      .reduce((s: number, i: any) => s + i.qty, 0);
    const teleCount = inv.filter((item: any) => item.tval === TVAL.SCROLL && item.name.includes("Teleportation") && item.qty > 0)
      .reduce((s: number, i: any) => s + i.qty, 0);
    const minPhaseForEscape = state.depth >= 15 ? 5 : 3;
    const hasEscapeMeans = phaseCount >= minPhaseForEscape || teleCount >= 2 ||
      (canCastSpells && findCastableSpell(spells, ESCAPE_SPELLS, p.level, sp) !== null);
    const escapeOk = state.depth < 8 || hasEscapeMeans || tooLongOnLevel;

    // CLが低すぎる場合は降下を控える (DLとCLの乖離チェック)
    const clOk = p.level >= Math.floor(state.depth * 0.6) || state.depth <= 2 || tooLongOnLevel;

    const readyToDescend = hpPct >= 0.7 && healingOk && escapeOk && clOk && (enoughKills || explorationStalled || tooLongOnLevel || overleveled);

    if (readyToDescend) {
      const downStair = findTile(tiles, FEAT.DOWN_STAIR);
      if (downStair) {
        const onStair = tiles.find((t: any) => t.x === px && t.y === py && t.feat === FEAT.DOWN_STAIR);
        if (onStair) {
          addLesson(state.turn, state.depth, "降下",
            `DL${state.depth}→DL${state.depth+1}。HP${Math.round(hpPct*100)}%、撃破${killsThisLevel}体。条件満たして降下`);
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
          // 階段がBFS到達不能 → テレポートで近くへ、なければ直進
          if (tooLongOnLevel || overleveled) {
            const teleSlot = findTeleportScroll(inv);
            if (teleSlot !== null) {
              addLesson(state.turn, state.depth, "降下テレポート",
                `階段到達不能+長期滞在${turnsOnLevel}T。テレポートで再配置`);
              state = await sendCommand({ type: CMD.READ, itemIndex: teleSlot });
              stuckCount = 0; noProgressCount = 0;
              continue;
            }
            // テレポートなし → 階段方向へ直進 (壁があればTUNNEL)
            const stairDir = directionTo(px, py, downStair.x, downStair.y);
            const [sdx, sdy] = dirOffsets[stairDir] ?? [0, 0];
            const stairPathTile = tiles.find((t: any) => t.x === px + sdx && t.y === py + sdy);
            if (stairPathTile && PASSABLE_FEATS.has(stairPathTile.feat)) {
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
