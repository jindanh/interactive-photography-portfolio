# Project: Visual Threads — Interactive Photo Exploration

## 1. Project Motivation

Build an interactive website for exploring a personal collection of photographs through
VISUAL CONTINUITY rather than conventional semantic or chronological organization.

Traditional photo galleries organize images by:
- date
- location
- people
- albums
- categories
- grid layouts

This project explores a different interaction paradigm:

> Instead of organizing photographs into predefined categories, let photographs
> connect to one another through shared visual properties.

For example:

Photo A
  ↓ shared blue color
Photo B
  ↓ circular shape
Photo C
  ↓ similar composition
Photo D

The user should feel that they are "following a visual thread" through the collection.

The goal is NOT to build an AI-powered photo classification system.
The goal is to create an engaging visual interaction for discovering relationships
between photographs.

A key design principle is:

> Don't organize photos. Let photos organize each other.

---

# 2. Core User Experience

The primary interaction loop should be:

    See → Discover connection → Follow → Explore → Discover another connection

The user should not feel like they are browsing a traditional gallery.

Instead, they should feel like:
- one photograph leads to another
- visual similarities form paths through the collection
- the collection has an underlying visual landscape
- they can discover relationships they were not explicitly looking for

The website should prioritize exploration over search.

---

# 3. MVP Scope

Start with a small MVP using approximately 30–50 photographs.

DO NOT build:
- backend
- database
- authentication
- user accounts
- external APIs
- LLM integration
- runtime AI inference
- cloud storage
- complicated CMS
- unnecessary framework infrastructure

The website should be deployable as a static website.

All data should live locally in the project.

---

# 4. Visual Representation

Each photograph should have a lightweight visual representation.

For MVP, use only a few properties:

- dominant color(s)
- brightness
- optionally saturation
- optionally aspect ratio

Example metadata:

{
  "id": "001",
  "src": "/photos/001.jpg",
  "colors": ["#2E5D73", "#D9C38A", "#F2EEE2"],
  "brightness": 0.64,
  "saturation": 0.51
}

Do not over-engineer the visual analysis.

If automatic extraction is useful, implement it as an OFFLINE preprocessing step.

Runtime should only consume static JSON.

---

# 5. Visual Relationship Graph

Represent the photo collection as a graph.

Each photograph is a node.

Connections represent visual similarity.

Example:

Photo 001
 ├── Photo 037 (color similarity)
 ├── Photo 082 (brightness similarity)
 └── Photo 114 (composition similarity)

For the MVP, color similarity should be the primary relationship.

A connection can have:

{
  "source": "001",
  "target": "037",
  "type": "color",
  "strength": 0.91
}

The system should be able to find the strongest few connections for each photograph.

Do not connect every photograph to every other photograph.

Aim for approximately 2–5 meaningful connections per photo.

---

# 6. Main Interaction: Follow a Visual Thread

The central interaction should be:

1. User sees a photograph.
2. Nearby related photographs or visual connections are discoverable.
3. Hovering over a connection should reveal/highlight it.
4. Clicking a connection should move the user toward the connected photograph.
5. The transition should feel spatial rather than like opening a new page.
6. The newly selected photograph becomes the center/focus.
7. New visual connections become available.
8. User can continue following the thread indefinitely.

Avoid standard:
- modal image viewer
- next/previous buttons
- traditional carousel behavior

The interaction should feel like navigating a visual space.

---

# 7. Spatial Layout

Do NOT use a standard rectangular photo grid as the primary layout.

Explore a spatial layout such as:

- force-directed graph
- radial layout
- organic free-form layout
- curved paths between photographs

Example conceptual structure:

                  [Photo B]

                      |
                      |
[Photo C] -------- [Photo A] -------- [Photo D]

                      |
                      |
                  [Photo E]

The exact layout can be simplified for the MVP.

Prioritize:
- visual clarity
- smooth transitions
- discoverability
- minimal clutter

---

# 8. Visual Connections

Connections should be visually subtle.

Do NOT draw a large network of permanent lines.

Instead:

- show only nearby/relevant connections
- reveal connections on hover
- animate them when relevant
- emphasize the currently active visual thread

A connection might be represented by:
- a thin line
- a color gradient
- a subtle glow
- a flowing animated stroke
- a small visual cue

The connection should feel like a visual relationship rather than a technical graph edge.

---

# 9. Photo ↔ Color Card Transformation

An important secondary interaction is the relationship between a photograph and
its visual abstraction.

A photograph can visually transform into a color-card representation.

For example:

PHOTO:

+----------------+
|                |
|     IMAGE      |
|                |
+----------------+

can transition into:

+--------+
|  BLUE  |
|  BLUE  |
|  GOLD  |
|  WHITE |
+--------+

When zooming out, photographs may become smaller and increasingly abstract,
eventually forming a visual field of color cards.

When zooming in, the color abstraction becomes the original photograph again.

This should feel like:

    photograph → visual abstraction → visual landscape

rather than simply hiding/showing an image.

This interaction can be implemented after the basic visual-thread interaction works.

---

# 10. Zoom Interaction

Implement spatial zoom.

Zoomed in:
- large photographs
- visible image details
- active connections

Zoomed out:
- photographs become smaller
- visual relationships become more apparent
- photographs may transition toward color/palette cards

Potential final state:

    [blue][blue][green][yellow][yellow]
    [blue][green][green][yellow][orange]
    [purple][blue][green][orange][red]

The collection should feel like a visual landscape.

---

# 11. Interaction States

Design explicit states for the photo nodes:

### Default
Photographs are visible but relatively quiet.

### Hover
The selected photograph becomes more prominent.
Relevant visual connections begin to appear.

### Focused
The selected photograph becomes the central object.

### Transition
The camera/view smoothly moves toward the connected photograph.

### Connected
The active relationship is visually emphasized.

### Zoomed Out
Photos become smaller and more abstract.

Avoid excessive animations.
Animations should communicate spatial relationships.

---

# 12. Visual Design Direction

The overall visual language should be:

- minimal
- editorial
- photographic
- spatial
- quiet
- slightly experimental
- sophisticated rather than "tech demo"

Avoid:
- generic dashboard UI
- excessive buttons
- card-heavy SaaS design
- excessive text
- obvious AI aesthetics
- neon cyberpunk styling
- overly decorative animations

The photographs should remain the primary visual material.

UI should be almost invisible.

---

# 13. Suggested Technology

Use a lightweight modern frontend.

Preferred:

- React
- Vite
- JavaScript or TypeScript
- CSS
- SVG and/or Canvas for spatial visualization

Use additional libraries only when they materially simplify implementation.

Potentially useful:
- Framer Motion for transitions
- D3 only if needed for graph/layout behavior

Do NOT add large dependencies without a clear reason.

The final result should remain easy to understand and modify.

---

# 14. Suggested Architecture

Organize the code into clear modules.

Example:

src/
  components/
    PhotoNode
    Connection
    VisualCanvas
    ZoomController
    Intro
  data/
    photos.json
    connections.json
  utils/
    colorSimilarity
    layout
    visualSimilarity
  styles/
  App

Keep visual data separate from UI logic.

Do not hard-code relationships directly into React components.

---

# 15. Data Pipeline

Design the system so that visual metadata can eventually be generated offline.

Possible workflow:

photos/
    001.jpg
    002.jpg
    ...

        ↓ preprocessing

metadata.json

        ↓

connections.json

        ↓

React application

The browser should NOT need to call an external service to understand the photographs.

For the first prototype, manually authored metadata is acceptable.

---

# 16. Progressive Implementation

Implement the project in phases.

## Phase 1 — Basic Photo Space

Goal:
Create a spatial canvas containing 20–50 photographs.

Requirements:
- photos load correctly
- photos can be positioned spatially
- smooth pan/zoom
- hover interaction
- responsive behavior

Do not implement advanced similarity yet.

---

## Phase 2 — Visual Relationships

Add:
- color metadata
- similarity calculation
- graph connections
- strongest 2–5 relationships per photo

Implement visual connection rendering.

---

## Phase 3 — Follow Interaction

Implement:

photo A
    ↓ click connection
photo B

Requirements:
- smooth camera transition
- selected photo becomes focus
- new connections appear
- previous photo remains spatially meaningful

This phase should establish the core "visual thread" experience.

---

## Phase 4 — Color Abstraction

Add:
- dominant-color palette
- photo → color-card transition
- zoom-dependent abstraction

At high zoom:
    photograph

At low zoom:
    color representation

---

## Phase 5 — Visual Polish

Improve:
- transitions
- spacing
- typography
- connection animations
- hover behavior
- visual hierarchy
- loading behavior

Do NOT add features simply because they are technically interesting.

Every interaction should reinforce visual exploration.

---

# 17. Initial Landing Experience

The first screen should be intentionally minimal.

Potentially:

    VISUAL THREADS

    Follow where one image leads.

Then transition into the photo space.

Avoid a conventional:
"Welcome / Upload / Browse Gallery" interface.

The user should enter the visual space quickly.

---

# 18. Important UX Question

The prototype should answer one central question:

> Can a user understand and enjoy the idea of following visual continuity
> without being explicitly told how the entire system works?

Therefore, interaction discoverability matters.

Use:
- subtle motion
- hover previews
- proximity
- visual cues

instead of large instructional text.

A very short instruction such as:

    Follow the visual thread.

may be enough.

---

# 19. Performance Constraints

The website should work smoothly with approximately 30–100 photos.

Avoid:
- runtime image analysis
- expensive computer vision
- unnecessary WebGL
- continuous expensive calculations
- API calls
- large animation loops

Precompute whenever possible.

Images should use:
- appropriate resolution
- lazy loading where appropriate
- compressed formats when possible

---

# 20. Code Quality Requirements

Before implementation:

1. Inspect the existing repository.
2. Understand the current structure.
3. Do not overwrite existing work unnecessarily.
4. Create a clear implementation plan.
5. Identify reusable components.
6. Implement incrementally.
7. Keep commits logically separated if Git is available.

After implementation:

1. Run the project.
2. Check for console errors.
3. Test desktop interaction.
4. Test mobile/responsive behavior.
5. Verify zoom and pan.
6. Verify photo transitions.
7. Verify connection interactions.
8. Verify performance with 30–50 images.

---

# 21. Important Design Constraints

The project should NOT become:

"an AI photo organization website."

It should remain:

"an interactive visual exploration of a photograph collection."

Technology should support the experience, not become the experience.

Prefer a simple, elegant interaction over a technically sophisticated but confusing one.

---

# 22. First Task for Claude Code

Before writing substantial code:

1. Inspect the repository.
2. Identify the current stack.
3. Determine whether a frontend already exists.
4. Propose the minimal architecture for this project.
5. Identify what can be reused.
6. Create a short implementation plan.
7. Ask for confirmation ONLY if there is a genuinely important ambiguity.

Then implement Phase 1 and Phase 2 first.

Do not jump directly into advanced AI/CV/embedding systems.

The first milestone should be:

> A visually compelling spatial photo collection where photos can be explored
> and followed through simple color-based visual relationships.