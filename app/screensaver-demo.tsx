"use client";

import { createScene, EXTERIOR_LABELS, type FlightMode } from "@screenjoy/starliner/scene";
import type { SkiMode } from "@screenjoy/downhill-ski/element";
import {
  registerGameOfLife,
  type GameOfLifeSeedChangeDetail,
} from "@screenjoy/game-of-life/element";
import type { FractalMode } from "@screenjoy/fractal-generator/element";
import type { PipesSeedChangeDetail } from "@screenjoy/pipes/element";
import type { HoleSettings } from "@screenjoy/pocket-golf/element";
import { useEffect, useMemo, useRef, useState } from "react";
import { DemoWindow } from "./demo-window";
import { GolfDemoElement } from "./golf/demo-element";

export type SaverName =
  | "starliner"
  | "golf"
  | "life"
  | "rain"
  | "fractal"
  | "ski"
  | "tank"
  | "pipes"
  | "maze";
type PipesMode = "classic" | "single";

const SAVER_LOADERS: Record<SaverName, () => Promise<void>> = {
  starliner: async () => {
    const { registerStarliner } = await import("@screenjoy/starliner/element");
    registerStarliner();
  },
  golf: async () => {
    const { registerPocketGolf } = await import("@screenjoy/pocket-golf/element");
    registerPocketGolf();
  },
  life: () => {
    registerGameOfLife();
    return Promise.resolve();
  },
  rain: async () => {
    const { registerCodeRain } = await import("@screenjoy/code-rain/element");
    registerCodeRain();
  },
  fractal: async () => {
    const { registerFractalGenerator } = await import(
      "@screenjoy/fractal-generator/element"
    );
    registerFractalGenerator();
  },
  ski: async () => {
    const { registerDownhillSki } = await import(
      "@screenjoy/downhill-ski/element"
    );
    registerDownhillSki();
  },
  tank: async () => {
    const { registerFishTank } = await import("@screenjoy/fishtank/element");
    registerFishTank();
  },
  pipes: async () => {
    const { registerPipesSaver } = await import("@screenjoy/pipes/element");
    registerPipesSaver();
  },
  maze: async () => {
    const { registerBrickMaze } = await import("@screenjoy/brick-maze/element");
    registerBrickMaze();
  },
};

const saverLoads = new Map<SaverName, Promise<void>>();

function loadSaver(saver: SaverName) {
  const existingLoad = saverLoads.get(saver);
  if (existingLoad) return existingLoad;

  const load = SAVER_LOADERS[saver]().catch((error: unknown) => {
    saverLoads.delete(saver);
    throw error;
  });
  saverLoads.set(saver, load);
  return load;
}

function warmSaver(saver: SaverName) {
  void loadSaver(saver).catch(() => undefined);
}

const SAVERS = {
  starliner: {
    packageName: "@screenjoy/starliner",
    tagName: "star-liner",
    title: "You have the window seat.",
    eyebrow: "Saver 09 / somewhere between stars",
    intro: "The cabin is quiet. Starlight slips past the glass. Settle into a slow cruise or watch the stars stretch into light at FTL. Every seed is another seat on the ship.",
    windowTitle: "Starliner",
    action: "Find another seat",
    control: "Flight speed",
    seed: 2026,
  },
  golf: {
    packageName: "@screenjoy/pocket-golf",
    tagName: "pocket-golf",
    title: "One more hole.",
    eyebrow: "Saver 08 / on the tee",
    intro: "A little fairway, a forgiving swing, and somewhere new to aim. Play one hole or settle in for a few. Your score stays with you.",
    windowTitle: "Pocket Golf",
    action: "New course",
    control: "Swing",
    seed: 2026,
  },
  life: {
    packageName: "@screenjoy/game-of-life",
    tagName: "game-of-life",
    title: "Simple rules. Endless life.",
    eyebrow: "Saver 07 / colony evolving",
    intro:
      "Every cell is born, survives, or disappears by the same tiny set of rules. From there, whole worlds unfold.",
    windowTitle: "Conway's Game of Life",
    action: "Seed a new colony",
    control: "Generation speed",
    seed: 1970,
  },
  rain: {
    packageName: "@screenjoy/code-rain",
    tagName: "code-rain",
    title: "The machine is dreaming.",
    eyebrow: "Saver 06 / signal incoming",
    intro:
      "A bottomless phosphor storm of katakana, code, and half-glimpsed signals. Every seed opens a different channel.",
    windowTitle: "Code Rain",
    action: "Change the signal",
    control: "Rain speed",
    seed: 10101,
  },
  fractal: {
    packageName: "@screenjoy/fractal-generator",
    tagName: "fractal-generator",
    title: "Infinity, made visible.",
    eyebrow: "Saver 05 / forever folding",
    intro:
      "A slow dive through luminous Mandelbrot shores, shifting Julia islands, and the jagged hull of the Burning Ship.",
    windowTitle: "Fractal Generator",
    action: "Find another edge",
    control: "Drift speed",
    seed: 314159,
  },
  ski: {
    packageName: "@screenjoy/downhill-ski",
    tagName: "downhill-ski",
    title: "Pick a line. Send it.",
    eyebrow: "Saver 04 / one more run",
    intro:
      "A tiny downhill arcade with crisp snow, reckless shortcuts, four ways to ski, and one very hungry surprise at 2,000 metres.",
    windowTitle: "Powder Run",
    action: "Cut a new trail",
    control: "Slope pace",
    seed: 1991,
  },
  tank: {
    packageName: "@screenjoy/fishtank",
    tagName: "fish-tank",
    title: "A tiny ocean, all to itself.",
    eyebrow: "Saver 03 / gently drifting",
    intro:
      "Sunlight on the sand, a reef full of curious fish, and a tiny crab going about its day. Tap the water to drop a little food.",
    windowTitle: "Fishtank",
    action: "Restock the tank",
    control: "Current speed",
    seed: 728,
  },
  pipes: {
    packageName: "@screenjoy/pipes",
    tagName: "pipes-saver",
    title: "Pipes with nowhere to go.",
    eyebrow: "Saver 02 / now growing",
    intro:
      "A cheerful little plumbing problem that builds itself forever. Real depth, shiny elbows, and GPU-instanced geometry.",
    windowTitle: "3D Pipes",
    action: "Start fresh",
    control: "Growth speed",
    seed: 95,
  },
  maze: {
    packageName: "@screenjoy/brick-maze",
    tagName: "brick-maze",
    title: "A tiny maze, going nowhere.",
    eyebrow: "Saver 01 / still wandering",
    intro:
      "Drop one joyful little window into any corner, card, or button. It knows only one thing: keep wandering.",
    windowTitle: "Brick Maze",
    action: "Shuffle the maze",
    control: "Walking speed",
    seed: 1995,
  },
} as const;

type SaverViewProps = {
  saver: SaverName;
  className?: string;
  seed: number | string;
  speed: number;
  paused: boolean;
  flightMode: FlightMode;
  pipeMode: PipesMode;
  onPipesSeedChange: (seed: number) => void;
  onLifeSeedChange: (seed: number) => void;
  fishCount: number;
  skiMode: SkiMode;
  fractalMode: FractalMode;
  rainDensity: number;
  lifeDensity: number;
  golfCourse: HoleSettings;
  onGolfHoleChange: (settings: HoleSettings, address: string) => void;
  onGolfNotice: (notice: string) => void;
};

function SaverView({
  saver,
  className,
  seed,
  speed,
  paused,
  flightMode,
  pipeMode,
  onPipesSeedChange,
  onLifeSeedChange,
  fishCount,
  skiMode,
  fractalMode,
  rainDensity,
  lifeDensity,
  golfCourse,
  onGolfHoleChange,
  onGolfNotice,
}: SaverViewProps) {
  const shared = {
    className,
    seed,
    speed: speed.toFixed(2),
    paused,
    "aria-hidden": saver === "ski" ? undefined : true,
  };

  return saver === "starliner" ? (
    <star-liner {...shared} mode={flightMode} />
  ) : saver === "golf" ? (
    <GolfDemoElement course={golfCourse} paused={paused} onHoleChange={onGolfHoleChange} onNotice={onGolfNotice} />
  ) : saver === "life" ? (
    <game-of-life
      {...shared}
      density={lifeDensity.toFixed(2)}
      onseedchange={(event: CustomEvent<GameOfLifeSeedChangeDetail>) =>
        onLifeSeedChange(event.detail.seed)
      }
    />
  ) : saver === "rain" ? (
    <code-rain {...shared} density={rainDensity.toFixed(2)} />
  ) : saver === "fractal" ? (
    <fractal-generator {...shared} mode={fractalMode} />
  ) : saver === "ski" ? (
    <downhill-ski {...shared} mode={skiMode} />
  ) : saver === "tank" ? (
    <fish-tank {...shared} population={fishCount} />
  ) : saver === "pipes" ? (
    <pipes-saver
      {...shared}
      density="1"
      mode={pipeMode}
      onseedchange={(event: CustomEvent<PipesSeedChangeDetail>) =>
        onPipesSeedChange(event.detail.seed)
      }
    />
  ) : (
    <brick-maze {...shared} />
  );
}

export function ScreensaverDemo({ initialSaver = "life", initialFlight = { seed: 2026, mode: "ftl", speed: 1 } }: {
  initialSaver?: SaverName;
  initialFlight?: { seed: number; mode: FlightMode; speed: number };
}) {
  const fullscreenTargetRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<SaverName>(initialSaver);
  const [seeds, setSeeds] = useState({
    starliner: initialFlight.seed,
    golf: 2026,
    life: 1970,
    rain: 10101,
    fractal: 314159,
    ski: 1991,
    tank: 728,
    pipes: 95,
    maze: 1995,
  });
  const [seedInput, setSeedInput] = useState(String(initialSaver === "starliner" ? initialFlight.seed : SAVERS[initialSaver].seed));
  const [speed, setSpeed] = useState(initialSaver === "starliner" ? initialFlight.speed : initialSaver === "tank" ? 0.8 : 1);
  const [flightMode, setFlightMode] = useState<FlightMode>(initialFlight.mode);
  const [seatShare, setSeatShare] = useState<{ key: string; notice: string; fallback: string } | null>(null);
  const [paused, setPaused] = useState(false);
  const [pipeMode, setPipeMode] = useState<PipesMode>("classic");
  const [skiMode, setSkiMode] = useState<SkiMode>("free-ride");
  const [fractalMode, setFractalMode] = useState<FractalMode>("mandelbrot");
  const [rainDensity, setRainDensity] = useState(1);
  const [lifeDensity, setLifeDensity] = useState(0.28);
  const [fishCount, setFishCount] = useState(11);
  const [copied, setCopied] = useState(false);
  const [copyNotice, setCopyNotice] = useState("");
  const [golfCourse, setGolfCourse] = useState<HoleSettings>({ version: 'g3', seed: '2026', index: 0, layout: 'mixed', hazards: 'mixed' });
  const [golfCurrent, setGolfCurrent] = useState(golfCourse);
  const [golfSeedInput, setGolfSeedInput] = useState('2026');
  const [golfIndexInput, setGolfIndexInput] = useState('0');
  const [golfAddress, setGolfAddress] = useState('');
  const [golfNotice, setGolfNotice] = useState('');
  const [golfCopyFallback, setGolfCopyFallback] = useState('');

  useEffect(() => {
    warmSaver(selected);
  }, [selected]);

  const saver = SAVERS[selected];
  const seed = selected === 'golf' ? golfCurrent.seed : seeds[selected];
  const seat = useMemo(() => createScene(String(seeds.starliner)), [seeds.starliner]);
  const seatKey = `${seeds.starliner}:${flightMode}:${speed}`;
  const seatNotice = seatShare?.key === seatKey ? seatShare.notice : "";
  const seatLinkFallback = seatShare?.key === seatKey ? seatShare.fallback : "";
  const snippet = useMemo(
    () => {
      if (selected === "golf") return `npm install @screenjoy/pocket-golf\n\nimport "@screenjoy/pocket-golf";\n\n<pocket-golf\n  seed="2026"\n  hole-index="0"\n  style="width: 100%; aspect-ratio: 1;"\n></pocket-golf>`;
      const modeAttribute =
        selected === "starliner"
          ? `\n  mode="${flightMode}"`
          : selected === "fractal"
          ? `\n  mode="${fractalMode}"`
          : selected === "pipes"
            ? `\n  mode="${pipeMode}"`
            : selected === "ski"
              ? `\n  mode="${skiMode}"`
              : "";
      const populationAttribute =
        selected === "tank" ? `\n  population="${fishCount}"` : "";
      const densityAttribute =
        selected === "rain"
          ? `\n  density="${rainDensity.toFixed(1)}"`
          : selected === "life"
            ? `\n  density="${lifeDensity.toFixed(2)}"`
            : "";
      return `npm install ${saver.packageName}\n\nimport "${saver.packageName}";\n\n<${saver.tagName}\n  seed="${seed}"\n  speed="${speed.toFixed(1)}"${populationAttribute}${densityAttribute}${modeAttribute}\n  style="width: 100%; height: 360px;"\n></${saver.tagName}>`;
    },
    [
      fishCount,
      flightMode,
      fractalMode,
      lifeDensity,
      pipeMode,
      rainDensity,
      saver,
      seed,
      selected,
      skiMode,
      speed,
    ],
  );

  function selectSaver(next: SaverName) {
    warmSaver(next);
    setSelected(next);
    setSeedInput(String(seeds[next]));
    setSpeed(
      next === "fractal"
        ? 0.65
        : next === "rain" || next === "life"
          ? 1
        : next === "tank"
          ? 0.8
          : next === "maze"
            ? 0.9
            : next === "ski"
              ? 1.1
              : 1,
    );
    setPaused(false);
    const url = new URL(window.location.href);
    url.searchParams.set('saver', next);
    if (next !== 'golf') url.searchParams.delete('hole');
    for (const key of ['seed', 'mode', 'speed']) url.searchParams.delete(key);
    window.history.replaceState(null, '', url);
  }

  function regenerate() {
    const nextSeed = Math.floor(1000 + Math.random() * 8999);
    if (selected === 'golf') {
      setGolfCourse({ version: 'g3', seed: String(nextSeed), index: 0, layout: 'mixed', hazards: 'mixed' });
      setPaused(false); return;
    }
    setSeeds((current) => ({
      ...current,
      [selected]: nextSeed,
    }));
    setSeedInput(String(nextSeed));
  }

  function updateSeedInput(value: string) {
    setSeedInput(value);
    if (!/^\d{1,6}$/.test(value)) return;
    const nextSeed = Number(value);
    setSeeds((current) => ({
      ...current,
      [selected]: nextSeed,
    }));
  }

  function syncPipesSeed(nextSeed: number) {
    setSeeds((current) => ({
      ...current,
      pipes: nextSeed,
    }));
    setSeedInput(String(nextSeed));
  }

  function syncLifeSeed(nextSeed: number) {
    setSeeds((current) => ({
      ...current,
      life: nextSeed,
    }));
    setSeedInput(String(nextSeed));
  }

  function syncGolfHole(settings: HoleSettings, address: string) {
    setGolfCurrent(settings); setGolfAddress(address);
    setGolfSeedInput(settings.seed); setGolfIndexInput(String(settings.index));
    setGolfCopyFallback('');
  }
  function playGolfCourse() {
    const index = Number(golfIndexInput);
    if (!golfSeedInput.trim() || !/^\d+$/.test(golfIndexInput) || index > 999999) {
      setGolfNotice('Enter a seed and a hole number between 1 and 1,000,000.'); return;
    }
    setGolfCourse({ ...golfCurrent, seed: golfSeedInput.trim(), index }); setPaused(false);
  }
  async function copyGolfHole() {
    if (!golfAddress) return;
    const url = new URL('/golf', window.location.origin); url.searchParams.set('hole', golfAddress);
    try { await navigator.clipboard.writeText(url.href); setGolfNotice('Hole link copied.'); }
    catch { setGolfCopyFallback(url.href); setGolfNotice('Select and copy the link below.'); }
  }

  async function copySeatLink() {
    const url = new URL(window.location.pathname, window.location.origin);
    url.searchParams.set("saver", "starliner");
    url.searchParams.set("seed", String(seeds.starliner));
    url.searchParams.set("mode", flightMode);
    url.searchParams.set("speed", String(speed));
    try {
      await navigator.clipboard.writeText(url.href);
      setSeatShare({ key: seatKey, notice: "Window seat link copied.", fallback: "" });
    } catch {
      setSeatShare({ key: seatKey, notice: "Select and copy your window seat link.", fallback: url.href });
    }
  }

  async function copyMarkup() {
    try { await navigator.clipboard.writeText(snippet); setCopied(true); }
    catch { setCopied(false); setCopyNotice("Clipboard unavailable. Select and copy the example below."); }
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <main className="site-shell">
      <header className="masthead">
        <div className="brand-mark">
          <span className="brand-block" aria-hidden="true" />
          <span>Screenjoy / Tiny wandering things</span>
        </div>
        <div className="status-mark">
          <span className="status-dot" aria-hidden="true" />
          <a href="https://github.com/StevenPartridge/screenjoy">Source on GitHub ↗</a>
        </div>
      </header>

      <div className="collection-intro">
        <p>A little room for <em>joy.</em></p>
        <span>Nine tiny worlds to watch, play with, and put on your website.</span>
      </div>

      <nav className="collection-nav" aria-label="Collection">
        <label htmlFor="scene-chooser">Choose a Screenjoy</label>
        <select id="scene-chooser" value={selected} onChange={event => selectSaver(event.target.value as SaverName)}>
          {(Object.keys(SAVERS) as SaverName[]).map(name => <option key={name} value={name}>{SAVERS[name].windowTitle}</option>)}
        </select>
        <a href="#use-it">Use it</a>
        <span className="release-status">v0.1.0 · MIT</span>
      </nav>

      <section id="demo" className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">{saver.eyebrow}</p>
          <h1 id="hero-title">{saver.title}</h1>
          <p className="hero-intro">{saver.intro}</p>
          <div className="hero-actions">
            <button className="primary-button" type="button" onClick={regenerate}>
              {saver.action}
            </button>
            <button
              className="secondary-button"
              type="button"
              aria-pressed={paused}
              onClick={() => setPaused((value) => !value)}
            >
              {paused ? selected === 'golf' ? 'Resume play' : "Resume motion" : "Pause for a moment"}
            </button>
            {selected === "tank" && (
              <button
                className="secondary-button"
                type="button"
                disabled={paused}
                onClick={() => fullscreenTargetRef.current?.querySelector("fish-tank")?.feed()}
              >
                Feed the fish
              </button>
            )}
          </div>
          {selected === 'golf' && <p className="golf-demo-instructions">Drag the amber target to aim. Click Swing, choose power on either pass, then click in the green zone on the return.</p>}
        </div>

        <div className={`hero-stage hero-stage-${selected}`}>
          <p className="stage-index">Live canvas / seed {seed}</p>
          <div className="demo-stack">
            <DemoWindow title={saver.windowTitle} frameRef={fullscreenTargetRef} paused={paused} onPause={() => setPaused(value => !value)}>
                <SaverView
                  saver={selected}
                  className="hero-saver"
                  seed={seed}
                  speed={speed}
                  paused={paused}
                  flightMode={flightMode}
                  pipeMode={pipeMode}
                  onPipesSeedChange={syncPipesSeed}
                  onLifeSeedChange={syncLifeSeed}
                  fishCount={fishCount}
                  skiMode={skiMode}
                  fractalMode={fractalMode}
                  rainDensity={rainDensity}
                  lifeDensity={lifeDensity}
                  golfCourse={golfCourse}
                  onGolfHoleChange={syncGolfHole}
                  onGolfNotice={setGolfNotice}
                />
            </DemoWindow>

            <details className="demo-controls">
              <summary>Adjust this scene</summary>
            <div className="control-panel">
              <div className="control-inputs">
                {selected === 'golf' ? <>
                  <form className="golf-demo-seed" onSubmit={event => { event.preventDefault(); playGolfCourse(); }}>
                    <label className="seed-control"><span>Seed</span><input type="text" maxLength={80} aria-label="Pocket Golf seed" value={golfSeedInput} onChange={event => setGolfSeedInput(event.target.value)}/></label>
                    <label className="seed-control"><span>Hole</span><input type="number" min="1" max="1000000" aria-label="Pocket Golf starting hole" value={golfIndexInput === '' ? '' : Number(golfIndexInput) + 1} onChange={event => setGolfIndexInput(event.target.value === '' ? '' : String(Number(event.target.value) - 1))}/></label>
                    <button type="submit" className="golf-demo-button">Play course</button>
                  </form>
                  <div className="golf-demo-actions">
                    <button type="button" className="golf-demo-button" onClick={() => fullscreenTargetRef.current?.querySelector('pocket-golf')?.restart()}>Replay hole</button>
                    <button type="button" className="golf-demo-button" disabled={!golfAddress} onClick={() => void copyGolfHole()}>Copy hole link</button>
                    <a className="golf-demo-button" href={golfAddress ? `/golf/lab?hole=${encodeURIComponent(golfAddress)}` : '/golf/lab'}>Hole lab</a>
                  </div>
                  {golfNotice && <p className="golf-demo-notice" role="status">{golfNotice}</p>}
                  {golfCopyFallback && <input className="golf-demo-copy" aria-label="Hole link to copy" readOnly value={golfCopyFallback} onFocus={event => event.target.select()}/>}
                </> : <>
                <label className="seed-control">
                  <span>Seed</span>
                  <input
                    type="number"
                    min="0"
                    max="999999"
                    step="1"
                    value={seedInput}
                    aria-label={`${saver.windowTitle} seed`}
                    onChange={(event) => updateSeedInput(event.target.value)}
                    onBlur={() => setSeedInput(String(seed))}
                  />
                </label>
                <label className="range-control">
                  <span>{saver.control}</span>
                  <input
                    type="range"
                    min={selected === "ski" ? "0.8" : "0.3"}
                    max={selected === "ski" ? "2.2" : "1.8"}
                    step="0.05"
                    value={speed}
                    onChange={(event) => setSpeed(Number(event.target.value))}
                  />
                  <span className="range-value">{speed.toFixed(2)}×</span>
                </label>
                </>}
                {selected === "starliner" && (
                  <>
                    <div className="mode-control" role="group" aria-label="Flight mode">
                      <span>Flight mode</span>
                      <button type="button" aria-pressed={flightMode === "cruise"} onClick={() => setFlightMode("cruise")}>Cruising</button>
                      <button type="button" aria-pressed={flightMode === "ftl"} onClick={() => setFlightMode("ftl")}>FTL</button>
                    </div>
                    <div className="seat-details">
                      <span>{seat.viewLabel} · {seat.material.name} · {EXTERIOR_LABELS[seat.exterior.kind]}</span>
                      <button type="button" className="secondary-button" onClick={() => void copySeatLink()}>Copy seat link</button>
                    </div>
                    {seatNotice && <p className="seat-notice" role="status">{seatNotice}</p>}
                    {seatLinkFallback && <input aria-label="Window seat link to copy" readOnly value={seatLinkFallback} onFocus={event => event.target.select()} />}
                  </>
                )}
                {selected === "fractal" && (
                  <div
                    className="mode-control fractal-mode-control"
                    role="group"
                    aria-label="Fractal family"
                  >
                    <span>Fractal family</span>
                    <button
                      type="button"
                      aria-pressed={fractalMode === "mandelbrot"}
                      onClick={() => setFractalMode("mandelbrot")}
                    >
                      Mandelbrot
                    </button>
                    <button
                      type="button"
                      aria-pressed={fractalMode === "julia"}
                      onClick={() => setFractalMode("julia")}
                    >
                      Julia
                    </button>
                    <button
                      type="button"
                      aria-pressed={fractalMode === "burning-ship"}
                      onClick={() => setFractalMode("burning-ship")}
                    >
                      Burning Ship
                    </button>
                  </div>
                )}
                {selected === "rain" && (
                  <label className="range-control rain-density-control">
                    <span>Stream density</span>
                    <input
                      type="range"
                      min="0.45"
                      max="1.6"
                      step="0.05"
                      value={rainDensity}
                      onChange={(event) =>
                        setRainDensity(Number(event.target.value))
                      }
                    />
                    <span className="range-value">
                      {rainDensity.toFixed(2)}×
                    </span>
                  </label>
                )}
                {selected === "life" && (
                  <label className="range-control life-density-control">
                    <span>Starting density</span>
                    <input
                      type="range"
                      min="0.12"
                      max="0.48"
                      step="0.01"
                      value={lifeDensity}
                      onChange={(event) =>
                        setLifeDensity(Number(event.target.value))
                      }
                    />
                    <span className="range-value">
                      {Math.round(lifeDensity * 100)}%
                    </span>
                  </label>
                )}
                {selected === "pipes" && (
                  <div
                    className="mode-control"
                    role="group"
                    aria-label="Pipe layout"
                  >
                    <span>Pipe layout</span>
                    <button
                      type="button"
                      aria-pressed={pipeMode === "classic"}
                      onClick={() => setPipeMode("classic")}
                    >
                      Shorties
                    </button>
                    <button
                      type="button"
                      aria-pressed={pipeMode === "single"}
                      onClick={() => setPipeMode("single")}
                    >
                      One long pipe
                    </button>
                  </div>
                )}
                {selected === "ski" && (
                  <div
                    className="mode-control ski-mode-control"
                    role="group"
                    aria-label="Ski run"
                  >
                    <span>Choose a run</span>
                    <button
                      type="button"
                      aria-pressed={skiMode === "free-ride"}
                      onClick={() => setSkiMode("free-ride")}
                    >
                      Free ride
                    </button>
                    <button
                      type="button"
                      aria-pressed={skiMode === "slalom"}
                      onClick={() => setSkiMode("slalom")}
                    >
                      Slalom
                    </button>
                    <button
                      type="button"
                      aria-pressed={skiMode === "freestyle"}
                      onClick={() => setSkiMode("freestyle")}
                    >
                      Freestyle
                    </button>
                    <button
                      type="button"
                      aria-pressed={skiMode === "tree-slalom"}
                      onClick={() => setSkiMode("tree-slalom")}
                    >
                      Tree slalom
                    </button>
                  </div>
                )}
                {selected === "tank" && (
                  <label className="range-control fish-count-control">
                    <span>Fish in tank</span>
                    <input
                      type="range"
                      min="4"
                      max="18"
                      step="1"
                      value={fishCount}
                      onChange={(event) =>
                        setFishCount(Number(event.target.value))
                      }
                    />
                    <span className="range-value">{fishCount}</span>
                  </label>
                )}
              </div>
              <p className="control-readout">
                {selected === "starliner"
                  ? "Cabin lights low"
                  : selected === "golf"
                  ? "Completed holes count toward your saved score"
                  : selected === "life"
                  ? "Canvas cellular automaton"
                  : selected === "rain"
                  ? "Canvas glyph engine"
                  : selected === "fractal"
                    ? "WebGL fragment shader"
                  : selected === "ski"
                    ? "Arrows · mouse · touch"
                    : selected === "tank"
                      ? "Three.js ecosystem"
                      : selected === "pipes"
                        ? "Three.js instancing"
                        : "Canvas raycaster"}
                <br />
                {selected === "starliner"
                  ? "No arrival to rush for"
                  : selected === "golf"
                  ? "Hover score for holes played"
                  : selected === "life"
                  ? "Conway B3/S23 · toroidal grid"
                  : selected === "rain"
                  ? "Katakana · Latin · binary"
                  : selected === "fractal"
                    ? "180 iterations · live"
                  : selected === "ski"
                    ? "Space to trick · R to reset"
                    : "30 fps target"}
              </p>
            </div>
            </details>
          </div>
        </div>
      </section>

      <div className="ticker" aria-hidden="true">
        <span>One install · one saver</span>
        <span>
          {selected === "starliner"
            ? "Cruising · faster than light"
            : selected === "golf"
            ? "Fairways · little victories"
            : selected === "life"
            ? "Birth · survival · solitude"
            : selected === "rain"
            ? "Phosphor glyph streams"
            : selected === "fractal"
              ? "Three fractal families"
            : selected === "ski"
              ? "Four downhill modes"
              : selected === "tank"
                ? `${fishCount} tiny fish`
                : "GPU friendly"}
        </span>
        <span>Framework agnostic</span>
        <span>Pauses offscreen</span>
        <span>Shadow DOM</span>
        <span>Seed {seed}</span>
        {selected === "ski" && <span>Yeti at 2,000 m</span>}
      </div>

      <section className="collection-section" aria-labelledby="collection-title">
        <div className="collection-heading"><div><p className="eyebrow">The collection / 01—09</p><h2 id="collection-title">Find your little world.</h2></div><p>Some are for watching. Some are for one more go. Each is its own small, installable thing.</p></div>
        <div className="scene-grid">
          {(Object.keys(SAVERS) as SaverName[]).map((name, index) => <a key={name} className={`scene-card scene-card-${name}`} href={`/?saver=${name}#demo`} aria-current={selected === name ? 'true' : undefined} onClick={event => {
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault(); selectSaver(name); document.getElementById('demo')?.scrollIntoView();
          }}>
            <div className="scene-card-top"><span>{String(index + 1).padStart(2, '0')}</span><span aria-hidden="true">↗</span></div>
            <h3>{SAVERS[name].windowTitle}</h3><p>{SAVERS[name].title}</p>
            <span className="scene-card-kind">{name === 'golf' || name === 'ski' ? 'Play a little' : name === 'tank' ? 'Watch & feed' : 'Watch a while'}</span>
          </a>)}
        </div>
      </section>

      <section id="use-it" className="code-section" aria-labelledby="code-title">
        <div className="code-layout">
          <div className="code-copy">
            <p className="eyebrow">The whole contract</p>
            <h2 id="code-title">
              Install only{" "}
              {selected === "starliner"
                ? "Starliner"
                : selected === "golf"
                ? "Pocket Golf"
                : selected === "life"
                ? "Game of Life"
                : selected === "tank"
                ? "Fishtank"
                : selected === "rain"
                  ? "Code Rain"
                : selected === "fractal"
                  ? "Fractals"
                  : selected === "ski"
                    ? "Powder Run"
                    : selected === "pipes"
                      ? "Pipes"
                      : "Maze"}
              .
            </h2>
            <p>
              Import one package, then give its custom element a rectangle.
              Use a bundler such as Vite to resolve the package import.
            </p>
            <p className="package-links"><a href={`https://www.npmjs.com/package/${saver.packageName}`}>Get it on npm ↗</a><a href="https://github.com/StevenPartridge/screenjoy/blob/main/docs/integration.md">Integration guide ↗</a></p>
            <div className="spec-list">
              <div>Independent npm package</div>
              <div>
                {selected === "starliner"
                  ? "Seeded cabins · layered starfields"
                  : selected === "golf"
                  ? "Mouse-only play · saved scores"
                  : selected === "life"
                  ? "Classic B3/S23 cellular automaton"
                  : selected === "rain"
                  ? "Layered 2D canvas glyphs"
                  : selected === "ski"
                    ? "Keyboard + pointer + touch"
                  : selected === "fractal"
                    ? "GPU fragment shader"
                    : selected === "tank"
                      ? "Procedural 3D ecosystem"
                      : "Instanced GPU geometry"}
              </div>
              <div>Deterministic seeds</div>
              <div>Responsive sizing</div>
            </div>
          </div>

          <div className="code-window">
            <div className="window-titlebar">
              <span>terminal · JavaScript · HTML</span>
              <span className="window-buttons" aria-hidden="true">
                <span className="window-button" />
                <span className="window-button" />
              </span>
            </div>
            <div className="code-body">
              <button className="copy-button" type="button" onClick={copyMarkup}>
                {copied ? "Copied!" : "Copy"}
              </button>
              <p role="status">{copyNotice}</p>
              <pre tabIndex={0} aria-label={`${saver.windowTitle} installation example`}>
                <code>{snippet}</code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      <section className="about-section" aria-labelledby="about-title">
        <div><p className="eyebrow">Made to belong on your website</p><h2 id="about-title">A banner. A quiet corner.<br />A very short break.</h2><p>Give an article a window onto the stars, tuck an aquarium into a card, or let visitors play a hole of golf. You choose the rectangle; Screenjoy brings it to life.</p></div>
        <div className="about-notes"><div><h3>Bring your own framework.</h3><p>Standard web components work with plain HTML, React, and Vue. Pick one scene and its shared runtime comes along.</p></div><div><h3>A good guest.</h3><p>Scenes resize with their container, respect reduced motion, and pause out of view. Golf and Ski keep their saved scores on your device.</p></div><div><h3>Yours to make things with.</h3><p>Open source under the MIT license, for personal projects and commercial work. No Screenjoy account, analytics, or subscription.</p></div></div>
      </section>

      <footer className="site-footer">
        <p>Screenjoy / Made by Steven Partridge / 2026</p>
        <nav aria-label="Project"><a href="https://github.com/StevenPartridge/screenjoy">GitHub</a><a href="https://www.npmjs.com/org/screenjoy">npm</a><a href="https://github.com/StevenPartridge/screenjoy/blob/main/LICENSE">MIT license</a></nav>
      </footer>
    </main>
  );
}
