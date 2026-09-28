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

## Commands

- `npm run dev` - start the dev server (site at localhost:5173, Photo Prep at localhost:5173/prep.html)
- `npm run build` - typecheck and build to `dist/`
- `npm run preview` - serve the built site locally
- `npm run typecheck` - typecheck only

## Adding photos

0. The first time only: open Terminal in the project folder and run `npm install`.
1. Run `npm run dev` and open http://localhost:5173/prep.html in your browser.
2. Choose one:
   - **Starting fresh** (e.g. replacing the placeholders): delete everything in `public/photos/` first.
   - **Adding to your existing collection:** click "Load existing photos.json" and pick `src/data/photos.json`, so the photos already on the site are kept.
3. Drag your photos onto the page. Your original files stay on your computer; they are never added to the project.
4. Check the layout preview, then click "Download all (.zip)".
5. Open Terminal in the project folder and run this one command:
   `unzip -o ~/Downloads/visual-threads-photos.zip`
   (If your browser renamed the file, e.g. "visual-threads-photos (1).zip", use that name instead.)
   **Do not drag the `public` and `src` folders into the project in Finder. That replaces the whole folder and deletes your existing photos.**
6. Commit the changes (the new files in `public/photos/` and `src/data/`).

Good to know:
- When you add photos, the whole arrangement is recalculated, so existing photos may move and some connections may change. Photo ids and files stay the same.
- Optional: to describe a photo for screen readers, edit `src/data/photos.json` and add a short `"alt": "..."` after that photo's `src`. It is never shown on screen, and Photo Prep keeps it when you re-export.
