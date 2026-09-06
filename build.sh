#!/bin/bash
set -e

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

# Overwrite the placeholder config.js with real values from Vercel's env vars,
# so the plain-HTML marketing site can talk to the same Supabase project the
# Flutter app uses.
cat > dist/config.js << CONFIGEOF
window.__SUPABASE_URL = "$SUPABASE_URL";
window.__SUPABASE_ANON_KEY = "$SUPABASE_ANON_KEY";
CONFIGEOF
