import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:audioplayers/audioplayers.dart';
import '../../onboarding/data/onboarding_provider.dart';
import '../../../shared/data/tts_locales.dart';
import '../../../shared/data/languages.dart';
import '../data/phrase_bank_repository.dart';
import '../data/phrase_entry.dart';
import '../data/saved_phrase.dart';
import '../data/saved_phrases_repository.dart';
import 'live_search_screen.dart';
import '../../../shared/widgets/section_header.dart';
import '../../../shared/widgets/save_phrase_button.dart';
import '../../../shared/widgets/playful_background.dart';
import '../../../core/theme/app_theme.dart';

final phraseBankRepositoryProvider = Provider((ref) => PhraseBankRepository());

/// Two views in one screen: "Saved" (your own bookmarked phrases from
/// anywhere in the app - fully local, persists via shared_preferences) and
/// "Browse" (the bundled offline per-language content, unchanged from
/// before). Audio in Browse prefers a real Tatoeba human recording when
/// bundled, otherwise falls back to device TTS.
class PhraseBankScreen extends ConsumerStatefulWidget {
  const PhraseBankScreen({super.key});

  @override
  ConsumerState<PhraseBankScreen> createState() => _PhraseBankScreenState();
}

class _PhraseBankScreenState extends ConsumerState<PhraseBankScreen> {
  bool _showSaved = true;
  String _query = '';
  final _revealed = <int>{};
  final _tts = FlutterTts();
  final _player = AudioPlayer();
  int? _playingIndex;
  String _languageFilter = 'All';

  @override
  void dispose() {
    _tts.stop();
    _player.dispose();
    super.dispose();
  }

  Future<void> _playBoth(int index, PhraseEntry phrase, String targetLanguage) async {
    setState(() => _playingIndex = index);
    try {
      if (phrase.audio != null) {
        await _playAssetAndWait('phrases/audio/${phrase.audio}');
      } else {
        final regionalLocale = kTtsLocales[targetLanguage] ?? 'en-US';
        final plainLocale = targetLanguage;
        String? usableLocale;
        if (await _tts.isLanguageAvailable(regionalLocale) == true) {
          usableLocale = regionalLocale;
        } else if (await _tts.isLanguageAvailable(plainLocale) == true) {
          usableLocale = plainLocale;
        }
        if (usableLocale == null) {
          _showError(
            'No offline voice installed for this language on this device yet. '
            'Go to your phone\'s Settings > System > Languages > Text-to-speech output, '
            'select your TTS engine, and download the voice for this language.',
          );
          return;
        }
        await _tts.setLanguage(usableLocale);
        await _speakAndWait(phrase.text);
      }
      await Future.delayed(const Duration(milliseconds: 300));
      await _tts.setLanguage('en-US');
      await _speakAndWait(phrase.translation);
    } catch (e) {
      _showError('Could not play audio: $e');
    } finally {
      if (mounted) setState(() => _playingIndex = null);
    }
  }

  Future<void> _playSavedPhrase(int index, SavedPhrase phrase) async {
    setState(() => _playingIndex = index);
    try {
      final regionalLocale = kTtsLocales[phrase.language] ?? 'en-US';
      if (await _tts.isLanguageAvailable(regionalLocale) == true) {
        await _tts.setLanguage(regionalLocale);
      } else {
        await _tts.setLanguage(phrase.language);
      }
      await _speakAndWait(phrase.text);
      await Future.delayed(const Duration(milliseconds: 300));
      await _tts.setLanguage('en-US');
      await _speakAndWait(phrase.translation);
    } catch (e) {
      _showError('Could not play audio: $e');
    } finally {
      if (mounted) setState(() => _playingIndex = null);
    }
  }

  Future<void> _playAssetAndWait(String assetPath) {
    final completer = Completer<void>();
    late final StreamSubscription sub;
    sub = _player.onPlayerComplete.listen((_) {
      if (!completer.isCompleted) completer.complete();
      sub.cancel();
    });
    _player.play(AssetSource(assetPath));
    return completer.future;
  }

  Future<void> _speakAndWait(String text) {
    final completer = Completer<void>();
    _tts.setCompletionHandler(() {
      if (!completer.isCompleted) completer.complete();
    });
    _tts.setErrorHandler((msg) {
      if (!completer.isCompleted) completer.complete();
    });
    _tts.speak(text);
    return completer.future;
  }

  void _showError(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: Theme.of(context).colorScheme.error),
    );
  }

  Future<void> _showAddDialog(String defaultLanguage) async {
    final textCtrl = TextEditingController();
    final translationCtrl = TextEditingController();
    String selectedLang = defaultLanguage;

    await showDialog(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, setDialogState) => AlertDialog(
          title: const Text('Add a Phrase'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<String>(
                initialValue: selectedLang,
                decoration: const InputDecoration(labelText: 'Language'),
                items: kLanguages
                    .map((l) => DropdownMenuItem(value: l.code, child: Text('${l.flag} ${l.name}')))
                    .toList(),
                onChanged: (v) => setDialogState(() => selectedLang = v ?? selectedLang),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: textCtrl,
                decoration: const InputDecoration(labelText: 'Phrase'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: translationCtrl,
                decoration: const InputDecoration(labelText: 'Translation (English)'),
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(dialogContext).pop(), child: const Text('Cancel')),
            FilledButton(
              onPressed: () {
                if (textCtrl.text.trim().isEmpty || translationCtrl.text.trim().isEmpty) return;
                ref.read(savedPhrasesProvider.notifier).toggle(SavedPhrase(
                      text: textCtrl.text.trim(),
                      translation: translationCtrl.text.trim(),
                      language: selectedLang,
                    ));
                Navigator.of(dialogContext).pop();
              },
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final targetLanguage = ref.watch(onboardingProvider).targetLanguage;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      body: PlayfulBackground(
        child: SafeArea(
        child: Column(
          children: [
            SectionHeader(
              icon: Icons.chat_bubble_outline,
              title: 'Phrase Bank',
              subtitle: _showSaved ? 'Your saved phrases' : 'Browse offline phrases',
              gradient: isDark ? AppColors.darkPrimaryGradient : AppColors.lightPrimaryGradient,
              trailing: IconButton(
                icon: const Icon(Icons.public, color: Colors.white),
                tooltip: 'Search Online',
                onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) => LiveSearchScreen(targetLanguage: targetLanguage),
                )),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
              child: ToggleButtons(
                isSelected: [_showSaved, !_showSaved],
                onPressed: (i) => setState(() => _showSaved = i == 0),
                borderRadius: BorderRadius.circular(10),
                constraints: const BoxConstraints(minHeight: 38, minWidth: 100),
                children: const [Text('Saved'), Text('Browse')],
              ),
            ),
            Expanded(
              child: _showSaved ? _buildSavedView(context) : _buildBrowseView(context, targetLanguage),
            ),
          ],
        ),
      ),
      ),
    );
  }

  Widget _buildSavedView(BuildContext context) {
    final saved = ref.watch(savedPhrasesProvider);
    final languagesPresent = saved.map((p) => p.language).toSet().toList();

    final filtered = saved.where((p) {
      final matchesLang = _languageFilter == 'All' || p.language == _languageFilter;
      final matchesQuery = _query.isEmpty ||
          p.text.toLowerCase().contains(_query.toLowerCase()) ||
          p.translation.toLowerCase().contains(_query.toLowerCase());
      return matchesLang && matchesQuery;
    }).toList();

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  decoration: const InputDecoration(
                    hintText: 'Search your saved phrases',
                    prefixIcon: Icon(Icons.search),
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                  onChanged: (v) => setState(() => _query = v),
                ),
              ),
              const SizedBox(width: 8),
              FilledButton.icon(
                onPressed: () => _showAddDialog(ref.read(onboardingProvider).targetLanguage),
                icon: const Icon(Icons.add, size: 18),
                label: const Text('Add'),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _langChip('All', 'All'),
                for (final code in languagesPresent)
                  _langChip(code, kLanguages.firstWhere((l) => l.code == code, orElse: () => AppLanguage(code: code, name: code, flag: '')).name),
              ],
            ),
          ),
        ),
        const SizedBox(height: 8),
        Expanded(
          child: saved.isEmpty
              ? const Padding(
                  padding: EdgeInsets.all(24),
                  child: Center(
                    child: Text(
                      'No saved phrases yet — tap the bookmark icon anywhere in the app to build your bank.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.grey),
                    ),
                  ),
                )
              : ListView.separated(
                  padding: const EdgeInsets.all(12),
                  itemCount: filtered.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (context, i) {
                    final p = filtered[i];
                    final isPlaying = _playingIndex == i;
                    return Card(
                      child: ListTile(
                        title: Text(p.text, style: const TextStyle(fontWeight: FontWeight.bold)),
                        subtitle: p.extraTranslations.isEmpty
                            ? Text(p.translation)
                            : Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Text(p.translation),
                                  Padding(
                                    padding: const EdgeInsets.only(top: 4),
                                    child: Wrap(
                                      spacing: 6,
                                      runSpacing: 4,
                                      children: p.extraTranslations.entries
                                          .map((e) => Chip(
                                                visualDensity: VisualDensity.compact,
                                                materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                                                label: Text('${e.key}: ${e.value}', style: const TextStyle(fontSize: 11)),
                                              ))
                                          .toList(),
                                    ),
                                  ),
                                ],
                              ),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            IconButton(
                              icon: isPlaying
                                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                                  : const Icon(Icons.volume_up),
                              onPressed: isPlaying ? null : () => _playSavedPhrase(i, p),
                            ),
                            SavePhraseButton(text: p.text, translation: p.translation, language: p.language),
                          ],
                        ),
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }

  Widget _langChip(String code, String label) {
    final selected = _languageFilter == code;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: ChoiceChip(
        label: Text(label),
        selected: selected,
        onSelected: (_) => setState(() => _languageFilter = code),
      ),
    );
  }

  Widget _buildBrowseView(BuildContext context, String targetLanguage) {
    return FutureBuilder<List<PhraseEntry>>(
      future: ref.read(phraseBankRepositoryProvider).getPhrases(targetLanguage),
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        final phrases = snapshot.data!;
        if (phrases.isEmpty) {
          return const Center(child: Text('No phrases available for this language yet.'));
        }
        final filtered = _query.isEmpty
            ? phrases
            : phrases
                .where((p) =>
                    p.text.toLowerCase().contains(_query.toLowerCase()) ||
                    p.translation.toLowerCase().contains(_query.toLowerCase()))
                .toList();

        return Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(12),
              child: TextField(
                decoration: const InputDecoration(
                  hintText: 'Search phrases…',
                  prefixIcon: Icon(Icons.search),
                  border: OutlineInputBorder(),
                  isDense: true,
                ),
                onChanged: (v) => setState(() => _query = v),
              ),
            ),
            Expanded(
              child: ListView.separated(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                itemCount: filtered.length,
                separatorBuilder: (_, __) => const SizedBox(height: 8),
                itemBuilder: (context, i) {
                  final phrase = filtered[i];
                  final isRevealed = _revealed.contains(i);
                  final isPlaying = _playingIndex == i;
                  return Card(
                    child: InkWell(
                      borderRadius: BorderRadius.circular(12),
                      onTap: () => setState(() {
                        isRevealed ? _revealed.remove(i) : _revealed.add(i);
                      }),
                      child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(phrase.text,
                                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                                  AnimatedCrossFade(
                                    firstChild: const SizedBox(height: 0, width: double.infinity),
                                    secondChild: Padding(
                                      padding: const EdgeInsets.only(top: 6),
                                      child: Text(phrase.translation,
                                          style: Theme.of(context).textTheme.bodyMedium),
                                    ),
                                    crossFadeState:
                                        isRevealed ? CrossFadeState.showSecond : CrossFadeState.showFirst,
                                    duration: const Duration(milliseconds: 150),
                                  ),
                                ],
                              ),
                            ),
                            SavePhraseButton(
                                text: phrase.text, translation: phrase.translation, language: targetLanguage),
                            IconButton(
                              icon: isPlaying
                                  ? SizedBox(
                                      width: 20,
                                      height: 20,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                        color: Theme.of(context).colorScheme.primary,
                                      ),
                                    )
                                  : Icon(
                                      phrase.audio != null ? Icons.record_voice_over : Icons.volume_up,
                                      color: phrase.audio != null
                                          ? Theme.of(context).colorScheme.tertiary
                                          : null,
                                    ),
                              tooltip: phrase.audio != null
                                  ? 'Play real recording, then translation'
                                  : 'Play (device voice), then translation',
                              onPressed: isPlaying ? null : () => _playBoth(i, phrase, targetLanguage),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        );
      },
    );
  }
}
