/// Fill this in once you've deployed the proxy from /server (see server/README.md).
/// This is the ONLY thing the Flutter app talks to for AI features - it never
/// calls Anthropic/Deepgram/Azure directly, so no API keys ever live in the app.
class Env {
  static const String proxyBaseUrl = String.fromEnvironment(
    'PROXY_BASE_URL',
    defaultValue: 'http://localhost:8787',
  );
}
