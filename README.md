# ul-sketchbook

An open-ended sketchbook for creative code experiments. Zero build step, zero
dependencies: every sketch is a folder with an `index.html` that runs directly
in a browser, on a laptop or a phone.

## Layout

```
index.html            gallery page that lists every sketch
sketches/
  001-first-light/    one folder per sketch, numbered in order of creation
    index.html
    sketch.js
lib/
  sketch.js           tiny shared helpers (canvas setup, resize, loop, rng)
```

## Run locally

Any static file server works. For example:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Add a sketch

1. Copy `sketches/001-first-light` to `sketches/NNN-some-name`.
2. Edit `sketch.js`. The `index.html` rarely needs to change.
3. Add a row to the `SKETCHES` list in `index.html` so it shows in the gallery.

That's it. Commit, push, done.

## Conventions

- Plain ES modules, no bundler. If a sketch needs a library, load it from a CDN
  with a pinned version in that sketch's `index.html`.
- Every sketch should fill the viewport and handle resize, so it looks right on
  a phone.
- Keep sketches self-contained. `lib/` is for helpers that at least two sketches
  share.
