# Visual Threads

## Project Overview

This is an interactive visual exploration website for photographs.

The core concept is visual continuity: photographs should be connected
through visual properties rather than conventional semantic categories.

## Design Principles

- Photography is the primary visual material.
- Prefer visual exploration over search.
- Avoid conventional gallery/grid layouts.
- Keep UI minimal.
- Avoid unnecessary AI/API/backend infrastructure.
- Prefer offline preprocessing and static data.
- Prefer simple interactions over technically complex interactions.

## Development Principles

- Keep the architecture lightweight.
- Do not add dependencies without a clear reason.
- Do not introduce a backend unless explicitly requested.
- Keep visual metadata separate from UI components.
- Preserve existing functionality.
- Make incremental changes.
- Test changes before considering a task complete.

## Reference

The detailed product/design specification is:

docs/visual-threads-plan.md

See docs/design-notes.md for architecture and decisions.

## Commands

- `npm run dev` - start the dev server (site at localhost:5173, Photo Prep at localhost:5173/prep.html)
- `npm run build` - typecheck and build to `dist/`
- `npm run preview` - serve the built site locally
- `npm run typecheck` - typecheck only

## Adding photos

Use Chrome. (Safari may not be able to save WebP images, and Photo Prep will tell you if so.) iPhone HEIC photos aren't supported; export them as JPEG first (Photos → File → Export).

0. The first time only: open Terminal in the project folder and run `npm install`.
1. Run `npm run dev` and open http://localhost:5173/prep.html in your browser.
2. Choose one:
   - **Starting fresh** (e.g. replacing the placeholders): delete everything in `public/photos/` first.
   - **Adding to your existing collection:** click "Load existing photos.json" and pick `src/data/photos.json`, so the photos already on the site are kept.
3. Drag your photos onto the page. Your original files stay on your computer; they are never added to the project.
4. Check the layout preview, then click "Download all (.zip)".
5. Open Terminal in the project folder and run this one command:
   `unzip -o ~/Downloads/"visual-threads-photos.zip"`
   (If your browser renamed the file, e.g. "visual-threads-photos (1).zip", use that name instead, keeping the quotes.)
   **Do not drag the `public` and `src` folders into the project in Finder. That replaces the whole folder and deletes your existing photos.**
6. Commit the changes (the new files in `public/photos/` and `src/data/`).

Good to know:
- When you add photos, the whole arrangement is recalculated, so existing photos may move and some connections may change. Photo ids and files stay the same.
- **Connections per photo (important).** Photo Prep has a "Connections per photo" slider. If you add photos with a different value than before, the connections of *all* photos change. The easiest safe way: in step 2, pick **both** `src/data/photos.json` and `src/data/connections.json` together. Prep then sets the slider to match your existing data and shows a note saying so. (It does this only when this browser has no remembered slider value yet. If you don't see the note, check that the slider shows the value you used before.) Prep also remembers the last slider value in this browser.
- **Choosing a shape.** The Shape row in Prep lets you pick how the whole collection is arranged: **Organic** (the default, arranged by color), **Flower**, **Umbrella**, **Heart**, **Circle**, or **Custom image**. For a custom image, upload a bold, filled silhouette (dark on light, or on a transparent background); tick **Invert** if the shape is light on a dark background. Similar photos stay close together inside any shape, and a shape never changes which photos are connected, only where they sit.
  - The layout preview shows a faint outline of the shape behind it. Untick **Show outline** to see what the site really looks like.
  - A stats line shows how long connections are compared with Organic, and how many photos overlap.
  - "Layout: <name>" is always shown next to the Download button. **Check it before you download.**
  - Shapes work best for roughly 30-100 photos. Tall shapes (Flower, Umbrella) make the first view of the site smaller than Organic. That is normal.
- **Prep remembers your shape and slider in this browser only.** If you open Prep in another browser, on another port (for example 5174 instead of 5173) or at 127.0.0.1, it forgets and goes back to Organic, so check "Layout:" before you download. The shape itself isn't saved in the project files, only the resulting positions.
- Optional: to describe a photo for screen readers, edit `src/data/photos.json` and add a short `"alt": "..."` after that photo's `src`. It is never shown on screen, and Photo Prep keeps it when you re-export.

## Using the site

- Hover a photo to see its connections.
- Click a connection or a photo to follow it.
- Click the focused photo again to look closer (tap on a phone). In the close-up, click a thumbnail to follow the thread, and press Esc, click the ×, or click anywhere else to return to the graph.
- Keyboard: Tab moves between the focused photo and its neighbors, Enter follows or opens, Esc goes back.

## Layout options and where the code lives

- Layouts are computed only in Photo Prep and end up as x/y values in `src/data/photos.json`. The site never computes layout.
- Organic is `src/analysis/layout.ts`. Shapes are `src/analysis/shapedLayout.ts` (the algorithm) and `src/analysis/shapes.ts` (the shapes and masks).
- The shape picker and its remembered choice are in `src/prep/` (`ShapePicker.tsx`, `shapeStorage.ts`).
- The close-up view is `src/site/components/Detail.tsx`.
- Reasons behind decisions are in `docs/design-notes.md`.

## Removing a photo

1. Open Photo Prep, click "Load existing photos.json" and pick `src/data/photos.json`.
2. Click the × on the photo you want to remove.
3. Download the zip and unzip it as usual (step 5 above).
4. Delete the two image files for that photo in `public/photos/` (Photo Prep names them, e.g. `007-fern-sm.webp` and `007-fern-lg.webp`).

## Publishing

Run `npm run build`, then upload the `dist/` folder to any static host. For a sub-path (for example GitHub Pages at `/repo-name/`), set `base: '/repo-name/'` in `vite.config.ts` before building.
