/// Non-web platforms (iOS/Android) have no address bar, so there is
/// nothing to clean up after a Google sign-in redirect. This file is
/// selected instead of oauth_url_cleanup_web.dart on those platforms - see
/// the conditional import at the top of rest_auth_repository.dart.
void clearOAuthUrlFragment() {}
