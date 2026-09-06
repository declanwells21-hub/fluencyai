import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/onboarding_state.dart';

/// Persists the onboarding choices (language, level, goal, tutor, accent,
/// gender, motivation, goals, frequency, topics, native language) to
/// Supabase, keyed to the signed-in user - this is what makes "sign out and
/// back in" actually keep your setup instead of starting over.
///
/// NOTE: motivation/goals/frequency/topics/native_language are new columns.
/// If you already ran scripts/supabase_setup.sql before these existed, run
/// scripts/supabase_migration_onboarding_profile.sql once too (see that
/// file for instructions) or saveProfile() will fail for existing users.
class ProfileRepository {
  SupabaseClient get _client => Supabase.instance.client;

  Future<OnboardingData?> loadProfile() async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) return null;

    final rows = await _client.from('profiles').select().eq('id', userId).limit(1);
    if (rows.isEmpty) return null;

    final row = rows.first;
    return OnboardingData(
      targetLanguage: row['target_language'] as String? ?? 'es',
      level: row['level'] as String?,
      dailyGoalMinutes: row['daily_goal_minutes'] as int? ?? 15,
      tutorName: row['tutor_name'] as String?,
      accent: row['accent'] as String?,
      gender: row['gender'] as String? ?? 'female',
      motivation: row['motivation'] as String?,
      goals: (row['goals'] as List?)?.cast<String>() ?? const [],
      frequency: row['frequency'] as String?,
      topics: (row['topics'] as List?)?.cast<String>() ?? const [],
      nativeLanguage: row['native_language'] as String?,
    );
  }

  /// Reads just `subscription_status` off the signed-in user's profile row -
  /// kept in sync server-side by the Stripe webhook (api/stripe-webhook.js).
  /// Returns null if there's no session or no row yet, which the caller
  /// treats as free-tier (see subscription_provider.dart).
  Future<String?> loadSubscriptionStatus() async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) return null;
    try {
      final rows = await _client.from('profiles').select('subscription_status').eq('id', userId).limit(1);
      if (rows.isEmpty) return null;
      return rows.first['subscription_status'] as String?;
    } catch (_) {
      // Missing column (migration not run yet) or network hiccup - fail
      // closed to free-tier rather than throwing and breaking navigation.
      return null;
    }
  }

  Future<void> saveProfile(OnboardingData data) async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) return; // not signed in - nothing to save against

    await _client.from('profiles').upsert({
      'id': userId,
      'target_language': data.targetLanguage,
      'level': data.level,
      'daily_goal_minutes': data.dailyGoalMinutes,
      'tutor_name': data.tutorName,
      'accent': data.accent,
      'gender': data.gender,
      'motivation': data.motivation,
      'goals': data.goals,
      'frequency': data.frequency,
      'topics': data.topics,
      'native_language': data.nativeLanguage,
      'updated_at': DateTime.now().toIso8601String(),
    });
  }
}

final profileRepositoryProvider = Provider((ref) => ProfileRepository());
