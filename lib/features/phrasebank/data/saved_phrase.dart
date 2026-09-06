class SavedPhrase {
  final String text;
  final String translation; // primary translation, shown in every list view
  final String language; // 2-letter code, e.g. 'es' - the language of `text`

  // Extra meanings in other languages, keyed by language code, e.g.
  // {'fr': 'merci beaucoup', 'de': 'vielen Dank'} - populated when a phrase
  // is saved from the Conversation screen with more than one language
  // selected. Empty for phrases saved the old way (Live Search, Grammar,
  // Scenario lines, bundled Phrase Bank) - none of those are affected.
  final Map<String, String> extraTranslations;

  const SavedPhrase({
    required this.text,
    required this.translation,
    required this.language,
    this.extraTranslations = const {},
  });

  Map<String, dynamic> toJson() => {
        'text': text,
        'translation': translation,
        'language': language,
        if (extraTranslations.isNotEmpty) 'extraTranslations': extraTranslations,
      };

  factory SavedPhrase.fromJson(Map<String, dynamic> json) => SavedPhrase(
        text: json['text'] as String,
        translation: json['translation'] as String,
        language: json['language'] as String,
        extraTranslations: (json['extraTranslations'] as Map?)
                ?.map((k, v) => MapEntry(k as String, v as String)) ??
            const {},
      );

  /// Two phrases are "the same" for save/unsave purposes if the text and
  /// language match - translation wording can vary slightly between sources
  /// (bundled vs live search) without it being a different phrase.
  bool matches(String otherText, String otherLanguage) =>
      text == otherText && language == otherLanguage;
}
