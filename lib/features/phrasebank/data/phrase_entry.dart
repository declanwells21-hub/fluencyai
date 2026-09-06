class PhraseEntry {
  final String text; // in the target language
  final String translation; // in English
  final String? audio; // optional filename under assets/phrases/audio/ - a
  // real human recording from Tatoeba, when the pull script was run with
  // --with-audio and the author allowed reuse. Null falls back to device TTS.

  const PhraseEntry({required this.text, required this.translation, this.audio});

  factory PhraseEntry.fromJson(Map<String, dynamic> json) => PhraseEntry(
        text: json['text'] as String,
        translation: json['translation'] as String,
        audio: json['audio'] as String?,
      );
}
