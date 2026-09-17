import { renderToString } from "react-dom/server";
import { SitePage } from "./page";

export function render(path: string) {
  return renderToString(<SitePage url={new URL(path, "https://screenjoy.invalid")} />);
}
