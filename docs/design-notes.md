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
- **Focus framing.** Center the focused node f. `cap = 0.4*min(vw,vh)/NODE_SIZE`; `hw`/`hh` are the max half-extents (center offset + half node size) over f and its neighbors; `fit = min(vw*0.42/hw, vh*0.42/hh)`; `scale = clamp(fit, min(0.9*home, cap), cap)`, where `home` is the fit-all scale. (The spec's original `0.6*cap` floor was dropped: it left most neighbor sets partly off-screen.)
- **Crossfade bands.** The color card fades to the photo across `--zoom-rel` 0.7-0.9 (card fully visible below 0.7, photo fully visible above 0.9). Edges fade in across 0.65-0.9. Dim nodes relax toward rest opacity when zoomed out.
- **Wheel convention.** Trackpad two-finger scroll pans; pinch (ctrlKey) and mouse-wheel notches zoom. Mode is latched per gesture until 150 ms of silence, so mixed deltas don't flip mid-gesture.
- **Portrait fill.** On portrait viewports the home view zooms extra (`portraitFactor`, up to 1.4x) so the field fills the height.
- **Ids.** `NNN-slug`: zero-padded ordinal (max + 1) plus an ascii slug from the filename, suffixed numerically if the slug is taken. Ids are stable and used as filenames and for ordering (`a.id < b.id`).
- **Touch: tap twice.** The first tap on a node previews its connections (no camera move); tapping the previewed node again focuses it. Hover-only affordances are not relied on for touch.
- **Accessibility.** `Photo.alt` is optional and preserved through Photo Prep re-export; nodes are keyboard-focusable buttons labelled by alt or ordinal.
- **Tab order.** Tab stops depend on focus only, never on hover or keyboard-hover (`computeTabbable`): with nothing focused every node is tabbable; with a node focused only it and its neighbors are (others get `tabIndex=-1`). Order is handled by a Tab/Shift+Tab handler in `App.tsx` that cycles focus through `[focused, ...neighbors by strength]` with `preventDefault` (wrapping; Escape clears focus and restores native Tab). Chosen over positive `tabIndex`, which would reorder the whole page and break tabbing out. `aria-current` follows the focused id, not the visual state, so it survives hover.
- **Layout recomputes on add.** Adding photos re-runs the layout for the whole collection, so existing photos can move and connections can change. This is intentional; pinning existing positions was rejected as unneeded complexity. Ids and image files are stable.
- **Node positioning uses `translate`, not `transform`.** Nodes are placed with the individual CSS `translate` property. Individual transform properties compose as translate, rotate, scale, then `transform`, so the hover/focus `scale: 1.03` would multiply a `transform: translate(...)` position (nodes jumped up to ~31 px and edges stopped short). With `translate` for position, `scale` only grows the box about its own center.
- **Keyboard help (WCAG 2.1.2).** While a node is focused, Tab cycles only among it and its neighbors and Escape exits, which is a trap unless stated. `#kbd-help` ("Tab: connected photos · Enter: follow · Esc: leave") is always in the accessibility tree (opacity 0, never `display:none`) and referenced by `aria-describedby` on each node. It is shown only under `body:has(.photo-node:focus-visible)`, so mouse users never see it.
- **WebP in Photo Prep.** Safari may return PNG from `canvas.toBlob(..., 'image/webp')`. `resize.ts` rejects any non-WebP blob with a clear message and Prep probes once on load and shows a banner (use Chrome).

## Detail view ("look closer")

- **Overlay plus FLIP, not a camera zoom.** `Detail.tsx` is a fixed overlay (paper veil, the photo, a thumbnail strip) that grows the image from the node's on-screen rect to a fitted rect (`utils/flip.ts`: `flip`, `flipBetween`, `fitRect`, `nodeScreenRect`). A camera-zoom detail was rejected: zoom is capped near `1.5*min(vw,vh)/NODE_SIZE`, neighbors would keep overlapping the photo, every node would need its `-lg` image loaded, and the color card would show through `--zoom-rel`. Reduced motion uses a 200 ms fade instead of FLIP.
- **State.** `ThreadState.detailId` is `null` or equal to `focusedId` (invariant). Reducer: `openDetail` only works for the focused id; `focus` while the detail is open moves `detailId` with it (a follow); `clear` resets it; `closeDetail` only clears it. While it is open, hover and preview actions are ignored.
- **Click routing** (`App.onNodeClick`): clicking the focused node opens the detail, except that a mouse click within 350 ms (`DOUBLE_CLICK_MS`) of a focus is the tail of a double-click and is ignored (keyboard is exempt). On touch, a tap on the focused node opens it directly; a tap on a different node previews first, as before. The canvas is `inert` while the detail is open.
- **Camera hand-off.** `useCamera.getTarget()` returns the tween's destination (or the current camera). On close, `prepareReturn` re-times any in-flight camera move to the close duration and computes the node rect from that target (`nodeScreenRect`, including the 1.03 hover/focus scale), so the image and the camera land together. Closing during the opening animation reverses it if the node has not moved, otherwise flips from where the image currently is.
- **Follow cross-fade.** `Detail` keeps up to three "layers" (photo, role, unique key). A follow appends a layer and the old one fades out; the outgoing layer is dropped after 350 ms. The key comes from a counter, not the photo id, because the same photo can be in the list twice while a cross-fade is still running. Each layer shows `-sm` immediately and fades in `-lg` when loaded.
- **Keyboard and focus.** Esc and Tab are captured in `Detail` (capture phase, so `App`'s handlers never see them). Tab cycles the thumbnails and the close button; Enter on a thumbnail follows. The dialog root takes focus on open and after each follow so the new label is announced. After close, focus returns to the focused node (`App`, after the layout effect that removes `inert`).
- **`inert` through a ref.** `VisualCanvas` sets `rootRef.current.inert` in a layout effect because the React 18 types and JSX have no `inert` prop.
- **`.detail:focus-visible`.** Added to the `#kbd-help` visibility selectors in `threads.css`, so the keyboard hint also shows when the dialog root itself has keyboard focus. The help text changes while the detail is open ("Esc: close").
- **Strip.** On desktop the thumbnail strip sits just right of the image (left = image right edge + 48, clamped to the viewport), not at the far edge; at 600 px and below it is a bottom strip. Thumbnail box: 96 px above 900 px wide, 72 px up to 900, 64 px at 600 and below (`--thumb` in `detail.css`, mirrored by `thumbPx` in `Detail.tsx`).
- **One-time hint.** "Click again to look closer." ("Tap" on touch) shows after the first focus, with a 700 ms transition delay so "Follow the visual thread." fades first. It ends at the first open or 8 s after it first showed.

## Shaped layouts

- **Only in Photo Prep.** A shape changes only the x/y in `photos.json`. `buildConnections` stays color-only, so `connections.json` is identical for every shape. The site is unchanged and never computes layout.
- **Mask model** (`shapes.ts`). A `Mask` is a binary grid (row 0 at the top, long side `MASK_SIZE` = 160). Treat masks as immutable (caches are keyed on the object). Built-in shapes are lists of primitives (circle, ellipse, polygon, stroke, each add or subtract) rasterized in pure TypeScript. No `Path2D`, canvas or `ImageData` constructor is used there, so the whole engine is testable in Node. Custom images become a mask in the browser (`maskFromImageData`, with Invert). Shapes are designed for about 45 photos.
- **Algorithm** (`shapedLayout.ts`, `computeShapedLayout`):
  1. Normalize the mask and split the photo count across its connected components by area.
  2. Lloyd relaxation (30 iterations, seeded `mulberry32`) gives n slots, snapped into the mask.
  3. Scale so the mean nearest-slot distance is 320.
  4. Seed: take the Organic layout, match its centroid and per-axis spread to the slots, try all 8 rotations and mirrors, and assign photos to slots with the Hungarian algorithm (`hungarian.ts`) on squared distance. Keep the cheapest.
  5. Refine by pairwise swaps to reduce `sum (0.5+0.5*strength)*d^2 + 0.15*|p - seed|^2`, until a pass makes no swap (max 40).
  6. Collision cleanup with `resolveCollisions` (gap 62), recenter, round to integers.
- **Spacing 320, gap 62.** `LAYOUT_GAP` stays 60 because `overlapCount` hard-codes it; the final resolve uses 62 so rounding cannot leave a pair just under 60. Slot spacing (320 = 4/3 of `NODE_SIZE`) is a separate knob: in prototypes at 300 the resolver moved nodes up to about 200 units and left one or two outside the mask; at 320 it moves nodes little and none end outside. Shapes come out about 1.3x larger than Organic.
- **Results on the owner's 45 photos.** Average connection length versus Organic: flower about 1.10, umbrella about 1.04, heart about 0.87, circle about 0.84. Home zoom versus Organic: flower about -47%, umbrella about -40%, heart and circle slightly larger. When following a photo, at least 43 of 45 neighbor sets fit on screen in every shape.
- **Determinism and Organic.** Same input gives the same output (fixed seed, stable orderings, ties to the lower index). Organic output is byte-identical to before the shape work: the collision code was extracted from `layout.ts` unchanged and checked against golden hashes of the old output. (Those check scripts were run during development and are not in the repo.)
- **Fallbacks.** `fallback: 'empty-mask'` (no inside pixels) or `'too-thin'` (area under 6 per photo) return the Organic positions. Prep then shows "This image doesn't give a usable shape" and labels the layout "Organic (<shape> unusable)".

## Photo Prep

- **Never compute a shaped layout while busy.** Adding files re-commits entries per photo; the shaped result is computed once when busy ends (memoized by entries, k and mask). Meanwhile the Organic result shows and the stats line says "Shaping the layout...". Downloads are disabled while busy.
- **localStorage keys** (`shapeStorage.ts`): `visual-threads:prep-shape:v1` (shape, and for Custom the invert flag and encoded mask, about 4 KB), `visual-threads:prep-k:v1` (integer 2-5), `visual-threads:prep-outline:v1` ("0" hides the outline). All reads and writes are in try/catch; missing or corrupt values fall back to Organic, k = 3, outline on. Storage is per browser, profile and origin, so another port or `127.0.0.1` starts fresh. The mitigation is the always-visible "Layout: <name>" next to Download. The shape is deliberately not written to the project files.
- **`k` inference.** Loading `photos.json` together with `connections.json` in one pick always picks the k in 2-5 whose `buildConnections` count on the loaded photos is closest to the file's count, even if a different k is remembered in this browser. It sets the slider, saves the value, and shows the note "Connections per photo set to N to match your existing data." (Silently keeping a remembered k that differed from the owner's data changed every photo's connections, which is why the remembered value no longer wins here.) Loading only `photos.json` keeps the remembered or default k and shows a visible warning: "Connections weren't loaded, so the connections per photo is N. If your existing data used a different number, load connections.json too." Connections are always recomputed from palettes, not read from the file. Exports are unchanged for the same inputs and k.
- **Underlay.** The normalized mask is drawn behind the preview at 6% opacity through the layout frame, so the owner can see the intended shape and that photos sit inside it. It is faint and optional ("Show outline") because the site shows no outline, and Prep should be able to show what visitors see.
- **Overlap counts.** For the owner's 45 photos, Organic has `overlapCount` 2 (two pairs with a 59-unit gap against 60 required; a rounding effect, invisible). It predates this work and is left alone to keep Organic byte-identical. Shaped layouts are required to report overlaps 0.

## Known limits

- Tall shapes cost first-view zoom (flower about -47%, umbrella about -40% versus Organic).
- The flower is the weakest shape at 45 photos: five petals read best with thumbnails and no connection lines.
- `-lg` images are at most 1800 px (`LG_EDGE`) and look slightly soft on 2x screens.
- Everything in `public/` ships in `dist/`, so remove test or example folders before publishing.
- Shapes assume roughly 30-100 photos.

## Backlog / ideas not done

- Remember the shape in the project files (a sidecar file), so it survives another browser or origin.
- Fewer and larger petals for the flower.
- A preview of the site's first view in Prep (the home zoom a shape gives).
