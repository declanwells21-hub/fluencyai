import 'dart:convert';
import 'package:flutter/services.dart' show rootBundle;
import 'grammar_topic.dart';

/// Fully offline - reads assets/grammar/<code>.json, no network, no AI.
class GrammarRepository {
  final Map<String, List<GrammarTopic>> _cache = {};

  Future<List<GrammarTopic>> getTopics(String languageCode) async {
    if (_cache.containsKey(languageCode)) return _cache[languageCode]!;
    try {
      final raw = await rootBundle.loadString('assets/grammar/$languageCode.json');
      final list = (jsonDecode(raw) as List)
          .map((e) => GrammarTopic.fromJson(e as Map<String, dynamic>))
          .toList();
      _cache[languageCode] = list;
      return list;
    } catch (_) {
      return [];
    }
  }
}
