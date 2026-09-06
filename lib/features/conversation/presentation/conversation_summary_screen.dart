import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:audioplayers/audioplayers.dart';

import '../data/chat_message.dart';
import '../data/conversation_analytics.dart';
import '../data/tutor_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../phrasebank/data/saved_phrase.dart';
import '../../phrasebank/data/saved_phrases_repository.dart';
import '../../../shared/widgets/save_phrase_button.dart';

/// Pushed once a conversation is ended (not just "New conversation", which
/// discards silently) - shows the AI-built session report: an "Understood"
/// gauge, spoken time, repair moves, grounded fixes grouped by category,
/// the full transcript, and a per-skill breakdown. Every "better" phrase
/// surfaced under Fixes is auto-saved to the Phrase Bank so nothing useful
/// from the session gets lost once this screen is closed.
class ConversationSummaryScreen extends ConsumerStatefulWidget {
  final ConversationAnalytics analytics;
  final Duration spokenDuration;
  final List<ChatMessage> transcript;
  final String targetLanguage;
  final String? accent;
  final String gender;

  const ConversationSummaryScreen({
    super.key,
    required this.analytics,
    required this.spokenDuration,
    required this.transcript,
    required this.targetLanguage,
    required this.accent,
    required this.gender,
  });

  @override
  ConsumerState<ConversationSummaryScreen> createState() => _ConversationSummaryScreenState();
}

class _ConversationSummaryScreenState extends ConsumerState<ConversationSummaryScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController = TabController(length: 3, vsync: this);
  final _player = AudioPlayer();
  int? _speakingFixIndex;

  bool _autoSaving = true;
  int _autoSavedCount = 0;

  @override
  void initState() {
    super.initState();
    _autoSaveFixes();
  }

  @override
  void dispose() {
    _tabController.dispose();
    _player.dispose();
    super.dispose();
  }

  /// Saves every fix's "better" phrase to the Phrase Bank automatically -
  /// silently skips anything already saved rather than toggling it off, so
  /// this can never accidentally un-save something the student saved
  /// earlier by hand.
  Future<void> _autoSaveFixes() async {
    final notifier = ref.read(savedPhrasesProvider.notifier);
    var count = 0;
    for (final fix in widget.analytics.fixes) {
      if (fix.better.isEmpty) continue;
      final already =
          ref.read(savedPhrasesProvider).any((p) => p.matches(fix.better, widget.targetLanguage));
      if (already) continue;
      await notifier.saveIfNew(SavedPhrase(
        text: fix.better,
        translation: fix.note.isNotEmpty ? fix.note : fix.original,
        language: widget.targetLanguage,
      ));
      count++;
    }
    if (mounted) {
      setState(() {
        _autoSaving = false;
        _autoSavedCount = count;
      });
    }
  }

  Future<void> _speakFix(int index, String text) async {
    setState(() => _speakingFixIndex = index);
    try {
      final bytes = await ref.read(tutorRepositoryProvider).speak(
            text: text,
            targetLanguage: widget.targetLanguage,
            accent: widget.accent,
            gender: widget.gender,
          );
      await _player.stop();
      await _player.play(BytesSource(bytes));
      await _player.onPlayerComplete.first;
    } catch (_) {
      // Non-fatal - the text is already visible either way.
    } finally {
      if (mounted) setState(() => _speakingFixIndex = null);
    }
  }

  Color _categoryColor(String category, bool isDark) {
    switch (category.toUpperCase()) {
      case 'GRAMMAR':
        return isDark ? AppColors.darkPurple : AppColors.lightPurple;
      case 'WORD CHOICE':
        return isDark ? AppColors.darkAmber : AppColors.lightAmber;
      case 'PRONUNCIATION':
        return isDark ? AppColors.darkSky : AppColors.lightSky;
      case 'MORE NATURAL':
      default:
        return isDark ? AppColors.darkMint : AppColors.lightMint;
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final a = widget.analytics;
    final mm = widget.spokenDuration.inMinutes.remainder(60).toString().padLeft(2, '0');
    final ss = widget.spokenDuration.inSeconds.remainder(60).toString().padLeft(2, '0');
    final teal = isDark ? AppColors.darkTeal : AppColors.lightTeal;
    final purple = isDark ? AppColors.darkPurple : AppColors.lightPurple;

    return Scaffold(
      backgroundColor: isDark ? AppColors.darkBg : AppColors.lightBg,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 12, 0),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: teal.withOpacity(isDark ? 0.16 : 0.10),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.check_circle_rounded, size: 14, color: teal),
                        const SizedBox(width: 6),
                        Text('Conversation complete',
                            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: teal)),
                      ],
                    ),
                  ),
                  const Spacer(),
                  IconButton(
                    icon: const Icon(Icons.close_rounded),
                    tooltip: 'Done',
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  a.summaryHeadline,
                  style: TextStyle(
                    fontSize: 23,
                    fontWeight: FontWeight.w800,
                    height: 1.25,
                    color: isDark ? AppColors.darkText : AppColors.lightText,
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _UnderstoodGauge(percent: a.understoodPercent),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      children: [
                        _StatCard(label: 'You spoke', value: '$mm:$ss'),
                        const SizedBox(height: 10),
                        _StatCard(
                          label: 'Repair moves',
                          value: '${a.repairMoves}',
                          sub: a.repairNotes.isNotEmpty ? a.repairNotes.first : null,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            TabBar(
              controller: _tabController,
              labelColor: purple,
              unselectedLabelColor: isDark ? AppColors.darkTextSoft : AppColors.lightTextSoft,
              indicatorColor: purple,
              tabs: const [Tab(text: 'Fixes'), Tab(text: 'Transcript'), Tab(text: 'Skills')],
            ),
            Expanded(
              child: TabBarView(
                controller: _tabController,
                children: [
                  _buildFixesTab(isDark),
                  _buildTranscriptTab(isDark),
                  _buildSkillsTab(isDark),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFixesTab(bool isDark) {
    final fixes = widget.analytics.fixes;
    return Column(
      children: [
        Expanded(
          child: fixes.isEmpty
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(
                      'No specific fixes this time — you handled that conversation cleanly.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: isDark ? AppColors.darkTextSoft : AppColors.lightTextSoft),
                    ),
                  ),
                )
              : ListView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                  itemCount: fixes.length,
                  itemBuilder: (context, i) => _FixCard(
                    fix: fixes[i],
                    color: _categoryColor(fixes[i].category, isDark),
                    isSpeaking: _speakingFixIndex == i,
                    onSpeak: () => _speakFix(i, fixes[i].better),
                    targetLanguage: widget.targetLanguage,
                  ),
                ),
        ),
        if (!_autoSaving && _autoSavedCount > 0) _SavedBar(count: _autoSavedCount),
      ],
    );
  }

  Widget _buildTranscriptTab(bool isDark) {
    if (widget.transcript.isEmpty) {
      return Center(
        child: Text('No transcript for this session.',
            style: TextStyle(color: isDark ? AppColors.darkTextSoft : AppColors.lightTextSoft)),
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
      itemCount: widget.transcript.length,
      itemBuilder: (context, i) {
        final m = widget.transcript[i];
        return Align(
          alignment: m.isUser ? Alignment.centerRight : Alignment.centerLeft,
          child: Container(
            margin: const EdgeInsets.symmetric(vertical: 4),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            constraints: const BoxConstraints(maxWidth: 300),
            decoration: BoxDecoration(
              color: m.isUser
                  ? (isDark ? AppColors.darkUserBubble : AppColors.lightUserBubble)
                  : (isDark ? AppColors.darkTutorBubble : AppColors.lightTutorBubble),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(m.text, style: TextStyle(color: m.isUser ? Colors.white : AppColors.lightText)),
                if (m.correction != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text(
                      '→ ${m.correction}',
                      style: TextStyle(
                        fontSize: 12,
                        fontStyle: FontStyle.italic,
                        color: isDark ? AppColors.darkAmber : AppColors.lightAmberText,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildSkillsTab(bool isDark) {
    final skills = widget.analytics.skills;
    if (skills.isEmpty) {
      return Center(
        child: Text('No skill breakdown available for this session.',
            style: TextStyle(color: isDark ? AppColors.darkTextSoft : AppColors.lightTextSoft)),
      );
    }
    final colors = [
      isDark ? AppColors.darkTeal : AppColors.lightTeal,
      isDark ? AppColors.darkPurple : AppColors.lightPurple,
      isDark ? AppColors.darkCyan : AppColors.lightCyan,
      isDark ? AppColors.darkAmber : AppColors.lightAmber,
    ];
    return ListView.builder(
      padding: const EdgeInsets.all(20),
      itemCount: skills.length,
      itemBuilder: (context, i) {
        final s = skills[i];
        final color = colors[i % colors.length];
        return Padding(
          padding: const EdgeInsets.only(bottom: 18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(s.name,
                      style: TextStyle(
                          fontWeight: FontWeight.w700, color: isDark ? AppColors.darkText : AppColors.lightText)),
                  Text('${s.percent}%', style: TextStyle(fontWeight: FontWeight.w700, color: color)),
                ],
              ),
              const SizedBox(height: 8),
              ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: LinearProgressIndicator(
                  value: s.percent / 100,
                  minHeight: 10,
                  backgroundColor: color.withOpacity(0.15),
                  valueColor: AlwaysStoppedAnimation(color),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _UnderstoodGauge extends StatelessWidget {
  final int percent;
  const _UnderstoodGauge({required this.percent});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final color = isDark ? AppColors.darkCyan : AppColors.lightCyan;
    return Container(
      width: 132,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface2 : AppColors.lightSurface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          SizedBox(
            width: 76,
            height: 76,
            child: Stack(
              alignment: Alignment.center,
              children: [
                SizedBox(
                  width: 76,
                  height: 76,
                  child: CircularProgressIndicator(
                    value: percent / 100,
                    strokeWidth: 7,
                    backgroundColor: color.withOpacity(0.15),
                    valueColor: AlwaysStoppedAnimation(color),
                  ),
                ),
                Text('$percent',
                    style: TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                        color: isDark ? AppColors.darkText : AppColors.lightText)),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Text('Understood',
              style: TextStyle(fontSize: 12, color: isDark ? AppColors.darkTextSoft : AppColors.lightTextSoft)),
        ],
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final String? sub;
  const _StatCard({required this.label, required this.value, this.sub});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface2 : AppColors.lightSurface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: TextStyle(fontSize: 11.5, color: isDark ? AppColors.darkTextSoft : AppColors.lightTextSoft)),
          const SizedBox(height: 2),
          Text(value,
              style: TextStyle(
                  fontSize: 18, fontWeight: FontWeight.w800, color: isDark ? AppColors.darkText : AppColors.lightText)),
          if (sub != null)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(sub!,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 11, color: isDark ? AppColors.darkTextSoft : AppColors.lightTextSoft)),
            ),
        ],
      ),
    );
  }
}

/// One card per grounded fix - a colored top border and category label tag
/// the mistake type (Grammar/Word Choice/More Natural/Pronunciation), the
/// original struck through, the improved version, a short note, and an
/// optional "a local would say" tip. Matches the Grammar/Word Choice/More
/// Natural card styling used elsewhere in the app (see AppColors doc
/// comment on amber/mint/purple).
class _FixCard extends StatelessWidget {
  final ConversationFix fix;
  final Color color;
  final bool isSpeaking;
  final VoidCallback onSpeak;
  final String targetLanguage;

  const _FixCard({
    required this.fix,
    required this.color,
    required this.isSpeaking,
    required this.onSpeak,
    required this.targetLanguage,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final textColor = isDark ? AppColors.darkText : AppColors.lightText;
    final softColor = isDark ? AppColors.darkTextSoft : AppColors.lightTextSoft;
    final tip = fix.localTip?.replaceFirst(RegExp(r'^A local would say:\s*', caseSensitive: false), '');

    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface2 : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border(top: BorderSide(color: color, width: 4)),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.06), blurRadius: 10, offset: const Offset(0, 3))],
      ),
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(fix.category.toUpperCase(),
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 0.4, color: color)),
          if (fix.original.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(fix.original,
                style: TextStyle(decoration: TextDecoration.lineThrough, color: softColor)),
          ],
          const SizedBox(height: 6),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                margin: const EdgeInsets.only(top: 6, right: 8),
                width: 8,
                height: 8,
                decoration: BoxDecoration(color: color, shape: BoxShape.circle),
              ),
              Expanded(
                child: Text(fix.better,
                    style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15.5, color: textColor)),
              ),
            ],
          ),
          if (fix.note.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 6, left: 16),
              child: Text(fix.note, style: TextStyle(fontSize: 12.5, color: softColor)),
            ),
          if (tip != null && tip.isNotEmpty)
            Container(
              margin: const EdgeInsets.only(top: 10),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(color: color.withOpacity(0.10), borderRadius: BorderRadius.circular(10)),
              child: Text.rich(
                TextSpan(children: [
                  TextSpan(text: 'A local would say: ', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5, color: color)),
                  TextSpan(text: tip, style: TextStyle(fontSize: 12.5, color: textColor)),
                ]),
              ),
            ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: onSpeak,
                  icon: isSpeaking
                      ? SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: color))
                      : Icon(Icons.volume_up_rounded, size: 16, color: color),
                  label: Text('Say it the better way', style: TextStyle(color: color)),
                  style: OutlinedButton.styleFrom(side: BorderSide(color: color.withOpacity(0.5))),
                ),
              ),
              const SizedBox(width: 6),
              SavePhraseButton(
                text: fix.better,
                translation: fix.note.isNotEmpty ? fix.note : fix.original,
                language: targetLanguage,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// The dark "N phrases saved" bar shown at the bottom of the Fixes tab once
/// auto-save finishes - deliberately a completed-action notice, not a
/// call-to-action, since the saving already happened by the time this
/// screen is visible.
class _SavedBar extends StatelessWidget {
  final int count;
  const _SavedBar({required this.count});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(color: AppColors.darkBg, borderRadius: BorderRadius.circular(16)),
      child: Row(
        children: [
          const CircleAvatar(
            radius: 12,
            backgroundColor: Colors.white24,
            child: Icon(Icons.bookmark_rounded, size: 13, color: Colors.white),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              '$count phrase${count == 1 ? '' : 's'} from this conversation saved to your Phrase Bank',
              style: const TextStyle(color: Colors.white, fontSize: 12.5),
            ),
          ),
          TextButton(
            onPressed: () => context.go('/app?tab=3'),
            child: const Text('Review', style: TextStyle(color: AppColors.darkCyan, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
  }
}
