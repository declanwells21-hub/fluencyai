import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_tts/flutter_tts.dart';
import '../../onboarding/data/onboarding_provider.dart';
import '../../../shared/data/tts_locales.dart';
import '../data/scenario_repository.dart';
import '../data/scenario.dart';
import '../data/custom_scenario_repository.dart';
import '../../phrasebank/presentation/live_search_screen.dart';
import '../../../shared/widgets/section_header.dart';
import '../../../shared/widgets/save_phrase_button.dart';
import '../../../shared/widgets/gradient_button.dart';
import '../../../shared/widgets/playful_background.dart';
import '../../../core/theme/app_theme.dart';

final scenarioRepositoryProvider = Provider((ref) => ScenarioRepository());

/// Bundled scenarios (offline) + custom AI-generated ones (saved locally)
/// shown together. Content is only bundled for English/Spanish/French/German
/// - custom scenarios work for any language since Claude generates them.
class ScenarioCatalogScreen extends ConsumerStatefulWidget {
  const ScenarioCatalogScreen({super.key});

  @override
  ConsumerState<ScenarioCatalogScreen> createState() => _ScenarioCatalogScreenState();
}

class _ScenarioCatalogScreenState extends ConsumerState<ScenarioCatalogScreen> {
  final _descriptionCtrl = TextEditingController();
  bool _generating = false;
  String? _error;

  @override
  void dispose() {
    _descriptionCtrl.dispose();
    super.dispose();
  }

  Future<void> _generateAndSave(String targetLanguage) async {
    final description = _descriptionCtrl.text.trim();
    if (description.isEmpty) return;
    setState(() { _generating = true; _error = null; });
    try {
      final scenario = await ref
          .read(customScenarioProvider.notifier)
          .generate(targetLanguage: targetLanguage, description: description);
      await ref.read(customScenarioProvider.notifier).save(scenario);
      _descriptionCtrl.clear();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Saved "${scenario.title}"')),
        );
      }
    } catch (e) {
      setState(() => _error = 'Could not create that scenario: $e');
    } finally {
      if (mounted) setState(() => _generating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final targetLanguage = ref.watch(onboardingProvider).targetLanguage;
    final customScenarios = ref.watch(customScenarioProvider);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      body: PlayfulBackground(
        child: SafeArea(
        child: Column(
          children: [
            SectionHeader(
              icon: Icons.grid_view,
              title: 'Scenarios',
              subtitle: 'Practice real conversations, line by line',
              gradient: isDark ? AppColors.darkPurpleTealGradient : AppColors.lightPurpleTealGradient,
            ),
            Expanded(
              child: FutureBuilder<List<Scenario>>(
                future: ref.read(scenarioRepositoryProvider).getScenarios(targetLanguage),
                builder: (context, snapshot) {
                  final bundled = snapshot.data ?? [];
                  final allScenarios = [...customScenarios, ...bundled];

                  return ListView(
                    padding: const EdgeInsets.all(12),
                    children: [
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(14),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('Create Your Own Scenario',
                                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                              const SizedBox(height: 4),
                              const Text(
                                'Describe any situation and the AI tutor will generate a full custom roleplay.',
                                style: TextStyle(fontSize: 12),
                              ),
                              const SizedBox(height: 10),
                              TextField(
                                controller: _descriptionCtrl,
                                maxLines: 2,
                                decoration: const InputDecoration(
                                  hintText: 'e.g. Negotiating rent with a landlord who speaks quickly',
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
                                label: _generating ? 'Generating…' : 'Save Custom Scenario',
                                loading: _generating,
                                onTap: _generating ? null : () => _generateAndSave(targetLanguage),
                              ),
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
                      else if (allScenarios.isEmpty)
                        Padding(
                          padding: const EdgeInsets.all(24),
                          child: Center(
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Text('🗂️', style: TextStyle(fontSize: 40)),
                                const SizedBox(height: 12),
                                const Text('No scenarios for this language yet',
                                    style: TextStyle(fontWeight: FontWeight.bold)),
                                const SizedBox(height: 16),
                                OutlinedButton.icon(
                                  icon: const Icon(Icons.public),
                                  label: const Text('Search Online for themed sentences'),
                                  onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                                    builder: (_) => LiveSearchScreen(targetLanguage: targetLanguage),
                                  )),
                                ),
                              ],
                            ),
                          ),
                        )
                      else
                        ...allScenarios.asMap().entries.map((entry) {
                          final scenario = entry.value;
                          final isCustom = entry.key < customScenarios.length;
                          return Card(
                            margin: const EdgeInsets.only(bottom: 10),
                            child: ListTile(
                              leading: isCustom
                                  ? Icon(Icons.auto_awesome, color: Theme.of(context).colorScheme.secondary)
                                  : null,
                              title: Text(scenario.title, style: const TextStyle(fontWeight: FontWeight.bold)),
                              subtitle: Text('${scenario.lines.length} lines${isCustom ? " · your scenario" : ""}'),
                              trailing: const Icon(Icons.chevron_right),
                              onTap: () => Navigator.of(context).push(MaterialPageRoute(
                                builder: (_) => ScenarioDetailScreen(scenario: scenario, targetLanguage: targetLanguage),
                              )),
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

class ScenarioDetailScreen extends StatefulWidget {
  final Scenario scenario;
  final String targetLanguage;
  const ScenarioDetailScreen({super.key, required this.scenario, required this.targetLanguage});

  @override
  State<ScenarioDetailScreen> createState() => _ScenarioDetailScreenState();
}

class _ScenarioDetailScreenState extends State<ScenarioDetailScreen> {
  final _tts = FlutterTts();
  final _revealed = <int>{};

  @override
  void dispose() {
    _tts.stop();
    super.dispose();
  }

  Future<void> _speak(String text) async {
    final locale = kTtsLocales[widget.targetLanguage] ?? 'en-US';
    await _tts.setLanguage(locale);
    await _tts.speak(text);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.scenario.title)),
      body: ListView.builder(
        padding: const EdgeInsets.all(12),
        itemCount: widget.scenario.lines.length,
        itemBuilder: (context, i) {
          final line = widget.scenario.lines[i];
          final isRevealed = _revealed.contains(i);
          return Card(
            margin: const EdgeInsets.only(bottom: 8),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(line.speaker,
                      style: TextStyle(
                          fontSize: 11, color: Theme.of(context).colorScheme.primary, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Expanded(child: Text(line.text, style: const TextStyle(fontWeight: FontWeight.w600))),
                      if (line.translation.isNotEmpty)
                        SavePhraseButton(
                          text: line.text,
                          translation: line.translation,
                          language: widget.targetLanguage,
                          size: 18,
                        ),
                      IconButton(
                        icon: const Icon(Icons.volume_up, size: 18),
                        onPressed: () => _speak(line.text),
                      ),
                    ],
                  ),
                  if (line.translation.isNotEmpty)
                    InkWell(
                      onTap: () => setState(() {
                        isRevealed ? _revealed.remove(i) : _revealed.add(i);
                      }),
                      child: Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(
                          isRevealed ? line.translation : 'Tap to reveal translation',
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              fontStyle: isRevealed ? FontStyle.normal : FontStyle.italic),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
