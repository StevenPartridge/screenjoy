import {
  SaverElement,
  clamp,
  createRandom,
  seedFrom,
} from "@screenjoy/runtime";

export type FractalMode = "mandelbrot" | "julia" | "burning-ship";

type Point = { x: number; y: number };

const TAG_NAME = "fractal-generator";
const MODES: FractalMode[] = ["mandelbrot", "julia", "burning-ship"];
const MANDELBROT_FOCI: Point[] = [
  { x: -0.743643887, y: 0.131825904 },
  { x: -0.7453, y: 0.1127 },
  { x: -0.16, y: 1.0405 },
  { x: -1.25066, y: 0.02012 },
  { x: -0.1011, y: 0.9563 },
];
const BURNING_SHIP_FOCI: Point[] = [
  { x: -1.861, y: -0.038 },
  { x: -1.768, y: -0.004 },
  { x: -1.755, y: -0.027 },
  { x: -1.87, y: -0.02 },
];

const VERTEX_SHADER = `
  attribute vec2 a_position;

  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  precision highp float;

  uniform vec2 u_resolution;
  uniform vec2 u_center;
  uniform vec2 u_julia;
  uniform float u_zoom;
  uniform float u_rotation;
  uniform float u_palette;
  uniform float u_mode;

  vec3 palette(float t) {
    vec3 phase = vec3(0.02, 0.31, 0.67) + u_palette;
    vec3 wave = 0.5 + 0.5 * cos(6.2831853 * (phase + t));
    vec3 ink = vec3(0.012, 0.018, 0.055);
    return mix(ink, wave, 0.92);
  }

  void main() {
    vec2 point = (gl_FragCoord.xy / u_resolution - 0.5) * 2.0;
    point.x *= u_resolution.x / u_resolution.y;

    float cosine = cos(u_rotation);
    float sine = sin(u_rotation);
    point = mat2(cosine, -sine, sine, cosine) * point;
    point = u_center + point * u_zoom;

    vec2 z = u_mode > 0.5 && u_mode < 1.5 ? point : vec2(0.0);
    vec2 c = u_mode > 0.5 && u_mode < 1.5 ? u_julia : point;
    float escapedAt = 0.0;
    float magnitudeSquared = 0.0;

    for (int iteration = 0; iteration < 180; iteration++) {
      if (u_mode > 1.5) {
        z = abs(z);
      }

      z = vec2(
        z.x * z.x - z.y * z.y,
        2.0 * z.x * z.y
      ) + c;
      magnitudeSquared = dot(z, z);

      if (magnitudeSquared > 256.0) {
        escapedAt = float(iteration) + 1.0 -
          log2(log2(max(magnitudeSquared, 1.0001))) * 0.5;
        break;
      }
    }

    vec3 color;
    if (escapedAt == 0.0) {
      float glow = 0.018 + 0.025 * exp(-length(point - u_center) * 1.8);
      color = vec3(glow * 0.55, glow * 0.7, glow * 1.35);
    } else {
      float bands = escapedAt * 0.024 + log2(1.0 / max(u_zoom, 0.0001)) * 0.055;
      color = palette(bands);
      color *= 0.62 + 0.48 * smoothstep(0.0, 18.0, escapedAt);
    }

    vec2 edge = gl_FragCoord.xy / u_resolution - 0.5;
    float vignette = 1.0 - 0.42 * dot(edge, edge);
    float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    color = max(vec3(0.0), color * vignette + (grain - 0.5) * 0.018);
    gl_FragColor = vec4(pow(color, vec3(0.88)), 1.0);
  }
`;

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (!vertex || !fragment) {
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
    return null;
  }

  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    return null;
  }

  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

export class FractalGeneratorElement extends SaverElement {
  static observedAttributes = [
    ...SaverElement.observedAttributes,
    "seed",
    "speed",
    "mode",
  ];

  private gl: WebGLRenderingContext | null;
  private fallback: CanvasRenderingContext2D | null = null;
  private program: WebGLProgram | null = null;
  private buffer: WebGLBuffer | null = null;
  private elapsed = 0;
  private phase = 0;
  private center: Point = { x: -0.743643887, y: 0.131825904 };
  private palette = 0;
  private juliaBase: Point = { x: -0.78, y: 0.136 };

  constructor() {
    super();
    this.gl = this.canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    });
    if (!this.gl) {
      this.fallback = this.canvas.getContext("2d", { alpha: false });
    }
  }

  regenerate(seed?: string | number) {
    this.setAttribute(
      "seed",
      String(seed ?? Math.floor(Math.random() * 999999)),
    );
  }

  get speed(): number {
    return clamp(Number(this.getAttribute("speed") ?? 0.65) || 0.65, 0.1, 2.5);
  }

  set speed(value: number | string | null | undefined) {
    if (value === null || value === undefined || value === "") {
      this.removeAttribute("speed");
      return;
    }
    this.setAttribute("speed", String(clamp(Number(value) || 0.65, 0.1, 2.5)));
  }

  get mode(): FractalMode {
    const value = this.getAttribute("mode");
    return MODES.includes(value as FractalMode)
      ? (value as FractalMode)
      : "mandelbrot";
  }

  set mode(value: FractalMode | string | null | undefined) {
    if (value === null || value === undefined || value === "") {
      this.removeAttribute("mode");
      return;
    }
    this.setAttribute(
      "mode",
      MODES.includes(value as FractalMode) ? value : "mandelbrot",
    );
  }

  protected get resolutionScale() {
    return 0.82;
  }

  protected get maxCanvasWidth() {
    return 720;
  }

  protected get maxCanvasHeight() {
    return 480;
  }

  protected get fullscreenFpsCap() {
    return 12;
  }

  protected elementDidConnect() {
    this.canvas.addEventListener("webglcontextlost", this.handleContextLost);
    this.canvas.addEventListener(
      "webglcontextrestored",
      this.handleContextRestored,
    );
    this.initializeRenderer();
    if (!this.gl) this.setAnimationSettled(true);
  }

  protected elementDidDisconnect() {
    this.canvas.removeEventListener("webglcontextlost", this.handleContextLost);
    this.canvas.removeEventListener(
      "webglcontextrestored",
      this.handleContextRestored,
    );
    this.releaseRenderer();
  }

  protected resetScene() {
    const random = createRandom(seedFrom(this.getAttribute("seed") ?? "314159"));
    const focusList =
      this.mode === "burning-ship" ? BURNING_SHIP_FOCI : MANDELBROT_FOCI;
    const focus = focusList[Math.floor(random() * focusList.length)];
    this.center = {
      x: focus.x + (random() - 0.5) * 0.002,
      y: focus.y + (random() - 0.5) * 0.002,
    };
    this.palette = random();
    this.phase = random() * Math.PI * 2;
    this.juliaBase = {
      x: -0.82 + random() * 0.19,
      y: 0.09 + random() * 0.2,
    };
    this.elapsed = 0;
  }

  protected attributeDidChange(name: string) {
    if (name === "seed" || name === "mode") this.resetScene();
  }

  protected updateFrame(deltaSeconds: number) {
    this.elapsed += deltaSeconds * this.speed;
  }

  protected canvasDidResize() {
    this.gl?.viewport(0, 0, this.canvasWidth, this.canvasHeight);
  }

  protected drawFrame() {
    if (!this.gl || !this.program || !this.buffer) {
      this.drawFallback();
      return;
    }

    const gl = this.gl;
    const modeIndex = MODES.indexOf(this.mode);
    const time = this.elapsed + this.phase;
    const pulse = 0.5 - 0.5 * Math.cos(time * 0.34);
    const easedPulse = pulse * pulse * (3 - 2 * pulse);
    const zoom =
      modeIndex === 1
        ? 1.48 + Math.sin(time * 0.21) * 0.18
        : 1.28 * Math.pow(0.025, easedPulse);
    const driftScale = modeIndex === 1 ? 0 : zoom * 0.028;
    const centerX =
      modeIndex === 1 ? 0 : this.center.x + Math.sin(time * 0.17) * driftScale;
    const centerY =
      modeIndex === 1
        ? 0
        : this.center.y + Math.cos(time * 0.13) * driftScale;
    const juliaX = this.juliaBase.x + Math.sin(time * 0.11) * 0.065;
    const juliaY =
      this.juliaBase.y * Math.cos(time * 0.09) +
      Math.sin(time * 0.07) * 0.055;

    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    const position = gl.getAttribLocation(this.program, "a_position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    gl.uniform2f(
      gl.getUniformLocation(this.program, "u_resolution"),
      this.canvasWidth,
      this.canvasHeight,
    );
    gl.uniform2f(
      gl.getUniformLocation(this.program, "u_center"),
      centerX,
      centerY,
    );
    gl.uniform2f(
      gl.getUniformLocation(this.program, "u_julia"),
      juliaX,
      juliaY,
    );
    gl.uniform1f(gl.getUniformLocation(this.program, "u_zoom"), zoom);
    gl.uniform1f(
      gl.getUniformLocation(this.program, "u_rotation"),
      modeIndex === 1 ? Math.sin(time * 0.08) * 0.22 : time * 0.012,
    );
    gl.uniform1f(
      gl.getUniformLocation(this.program, "u_palette"),
      this.palette + Math.sin(time * 0.045) * 0.08,
    );
    gl.uniform1f(gl.getUniformLocation(this.program, "u_mode"), modeIndex);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private initializeRenderer() {
    if (!this.gl || this.program) return;
    const program = createProgram(this.gl);
    const buffer = this.gl.createBuffer();
    if (!program || !buffer) {
      if (program) this.gl.deleteProgram(program);
      if (buffer) this.gl.deleteBuffer(buffer);
      return;
    }

    this.program = program;
    this.buffer = buffer;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
    this.gl.bufferData(
      this.gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      this.gl.STATIC_DRAW,
    );
    this.gl.viewport(0, 0, this.canvasWidth, this.canvasHeight);
  }

  private releaseRenderer() {
    if (!this.gl) return;
    if (this.buffer) this.gl.deleteBuffer(this.buffer);
    if (this.program) this.gl.deleteProgram(this.program);
    this.buffer = null;
    this.program = null;
  }

  private drawFallback() {
    if (!this.fallback) return;
    const width = this.canvasWidth;
    const height = this.canvasHeight;
    const gradient = this.fallback.createRadialGradient(
      width * 0.58,
      height * 0.45,
      0,
      width * 0.5,
      height * 0.5,
      Math.max(width, height) * 0.72,
    );
    gradient.addColorStop(0, "#ef65d9");
    gradient.addColorStop(0.32, "#5b35ae");
    gradient.addColorStop(0.68, "#13103c");
    gradient.addColorStop(1, "#050512");
    this.fallback.fillStyle = gradient;
    this.fallback.fillRect(0, 0, width, height);
    this.fallback.fillStyle = "rgba(255,255,255,.78)";
    this.fallback.font = `700 ${Math.max(9, Math.round(height * 0.04))}px monospace`;
    this.fallback.textAlign = "center";
    this.fallback.fillText(
      "FRACTAL / STATIC FALLBACK",
      width / 2,
      height / 2,
    );
  }

  private handleContextLost = (event: Event) => {
    event.preventDefault();
    this.program = null;
    this.buffer = null;
  };

  private handleContextRestored = () => {
    this.initializeRenderer();
    this.requestDraw();
  };
}

export function registerFractalGenerator() {
  if (
    typeof window === "undefined" ||
    typeof customElements === "undefined" ||
    customElements.get(TAG_NAME)
  ) {
    return;
  }
  customElements.define(TAG_NAME, FractalGeneratorElement);
}

declare global {
  interface HTMLElementTagNameMap {
    "fractal-generator": FractalGeneratorElement;
  }
}
