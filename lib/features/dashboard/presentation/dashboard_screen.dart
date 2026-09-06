import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../onboarding/data/onboarding_provider.dart';
import '../../stats/data/usage_stats_repository.dart';
import '../../phrasebank/data/saved_phrases_repository.dart';
import '../../plan/data/plan_provider.dart';
import '../../plan/data/plan_item.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/app_logo.dart';
import '../../../shared/widgets/playful_background.dart';

/// Landing screen after onboarding, matching the prototype's dashboard:
/// topbar, resume-session card, quick-access practice cards, snapshot stats.
/// Tapping "Start a conversation" drops into the real AI-powered tab shell.
///
/// Note: Scenarios/Grammar quick cards below navigate straight to
/// AppShellScreen with that tab pre-selected - AppShellScreen's own
/// initState is what shows the paywall sheet for Free Tier users landing on
/// a gated tab (see its `_gatedIndices` check), since by the time that
/// screen exists this one has already been replaced and its context is no
/// longer valid to show a sheet from.
class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final onboarding = ref.watch(onboardingProvider);
    final stats = ref.watch(usageStatsProvider);
    final savedPhrasesCount = ref.watch(savedPhrasesProvider).length;
    final planAsync = ref.watch(planProvider);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      appBar: AppBar(
        title: const AppLogo(height: 28),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: Row(children: const [
              Icon(Icons.circle, size: 8, color: Colors.green),
              SizedBox(width: 4),
              Text('Online', style: TextStyle(fontSize: 12)),
            ]),
          ),
        ],
      ),
      body: PlayfulBackground(
        child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              gradient: isDark ? AppColors.darkPrimaryGradient : AppColors.lightPrimaryGradient,
              borderRadius: BorderRadius.circular(18),
            ),
            child: Row(
              children: [
                const CircleAvatar(
                  radius: 24,
                  backgroundColor: Colors.white24,
                  child: Icon(Icons.play_arrow, color: Colors.white),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Resume with your tutor',
                          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                      Text('${onboarding.tutorName ?? "Your tutor"} · ${onboarding.accent ?? ""}',
                          style: const TextStyle(color: Colors.white70, fontSize: 12)),
                    ],
                  ),
                ),
                FilledButton(
                  style: FilledButton.styleFrom(backgroundColor: Colors.white, foregroundColor: Colors.black),
                  onPressed: () => context.go('/app'),
                  child: const Text('Go'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          _StudyPlanCard(planAsync: planAsync, targetLanguage: onboarding.targetLanguage),
          const SizedBox(height: 20),
          const Text('Practice Now', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _QuickCard(
                  icon: Icons.mic,
                  label: 'Conversation',
                  onTap: () => context.go('/app'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _QuickCard(
                  icon: Icons.grid_view,
                  label: 'Scenarios',
                  onTap: () => context.go('/app?tab=1'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _QuickCard(
                  icon: Icons.menu_book,
                  label: 'Grammar',
                  onTap: () => context.go('/app?tab=2'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          const Text("Today's Snapshot", style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(child: _StatCard(label: 'Streak', value: '${stats.currentStreakDays} days', accent: isDark ? AppColors.darkMint : AppColors.lightMint)),
              const SizedBox(width: 10),
              Expanded(child: _StatCard(label: 'Minutes Today', value: '${stats.todaySeconds ~/ 60}', accent: isDark ? AppColors.darkSky : AppColors.lightSky)),
              const SizedBox(width: 10),
              Expanded(child: _StatCard(label: 'Saved Phrases', value: '$savedPhrasesCount', accent: isDark ? AppColors.darkAmber : AppColors.lightAmber)),
            ],
          ),
        ],
      ),
      ),
    );
  }
}

class _QuickCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  const _QuickCard({required this.icon, required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 18),
          child: Column(
            children: [
              Icon(icon, color: Theme.of(context).colorScheme.primary),
              const SizedBox(height: 6),
              Text(label, style: const TextStyle(fontSize: 12)),
            ],
          ),
        ),
      ),
    );
  }
}

class _StudyPlanCard extends StatelessWidget {
  final AsyncValue<List<PlanItem>> planAsync;
  final String targetLanguage;
  const _StudyPlanCard({required this.planAsync, required this.targetLanguage});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => context.push('/plan'),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: planAsync.when(
            loading: () => const Row(children: [
              SizedBox(height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2)),
              SizedBox(width: 12),
              Text('Loading your study plan…'),
            ]),
            error: (e, _) => Row(
              children: [
                Icon(Icons.error_outline, color: Theme.of(context).colorScheme.error, size: 20),
                const SizedBox(width: 10),
                const Expanded(child: Text('Could not load your study plan')),
                const Icon(Icons.chevron_right),
              ],
            ),
            data: (items) {
              if (items.isEmpty) {
                return Row(
                  children: [
                    Icon(Icons.auto_awesome_rounded, color: Theme.of(context).colorScheme.primary, size: 20),
                    const SizedBox(width: 10),
                    const Expanded(child: Text('Generate your personalized study plan')),
                    const Icon(Icons.chevron_right),
                  ],
                );
              }
              final completed = items.where((i) => i.completed).length;
              final fraction = items.isEmpty ? 0.0 : completed / items.length;
              return Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Your Study Plan', style: TextStyle(fontWeight: FontWeight.bold)),
                        const SizedBox(height: 6),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(6),
                          child: LinearProgressIndicator(value: fraction, minHeight: 6),
                        ),
                        const SizedBox(height: 6),
                        Text('$completed of ${items.length} complete',
                            style: Theme.of(context).textTheme.bodySmall),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  const Icon(Icons.chevron_right),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final Color accent;
  const _StatCard({required this.label, required this.value, required this.accent});

  @override
  Widget build(BuildContext context) {
    return Card(
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: accent.withOpacity(0.4), width: 1.5),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 14),
        child: Column(
          children: [
            Container(width: 24, height: 3, decoration: BoxDecoration(color: accent, borderRadius: BorderRadius.circular(2))),
            const SizedBox(height: 8),
            Text(value, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            const SizedBox(height: 4),
            Text(label, style: const TextStyle(fontSize: 11, color: Colors.grey)),
          ],
        ),
      ),
    );
  }
}
