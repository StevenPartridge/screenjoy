import type { DetailedHTMLProps, HTMLAttributes } from "react";
import type { GameOfLifeSeedChangeDetail } from "@screenjoy/game-of-life/element";
import type { PipesSeedChangeDetail } from "@screenjoy/pipes/element";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "star-liner": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        seed?: string | number;
        speed?: string | number;
        mode?: "cruise" | "ftl";
        fps?: string | number;
        paused?: boolean | string;
        motion?: "allow";
      };
      "pocket-golf": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        seed?: string | number;
        "hole-index"?: number | string;
        fps?: number | string;
        paused?: boolean | string;
        motion?: "allow";
        review?: boolean | string;
        "show-route"?: boolean | string;
      };
      "game-of-life": DetailedHTMLProps<
        HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        seed?: number | string;
        speed?: number | string;
        density?: number | string;
        onseedchange?: (
          event: CustomEvent<GameOfLifeSeedChangeDetail>
        ) => void;
        fps?: number | string;
        paused?: boolean | string;
        motion?: "allow";
      };
      "code-rain": DetailedHTMLProps<
        HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        seed?: number | string;
        speed?: number | string;
        density?: number | string;
        fps?: number | string;
        paused?: boolean | string;
        motion?: "allow";
      };
      "brick-maze": DetailedHTMLProps<
        HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        seed?: number | string;
        speed?: number | string;
        fps?: number | string;
        paused?: boolean | string;
        motion?: "allow";
      };
      "pipes-saver": DetailedHTMLProps<
        HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        seed?: number | string;
        speed?: number | string;
        density?: number | string;
        mode?: "classic" | "single";
        onseedchange?: (
          event: CustomEvent<PipesSeedChangeDetail>
        ) => void;
        fps?: number | string;
        paused?: boolean | string;
        motion?: "allow";
      };
      "fish-tank": DetailedHTMLProps<
        HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        seed?: number | string;
        speed?: number | string;
        population?: number | string;
        fps?: number | string;
        paused?: boolean | string;
        motion?: "allow";
      };
      "downhill-ski": DetailedHTMLProps<
        HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        seed?: number | string;
        speed?: number | string;
        mode?: "free-ride" | "slalom" | "freestyle" | "tree-slalom";
        fps?: number | string;
        paused?: boolean | string;
        motion?: "allow";
      };
      "fractal-generator": DetailedHTMLProps<
        HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        seed?: number | string;
        speed?: number | string;
        mode?: "mandelbrot" | "julia" | "burning-ship";
        fps?: number | string;
        paused?: boolean | string;
        motion?: "allow";
      };
    }
  }
}
