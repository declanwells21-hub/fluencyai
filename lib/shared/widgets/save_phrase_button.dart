import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../features/phrasebank/data/saved_phrase.dart';
import '../../features/phrasebank/data/saved_phrases_repository.dart';

/// The "tap the flag or save icon anywhere in the app" bookmark button -
/// same widget reused in Phrase Bank, Live Search results, Grammar examples,
/// and Scenario lines, so saving works identically everywhere.
class SavePhraseButton extends ConsumerWidget {
  final String text;
  final String translation;
  final String language;
  final double size;

  const SavePhraseButton({
    super.key,
    required this.text,
    required this.translation,
    required this.language,
    this.size = 20,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final saved = ref.watch(savedPhrasesProvider.select(
      (list) => list.any((p) => p.matches(text, language)),
    ));
    return IconButton(
      icon: Icon(
        saved ? Icons.bookmark : Icons.bookmark_border,
        size: size,
        color: saved ? Theme.of(context).colorScheme.secondary : null,
      ),
      tooltip: saved ? 'Saved to Phrase Bank' : 'Save to Phrase Bank',
      onPressed: () => ref
          .read(savedPhrasesProvider.notifier)
          .toggle(SavedPhrase(text: text, translation: translation, language: language)),
    );
  }
}
