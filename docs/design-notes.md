# Design notes

Short notes for a future developer. Product intent lives in `visual-threads-plan.md`.

## Architecture

- Two Vite pages: the public site (`index.html` -> `src/site/`) and the owner-only **Photo Prep** tool (`prep.html` -> `src/prep/`).
- No backend. The site reads static JSON (`src/data/photos.json`, `connections.json`) and images in `public/photos/` (`NNN-slug-sm.webp` / `-lg.webp`). The contract types are in `src/types.ts`.
- Photo Prep does all analysis in the browser (`src/analysis/`: colors, similarity, layout, resizing) and exports a zip of repo-relative files (`exportZip.ts`) to unzip at the repo root. Keep visual metadata out of UI components.
- The camera (`hooks/useCamera.ts`) writes to the DOM through a ref: it sets the `.world` transform and the CSS variables `--zoom` (absolute scale) and `--zoom-rel` (scale relative to the fitted "home" view) on the canvas root. Panning and zooming cause no React renders. Anything that must track zoom (stroke widths, crossfades, dim relaxation) is CSS using those variables.
- Interaction state (hover, focus, preview, trail) is a reducer in `state/threadState.ts`; `App.tsx` wires it to the canvas and camera.
- Layout: `src/site/{App,components,hooks,state,styles,utils}`, `src/prep/`, `src/analysis/`, `src/data/`.

## Decisions

- **vector-effect limitation.** `non-scaling-stroke` ignores CSS transforms on ancestors (the `.world` transform), and `pathLength`-based dashes then break too. Edges therefore use `stroke-width: calc(N px / var(--zoom))` for constant on-screen width. Do not transition stroke-width (it tracks `--zoom` every frame).
- **Z-order.** Inside `.world` (a stacking context): dim nodes (auto) < `svg.connections` (1) < connected nodes (2) < hovered/focused nodes (2, later in DOM). Edges are thus never hidden by unrelated nodes but never cross over the photos they connect.
- **Curve direction.** `curvePath` (`utils/geometry.ts`) normalizes by id order, so A->B and B->A give the identical path. Trail segments are deduped by unordered pair, so a trail and an edge for the same pair coincide exactly.
- **Focus framing.** Center the focused node f. `cap = 0.4*min(vw,vh)/NODE_SIZE`; `hw`/`hh` are the max half-extents (center offset + half node size) over f and its neighbors; `fit = min(vw*0.42/hw, vh*0.42/hh)`; `scale = clamp(fit, 0.6*cap, cap)`.
- **Crossfade bands.** The color card fades to the photo across `--zoom-rel` 0.7-0.9 (card fully visible below 0.7, photo fully visible above 0.9). Edges fade in across 0.65-0.9. Dim nodes relax toward rest opacity when zoomed out.
- **Wheel convention.** Trackpad two-finger scroll pans; pinch (ctrlKey) and mouse-wheel notches zoom. Mode is latched per gesture until 150 ms of silence, so mixed deltas don't flip mid-gesture.
- **Portrait fill.** On portrait viewports the home view zooms extra (`portraitFactor`, up to 1.4x) so the field fills the height.
- **Ids.** `NNN-slug`: zero-padded ordinal (max + 1) plus an ascii slug from the filename, suffixed numerically if the slug is taken. Ids are stable and used as filenames and for ordering (`a.id < b.id`).
- **Touch: tap twice.** The first tap on a node previews its connections (no camera move); tapping the previewed node again focuses it. Hover-only affordances are not relied on for touch.
- **Accessibility.** `Photo.alt` is optional and preserved through Photo Prep re-export; nodes are keyboard-focusable buttons labelled by alt or ordinal.
