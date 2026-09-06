import 'dart:typed_data';

class ChatMessage {
  final String text;
  final bool isUser;
  final String? correction; // corrected version of what the user said, if any
  final String? explanation; // short grammar explanation for the correction
  final String? audioUrl; // tutor's spoken reply, if TTS succeeded
  final String? translation; // English translation of a tutor reply, if requested
  final Uint8List? audioBytes; // tutor's spoken reply bytes, kept so it can be replayed later

  const ChatMessage({
    required this.text,
    required this.isUser,
    this.correction,
    this.explanation,
    this.audioUrl,
    this.translation,
    this.audioBytes,
  });

  ChatMessage copyWith({String? translation, Uint8List? audioBytes}) => ChatMessage(
        text: text,
        isUser: isUser,
        correction: correction,
        explanation: explanation,
        audioUrl: audioUrl,
        translation: translation ?? this.translation,
        audioBytes: audioBytes ?? this.audioBytes,
      );
}
