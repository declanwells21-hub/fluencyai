import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../shared/data/languages.dart';
import '../../../core/theme/app_theme.dart';
import '../../onboarding/data/onboarding_provider.dart';
import '../../phrasebank/data/saved_phrase.dart';
import '../../phrasebank/data/saved_phrases_repository.dart';
import '../data/tutor_repository.dart';

/// Bottom sheet opened from the "save to Phrase Bank" icon on any
/// conversation bubble (yours or the tutor's). Lets the student pick one or
/// more languages to see the phrase's meaning in - rather than always
/// defaulting to English, the AI translates it into every language picked
/// in one call, and the phrase is saved to the Phrase Bank with all of
/// those meanings attached (see SavedPhrase.extraTranslations).
Future<void> showSavePhraseSheet({
  required BuildContext context,
  required WidgetRef ref,
  required String text,
  required String phraseLanguage,
}) {
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
    builder: (sheetContext) => _SavePhraseSheet(text: text, phraseLanguage: phraseLanguage),
  );
}

class _SavePhraseSheet extends ConsumerStatefulWidget {
  final String text;
  final String phraseLanguage;
  const _SavePhraseSheet({required this.text, required this.phraseLanguage});

  @override
  ConsumerState<_SavePhraseSheet> createState() => _SavePhraseSheetState();
}

class _SavePhraseSheetState extends ConsumerState<_SavePhraseSheet> {
  late Set<String> _selected;
  bool _saving = false;
  bool _saved = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final native = ref.read(onboardingProvider).nativeLanguage;
    String initial = (native != null && native != widget.phraseLanguage) ? native : 'en';
    if (initial == widget.phraseLanguage) {
      // Edge case: the phrase is already in the default fallback language
      // (e.g. the student is learning English) - fall back to the first
      // selectable language instead so there's always something checked.
      initial = kLanguages.firstWhere((l) => l.code != widget.phraseLanguage).code;
    }
    _selected = {initial};
  }

  Future<void> _save() async {
    if (_selected.isEmpty) {
      setState(() => _error = 'Pick at least one language.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final targets = _selected.toList();
      final translations = await ref.read(tutorRepositoryProvider).translatePhrase(
            text: widget.text,
            sourceLanguage: widget.phraseLanguage,
            targetLanguages: targets,
          );
      if (translations.isEmpty) {
        setState(() {
          _saving = false;
          _error = 'Could not translate that phrase - try again.';
        });
        return;
      }
      final primaryCode = targets.first;
      final primary = translations[primaryCode] ?? translations.values.first;
      final extra = Map<String, String>.from(translations)..remove(primaryCode);
      await ref.read(savedPhrasesProvider.notifier).toggle(SavedPhrase(
            text: widget.text,
            translation: primary,
            language: widget.phraseLanguage,
            extraTranslations: extra,
          ));
      if (!mounted) return;
      setState(() {
        _saving = false;
        _saved = true;
      });
      await Future.delayed(const Duration(milliseconds: 500));
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      setState(() {
        _saving = false;
        _error = 'Could not save that phrase: $e';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final purple = isDark ? AppColors.darkPurple : AppColors.lightPurple;
    final selectable = kLanguages.where((l) => l.code != widget.phraseLanguage).toList();

    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Save to Phrase Bank', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
              IconButton(icon: const Icon(Icons.close), onPressed: () => Navigator.of(context).pop()),
            ],
          ),
          Container(
            width: double.infinity,
            margin: const EdgeInsets.only(top: 4, bottom: 14),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: purple.withOpacity(0.08), borderRadius: BorderRadius.circular(12)),
            child: Text(widget.text, style: TextStyle(fontWeight: FontWeight.w700, color: purple)),
          ),
          Text('Show its meaning in', style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: selectable.map((l) {
              final on = _selected.contains(l.code);
              return FilterChip(
                label: Text('${l.flag} ${l.name}'),
                selected: on,
                onSelected: (_) => setState(() => on ? _selected.remove(l.code) : _selected.add(l.code)),
                selectedColor: purple.withOpacity(0.18),
                checkmarkColor: purple,
              );
            }).toList(),
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error, fontSize: 12.5)),
            ),
          const SizedBox(height: 18),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: (_saving || _saved) ? null : _save,
              icon: _saving
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : Icon(_saved ? Icons.check_rounded : Icons.bookmark_added_outlined),
              label: Text(_saving ? 'Translating…' : (_saved ? 'Saved!' : 'Save phrase')),
            ),
          ),
        ],
      ),
    );
  }
}
