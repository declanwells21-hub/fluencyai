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
