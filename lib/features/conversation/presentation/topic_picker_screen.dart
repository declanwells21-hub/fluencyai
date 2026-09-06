import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../onboarding/data/onboarding_provider.dart';
import '../../stats/data/usage_stats_repository.dart';
import '../../plan/data/plan_provider.dart';
import '../../plan/data/plan_item.dart';
import '../../scenarios/data/custom_scenario_repository.dart';
import '../../../shared/data/languages.dart';
import '../../../shared/widgets/playful_background.dart';
import '../../../core/theme/app_theme.dart';
import '../data/conversation_topic.dart';
import '../data/custom_topic.dart';
import '../data/custom_topic_repository.dart';
import 'conversation_screen.dart';
import 'custom_topic_screen.dart';

/// The gateway into the Conversation tab: pick a bundled topic (optionally
/// filtered by category, with anything generated for the user's study plan
/// shown first), pick a saved custom topic, or create a brand new custom
/// one. Selecting anything here pushes into ConversationScreen scoped to
/// that topic - "Free Chat" (the default) starts a plain, unscoped
/// conversation exactly like before this feature existed.
class TopicPickerScreen extends ConsumerStatefulWidget {
  const TopicPickerScreen({super.key});

  @override
  ConsumerState<TopicPickerScreen> createState() => _TopicPickerScreenState();
}

class _TopicPickerScreenState extends ConsumerState<TopicPickerScreen> {
  int _tab = 0; // 0 = Topics, 1 = Custom
  String _category = 'general'; // 'general' | 'work' | 'ielts'

  void _openTopic(String title, {String? situation, String? yourRole, String? aiRole}) {
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => ConversationScreen(
        topicTitle: title,
        situation: situation,
        yourRole: yourRole,
        aiRole: aiRole,
      ),
    ));
  }

  void _openFreeChat() {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ConversationScreen()));
  }

  Future<void> _saveTopicAsScenario(String title, String targetLanguage) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      final scenario = await ref
          .read(customScenarioProvider.notifier)
          .generate(targetLanguage: targetLanguage, description: title);
      await ref.read(customScenarioProvider.notifier).save(scenario);
      messenger.showSnackBar(SnackBar(content: Text('Saved "${scenario.title}" to Scenarios')));
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('Could not save to Scenarios: $e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final onboarding = ref.watch(onboardingProvider);
    final streak = ref.watch(usageStatsProvider).currentStreakDays;
    final language = kLanguages.firstWhere(
      (l) => l.code == onboarding.targetLanguage,
      orElse: () => kLanguages.first,
    );

    return Scaffold(
      body: PlayfulBackground(
        child: SafeArea(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 4),
                child: Row(
                  children: [
                    Expanded(
                      child: Row(
                        children: [
                          _TabLabel(label: 'Topics', active: _tab == 0, onTap: () => setState(() => _tab = 0)),
                          const SizedBox(width: 20),
                          _TabLabel(label: 'Custom', active: _tab == 1, onTap: () => setState(() => _tab = 1)),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                      decoration: BoxDecoration(
                        color: isDark ? AppColors.darkSurface2 : AppColors.lightSurface2,
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(language.flag, style: const TextStyle(fontSize: 16)),
                          const SizedBox(width: 4),
                          Icon(Icons.keyboard_arrow_down_rounded,
                              size: 16, color: isDark ? AppColors.darkTextSoft : AppColors.lightTextSoft),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                      decoration: BoxDecoration(
                        color: isDark ? AppColors.darkSurface2 : AppColors.lightSurface2,
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text('$streak', style: TextStyle(fontWeight: FontWeight.bold, color: isDark ? AppColors.darkText : AppColors.lightText)),
                          const SizedBox(width: 4),
                          const Text('🔥', style: TextStyle(fontSize: 14)),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              Expanded(
                child: _tab == 0
                    ? _TopicsTab(
                        category: _category,
                        onCategoryChanged: (c) => setState(() => _category = c),
                        onFreeChat: _openFreeChat,
                        onOpenTopic: _openTopic,
                        onSaveTopic: (title) => _saveTopicAsScenario(title, onboarding.targetLanguage),
                      )
                    : _CustomTab(
                        onOpenTopic: _openTopic,
                        onSaveTopic: (topic) => _saveTopicAsScenario(topic.title, onboarding.targetLanguage),
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TabLabel extends StatelessWidget {
  final String label;
  final bool active;
  final VoidCallback onTap;
  const _TabLabel({required this.label, required this.active, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final activeColor = isDark ? AppColors.darkText : AppColors.lightText;
    final inactiveColor = isDark ? AppColors.darkTextSoft : AppColors.lightTextSoft;
    return GestureDetector(
      onTap: onTap,
      child: Text(
        label,
        style: TextStyle(
          fontSize: 20,
          fontWeight: active ? FontWeight.w800 : FontWeight.w500,
          color: active ? activeColor : inactiveColor,
        ),
      ),
    );
  }
}

class _CategoryChip extends StatelessWidget {
  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;
  const _CategoryChip({required this.label, required this.icon, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final purple = isDark ? AppColors.darkPurple : AppColors.lightPurple;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: ChoiceChip(
        label: Text(label),
        avatar: Icon(icon, size: 16, color: selected ? Colors.white : null),
        selected: selected,
        onSelected: (_) => onTap(),
        selectedColor: purple,
        labelStyle: TextStyle(
          color: selected ? Colors.white : (isDark ? AppColors.darkText : AppColors.lightText),
          fontWeight: FontWeight.w600,
        ),
        backgroundColor: isDark ? AppColors.darkSurface2 : AppColors.lightSurface2,
        side: BorderSide.none,
      ),
    );
  }
}

typedef _OpenTopic = void Function(String title, {String? situation, String? yourRole, String? aiRole});

class _TopicsTab extends ConsumerWidget {
  final String category;
  final ValueChanged<String> onCategoryChanged;
  final VoidCallback onFreeChat;
  final _OpenTopic onOpenTopic;
  final ValueChanged<String> onSaveTopic;

  const _TopicsTab({
    required this.category,
    required this.onCategoryChanged,
    required this.onFreeChat,
    required this.onOpenTopic,
    required this.onSaveTopic,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final planAsync = ref.watch(planProvider);
    final planTopics = (planAsync.value ?? const <PlanItem>[])
        .where((item) => item.kind == PlanItemKind.scenario)
        .toList();

    final filtered = category == 'general'
        ? kConversationTopics
        : kConversationTopics.where((t) => t.category == category).toList();

    // Group by module, preserving overall ordering for the "Topic N" count.
    final modules = <String>[];
    for (final t in filtered) {
      if (!modules.contains(t.module)) modules.add(t.module);
    }
    var globalIndex = 0;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
      children: [
        Row(
          children: [
            _CategoryChip(
              label: 'Work',
              icon: Icons.work_outline_rounded,
              selected: category == 'work',
              onTap: () => onCategoryChanged(category == 'work' ? 'general' : 'work'),
            ),
            _CategoryChip(
              label: 'IELTS Prep',
              icon: Icons.menu_book_rounded,
              selected: category == 'ielts',
              onTap: () => onCategoryChanged(category == 'ielts' ? 'general' : 'ielts'),
            ),
            _CategoryChip(
              label: 'Free Chat',
              icon: Icons.forum_rounded,
              selected: category == 'general',
              onTap: onFreeChat,
            ),
          ],
        ),
        const SizedBox(height: 16),
        if (planTopics.isNotEmpty && category == 'general') ...[
          const _ModuleHeader('From Your Plan'),
          ...planTopics.map((item) => _TopicRow(
                emoji: '⭐',
                topicLabel: 'Personalized',
                title: item.title,
                onTap: () => onOpenTopic(item.title),
                onSave: () => onSaveTopic(item.title),
              )),
          const SizedBox(height: 8),
        ],
        for (final module in modules) ...[
          _ModuleHeader(module),
          ...filtered.where((t) => t.module == module).map((t) {
            globalIndex++;
            return _TopicRow(
              emoji: t.emoji,
              topicLabel: 'Topic $globalIndex',
              title: t.title,
              onTap: () => onOpenTopic(t.title),
              onSave: () => onSaveTopic(t.title),
            );
          }),
        ],
      ],
    );
  }
}

class _ModuleHeader extends StatelessWidget {
  final String text;
  const _ModuleHeader(this.text);

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Padding(
      padding: const EdgeInsets.only(top: 12, bottom: 8),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w700,
          color: isDark ? AppColors.darkTextSoft : AppColors.lightTextSoft,
        ),
      ),
    );
  }
}

class _TopicRow extends StatelessWidget {
  final String emoji;
  final String topicLabel;
  final String title;
  final VoidCallback onTap;
  final VoidCallback onSave;

  const _TopicRow({
    required this.emoji,
    required this.topicLabel,
    required this.title,
    required this.onTap,
    required this.onSave,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final purple = isDark ? AppColors.darkPurple : AppColors.lightPurple;
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Row(
          children: [
            Container(
              height: 52,
              width: 52,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: purple, width: 2),
              ),
              child: Text(emoji, style: const TextStyle(fontSize: 22)),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(topicLabel,
                      style: TextStyle(fontSize: 11, color: isDark ? AppColors.darkTextSoft : AppColors.lightTextSoft)),
                  const SizedBox(height: 2),
                  Text(title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                ],
              ),
            ),
            IconButton(
              icon: Icon(Icons.bookmark_add_outlined, size: 20, color: purple),
              tooltip: 'Save to Scenarios',
              onPressed: onSave,
            ),
          ],
        ),
      ),
    );
  }
}

class _CustomTab extends ConsumerWidget {
  final _OpenTopic onOpenTopic;
  final ValueChanged<CustomTopic> onSaveTopic;
  const _CustomTab({required this.onOpenTopic, required this.onSaveTopic});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final topics = ref.watch(customTopicProvider);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final purple = isDark ? AppColors.darkPurple : AppColors.lightPurple;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
      children: [
        InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => const CustomTopicScreen()),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Row(
              children: [
                Container(
                  height: 52,
                  width: 52,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: LinearGradient(colors: [purple, purple.withOpacity(0.5)]),
                  ),
                  child: const Icon(Icons.add, color: Colors.white, size: 26),
                ),
                const SizedBox(width: 14),
                const Text('Create a custom topic', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
              ],
            ),
          ),
        ),
        if (topics.isEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 60),
            child: Column(
              children: [
                Icon(Icons.forum_outlined, size: 44, color: isDark ? AppColors.darkTextSoft : AppColors.lightTextSoft),
                const SizedBox(height: 12),
                Text(
                  'Your custom topics will be here',
                  style: TextStyle(color: isDark ? AppColors.darkTextSoft : AppColors.lightTextSoft),
                ),
              ],
            ),
          )
        else
          ...topics.map((topic) => Padding(
                padding: const EdgeInsets.only(top: 10),
                child: InkWell(
                  borderRadius: BorderRadius.circular(16),
                  onTap: () => onOpenTopic(
                    topic.title,
                    situation: topic.situation,
                    yourRole: topic.yourRole,
                    aiRole: topic.aiRole,
                  ),
                  child: Row(
                    children: [
                      Container(
                        height: 52,
                        width: 52,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: purple, width: 2)),
                        child: const Icon(Icons.theater_comedy_outlined),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(topic.title,
                                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis),
                            const SizedBox(height: 2),
                            Text(
                              'You: ${topic.yourRole} · AI: ${topic.aiRole}',
                              style: TextStyle(fontSize: 12, color: isDark ? AppColors.darkTextSoft : AppColors.lightTextSoft),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        icon: Icon(Icons.bookmark_add_outlined, size: 20, color: purple),
                        tooltip: 'Save to Scenarios',
                        onPressed: () => onSaveTopic(topic),
                      ),
                    ],
                  ),
                ),
              )),
      ],
    );
  }
}
