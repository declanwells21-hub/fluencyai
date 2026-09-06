import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import '../../../core/config/env.dart';
import '../../../shared/data/local_storage_service.dart';
import 'scenario.dart';

const _storageKey = 'custom_scenarios';

/// Generates a custom roleplay scenario from a free-text description via
/// Claude (mode: "scenario" in api/chat.js), and persists saved ones
/// locally so they survive app restarts without needing a backend.
class CustomScenarioNotifier extends StateNotifier<List<Scenario>> {
  final _storage = LocalStorageService();
  CustomScenarioNotifier() : super([]) {
    _load();
  }

  Future<void> _load() async {
    final raw = await _storage.loadList(_storageKey);
    state = raw.map((e) => Scenario.fromJson(e)).toList();
  }

  /// Calls Claude to generate a scenario matching our schema. Throws on
  /// failure - the UI is responsible for showing a retry-able error.
  Future<Scenario> generate({required String targetLanguage, required String description}) async {
    final res = await http.post(
      Uri.parse('${Env.proxyBaseUrl}/chat'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'mode': 'scenario', 'targetLanguage': targetLanguage, 'description': description}),
    );
    if (res.statusCode != 200) {
      throw Exception('Could not generate scenario: ${res.statusCode} ${res.body}');
    }
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    if (data['title'] == null || data['lines'] == null) {
      throw Exception('Unexpected response - try rephrasing your description');
    }
    return Scenario.fromJson(data);
  }

  Future<void> save(Scenario scenario) async {
    state = [...state, scenario];
    await _storage.saveList(_storageKey, state.map(_scenarioToJson).toList());
  }

  Map<String, dynamic> _scenarioToJson(Scenario s) => {
        'title': s.title,
        'lines': s.lines
            .map((l) => {'speaker': l.speaker, 'text': l.text, 'translation': l.translation})
            .toList(),
      };
}

final customScenarioProvider = StateNotifierProvider<CustomScenarioNotifier, List<Scenario>>(
  (ref) => CustomScenarioNotifier(),
);
