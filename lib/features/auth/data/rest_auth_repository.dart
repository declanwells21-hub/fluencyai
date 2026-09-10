import 'dart:convert';

import 'package:flutter/foundation.dart' show kIsWeb, defaultTargetPlatform, TargetPlatform;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/config/env.dart';
import '../../../core/config/supabase_config.dart';
import 'auth_repository.dart';

/// Talks to Supabase Auth directly over plain HTTP instead of going through
/// supabase_flutter's GoTrue client for the actual sign-up / verify / login
/// / reset calls.
///
/// Why: the site (site/auth.js) hit a confirmed upstream Supabase bug where
/// the JS client's internal cross-tab lock (used to serialize auth calls)
/// could get stuck and hang forever, making a correct 6-digit code look
/// like it was "incorrect or expired" - the request never even reached the
/// network. The Dart client is a different codebase, but shares the same
/// design (a client-side lock guarding every auth call) and the same
/// symptom was reported here. Rather than debug two separate SDK
/// implementations, both now bypass their SDK's auth internals entirely
/// for these calls: one plain HTTP request in, one clear response out,
/// nothing that can silently hang.
///
/// The rest of the app (plan, profile, checkout repositories) still reads
/// data through `Supabase.instance.client` for its database queries, so
/// after a successful login/verify here, [_hydrateSdkSession] pushes the
/// resulting tokens into that SDK client with `setSession()` - a single,
/// well-defined call - so the rest of the app keeps working unchanged.
class RestAuthRepository implements AuthRepository {
  static const _sessionPrefsKey = 'fl_rest_session';

  final http.Client _http = http.Client();
  Map<String, dynamic>? _session;

  String get _baseUrl => SupabaseConfig.url.replaceAll(RegExp(r'/$'), '');
  String get _anonKey => SupabaseConfig.anonKey;

  Map<String, String> _headers({String? accessToken}) => {
        'apikey': _anonKey,
        'Content-Type': 'application/json',
        if (accessToken != null) 'Authorization': 'Bearer $accessToken',
      };

  Future<Map<String, dynamic>?> _post(
    String path, {
    Map<String, dynamic>? body,
    String? accessToken,
    Map<String, String>? query,
  }) async {
    var uri = Uri.parse('$_baseUrl$path');
    if (query != null) uri = uri.replace(queryParameters: query);
    final res = await _http.post(
      uri,
      headers: _headers(accessToken: accessToken),
      body: body != null ? jsonEncode(body) : null,
    );
    return _handle(res);
  }

  Future<Map<String, dynamic>?> _put(
    String path, {
    Map<String, dynamic>? body,
    String? accessToken,
  }) async {
    final res = await _http.put(
      Uri.parse('$_baseUrl$path'),
      headers: _headers(accessToken: accessToken),
      body: body != null ? jsonEncode(body) : null,
    );
    return _handle(res);
  }

  Map<String, dynamic>? _handle(http.Response res) {
    Map<String, dynamic>? data;
    if (res.body.isNotEmpty) {
      try {
        final decoded = jsonDecode(res.body);
        if (decoded is Map<String, dynamic>) data = decoded;
      } catch (_) {
        // empty/non-JSON body on some successful responses (e.g. logout)
      }
    }
    if (res.statusCode < 200 || res.statusCode >= 300) {
      final message = data?['msg'] ?? data?['error_description'] ?? data?['message'] ?? 'Request failed (${res.statusCode})';
      throw AuthApiException(message.toString(), statusCode: res.statusCode);
    }
    return data;
  }

  Future<void> _saveSession(Map<String, dynamic> session) async {
    _session = session;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_sessionPrefsKey, jsonEncode(session));
    await _hydrateSdkSession(session);
  }

  Future<void> _clearSession() async {
    _session = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_sessionPrefsKey);
  }

  /// Loads a previously-saved session, if any, so [isLoggedIn] and app
  /// restarts behave the same as before this rewrite.
  Future<void> restoreSession() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_sessionPrefsKey);
    if (raw == null) return;
    try {
      final session = jsonDecode(raw) as Map<String, dynamic>;
      _session = session;
      await _hydrateSdkSession(session);
    } catch (_) {
      await prefs.remove(_sessionPrefsKey);
    }
  }

  /// Pushes tokens into the existing supabase_flutter client so the rest
  /// of the app's database queries (plan, profile, checkout) keep working
  /// exactly as before - this is the SDK's own, single-purpose
  /// `setSession` call, not the auth flow that was hanging.
  Future<void> _hydrateSdkSession(Map<String, dynamic> session) async {
    final refreshToken = session['refresh_token'] as String?;
    if (refreshToken == null) return;
    try {
      await Supabase.instance.client.auth.setSession(refreshToken);
    } catch (_) {
      // Non-fatal: auth itself succeeded even if the SDK client couldn't
      // be hydrated (e.g. transient network hiccup). Database calls that
      // need a session will surface their own error if this matters.
    }
  }

  @override
  bool get isLoggedIn => _session != null;

  @override
  Future<SignUpOutcome> signUp(String email, String password) async {
    try {
      final res = await _post('/auth/v1/signup', body: {'email': email, 'password': password});
      if (res != null && res['access_token'] != null) {
        await _saveSession(res);
        return SignUpOutcome.success;
      }
      if (res != null && res['id'] != null) {
        return SignUpOutcome.needsConfirmation;
      }
      return SignUpOutcome.failure;
    } on AuthApiException {
      return SignUpOutcome.failure;
    } catch (_) {
      return SignUpOutcome.failure;
    }
  }

  @override
  Future<bool> logIn(String email, String password) async {
    try {
      final res = await _post(
        '/auth/v1/token',
        query: {'grant_type': 'password'},
        body: {'email': email, 'password': password},
      );
      if (res == null || res['access_token'] == null) return false;
      await _saveSession(res);
      _reportActivity(res['access_token'] as String);
      return true;
    } catch (_) {
      return false;
    }
  }

  @override
  Future<void> logOut() async {
    final token = _session?['access_token'] as String?;
    if (token != null) {
      try {
        await _post('/auth/v1/logout', accessToken: token, query: {'scope': 'local'});
      } catch (_) {
        // Best-effort - clear locally regardless.
      }
    }
    await _clearSession();
    try {
      await Supabase.instance.client.auth.signOut();
    } catch (_) {}
  }

  @override
  Future<bool> verifySignUpCode(String email, String code) async {
    try {
      final res = await _post('/auth/v1/verify', body: {
        'email': email,
        'token': code,
        'type': 'signup',
      });
      if (res == null || res['access_token'] == null) return false;
      await _saveSession(res);
      _reportActivity(res['access_token'] as String);
      return true;
    } catch (_) {
      return false;
    }
  }

  @override
  Future<bool> resendSignUpCode(String email) async {
    try {
      await _post('/auth/v1/resend', body: {'type': 'signup', 'email': email});
      return true;
    } catch (_) {
      return false;
    }
  }

  @override
  Future<bool> resetPasswordForEmail(String email) async {
    try {
      await _post('/auth/v1/recover', body: {'email': email});
      return true;
    } catch (_) {
      // Still return true - don't reveal whether the email exists.
      return true;
    }
  }

  @override
  Future<bool> verifyRecoveryCode(String email, String code) async {
    try {
      final res = await _post('/auth/v1/verify', body: {
        'email': email,
        'token': code,
        'type': 'recovery',
      });
      if (res == null || res['access_token'] == null) return false;
      // Keep this as a temporary in-memory session (don't persist to
      // SharedPreferences yet) - the user isn't "logged in" until they
      // finish setting a new password, same behavior as before.
      _session = res;
      await _hydrateSdkSession(res);
      return true;
    } catch (_) {
      return false;
    }
  }

  @override
  Future<bool> updatePassword(String newPassword) async {
    final token = _session?['access_token'] as String?;
    if (token == null) return false;
    try {
      await _put('/auth/v1/user', accessToken: token, body: {'password': newPassword});
      return true;
    } catch (_) {
      return false;
    }
  }

  /// See the notes above - unchanged behavior,
  /// still needs the "delete-account" Edge Function deployed to do anything.
  @override
  Future<bool> deleteAccount() async {
    try {
      final res = await Supabase.instance.client.functions.invoke('delete-account');
      if (res.status != 200) return false;
      await logOut();
      return true;
    } catch (_) {
      return false;
    }
  }

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

/// Thrown for any non-2xx response from a Supabase Auth REST call.
class AuthApiException implements Exception {
  AuthApiException(this.message, {required this.statusCode});
  final String message;
  final int statusCode;
  @override
  String toString() => 'AuthApiException($statusCode): $message';
}

final authRepositoryProvider = Provider<AuthRepository>((ref) => RestAuthRepository());
