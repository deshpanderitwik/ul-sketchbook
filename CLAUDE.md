# ul-sketchbook

Creative code sketchbook. Zero build step, zero npm dependencies. Everything is
plain HTML + ES modules served as static files, so it runs from a laptop, a
phone browser, or GitHub Pages without tooling.

## Adding a sketch

- Copy `sketches/001-first-light/` to `sketches/NNN-kebab-name/` using the next
  number. Edit `sketch.js`; leave `index.html` mostly alone (update the title).
- Register it in the `SKETCHES` array in the root `index.html`.
- Use helpers from `lib/sketch.js` (`createSketch`, `rng`, `lerp`, `map`,
  `clamp`, `TAU`). Only add to `lib/` when two or more sketches share the code.
- External libraries: load from a CDN with a pinned version inside that sketch's
  `index.html`. Do not add a package.json or bundler.

## Constraints

- Sketches must fill the viewport, handle resize, and work with touch input.
- Keep each sketch self-contained so any one can be deleted without breaking
  others.
- One commit per sketch or per meaningful iteration. Short messages like
  `007: noise field, first pass`.

## Running

`python3 -m http.server <port>` from the repo root, or open GitHub Pages.
