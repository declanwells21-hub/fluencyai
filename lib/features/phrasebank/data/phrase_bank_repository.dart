import 'dart:convert';
import 'package:flutter/services.dart' show rootBundle;
import 'phrase_entry.dart';

/// Reads phrase data bundled directly in the app (assets/phrases/<code>.json)
/// - no network call, no AI call, works fully offline. `ja.json` is real
/// data derived from the Tatoeba corpus (CC BY 2.0 FR); the rest are a small
/// hand-written starter set pending a real Tatoeba pull per language (see
/// scripts/pull_tatoeba.py).
class PhraseBankRepository {
  final Map<String, List<PhraseEntry>> _cache = {};

  Future<List<PhraseEntry>> getPhrases(String languageCode) async {
    if (_cache.containsKey(languageCode)) return _cache[languageCode]!;
    try {
      final raw = await rootBundle.loadString('assets/phrases/$languageCode.json');
      final list = (jsonDecode(raw) as List)
          .map((e) => PhraseEntry.fromJson(e as Map<String, dynamic>))
          .toList();
      _cache[languageCode] = list;
      return list;
    } catch (_) {
      return [];
    }
  }
}
