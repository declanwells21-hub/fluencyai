import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import '../../../core/config/env.dart';
import '../../../shared/data/local_storage_service.dart';
import 'grammar_topic.dart';

const _storageKey = 'custom_grammar_topics';

/// Answers a free-text grammar question via Claude (mode: "grammar" in
/// api/chat.js) and optionally persists saved answers locally.
class CustomGrammarNotifier extends StateNotifier<List<GrammarTopic>> {
  final _storage = LocalStorageService();
  CustomGrammarNotifier() : super([]) {
    _load();
  }

  Future<void> _load() async {
    final raw = await _storage.loadList(_storageKey);
    state = raw.map((e) => GrammarTopic.fromJson(e)).toList();
  }

  Future<GrammarTopic> ask({required String targetLanguage, required String question}) async {
    final res = await http.post(
      Uri.parse('${Env.proxyBaseUrl}/chat'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'mode': 'grammar', 'targetLanguage': targetLanguage, 'question': question}),
    );
    if (res.statusCode != 200) {
      throw Exception('Could not get an answer: ${res.statusCode} ${res.body}');
    }
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    if (data['title'] == null || data['explanation'] == null) {
      throw Exception('Unexpected response - try rephrasing your question');
    }
    return GrammarTopic.fromJson(data);
  }

  Future<void> save(GrammarTopic topic) async {
    state = [...state, topic];
    await _storage.saveList(_storageKey, state.map(_topicToJson).toList());
  }

  Map<String, dynamic> _topicToJson(GrammarTopic t) => {
        'title': t.title,
        'explanation': t.explanation,
        'examples': t.examples.map((e) => {'text': e.text, 'note': e.note}).toList(),
      };
}

final customGrammarProvider = StateNotifierProvider<CustomGrammarNotifier, List<GrammarTopic>>(
  (ref) => CustomGrammarNotifier(),
);
