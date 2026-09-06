import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../data/usage_stats_repository.dart';
import '../../onboarding/data/onboarding_provider.dart';
import '../../phrasebank/data/saved_phrases_repository.dart';
import '../../scenarios/data/custom_scenario_repository.dart';
import '../../grammar/data/custom_grammar_repository.dart';
import '../../../shared/widgets/section_header.dart';
import '../../../shared/widgets/playful_background.dart';
import '../../../core/theme/app_theme.dart';

/// Real usage data, not placeholders - streak, minutes, corrections, and
/// content counts are all pulled from actual on-device tracking (see
/// usage_stats_repository.dart) and the saved-phrase/scenario/grammar
/// providers already built in earlier features. Nothing here is synced to
/// Supabase yet - it's device-local, same as the content it's counting.
class StatsScreen extends ConsumerWidget {
  const StatsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final stats = ref.watch(usageStatsProvider);
    final onboarding = ref.watch(onboardingProvider);
    final savedPhrasesCount = ref.watch(savedPhrasesProvider).length;
    final customScenariosCount = ref.watch(customScenarioProvider).length;
    final customGrammarCount = ref.watch(customGrammarProvider).length;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final todayMinutes = stats.todaySeconds ~/ 60;
    final totalMinutes = stats.totalSeconds ~/ 60;
    final goalMinutes = onboarding.dailyGoalMinutes;
    final goalProgress = goalMinutes > 0 ? (todayMinutes / goalMinutes).clamp(0.0, 1.0) : 0.0;

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            SectionHeader(
              icon: Icons.bar_chart,
              title: 'Stats',
              subtitle: 'Your real practice history',
              gradient: isDark ? AppColors.darkCyanPurpleGradient : AppColors.lightCyanPurpleGradient,
            ),
            Expanded(
              child: PlayfulBackground(
                child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  // ---- Streak + today's goal ----
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              const Text('🔥', style: TextStyle(fontSize: 28)),
                              const SizedBox(width: 10),
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('${stats.currentStreakDays} day streak',
                                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
                                  Text(
                                    stats.currentStreakDays == 0
                                        ? 'Practice today to start a streak'
                                        : 'Keep it going!',
                                    style: Theme.of(context).textTheme.bodySmall,
                                  ),
                                ],
                              ),
                            ],
                          ),
                          const SizedBox(height: 16),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text("Today's goal", style: Theme.of(context).textTheme.bodySmall),
                              Text('$todayMinutes / $goalMinutes min',
                                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                            ],
                          ),
                          const SizedBox(height: 6),
                          ClipRRect(
                            borderRadius: BorderRadius.circular(6),
                            child: LinearProgressIndicator(
                              value: goalProgress,
                              minHeight: 10,
                              backgroundColor: Theme.of(context).colorScheme.surface,
                              color: Theme.of(context).colorScheme.primary,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // ---- All-time practice + corrections ----
                  Row(
                    children: [
                      Expanded(
                        child: _StatTile(
                          icon: Icons.timer_outlined,
                          value: '$totalMinutes',
                          label: 'Total Minutes',
                          accent: Theme.of(context).colorScheme.primary,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: _StatTile(
                          icon: Icons.spellcheck,
                          value: '${stats.correctionsCount}',
                          label: 'Corrections Learned',
                          accent: Theme.of(context).colorScheme.secondary,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),

                  // ---- Content you've built ----
                  const Text('Your Content', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                        child: _StatTile(
                          icon: Icons.bookmark,
                          value: '$savedPhrasesCount',
                          label: 'Saved Phrases',
                          accent: Theme.of(context).colorScheme.tertiary,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: _StatTile(
                          icon: Icons.auto_awesome,
                          value: '$customScenariosCount',
                          label: 'Scenarios Created',
                          accent: Theme.of(context).colorScheme.primary,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: _StatTile(
                          icon: Icons.menu_book,
                          value: '$customGrammarCount',
                          label: 'Grammar Saved',
                          accent: Theme.of(context).colorScheme.secondary,
                        ),
                      ),
                    ],
                  ),

                  if (totalMinutes == 0 && stats.correctionsCount == 0) ...[
                    const SizedBox(height: 24),
                    Center(
                      child: Text(
                        "No practice recorded yet - head to Conversation and have your first chat.",
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ),
                  ],
                ],
              ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatTile extends StatelessWidget {
  final IconData icon;
  final String value;
  final String label;
  final Color accent;
  const _StatTile({required this.icon, required this.value, required this.label, required this.accent});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 8),
        child: Column(
          children: [
            Icon(icon, color: accent, size: 22),
            const SizedBox(height: 8),
            Text(value, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
            const SizedBox(height: 2),
            Text(label, textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      ),
    );
  }
}
