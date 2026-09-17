export {
  FractalGeneratorElement,
  registerFractalGenerator,
} from "./fractal-generator.js";
export type { FractalMode } from "./fractal-generator.js";

import { registerFractalGenerator } from "./fractal-generator.js";

registerFractalGenerator();
