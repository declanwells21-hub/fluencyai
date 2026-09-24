/// What happened when someone tried to sign up.
enum SignUpOutcome {
  /// Account created and logged in immediately (email confirmation is OFF
  /// in Supabase).
  success,

  /// Account created but a 6-digit code was emailed to them - they need to
  /// enter it before they're logged in (email confirmation is ON, which is
  /// what we use with the Brevo/OTP setup).
  needsConfirmation,

  /// Something went wrong (bad email, weak password, email already used...).
  failure,
}

/// Abstract interface. RestAuthRepository (see rest_auth_repository.dart)
/// implementation instead - nothing in the UI layer needs to change.
abstract class AuthRepository {
  Future<SignUpOutcome> signUp(String email, String password);
  Future<bool> logIn(String email, String password);
  Future<void> logOut();
  bool get isLoggedIn;

  /// Verifies the 6-digit code emailed after signup. On success the user is
  /// logged in.
  Future<bool> verifySignUpCode(String email, String code);

  /// Re-sends the signup confirmation code (in case it expired or never
  /// arrived).
  Future<bool> resendSignUpCode(String email);

  /// Emails a 6-digit "reset your password" code to [email]. Always
  /// returns true so people can't use this to probe which emails exist.
  Future<bool> resetPasswordForEmail(String email);

  /// Verifies the reset code. On success the user has a temporary session
  /// that lets them set a new password with [updatePassword].
  Future<bool> verifyRecoveryCode(String email, String code);

  /// Sets a new password. Must be called right after [verifyRecoveryCode]
  /// succeeds (or while already logged in).
  Future<bool> updatePassword(String newPassword);

  /// Permanently deletes the signed-in user's account. The Supabase client
  /// SDK can't delete a user by itself (that needs the service-role key),
  /// so the real implementation calls a Supabase Edge Function - see the
  /// doc comment on RestAuthRepository.deleteAccount for setup notes.
  /// Returns false (never throws) if deletion isn't available.
  Future<bool> deleteAccount();

  /// Starts Google sign-in via Supabase's own OAuth endpoint - see
  /// RestAuthRepository for how the two halves of this fit together:
  ///
  /// - On the web, this navigates the whole tab to Google's consent
  ///   screen. There's nothing more to do here; the app finishes signing
  ///   in on its own once the browser comes back (see
  ///   RestAuthRepository.completeOAuthFromUrl, called from main.dart at
  ///   startup, before runApp()).
  /// - On a native build (iOS/Android), this throws UnimplementedError -
  ///   that needs the google_sign_in package plus Google Cloud OAuth
  ///   clients for each platform, which isn't set up yet. See the
  ///   "Google sign-in" section in README.md for the steps once you build
  ///   real native apps.
  Future<void> beginGoogleSignIn();
}

/// Phase 1-2 fake implementation: kept for reference. The real app now uses
/// RestAuthRepository (see rest_auth_repository.dart).
class FakeAuthRepository implements AuthRepository {
  bool _loggedIn = false;

  @override
  bool get isLoggedIn => _loggedIn;

  @override
  Future<SignUpOutcome> signUp(String email, String password) async {
    await Future.delayed(const Duration(milliseconds: 400));
    _loggedIn = email.isNotEmpty && password.length >= 6;
    return _loggedIn ? SignUpOutcome.success : SignUpOutcome.failure;
  }

  @override
  Future<bool> logIn(String email, String password) async {
    await Future.delayed(const Duration(milliseconds: 400));
    _loggedIn = email.isNotEmpty && password.isNotEmpty;
    return _loggedIn;
  }

  @override
  Future<void> logOut() async {
    _loggedIn = false;
  }

  @override
  Future<bool> verifySignUpCode(String email, String code) async {
    await Future.delayed(const Duration(milliseconds: 300));
    _loggedIn = true;
    return true;
  }

  @override
  Future<bool> resendSignUpCode(String email) async {
    await Future.delayed(const Duration(milliseconds: 300));
    return true;
  }

  @override
  Future<bool> resetPasswordForEmail(String email) async {
    await Future.delayed(const Duration(milliseconds: 300));
    return true;
  }

  @override
  Future<bool> verifyRecoveryCode(String email, String code) async {
    await Future.delayed(const Duration(milliseconds: 300));
    return true;
  }

  @override
  Future<bool> updatePassword(String newPassword) async {
    await Future.delayed(const Duration(milliseconds: 300));
    return true;
  }

  @override
  Future<bool> deleteAccount() async {
    await Future.delayed(const Duration(milliseconds: 300));
    _loggedIn = false;
    return true;
  }

  @override
  Future<void> beginGoogleSignIn() async {
    await Future.delayed(const Duration(milliseconds: 400));
    _loggedIn = true;
  }
}
