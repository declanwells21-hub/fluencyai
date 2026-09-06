import 'dart:convert';
import 'dart:typed_data';
import 'package:http/http.dart' as http;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/config/env.dart';
import 'chat_message.dart';
import 'conversation_analytics.dart';

/// Everything the Conversation screen needs from "the AI". Swapping vendors
/// later (e.g. STT provider) only ever means editing the proxy server, never
/// this interface or the UI.
abstract class TutorRepository {
  /// Raw mic recording -> transcribed text (Deepgram, via proxy)
  Future<String> transcribe(Uint8List audioBytes, {required String targetLanguage});

  /// User's text + conversation context -> tutor reply + correction (Claude, via proxy).
  /// [topic]/[situation]/[yourRole]/[aiRole] optionally scope the conversation to a
  /// chosen practice topic or a custom roleplay (see the topic picker / custom
  /// topic screens) - all null for plain free-chat, unchanged from before.
  Future<ChatMessage> getTutorReply({
    required String targetLanguage,
    required String? level,
    required String? tutorName,
    required String? accent,
    required String tone,
    required List<ChatMessage> history,
    required String userText,
    String? topic,
    String? situation,
    String? yourRole,
    String? aiRole,
  });

  /// Tutor reply text -> spoken audio bytes (Azure TTS, via proxy)
  Future<Uint8List> speak({
    required String text,
    required String targetLanguage,
    required String? accent,
    required String gender,
  });

  /// Advanced toolkit: text-based pronunciation tips for what the student
  /// last said (based on the transcript, not real audio analysis - see the
  /// honest caveat in api/chat.js's pronunciation mode prompt).
  Future<String> analyzePronunciation({required String targetLanguage, required String spokenText});

  /// Advanced toolkit: a fill-in-the-blank prompt to help the student
  /// respond to the tutor's last message.
  Future<String> getHint({required String targetLanguage, required String? level, required String context});

  /// One phrase -> its meaning in several languages at once (Claude, via
  /// proxy). Used by the "Save to Phrase Bank" flow on the Conversation
  /// screen, where the student can pick more than one language to save the
  /// meaning in rather than always defaulting to English.
  Future<Map<String, String>> translatePhrase({
    required String text,
    required String sourceLanguage,
    required List<String> targetLanguages,
  });

  /// End-of-conversation report: understood %, repair moves, grounded fixes,
  /// and a per-skill breakdown - built from the actual transcript plus the
  /// corrections already flagged live during the session (Claude, via proxy).
  Future<ConversationAnalytics> analyzeConversation({
    required String targetLanguage,
    required String? level,
    required String? tutorName,
    required List<ChatMessage> history,
    required Duration duration,
  });
}

class ProxyTutorRepository implements TutorRepository {
  final String baseUrl;
  ProxyTutorRepository({this.baseUrl = Env.proxyBaseUrl});

  @override
  Future<String> transcribe(Uint8List audioBytes, {required String targetLanguage}) async {
    final res = await http.post(
      Uri.parse('$baseUrl/stt?language=$targetLanguage'),
      headers: {'Content-Type': 'application/octet-stream'},
      body: audioBytes,
    );
    if (res.statusCode != 200) {
      throw Exception('STT failed: ${res.statusCode} ${res.body}');
    }
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    return data['transcript'] as String? ?? '';
  }

  @override
  Future<ChatMessage> getTutorReply({
    required String targetLanguage,
    required String? level,
    required String? tutorName,
    required String? accent,
    required String tone,
    required List<ChatMessage> history,
    required String userText,
    String? topic,
    String? situation,
    String? yourRole,
    String? aiRole,
  }) async {
    final res = await http.post(
      Uri.parse('$baseUrl/chat'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'targetLanguage': targetLanguage,
        'level': level,
        'tutorName': tutorName,
        'accent': accent,
        'tone': tone,
        'topic': topic,
        'situation': situation,
        'yourRole': yourRole,
        'aiRole': aiRole,
        'history': history
            .map((m) => {'role': m.isUser ? 'user' : 'assistant', 'text': m.text})
            .toList(),
        'userText': userText,
      }),
    );
    if (res.statusCode != 200) {
      throw Exception('Chat failed: ${res.statusCode} ${res.body}');
    }
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    return ChatMessage(
      text: data['reply'] as String? ?? '',
      isUser: false,
      correction: data['correction'] as String?,
      explanation: data['explanation'] as String?,
      translation: data['translation'] as String?,
    );
  }

  @override
  Future<Uint8List> speak({
    required String text,
    required String targetLanguage,
    required String? accent,
    required String gender,
  }) async {
    final res = await http.post(
      Uri.parse('$baseUrl/tts'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'text': text,
        'targetLanguage': targetLanguage,
        'accent': accent,
        'gender': gender,
      }),
    );
    if (res.statusCode != 200) {
      throw Exception('TTS failed: ${res.statusCode} ${res.body}');
    }
    return res.bodyBytes;
  }

  @override
  Future<String> analyzePronunciation({required String targetLanguage, required String spokenText}) async {
    final res = await http.post(
      Uri.parse('$baseUrl/chat'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'mode': 'pronunciation', 'targetLanguage': targetLanguage, 'spokenText': spokenText}),
    );
    if (res.statusCode != 200) {
      throw Exception('Could not analyze pronunciation: ${res.statusCode} ${res.body}');
    }
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    return data['feedback'] as String? ?? 'No feedback available.';
  }

  @override
  Future<String> getHint({required String targetLanguage, required String? level, required String context}) async {
    final res = await http.post(
      Uri.parse('$baseUrl/chat'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'mode': 'hint', 'targetLanguage': targetLanguage, 'level': level, 'context': context}),
    );
    if (res.statusCode != 200) {
      throw Exception('Could not get a hint: ${res.statusCode} ${res.body}');
    }
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    return data['hint'] as String? ?? 'No hint available.';
  }

  @override
  Future<Map<String, String>> translatePhrase({
    required String text,
    required String sourceLanguage,
    required List<String> targetLanguages,
  }) async {
    if (targetLanguages.isEmpty) return {};
    final res = await http.post(
      Uri.parse('$baseUrl/chat'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'mode': 'translate',
        'text': text,
        'sourceLanguage': sourceLanguage,
        'targetLanguages': targetLanguages,
      }),
    );
    if (res.statusCode != 200) {
      throw Exception('Could not translate that phrase: ${res.statusCode} ${res.body}');
    }
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    final raw = data['translations'] as Map<String, dynamic>? ?? {};
    return raw.map((k, v) => MapEntry(k, v.toString()));
  }

  @override
  Future<ConversationAnalytics> analyzeConversation({
    required String targetLanguage,
    required String? level,
    required String? tutorName,
    required List<ChatMessage> history,
    required Duration duration,
  }) async {
    // Corrections already flagged live during the conversation (see
    // ChatMessage.correction/explanation) - passed explicitly so the report
    // is grounded in what the tutor actually caught, not re-derived blind.
    final corrections = <Map<String, String?>>[];
    for (var i = 0; i < history.length; i++) {
      final m = history[i];
      if (!m.isUser && m.correction != null && i > 0 && history[i - 1].isUser) {
        corrections.add({
          'original': history[i - 1].text,
          'corrected': m.correction,
          'explanation': m.explanation,
        });
      }
    }

    final res = await http.post(
      Uri.parse('$baseUrl/chat'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'mode': 'analyze',
        'targetLanguage': targetLanguage,
        'level': level,
        'tutorName': tutorName,
        'history': history.map((m) => {'role': m.isUser ? 'user' : 'assistant', 'text': m.text}).toList(),
        'corrections': corrections,
        'durationSeconds': duration.inSeconds,
      }),
    );
    if (res.statusCode != 200) {
      throw Exception('Could not build your session report: ${res.statusCode} ${res.body}');
    }
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    return ConversationAnalytics.fromJson(data);
  }
}

final tutorRepositoryProvider = Provider<TutorRepository>((ref) => ProxyTutorRepository());
