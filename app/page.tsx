import { ScreensaverDemo, type SaverName } from "./screensaver-demo";

export default async function Home({ searchParams }: { searchParams: Promise<{ saver?: string; seed?: string; mode?: string; speed?: string }> }) {
  const { saver, seed, mode, speed } = await searchParams;
  const flightSeed = typeof seed === "string" && /^\d{1,6}$/.test(seed) ? Number(seed) : 2026;
  const flightSpeed = typeof speed === "string" && speed.trim() && Number.isFinite(Number(speed))
    ? Math.min(1.8, Math.max(0.3, Number(speed))) : 1;
  return <ScreensaverDemo
    initialSaver={(["starliner", "golf", "life", "rain", "fractal", "ski", "tank", "pipes", "maze"].includes(saver ?? "") ? saver : "life") as SaverName}
    initialFlight={{ seed: flightSeed, mode: mode === "cruise" ? "cruise" : "ftl", speed: flightSpeed }}
  />;
}
