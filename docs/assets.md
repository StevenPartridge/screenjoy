# Asset and dependency notes

The maintainer confirmed on September 16, 2026 that this project was created
from scratch with AI assistance, with no known third-party ownership claims.
Original project code and assets are released under MIT, copyright 2026 Steven
Partridge. Dependencies retain their separate terms below.

| Material | Source evidence | License / status |
| --- | --- | --- |
| Scene code and procedural art | TypeScript under `packages/*/src` | MIT; maintainer confirms original work |
| Seven fish GLBs | `packages/fishtank/models`; editable animation-node contract in its README; starter factory in `fish-models.ts` | MIT; included in the maintainer's original-work confirmation |
| Social images | `public/og*.png` | MIT; included in the maintainer's original-work confirmation |
| Demo fonts | CSS system-font stacks; fresh build emits no font files | No font files are redistributed by the current source export |
| Three.js | Dependency of Pipes and Fishtank | Preserve its MIT notice when bundling/distributing Three.js |
| Framework/build dependencies | Locked in `package-lock.json` | Retain their terms if redistributing bundled code |

Dependency license text for React, React DOM, Next.js, Three.js, and Tailwind is
collected in `docs/third-party-notices.txt`. Dependencies retain their own
licenses; Screenjoy's MIT notice does not replace those terms.

The npm archives include the package LICENSE and source alongside generated
code/maps. Fishtank includes its GLBs. Archives do not include demo screenshots,
fonts, app code, or private planning. The original-work confirmation does not replace dependency licenses.
