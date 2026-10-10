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

# Home page (tools/build_home.py)

Home is built from the handoff's "Conversational" direction (1b). Three steps, all run from the repo root:

    python3 tools/record_home.py    # records the hero frames, widget states and coach expressions -> /tmp/home_rec.json
    python3 tools/record_home2.py   # records the pop-ups and waitlist form states              -> /tmp/home_rec2.json
    python3 tools/build_home.py     # writes site/index.html and site/assets/js/home-states.js

The recorders drive the real design (its own React runtime) and store what it renders; site/assets/js/home.js replays
those states in the browser. Scripts import rec_common.py and dc2static.py from tools/ (they expect them on sys.path, and
use /tmp for the recordings). Re-run all three if the handoff's Home page changes.
