import { ScreensaverDemo, type SaverName } from "../app/screensaver-demo";
import GolfPage from "../app/golf/page";
import { GolfLab } from "../app/golf/lab/lab";

export function SitePage({ url }: { url: URL }) {
  const path = url.pathname.replace(/\/$/, "") || "/";
  if (path === "/golf") return <GolfPage />;
  if (path === "/golf/lab") return <GolfLab />;
  if (path !== "/") return <main className="missing-page"><p className="eyebrow">Screenjoy / somewhere else</p><h1>This window opens onto nothing.</h1><p>There are nine little worlds back at the collection.</p><a className="primary-button" href="/">Back to Screenjoy</a></main>;
  const saver = url.searchParams.get("saver") ?? "life";
  const seed = url.searchParams.get("seed") ?? "";
  const speed = url.searchParams.get("speed") ?? "";
  return <ScreensaverDemo
    initialSaver={(["starliner", "golf", "life", "rain", "fractal", "ski", "tank", "pipes", "maze"].includes(saver) ? saver : "life") as SaverName}
    initialFlight={{
      seed: /^\d{1,6}$/.test(seed) ? Number(seed) : 2026,
      mode: url.searchParams.get("mode") === "cruise" ? "cruise" : "ftl",
      speed: speed.trim() && Number.isFinite(Number(speed)) ? Math.min(1.8, Math.max(0.3, Number(speed))) : 1,
    }}
  />;
}
