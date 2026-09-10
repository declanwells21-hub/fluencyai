import 'dart:convert';

import 'package:flutter/foundation.dart' show kIsWeb, defaultTargetPlatform, TargetPlatform;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/config/env.dart';
import 'auth_repository.dart';

/// Real accounts, real sessions - swaps in for FakeAuthRepository with zero
/// changes needed anywhere else, since both implement the same interface.
/// Supabase persists the session on-device automatically, so a signed-in
/// user stays signed in across app restarts without any extra code here.
///
/// Signup confirmation and password reset both use 6-digit email codes
/// (OTP), not links - this avoids needing a working website / deep links
/// for a redirect to land on. Supabase sends both emails through whatever
/// SMTP provider is configured in the dashboard (Brevo).
class SupabaseAuthRepository implements AuthRepository {
  SupabaseClient get _client => Supabase.instance.client;

  @override
  bool get isLoggedIn => _client.auth.currentSession != null;

  @override
  Future<SignUpOutcome> signUp(String email, String password) async {
    try {
      final res = await _client.auth.signUp(email: email, password: password);
      if (res.session != null) return SignUpOutcome.success;
      if (res.user != null) return SignUpOutcome.needsConfirmation;
      return SignUpOutcome.failure;
    } on AuthException {
      return SignUpOutcome.failure;
    }
  }

  @override
  Future<bool> logIn(String email, String password) async {
    try {
      final res = await _client.auth.signInWithPassword(email: email, password: password);
      if (res.session != null) {
        _reportActivity(res.session!.accessToken);
      }
      return res.session != null;
    } on AuthException {
      return false;
    }
  }

  @override
  Future<void> logOut() async {
    await _client.auth.signOut();
  }

  @override
  Future<bool> verifySignUpCode(String email, String code) async {
    try {
      final res = await _client.auth.verifyOTP(
        email: email,
        token: code,
        type: OtpType.signup,
      );
      if (res.session != null) {
        _reportActivity(res.session!.accessToken);
      }
      return res.session != null;
    } on AuthException {
      return false;
    }
  }

  @override
  Future<bool> resendSignUpCode(String email) async {
    try {
      await _client.auth.resend(type: OtpType.signup, email: email);
      return true;
    } on AuthException {
      return false;
    }
  }

  @override
  Future<bool> resetPasswordForEmail(String email) async {
    try {
      // No redirectTo - we want Supabase to email a 6-digit code, not a
      // link, so the user never needs to leave the app.
      await _client.auth.resetPasswordForEmail(email);
      return true;
    } catch (_) {
      // Still return true - don't reveal whether the email exists.
      return true;
    }
  }

  @override
  Future<bool> verifyRecoveryCode(String email, String code) async {
    try {
      final res = await _client.auth.verifyOTP(
        email: email,
        token: code,
        type: OtpType.recovery,
      );
      return res.session != null;
    } on AuthException {
      return false;
    }
  }

  @override
  Future<bool> updatePassword(String newPassword) async {
    try {
      await _client.auth.updateUser(UserAttributes(password: newPassword));
      return true;
    } on AuthException {
      return false;
    }
  }

  /// Permanently deletes the signed-in user's account and all their data.
  ///
  /// SETUP NEEDED: the Supabase client SDK only has permission to delete the
  /// *currently signed-in user's own row/session for things it owns - it
  /// cannot delete an auth user outright (that requires the service-role
  /// key, which must never ship inside the app). The standard pattern is a
  /// Supabase Edge Function that runs server-side with the service role and
  /// deletes the caller's own account - this calls one named
  /// "delete-account". Until that function is deployed, this will fail
  /// gracefully and the Settings screen shows a "contact support" message
  /// instead of a broken button.
  @override
  Future<bool> deleteAccount() async {
    try {
      final res = await _client.functions.invoke('delete-account');
      if (res.status != 200) return false;
      await _client.auth.signOut();
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Fire-and-forget ping so the admin dashboard's "active users" and
  /// country/device breakdowns have something to show. Never blocks or
  /// fails login if it doesn't succeed - this is purely analytics, not
  /// something the user's experience should ever depend on.
  ///
  /// Also carries the Fluency Creator Program referral code, if this
  /// session started from a creator's link - see _referralCode() below.
  /// api/track-activity.js only ever writes it once (it won't overwrite an
  /// existing referred_by_code), so it's safe to send on every login, not
  /// just the first one.
  void _reportActivity(String accessToken) {
    final referredByCode = _referralCode();
    http
        .post(
          Uri.parse('${Env.proxyBaseUrl}/track-activity'),
          headers: {
            'Authorization': 'Bearer $accessToken',
            'Content-Type': 'application/json',
          },
          body: jsonEncode({
            'device': _currentDevice(),
            if (referredByCode != null) 'referredByCode': referredByCode,
          }),
        )
        .catchError((_) => http.Response('', 0));
  }

  /// Reads ?ref=CODE from the page URL on web - set when someone arrives
  /// via a creator's referral link (fluencyai.app/?ref=CODE ->
  /// /app/auth?mode=signup&ref=CODE, rewritten client-side by
  /// spawnReferralCapture() in site/app.js). Native iOS/Android builds have
  /// no comparable URL to read here, so this is web-only by design - not a
  /// gap, just the only place this particular link path exists today.
  String? _referralCode() {
    if (!kIsWeb) return null;
    final ref = Uri.base.queryParameters['ref'];
    if (ref == null) return null;
    final trimmed = ref.trim();
    return trimmed.isEmpty ? null : trimmed;
  }

  String _currentDevice() {
    if (kIsWeb) return 'web';
    switch (defaultTargetPlatform) {
      case TargetPlatform.iOS:
        return 'ios';
      case TargetPlatform.android:
        return 'android';
      default:
        return 'unknown';
    }
  }
}

final authRepositoryProvider = Provider<AuthRepository>((ref) => SupabaseAuthRepository());
