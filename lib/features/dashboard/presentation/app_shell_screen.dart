import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../conversation/presentation/topic_picker_screen.dart';
import '../../settings/presentation/settings_screen.dart';
import '../../phrasebank/presentation/phrase_bank_screen.dart';
import '../../grammar/presentation/grammar_screen.dart';
import '../../scenarios/presentation/scenario_catalog_screen.dart';
import '../../stats/presentation/stats_screen.dart';
import '../../paywall/data/subscription_provider.dart';
import '../../paywall/presentation/paywall_sheet.dart';

/// Matches the prototype's TAB_KEYS bottom nav: conv, catalog, grammar,
/// phrasebank, analytics, settings. All six tabs are real now.
///
/// The "Conversation" tab now opens the topic picker first (choose a
/// bundled topic, a saved custom topic, or start Free Chat) instead of
/// dropping straight into free-chat - ConversationScreen itself is pushed
/// on top once a topic (or Free Chat) is chosen.
///
/// Scenarios/Grammar/Phrases/Stats are the "standard scenarios and content"
/// the paywall spec locks behind Pro - Conversation and Settings stay open
/// (Conversation has its own 5-minute/day cap enforced in
/// ConversationScreen instead). On Free Tier, tapping a gated tab still
/// switches to it (so it's visible/previewable underneath, per the paywall
/// spec) but also surfaces the paywall sheet on top of it.
class AppShellScreen extends ConsumerStatefulWidget {
  final int initialIndex;
  const AppShellScreen({super.key, this.initialIndex = 0});

  @override
  ConsumerState<AppShellScreen> createState() => _AppShellScreenState();
}

class _AppShellScreenState extends ConsumerState<AppShellScreen> {
  late int _index = widget.initialIndex;

  static const _gatedIndices = {1, 2, 3, 4};

  static const _screens = [
    TopicPickerScreen(),
    ScenarioCatalogScreen(),
    GrammarScreen(),
    PhraseBankScreen(),
    StatsScreen(),
    SettingsScreen(),
  ];

  @override
  void initState() {
    super.initState();
    if (_gatedIndices.contains(widget.initialIndex)) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _maybeShowPaywall());
    }
  }

  Future<void> _maybeShowPaywall() async {
    if (!mounted) return;
    final tier = await ref.read(subscriptionTierProvider.future);
    if (mounted && tier.isFree) showPaywallSheet(context);
  }

  void _onDestinationSelected(int i) {
    setState(() => _index = i);
    if (_gatedIndices.contains(i)) _maybeShowPaywall();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(index: _index, children: _screens),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: _onDestinationSelected,
        destinations: const [
          NavigationDestination(icon: Icon(Icons.mic), label: 'Conversation'),
          NavigationDestination(icon: Icon(Icons.grid_view), label: 'Scenarios'),
          NavigationDestination(icon: Icon(Icons.menu_book), label: 'Grammar'),
          NavigationDestination(icon: Icon(Icons.chat_bubble_outline), label: 'Phrases'),
          NavigationDestination(icon: Icon(Icons.bar_chart), label: 'Stats'),
          NavigationDestination(icon: Icon(Icons.settings), label: 'Settings'),
        ],
      ),
    );
  }
}
