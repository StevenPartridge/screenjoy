import { createRoot, hydrateRoot } from "react-dom/client";
import { SitePage } from "./page";
import "../app/globals.css";

const root = document.getElementById("root")!;
const url = new URL(window.location.href);
// Static HTML describes the default scene. Shared query settings are rendered
// directly on the client rather than hydrating different scene markup.
if (url.search || !root.firstElementChild) createRoot(root).render(<SitePage url={url} />);
else hydrateRoot(root, <SitePage url={url} />);
