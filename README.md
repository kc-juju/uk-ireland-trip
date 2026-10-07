# 2026 UK & Ireland Honeymoon

A static GitHub Pages travel journal. It has no build step, framework, backend, or API dependency.

## Architecture

```text
index.html / qatar-dining-guide.html  → minimal document shells
styles/                               → presentation layer
js/data/                              → travel content source of truth
js/components.js                      → UI templates that render trusted data
js/app.js                             → itinerary state, navigation and disclosure behavior
js/qatar-dining-guide.js              → Qatar guide bootstrap
assets/                               → local images and airline marks
downloads/                            → printable PDF guides
```

The browser loads the data file first, then `components.js`, then the relevant page bootstrap. The bootstrap renders the document before attaching interaction behavior.

## Updating travel information

- Daily timelines, flights, stays, booking status, links, and overview content: edit `js/data/itinerary-data.js`.
- Qatar menu, drinks, and recommendation content: edit `js/data/qatar-dining-data.js`.
- Layout, colors, typography, responsive rules: edit `styles/app.css` or `styles/qatar-dining-guide.css`.
- Navigation, selected-day state, progressive disclosure behavior: edit `js/app.js`.

Keep the content data and UI templates separate. This preserves the current GitHub Pages deployment model while making itinerary updates safer and easier to review.

## Printable booklet

`downloads/uk-ireland-honeymoon-a4-folded-booklet.pdf` is an A4 landscape PDF imposed for duplex printing. Print at 100% with **short-edge flipping**, then fold each sheet to make an A5 booklet.

`downloads/uk-ireland-honeymoon-black-white-reading-guide.pdf` is the image-free black-and-white edition in normal reading order, intended for screens or low-ink printing.

After itinerary data changes, regenerate it with the bundled PDF runtime:

```bash
/home/jim841019g/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 scripts/generate_print_booklet.py
```
