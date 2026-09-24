import 'dart:html' as html;

/// Removes the `#access_token=...` fragment Supabase appends to the URL
/// after a Google sign-in redirect. Without this, go_router's hash-based
/// web routing (the Flutter default - see README.md) would try to treat
/// that leftover token text as a route the next time it reads the URL,
/// instead of landing on '/' as usual. Called from
/// RestAuthRepository.completeOAuthFromUrl, before go_router ever builds -
/// see main.dart, where that happens before runApp().
void clearOAuthUrlFragment() {
  final clean = Uri.base.replace(fragment: '').toString();
  html.window.history.replaceState(null, '', clean);
}
