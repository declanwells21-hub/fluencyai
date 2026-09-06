import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_tts/flutter_tts.dart';
import '../../onboarding/data/onboarding_provider.dart';
import '../../../shared/data/tts_locales.dart';
import '../data/grammar_repository.dart';
import '../data/grammar_topic.dart';
import '../data/custom_grammar_repository.dart';
import '../../phrasebank/presentation/live_search_screen.dart';
import '../../../shared/widgets/section_header.dart';
import '../../../shared/widgets/save_phrase_button.dart';
import '../../../shared/widgets/gradient_button.dart';
import '../../../shared/widgets/playful_background.dart';
import '../../../core/theme/app_theme.dart';

final grammarRepositoryProvider = Provider((ref) => GrammarRepository());

/// Bundled grammar (offline, English/Spanish/French/German only) + the
/// Grammar Hub: ask any grammar question, Claude answers, optionally save
/// it locally so it shows up in the topic list from then on.
class GrammarScreen extends ConsumerStatefulWidget {
  const GrammarScreen({super.key});

  @override
  ConsumerState<GrammarScreen> createState() => _GrammarScreenState();
}

class _GrammarScreenState extends ConsumerState<GrammarScreen> {
  final _tts = FlutterTts();
  final _questionCtrl = TextEditingController();
  bool _asking = false;
  String? _error;
  GrammarTopic? _lastAnswer;

  @override
  void dispose() {
    _tts.stop();
    _questionCtrl.dispose();
    super.dispose();
  }

  Future<void> _speak(String text, String targetLanguage) async {
    final locale = kTtsLocales[targetLanguage] ?? 'en-US';
    await _tts.setLanguage(locale);
    await _tts.speak(text);
  }

  Future<void> _askQuestion(String targetLanguage) async {
    final question = _questionCtrl.text.trim();
    if (question.isEmpty) return;
    setState(() { _asking = true; _error = null; _lastAnswer = null; });
    try {
      final answer = await ref.read(customGrammarProvider.notifier).ask(
            targetLanguage: targetLanguage,
            question: question,
          );
      setState(() => _lastAnswer = answer);
    } catch (e) {
      setState(() => _error = 'Could not get an answer: $e');
    } finally {
      if (mounted) setState(() => _asking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final targetLanguage = ref.watch(onboardingProvider).targetLanguage;
    final customTopics = ref.watch(customGrammarProvider);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      body: PlayfulBackground(
        child: SafeArea(
        child: Column(
          children: [
            SectionHeader(
              icon: Icons.menu_book,
              title: 'Grammar',
              subtitle: 'Rules, explained and illustrated',
              gradient: isDark ? AppColors.darkCyanPurpleGradient : AppColors.lightCyanPurpleGradient,
            ),
            Expanded(
              child: FutureBuilder<List<GrammarTopic>>(
                future: ref.read(grammarRepositoryProvider).getTopics(targetLanguage),
                builder: (context, snapshot) {
                  final bundled = snapshot.data ?? [];
                  final allTopics = [...customTopics, ...bundled];

                  return ListView(
                    padding: const EdgeInsets.all(12),
                    children: [
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(14),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('Grammar Hub', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                              const SizedBox(height: 8),
                              TextField(
                                controller: _questionCtrl,
                                decoration: const InputDecoration(
                                  hintText: "Ask a grammar question, e.g. 'when do I use dative case'",
                                  border: OutlineInputBorder(),
                                  isDense: true,
                                ),
                              ),
                              const SizedBox(height: 10),
                              if (_error != null)
                                Padding(
                                  padding: const EdgeInsets.only(bottom: 8),
                                  child: Text(_error!,
                                      style: TextStyle(color: Theme.of(context).colorScheme.error, fontSize: 12)),
                                ),
                              GradientButton(
                                label: _asking ? 'Thinking…' : 'Explain This',
                                loading: _asking,
                                onTap: _asking ? null : () => _askQuestion(targetLanguage),
                              ),
                              if (_lastAnswer != null) ...[
                                const Divider(height: 24),
                                Text(_lastAnswer!.title,
                                    style: const TextStyle(fontWeight: FontWeight.bold)),
                                const SizedBox(height: 6),
                                Text(_lastAnswer!.explanation),
                                const SizedBox(height: 8),
                                ..._lastAnswer!.examples.map((ex) => Padding(
                                      padding: const EdgeInsets.only(bottom: 4),
                                      child: Text('${ex.text}  —  ${ex.note}',
                                          style: Theme.of(context).textTheme.bodySmall),
                                    )),
                                const SizedBox(height: 8),
                                Align(
                                  alignment: Alignment.centerLeft,
                                  child: OutlinedButton.icon(
                                    icon: const Icon(Icons.bookmark_add_outlined, size: 16),
                                    label: const Text('Save this'),
                                    onPressed: () async {
                                      await ref.read(customGrammarProvider.notifier).save(_lastAnswer!);
                                      setState(() => _lastAnswer = null);
                                      _questionCtrl.clear();
                                    },
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                      if (!snapshot.hasData)
                        const Padding(
                          padding: EdgeInsets.all(24),
                          child: Center(child: CircularProgressIndicator()),
                        )
                      else if (allTopics.isEmpty)
                        Padding(
                          padding: const EdgeInsets.all(24),
                          child: Center(
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Text('📘', style: TextStyle(fontSize: 40)),
                                const SizedBox(height: 12),
                                const Text('No grammar content for this language yet',
                                    style: TextStyle(fontWeight: FontWeight.bold), textAlign: TextAlign.center),
                                const SizedBox(height: 6),
                                const Text(
                                  "Grammar rules need to be right, not just plausible-sounding, so this is only "
                                  "filled in for languages with verified content so far, or answered live above.",
                                  style: TextStyle(color: Colors.grey, fontSize: 12),
                                  textAlign: TextAlign.center,
                                ),
                                const SizedBox(height: 16),
                                OutlinedButton.icon(
                                  icon: const Icon(Icons.public),
                                  label: const Text('Search Online for real examples'),
                                  onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                                    builder: (_) => LiveSearchScreen(targetLanguage: targetLanguage),
                                  )),
                                ),
                              ],
                            ),
                          ),
                        )
                      else
                        ...allTopics.asMap().entries.map((entry) {
                          final topic = entry.value;
                          final isCustom = entry.key < customTopics.length;
                          return Card(
                            margin: const EdgeInsets.only(bottom: 10),
                            child: ExpansionTile(
                              leading: isCustom
                                  ? Icon(Icons.auto_awesome, color: Theme.of(context).colorScheme.secondary)
                                  : null,
                              title: Text(topic.title, style: const TextStyle(fontWeight: FontWeight.bold)),
                              children: [
                                Padding(
                                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(topic.explanation),
                                      const SizedBox(height: 10),
                                      ...topic.examples.map((ex) => Padding(
                                            padding: const EdgeInsets.only(bottom: 6),
                                            child: Row(
                                              children: [
                                                Expanded(
                                                  child: RichText(
                                                    text: TextSpan(
                                                      style: DefaultTextStyle.of(context).style,
                                                      children: [
                                                        TextSpan(
                                                            text: ex.text,
                                                            style: const TextStyle(fontWeight: FontWeight.w600)),
                                                        TextSpan(text: '  —  ${ex.note}',
                                                            style: Theme.of(context).textTheme.bodySmall),
                                                      ],
                                                    ),
                                                  ),
                                                ),
                                                SavePhraseButton(
                                                  text: ex.text,
                                                  translation: ex.note,
                                                  language: targetLanguage,
                                                  size: 18,
                                                ),
                                                IconButton(
                                                  icon: const Icon(Icons.volume_up, size: 18),
                                                  onPressed: () => _speak(ex.text, targetLanguage),
                                                ),
                                              ],
                                            ),
                                          )),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          );
                        }),
                    ],
                  );
                },
              ),
            ),
          ],
        ),
      ),
      ),
    );
  }
}
