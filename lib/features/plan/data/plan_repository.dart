import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../core/config/env.dart';
import '../../onboarding/models/onboarding_state.dart';
import 'plan_item.dart';

/// Generates and persists the AI study plan (see api/chat.js mode "plan"):
/// a batch of phrases/scenarios/grammar topics tailored to the user's
/// onboarding choices, stored one row per item in Supabase's "plan_items"
/// table so each can be marked done independently and progress measured
/// against exactly what was generated.
class PlanRepository {
  SupabaseClient get _client => Supabase.instance.client;

  /// Calls Claude to generate a plan matching [data], saves every item, and
  /// returns the saved rows. Throws on failure (network issue, rate limit,
  /// malformed AI response) - callers decide how to surface that; nothing
  /// here silently fabricates content.
  Future<List<PlanItem>> generateAndSave(OnboardingData data) async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) throw Exception('Not signed in');

    final res = await http.post(
      Uri.parse('${Env.proxyBaseUrl}/chat'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'mode': 'plan',
        'targetLanguage': data.targetLanguage,
        'level': data.level,
        'motivation': data.motivation,
        'goals': data.goals,
        'frequency': data.frequency,
        'topics': data.topics,
        'nativeLanguage': data.nativeLanguage,
      }),
    );
    if (res.statusCode != 200) {
      throw Exception('Could not generate a study plan: ${res.statusCode} ${res.body}');
    }

    final body = jsonDecode(res.body) as Map<String, dynamic>;
    final phrases = (body['phrases'] as List?) ?? const [];
    final scenarios = (body['scenarios'] as List?) ?? const [];
    final grammar = (body['grammar'] as List?) ?? const [];
    if (phrases.isEmpty && scenarios.isEmpty && grammar.isEmpty) {
      throw Exception('Unexpected response while building your study plan - please try again');
    }

    final rows = <Map<String, dynamic>>[];
    var order = 0;
    for (final p in phrases) {
      final m = Map<String, dynamic>.from(p as Map);
      rows.add({
        'user_id': userId,
        'kind': 'phrase',
        'title': m['text'],
        'payload': {'translation': m['translation']},
        'sort_order': order++,
      });
    }
    for (final s in scenarios) {
      final m = Map<String, dynamic>.from(s as Map);
      rows.add({
        'user_id': userId,
        'kind': 'scenario',
        'title': m['title'],
        'payload': {'lines': m['lines']},
        'sort_order': order++,
      });
    }
    for (final g in grammar) {
      final m = Map<String, dynamic>.from(g as Map);
      rows.add({
        'user_id': userId,
        'kind': 'grammar',
        'title': m['title'],
        'payload': {'explanation': m['explanation'], 'examples': m['examples']},
        'sort_order': order++,
      });
    }

    final inserted = await _client.from('plan_items').insert(rows).select();
    return (inserted as List).map((r) => PlanItem.fromRow(Map<String, dynamic>.from(r as Map))).toList();
  }

  Future<List<PlanItem>> loadPlan() async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) return [];
    final rows = await _client
        .from('plan_items')
        .select()
        .eq('user_id', userId)
        .order('kind')
        .order('sort_order');
    return (rows as List).map((r) => PlanItem.fromRow(Map<String, dynamic>.from(r as Map))).toList();
  }

  Future<void> setCompleted(String itemId, bool completed) async {
    await _client.from('plan_items').update({
      'completed': completed,
      'completed_at': completed ? DateTime.now().toIso8601String() : null,
    }).eq('id', itemId);
  }

  /// Avoids generating (and paying for) a second plan if one already
  /// exists - e.g. if onboarding's save step is retried after a crash.
  Future<bool> hasExistingPlan() async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) return false;
    final rows = await _client.from('plan_items').select('id').eq('user_id', userId).limit(1);
    return (rows as List).isNotEmpty;
  }
}

final planRepositoryProvider = Provider((ref) => PlanRepository());
