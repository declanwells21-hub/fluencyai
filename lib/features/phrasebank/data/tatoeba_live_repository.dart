import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/config/env.dart';

class ThemeList {
  final String id;
  final String name;
  const ThemeList({required this.id, required this.name});

  factory ThemeList.fromJson(Map<String, dynamic> json) =>
      ThemeList(id: json['id'] as String, name: json['name'] as String);
}

class LiveSearchResult {
  final int id;
  final String text;
  final String translation;
  final int? audioId; // real Tatoeba recording, if one exists

  const LiveSearchResult({
    required this.id,
    required this.text,
    required this.translation,
    this.audioId,
  });

  factory LiveSearchResult.fromJson(Map<String, dynamic> json) => LiveSearchResult(
        id: json['id'] as int,
        text: json['text'] as String,
        translation: json['translation'] as String,
        audioId: json['audioId'] as int?,
      );
}

/// Calls Tatoeba live via our own proxy (see api/tatoeba.js) - this is a
/// genuinely "online" feature, unlike the bundled offline phrase/grammar/
/// scenario JSON. Needs internet; the UI should make that clear.
class TatoebaLiveRepository {
  final String baseUrl;
  TatoebaLiveRepository({this.baseUrl = Env.proxyBaseUrl});

  Future<List<LiveSearchResult>> search({
    required String targetLanguage,
    String? query,
    String? listId,
    int limit = 20,
  }) async {
    final params = {
      'lang': targetLanguage,
      'limit': '$limit',
      if (query != null && query.isNotEmpty) 'q': query,
      if (listId != null) 'list': listId,
    };
    final uri = Uri.parse('$baseUrl/tatoeba').replace(queryParameters: params);
    final res = await http.get(uri);
    if (res.statusCode != 200) {
      throw Exception('Search failed: ${res.statusCode} ${res.body}');
    }
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    return (data['results'] as List)
        .map((e) => LiveSearchResult.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Finds named themed collections (e.g. "Restaurant Vocabulary") matching
  /// a keyword - no list ID needed from the person, they just type a theme.
  Future<List<ThemeList>> findThemeLists(String keyword) async {
    final uri = Uri.parse('$baseUrl/tatoeba-lists').replace(queryParameters: {'q': keyword});
    final res = await http.get(uri);
    if (res.statusCode != 200) {
      throw Exception('Theme search failed: ${res.statusCode} ${res.body}');
    }
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    return (data['results'] as List)
        .map((e) => ThemeList.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// URL to stream a real recording for a given audio id, if the result had one.
  String audioUrl(int audioId) => '$baseUrl/tatoeba-audio?id=$audioId';
}

final tatoebaLiveRepositoryProvider = Provider((ref) => TatoebaLiveRepository());
