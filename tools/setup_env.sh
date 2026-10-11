#!/bin/sh
# Recreates the local copies the build/test tools expect (the design handoff loads these from unpkg).
# Run once per new session. Needs node/npm and network access to registry.npmjs.org.
set -e
mkdir -p /tmp/vend /tmp/lu && cd /tmp/vend
npm pack react@18.3.1 react-dom@18.3.1 @babel/standalone@7.29.0 lenis@1.1.13 --silent
mkdir -p x_react-18.3.1 x_react-dom-18.3.1 x_babel-standalone-7.29.0 l
tar xzf react-18.3.1.tgz -C x_react-18.3.1
tar xzf react-dom-18.3.1.tgz -C x_react-dom-18.3.1
tar xzf babel-standalone-7.29.0.tgz -C x_babel-standalone-7.29.0
tar xzf lenis-1.1.13.tgz -C l
cd /tmp/lu && npm pack lucide@0.454.0 --silent && tar xzf lucide-0.454.0.tgz
pip install playwright beautifulsoup4 pillow --break-system-packages -q || true
python3 -m playwright install chromium || true
echo "env ready"
# Then: unzip zip 2 to /home/claude/z2 (gives /home/claude/z2/fluency-handoff/), zip 3 to /home/claude/z3,
# and the current GitHub repo to /home/claude/work3 (so the site folder is /home/claude/work3/site).
# Copy tools/recordings/home_rec*.json to /tmp/ if you need to re-run tools/build_home.py.
