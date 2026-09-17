import {
  CanvasSaverElement,
  clamp,
  createRandom,
  seedFrom,
} from "@screenjoy/runtime";

type Point = { x: number; y: number };

const TAG_NAME = "brick-maze";
const MAZE_SIZE = 21;
const DIRECTIONS: Point[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];

function createMaze(random: () => number) {
  const grid = Array.from({ length: MAZE_SIZE }, () =>
    Array<number>(MAZE_SIZE).fill(1),
  );
  const stack: Point[] = [{ x: 1, y: 1 }];
  grid[1][1] = 0;

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const candidates = DIRECTIONS.map((direction) => ({
      x: current.x + direction.x * 2,
      y: current.y + direction.y * 2,
      direction,
    })).filter(
      ({ x, y }) =>
        x > 0 &&
        y > 0 &&
        x < MAZE_SIZE - 1 &&
        y < MAZE_SIZE - 1 &&
        grid[y][x] === 1,
    );

    if (candidates.length === 0) {
      stack.pop();
      continue;
    }

    const next = candidates[Math.floor(random() * candidates.length)];
    grid[current.y + next.direction.y][current.x + next.direction.x] = 0;
    grid[next.y][next.x] = 0;
    stack.push({ x: next.x, y: next.y });
  }

  return grid;
}

function setPixel(
  pixels: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  red: number,
  green: number,
  blue: number,
) {
  const offset = (y * width + x) * 4;
  pixels[offset] = red;
  pixels[offset + 1] = green;
  pixels[offset + 2] = blue;
  pixels[offset + 3] = 255;
}

function angleDelta(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

export class BrickMazeElement extends CanvasSaverElement {
  static observedAttributes = [
    ...CanvasSaverElement.observedAttributes,
    "seed",
    "speed",
  ];

  private imageData: ImageData;
  private pixels: Uint8ClampedArray;
  private grid: number[][] = [];
  private random = createRandom(1);
  private camera = {
    x: 1.5,
    y: 1.5,
    angle: 0,
    cellX: 1,
    cellY: 1,
    heading: 0,
    targetAngle: 0,
    progress: 0,
    phase: "move" as "move" | "turn",
  };

  constructor() {
    super();
    this.canvas.style.imageRendering = "pixelated";
    this.context.imageSmoothingEnabled = false;
    this.imageData = this.context.createImageData(
      this.canvasWidth,
      this.canvasHeight,
    );
    this.pixels = this.imageData.data;
  }

  regenerate(seed?: string | number) {
    if (seed !== undefined) {
      this.setAttribute("seed", String(seed));
    } else {
      this.setAttribute("seed", String(Math.floor(Math.random() * 99999)));
    }
  }

  get speed(): number {
    return clamp(Number(this.getAttribute("speed") ?? 0.9) || 0.9, 0.15, 2.5);
  }

  set speed(value: number | string | null | undefined) {
    if (value === null || value === undefined || value === "") {
      this.removeAttribute("speed");
      return;
    }
    this.setAttribute("speed", String(clamp(Number(value) || 0.9, 0.15, 2.5)));
  }

  protected get fullscreenPixelBudget() {
    return null;
  }

  protected resetScene() {
    const seed = seedFrom(this.getAttribute("seed") ?? "1995");
    this.random = createRandom(seed);
    this.grid = createMaze(this.random);
    this.camera = {
      x: 1.5,
      y: 1.5,
      angle: 0,
      cellX: 1,
      cellY: 1,
      heading: 0,
      targetAngle: 0,
      progress: 0,
      phase: "move",
    };
    const openDirection = DIRECTIONS.findIndex(
      (direction) => this.grid[1 + direction.y]?.[1 + direction.x] === 0,
    );
    this.camera.heading = Math.max(openDirection, 0);
    this.camera.angle = this.camera.heading * (Math.PI / 2);
    this.camera.targetAngle = this.camera.angle;
  }

  protected attributeDidChange(name: string) {
    if (name === "seed") this.resetScene();
  }

  protected canvasDidResize() {
    this.context.imageSmoothingEnabled = false;
    this.imageData = this.context.createImageData(
      this.canvasWidth,
      this.canvasHeight,
    );
    this.pixels = this.imageData.data;
  }

  private chooseDirection() {
    const reverse = (this.camera.heading + 2) % 4;
    let choices = DIRECTIONS.map((direction, heading) => ({ direction, heading }))
      .filter(
        ({ direction }) =>
          this.grid[this.camera.cellY + direction.y]?.[
            this.camera.cellX + direction.x
          ] === 0,
      );

    if (choices.length > 1) {
      choices = choices.filter(({ heading }) => heading !== reverse);
    }

    const straight = choices.find(
      ({ heading }) => heading === this.camera.heading,
    );
    const weighted = straight ? [...choices, straight, straight] : choices;
    return weighted[Math.floor(this.random() * weighted.length)]?.heading ?? reverse;
  }

  protected updateFrame(deltaSeconds: number) {
    const camera = this.camera;

    if (camera.phase === "turn") {
      const difference = angleDelta(camera.angle, camera.targetAngle);
      const step = deltaSeconds * (2.4 + this.speed * 0.7);
      if (Math.abs(difference) <= step) {
        camera.angle = camera.targetAngle;
        camera.phase = "move";
        camera.progress = 0;
      } else {
        camera.angle += Math.sign(difference) * step;
      }
      return;
    }

    camera.progress += deltaSeconds * this.speed;
    while (camera.progress >= 1) {
      const direction = DIRECTIONS[camera.heading];
      camera.cellX += direction.x;
      camera.cellY += direction.y;
      camera.x = camera.cellX + 0.5;
      camera.y = camera.cellY + 0.5;
      camera.progress -= 1;
      const nextHeading = this.chooseDirection();

      if (nextHeading === camera.heading) continue;

      camera.heading = nextHeading;
      camera.targetAngle = nextHeading * (Math.PI / 2);
      camera.phase = "turn";
      camera.progress = 0;
      return;
    }

    const direction = DIRECTIONS[camera.heading];
    camera.x = camera.cellX + 0.5 + direction.x * camera.progress;
    camera.y = camera.cellY + 0.5 + direction.y * camera.progress;
  }

  private paintFloorAndCeiling() {
      const width = this.canvas.width;
      const height = this.canvas.height;
      const half = Math.floor(height / 2);
      const directionX = Math.cos(this.camera.angle);
      const directionY = Math.sin(this.camera.angle);
      const planeX = -directionY * 0.66;
      const planeY = directionX * 0.66;
      const leftX = directionX - planeX;
      const leftY = directionY - planeY;
      const rightX = directionX + planeX;
      const rightY = directionY + planeY;

      for (let y = 0; y < height; y += 1) {
        const distanceFromCenter = Math.max(1, Math.abs(y - half));
        const rowDistance = (height * 0.52) / distanceFromCenter;
        const stepX = (rowDistance * (rightX - leftX)) / width;
        const stepY = (rowDistance * (rightY - leftY)) / width;
        let worldX = this.camera.x + rowDistance * leftX;
        let worldY = this.camera.y + rowDistance * leftY;
        const isFloor = y >= half;

        for (let x = 0; x < width; x += 1) {
          const tileX = Math.floor(worldX * (isFloor ? 3 : 2));
          const tileY = Math.floor(worldY * (isFloor ? 3 : 2));
          const fractionX = ((worldX % 1) + 1) % 1;
          const fractionY = ((worldY % 1) + 1) % 1;
          const edge =
            fractionX < 0.02 ||
            fractionY < 0.02 ||
            fractionX > 0.98 ||
            fractionY > 0.98;
          const noise = ((tileX * 13) ^ (tileY * 29) ^ (x * 3 + y)) & 7;
          const fog = clamp(1 - rowDistance / 15, 0.22, 1);
          let base: number;

          if (isFloor) {
            const checker = (tileX + tileY) & 1;
            const tileBase = checker ? 104 : 87;
            base = edge ? Math.round(tileBase * 0.86) : tileBase;
            setPixel(
              this.pixels,
              width,
              x,
              y,
              (base + noise) * fog,
              (base + noise - 3) * fog,
              (base + noise - 8) * fog,
            );
          } else {
            base = edge ? 60 : 72 + noise;
            setPixel(
              this.pixels,
              width,
              x,
              y,
              base * fog,
              (base + 2) * fog,
              (base + 1) * fog,
            );
          }

          worldX += stepX;
          worldY += stepY;
        }
      }
    }

    private paintWalls() {
      const width = this.canvas.width;
      const height = this.canvas.height;
      const directionX = Math.cos(this.camera.angle);
      const directionY = Math.sin(this.camera.angle);
      const planeX = -directionY * 0.66;
      const planeY = directionX * 0.66;

      for (let screenX = 0; screenX < width; screenX += 1) {
        const cameraX = (2 * screenX) / width - 1;
        const rayX = directionX + planeX * cameraX;
        const rayY = directionY + planeY * cameraX;
        let mapX = Math.floor(this.camera.x);
        let mapY = Math.floor(this.camera.y);
        const deltaX = Math.abs(1 / (rayX || 0.00001));
        const deltaY = Math.abs(1 / (rayY || 0.00001));
        const stepX = rayX < 0 ? -1 : 1;
        const stepY = rayY < 0 ? -1 : 1;
        let sideDistanceX =
          rayX < 0
            ? (this.camera.x - mapX) * deltaX
            : (mapX + 1 - this.camera.x) * deltaX;
        let sideDistanceY =
          rayY < 0
            ? (this.camera.y - mapY) * deltaY
            : (mapY + 1 - this.camera.y) * deltaY;
        let side = 0;

        for (let depth = 0; depth < 64; depth += 1) {
          if (sideDistanceX < sideDistanceY) {
            sideDistanceX += deltaX;
            mapX += stepX;
            side = 0;
          } else {
            sideDistanceY += deltaY;
            mapY += stepY;
            side = 1;
          }
          if (this.grid[mapY]?.[mapX] !== 0) break;
        }

        const distance =
          side === 0
            ? (mapX - this.camera.x + (1 - stepX) / 2) / rayX
            : (mapY - this.camera.y + (1 - stepY) / 2) / rayY;
        const safeDistance = Math.max(0.05, distance);
        const wallHeight = Math.floor(height / safeDistance);
        const start = Math.max(0, Math.floor((height - wallHeight) / 2));
        const end = Math.min(height - 1, Math.floor((height + wallHeight) / 2));
        let hit =
          side === 0
            ? this.camera.y + safeDistance * rayY
            : this.camera.x + safeDistance * rayX;
        hit -= Math.floor(hit);
        let textureX = Math.floor(hit * 64);
        if ((side === 0 && rayX > 0) || (side === 1 && rayY < 0)) {
          textureX = 63 - textureX;
        }

        const fog = clamp(1 - safeDistance / 12, 0.18, 1);
        const sideShade = side === 1 ? 0.7 : 1;

        for (let screenY = start; screenY <= end; screenY += 1) {
          const textureY = Math.floor(
            ((screenY - (height - wallHeight) / 2) / wallHeight) * 64,
          );
          const brickRow = Math.floor(textureY / 8);
          const staggeredX = (textureX + (brickRow % 2) * 8) % 16;
          const mortar = textureY % 8 <= 1 || staggeredX <= 1;
          const grain = ((textureX * 17) ^ (textureY * 11) ^ brickRow) & 11;
          const scanline = screenY % 2 === 0 ? 0.96 : 1;
          const shade = fog * sideShade * scanline;

          if (mortar) {
            const mortarBase = 124 + grain;
            setPixel(
              this.pixels,
              width,
              screenX,
              screenY,
              mortarBase * shade,
              (mortarBase - 5) * shade,
              (mortarBase - 12) * shade,
            );
          } else {
            setPixel(
              this.pixels,
              width,
              screenX,
              screenY,
              (137 + grain) * shade,
              (52 + grain * 0.45) * shade,
              (34 + grain * 0.25) * shade,
            );
          }
        }
      }
    }

    protected drawFrame() {
      if (this.grid.length === 0) return;
      this.paintFloorAndCeiling();
      this.paintWalls();
      this.context.putImageData(this.imageData, 0, 0);
    }
}

export function registerBrickMaze() {
  if (
    typeof window === "undefined" ||
    typeof customElements === "undefined" ||
    customElements.get(TAG_NAME)
  ) {
    return;
  }
  customElements.define(TAG_NAME, BrickMazeElement);
}

declare global {
  interface HTMLElementTagNameMap {
    "brick-maze": BrickMazeElement;
  }
}
