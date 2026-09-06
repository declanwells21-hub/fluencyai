import 'dart:convert';
import 'package:flutter/services.dart' show rootBundle;
import 'scenario.dart';

/// Fully offline - reads assets/scenarios/<code>.json, no network, no AI.
class ScenarioRepository {
  final Map<String, List<Scenario>> _cache = {};

  Future<List<Scenario>> getScenarios(String languageCode) async {
    if (_cache.containsKey(languageCode)) return _cache[languageCode]!;
    try {
      final raw = await rootBundle.loadString('assets/scenarios/$languageCode.json');
      final list =
          (jsonDecode(raw) as List).map((e) => Scenario.fromJson(e as Map<String, dynamic>)).toList();
      _cache[languageCode] = list;
      return list;
    } catch (_) {
      return [];
    }
  }
}
