# tools/dc2static.py

Turns one design-handoff page (`*.dc.html`) into a static HTML file for `site/`.
Not deployed (lives outside `site/`). Needs: python3, playwright + chromium, beautifulsoup4.

The handoff pages load React, Babel, Lucide and Lenis from unpkg, so the tool serves local copies. Get them once:

    mkdir -p /tmp/vend && cd /tmp/vend
    npm pack react@18.3.1 react-dom@18.3.1 @babel/standalone@7.29.0 lenis@1.1.13
    cd /tmp && npm pack lucide@0.454.0
    # unpack each .tgz and point VENDOR in dc2static.py at the files (paths at the top of the script)

Run:  HANDOFF_DIR=/path/to/fluency-handoff/ python3 tools/dc2static.py "Pricing v3.dc.html" site/pricing.html

What it does: renders the page in headless Chromium, keeps the finished HTML (icons become inline SVG, the coach stays
a <fl-coach> element), removes the React runtime attributes, maps page links to site routes (/store, /pricing ...),
adds a press effect class to design-system buttons, and writes the page head and styles.
What it does NOT do: page behaviour (tabs, filters, calculators, forms). Those are written by hand per page.

# Home page, design 1a "Product-forward" (tools/build_home_1a.py)

Home is compiled, like Store, Pricing and Partners (no recording). The design file is kept in the repo at
`tools/design/Fluency Home v3 (1a product-forward).dc.html`. Run from the repo root:

    python3 tools/build_home_1a.py     # writes site/index.html and site/assets/js/home.js
    python3 tools/test_home_1a.py      # 41 browser checks (interactions, forms, pop-ups, links, mobile, SEO data)

`build_home_1a.py` keeps the 1a direction and the shared sections, removes the 1b direction and the review-only direction
switcher, compiles the design's own template and script, and pre-renders it in headless Chromium. Every change from the
design file is listed at the top of the script and asserted, so if the design file changes in a way a patch no longer fits,
the build fails loudly instead of silently dropping it. The head of the page (SEO tags, structured data, app tags) is taken
from the current site/index.html, so edit those there. To use a newer design: replace the design file and re-run both commands.

**Superseded:** `build_home.py`, `record_home.py`, `record_home2.py`, `test_home.py` and `compare_dom.py` built the earlier
"Conversational" Home by recording the design in its own React runtime. They are kept for reference only; running them would
overwrite the new Home with the old one.

# Store, Pricing and Partners (tools/build_pages.py)

These three pages are compiled, not recorded: tools/dc2js.py turns the handoff's templates (and the Coach and GuideCover
components) into plain JavaScript; site/assets/js/fl-dc.js is a small runtime with the design's setState/re-render
semantics, its Icon, Wordmark and Button components, and a React-style patcher.

    python3 tools/build_pages.py            # writes site/{store,pricing,partners}.html, assets/js/{store,pricing,partners,fl-components}.js
    python3 tools/test_pages.py store       # pixel comparison against the design, per state, at 1280 and 390
    python3 tools/compare_dom.py store '{"cur":"EUR"}'   # structure + computed-style comparison for one state

Pages are pre-rendered (for search engines and no flash) by running the same runtime in headless Chromium.
Catalogue data lives in site/fluency-data.js (guides, Selar codes, prices, commission rules).
The Partner Hub sample data that used to ship inside it is kept in docs/partner-hub-sample-data.txt for Phase 5.
