/**
 * @file z/index.ts
 * @brief Z-layer barrel export
 *
 * The Z-layer provides all low-level utilities with no external dependencies:
 * RNG, bitflags, dice, colors, coordinates, queues, string interning, expressions.
 */

export {
  RNG,
  type RandomValue,
  type RandomChance,
  Aspect,
  MAX_RAND_DEPTH,
  randomValue,
  damcalc,
  mBonus,
  mBonusCalc,
  randcalc,
  randcalcValid,
  randcalcVaries,
  randomChanceCheck,
  randomChanceScaled,
} from "./rand.js";

export { BitFlag, FLAG_END, flagSize } from "./bitflag.js";

export { Dice } from "./dice.js";

export {
  Expression,
  ExpressionError,
  type BaseValueFn,
} from "./expression.js";

export {
  COLOUR_DARK,
  COLOUR_WHITE,
  COLOUR_SLATE,
  COLOUR_ORANGE,
  COLOUR_RED,
  COLOUR_GREEN,
  COLOUR_BLUE,
  COLOUR_UMBER,
  COLOUR_L_DARK,
  COLOUR_L_WHITE,
  COLOUR_L_PURPLE,
  COLOUR_YELLOW,
  COLOUR_L_RED,
  COLOUR_L_GREEN,
  COLOUR_L_BLUE,
  COLOUR_L_UMBER,
  COLOUR_PURPLE,
  COLOUR_VIOLET,
  COLOUR_TEAL,
  COLOUR_MUD,
  COLOUR_L_YELLOW,
  COLOUR_MAGENTA,
  COLOUR_L_TEAL,
  COLOUR_L_VIOLET,
  COLOUR_L_PINK,
  COLOUR_MUSTARD,
  COLOUR_BLUE_SLATE,
  COLOUR_DEEP_L_BLUE,
  COLOUR_SHADE,
  MAX_COLORS,
  BASIC_COLORS,
  ATTR_FULL,
  ATTR_MONO,
  ATTR_VGA,
  ATTR_BLIND,
  ATTR_LIGHT,
  ATTR_DARK,
  ATTR_HIGH,
  ATTR_METAL,
  ATTR_MISC,
  MAX_ATTR,
  type ColorType,
  angbandColorTable,
  colorTable,
  colorCharToAttr,
  colorTextToAttr,
  attrToText,
  getColor,
  gammaTable,
  buildGammaTable,
} from "./color.js";

export {
  type Loc,
  loc,
  locEq,
  locIsZero,
  locSum,
  locDiff,
  locOffset,
  randLoc,
  PointSet,
  type Grouper,
} from "./type.js";

export { Queue, PriorityQueue } from "./queue.js";

export { QuarkStore, type QuarkId } from "./quark.js";
