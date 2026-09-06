import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_tts/flutter_tts.dart';
import '../../onboarding/data/onboarding_provider.dart';
import '../../../shared/data/tts_locales.dart';
import '../../../shared/widgets/gradient_button.dart';
import '../../../shared/widgets/save_phrase_button.dart';
import '../../../core/theme/app_theme.dart';
import '../../scenarios/presentation/scenario_catalog_screen.dart';
import '../data/plan_item.dart';
import '../data/plan_provider.dart';
import '../data/plan_repository.dart';
import '../../../shared/widgets/playful_background.dart';
import '../../../shared/widgets/colorful_icon.dart';

/// The user's personalized study plan: everything Claude generated right
/// after onboarding (see api/chat.js mode "plan"), grouped by phrases,
/// scenarios, and grammar topics, each with a real completed/not-completed
/// state. The progress bar at the top is computed directly from this list -
/// it's not a separate stat, it IS "how much of your plan you've done".
class PlanScreen extends ConsumerStatefulWidget {
  const PlanScreen({super.key});

  @override
  ConsumerState<PlanScreen> createState() => _PlanScreenState();
}

class _PlanScreenState extends ConsumerState<PlanScreen> {
  bool _generating = false;
  String? _generateError;

  Future<void> _generate() async {
    setState(() { _generating = true; _generateError = null; });
    try {
      final onboarding = ref.read(onboardingProvider);
      await ref.read(planRepositoryProvider).generateAndSave(onboarding);
      await ref.read(planProvider.notifier).refresh();
    } catch (e) {
      setState(() => _generateError = e.toString());
    } finally {
      if (mounted) setState(() => _generating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final planAsync = ref.watch(planProvider);
    final targetLanguage = ref.watch(onboardingProvider).targetLanguage;

    return Scaffold(
      appBar: AppBar(title: const Text('Your Study Plan')),
      body: PlayfulBackground(
        child: planAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => _ErrorState(
          message: 'Could not load your study plan: $e',
          onRetry: () => ref.read(planProvider.notifier).refresh(),
        ),
        data: (items) {
          if (items.isEmpty) {
            return _EmptyPlanState(
              generating: _generating,
              error: _generateError,
              onGenerate: _generate,
            );
          }
          return RefreshIndicator(
            onRefresh: () => ref.read(planProvider.notifier).refresh(),
            child: _PlanList(items: items, targetLanguage: targetLanguage),
          );
        },
        ),
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _ErrorState({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.error_outline, color: Theme.of(context).colorScheme.error, size: 36),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            FilledButton(onPressed: onRetry, child: const Text('Retry')),
          ],
        ),
      ),
    );
  }
}

class _EmptyPlanState extends StatelessWidget {
  final bool generating;
  final String? error;
  final VoidCallback onGenerate;
  const _EmptyPlanState({required this.generating, required this.error, required this.onGenerate});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const ColorfulIcon(Icons.auto_awesome_rounded, mood: IconMood.mint, size: 30, boxSize: 60),
            const SizedBox(height: 14),
            Text(
              "You don't have a study plan yet",
              style: TextStyle(
                fontWeight: FontWeight.bold,
                fontSize: 17,
                color: isDark ? AppColors.darkText : AppColors.lightText,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 6),
            Text(
              "This usually only happens if plan generation didn't finish right after "
              "onboarding. Tap below to build one now from your saved preferences.",
              textAlign: TextAlign.center,
              style: TextStyle(color: isDark ? AppColors.darkTextSoft : AppColors.lightTextSoft, height: 1.4),
            ),
            const SizedBox(height: 20),
            if (error != null) ...[
              Text(error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
              const SizedBox(height: 12),
            ],
            GradientButton(
              label: generating ? 'Building your plan…' : 'Generate My Plan',
              loading: generating,
              onTap: generating ? null : onGenerate,
            ),
          ],
        ),
      ),
    );
  }
}

class _PlanList extends StatelessWidget {
  final List<PlanItem> items;
  final String targetLanguage;
  const _PlanList({required this.items, required this.targetLanguage});

  @override
  Widget build(BuildContext context) {
    final phrases = items.where((i) => i.kind == PlanItemKind.phrase).toList();
    final scenarios = items.where((i) => i.kind == PlanItemKind.scenario).toList();
    final grammar = items.where((i) => i.kind == PlanItemKind.grammar).toList();
    final completed = items.where((i) => i.completed).length;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _ProgressCard(completed: completed, total: items.length),
        const SizedBox(height: 20),
        if (phrases.isNotEmpty) ...[
          _SectionLabel(icon: Icons.chat_bubble_rounded, label: 'Phrases', count: phrases.length, mood: IconMood.cyan),
          const SizedBox(height: 8),
          ...phrases.map((p) => _PhraseTile(item: p, targetLanguage: targetLanguage)),
          const SizedBox(height: 20),
        ],
        if (scenarios.isNotEmpty) ...[
          _SectionLabel(icon: Icons.theater_comedy_rounded, label: 'Scenarios', count: scenarios.length, mood: IconMood.amber),
          const SizedBox(height: 8),
          ...scenarios.map((s) => _ScenarioTile(item: s, targetLanguage: targetLanguage)),
          const SizedBox(height: 20),
        ],
        if (grammar.isNotEmpty) ...[
          _SectionLabel(icon: Icons.menu_book_rounded, label: 'Grammar', count: grammar.length, mood: IconMood.purple),
          const SizedBox(height: 8),
          ...grammar.map((g) => _GrammarTile(item: g)),
        ],
      ],
    );
  }
}

class _ProgressCard extends StatelessWidget {
  final int completed;
  final int total;
  const _ProgressCard({required this.completed, required this.total});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final fraction = total == 0 ? 0.0 : completed / total;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: isDark ? AppColors.darkPrimaryGradient : AppColors.lightPrimaryGradient,
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Plan Progress', style: TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          Text('$completed of $total complete',
              style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w800)),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: LinearProgressIndicator(
              value: fraction,
              minHeight: 8,
              backgroundColor: Colors.white24,
              valueColor: const AlwaysStoppedAnimation(Colors.white),
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final IconData icon;
  final String label;
  final int count;
  final IconMood mood;
  const _SectionLabel({required this.icon, required this.label, required this.count, this.mood = IconMood.teal});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        ColorfulIcon(icon, mood: mood, size: 16, boxSize: 30),
        const SizedBox(width: 8),
        Text(label, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
        const SizedBox(width: 6),
        Text('($count)', style: Theme.of(context).textTheme.bodySmall),
      ],
    );
  }
}

/// Checkbox shared by every plan tile - marking an item done/not-done is
/// exactly what drives the progress bar above, so this is the one place
/// that calls planProvider.toggleCompleted.
class _CompletionCheckbox extends ConsumerWidget {
  final PlanItem item;
  const _CompletionCheckbox({required this.item});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Checkbox(
      value: item.completed,
      onChanged: (_) => ref.read(planProvider.notifier).toggleCompleted(item),
    );
  }
}

class _PhraseTile extends StatefulWidget {
  final PlanItem item;
  final String targetLanguage;
  const _PhraseTile({required this.item, required this.targetLanguage});

  @override
  State<_PhraseTile> createState() => _PhraseTileState();
}

class _PhraseTileState extends State<_PhraseTile> {
  bool _revealed = false;
  final _tts = FlutterTts();

  @override
  void dispose() {
    _tts.stop();
    super.dispose();
  }

  Future<void> _speak() async {
    final locale = kTtsLocales[widget.targetLanguage] ?? 'en-US';
    await _tts.setLanguage(locale);
    await _tts.speak(widget.item.title);
  }

  @override
  Widget build(BuildContext context) {
    final phrase = widget.item.toPhraseEntry();
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
        child: Row(
          children: [
            _CompletionCheckbox(item: widget.item),
            Expanded(
              child: InkWell(
                onTap: () => setState(() => _revealed = !_revealed),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(phrase.text,
                          style: TextStyle(
                            fontWeight: FontWeight.w600,
                            decoration: widget.item.completed ? TextDecoration.lineThrough : null,
                          )),
                      const SizedBox(height: 3),
                      Text(
                        _revealed ? phrase.translation : 'Tap to reveal translation',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            fontStyle: _revealed ? FontStyle.normal : FontStyle.italic),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            SavePhraseButton(text: phrase.text, translation: phrase.translation, language: widget.targetLanguage),
            IconButton(icon: const ColorfulIcon(Icons.volume_up, mood: IconMood.sky, size: 16, boxSize: 30), onPressed: _speak),
          ],
        ),
      ),
    );
  }
}

class _ScenarioTile extends ConsumerWidget {
  final PlanItem item;
  final String targetLanguage;
  const _ScenarioTile({required this.item, required this.targetLanguage});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: _CompletionCheckbox(item: item),
        title: Text(item.title,
            style: TextStyle(
              fontWeight: FontWeight.w600,
              decoration: item.completed ? TextDecoration.lineThrough : null,
            )),
        subtitle: const Text('Tap to practice this roleplay'),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => ScenarioDetailScreen(scenario: item.toScenario(), targetLanguage: targetLanguage),
        )),
      ),
    );
  }
}

class _GrammarTile extends StatefulWidget {
  final PlanItem item;
  const _GrammarTile({required this.item});

  @override
  State<_GrammarTile> createState() => _GrammarTileState();
}

class _GrammarTileState extends State<_GrammarTile> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final topic = widget.item.toGrammarTopic();
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Column(
        children: [
          ListTile(
            leading: _CompletionCheckbox(item: widget.item),
            title: Text(topic.title,
                style: TextStyle(
                  fontWeight: FontWeight.w600,
                  decoration: widget.item.completed ? TextDecoration.lineThrough : null,
                )),
            trailing: Icon(_expanded ? Icons.expand_less : Icons.expand_more),
            onTap: () => setState(() => _expanded = !_expanded),
          ),
          if (_expanded)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(topic.explanation),
                  const SizedBox(height: 10),
                  ...topic.examples.map((ex) => Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(ex.text, style: const TextStyle(fontWeight: FontWeight.w600)),
                            Text(ex.note, style: Theme.of(context).textTheme.bodySmall),
                          ],
                        ),
                      )),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
