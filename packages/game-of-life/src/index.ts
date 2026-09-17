export {
  GameOfLifeElement,
  lifeStateKey,
  registerGameOfLife,
  stepLifeGrid,
} from "./game-of-life.js";
export type {
  GameOfLifeSeedChangeDetail,
  LifeStep,
} from "./game-of-life.js";

import { registerGameOfLife } from "./game-of-life.js";

registerGameOfLife();
