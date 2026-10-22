#!/bin/bash
set -e

# Preview deployments (the links you share for review) skip the Flutter web app. It is only for internal testing at /app,
# it makes every deployment tens of megabytes larger and adds minutes to the build. Production always builds it, exactly as before.
# To get the Flutter app on a preview too, set BUILD_FLUTTER=true in that project's Vercel environment variables.
if [ "${VERCEL_ENV:-production}" = "production" ] || [ "${BUILD_FLUTTER:-}" = "true" ]; then
  git clone https://github.com/flutter/flutter.git -b stable --depth 1 _flutter_sdk
  export PATH="$PWD/_flutter_sdk/bin:$PATH"

  flutter config --enable-web
  flutter create . --platforms=web
  flutter pub get
  flutter build web --base-href=/app/ \
    --dart-define=PROXY_BASE_URL=/api \
    --dart-define=SUPABASE_URL=$SUPABASE_URL \
    --dart-define=SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY

  rm -rf dist
  mkdir -p dist/app
  cp -r site/. dist/.
  cp -r build/web/. dist/app/.
else
  echo "Preview deployment: skipping the Flutter web build (set BUILD_FLUTTER=true to include it)."
  rm -rf dist
  mkdir -p dist/app
  cp -r site/. dist/.
  cat > dist/app/index.html << 'APPEOF'
<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Not built on previews</title></head>
<body style="font-family:system-ui,sans-serif;background:#04121B;color:#D8E4EA;display:grid;place-items:center;min-height:100vh;margin:0"><p>The web app is only built on the production site.</p></body></html>
APPEOF
fi

# Overwrite the placeholder config.js with real values from Vercel's env vars,
# so the plain-HTML marketing site can talk to the same Supabase project the
# Flutter app uses.
cat > dist/config.js << CONFIGEOF
window.__SUPABASE_URL = "$SUPABASE_URL";
window.__SUPABASE_ANON_KEY = "$SUPABASE_ANON_KEY";
CONFIGEOF
