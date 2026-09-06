import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:audioplayers/audioplayers.dart';
import '../data/chat_message.dart';
import '../data/tutor_repository.dart';
import '../../onboarding/data/onboarding_provider.dart';

/// Advanced Speaking Toolkit. Uses our own brand colors/theme throughout,
/// not the reference design's colors. Pronunciation Grader and Scaffolded
/// Prompts are real AI calls (mode: "pronunciation" / "hint" in
/// api/chat.js). Shadowing Engine is real slowed-down TTS playback per word.
/// Visual Phonetics is deliberately NOT a mouth/tongue diagram tool - I
/// don't have a verified, linguistically accurate diagram source, and a
/// wrong diagram teaches wrong pronunciation, so this shows plain-text tips
/// instead and says so.
Future<void> showAdvancedToolkit({
  required BuildContext context,
  required WidgetRef ref,
  required ChatMessage? lastUserMessage,
  required ChatMessage? lastTutorMessage,
}) {
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (sheetContext) => _AdvancedToolkitSheet(
      lastUserMessage: lastUserMessage,
      lastTutorMessage: lastTutorMessage,
    ),
  );
}

class _AdvancedToolkitSheet extends ConsumerStatefulWidget {
  final ChatMessage? lastUserMessage;
  final ChatMessage? lastTutorMessage;
  const _AdvancedToolkitSheet({required this.lastUserMessage, required this.lastTutorMessage});

  @override
  ConsumerState<_AdvancedToolkitSheet> createState() => _AdvancedToolkitSheetState();
}

class _AdvancedToolkitSheetState extends ConsumerState<_AdvancedToolkitSheet> {
  bool _analyzing = false;
  String? _pronunciationFeedback;

  bool _gettingHint = false;
  String? _hint;

  bool _phoneticsOn = false;

  final _player = AudioPlayer();
  int? _speakingChunkIndex;

  @override
  void dispose() {
    _player.dispose();
    super.dispose();
  }

  Future<void> _analyzeSpeech() async {
    final text = widget.lastUserMessage?.text;
    if (text == null || text.isEmpty) {
      setState(() => _pronunciationFeedback = "You haven't said anything yet in this conversation - speak first, then come back here.");
      return;
    }
    setState(() { _analyzing = true; _pronunciationFeedback = null; });
    try {
      final onboarding = ref.read(onboardingProvider);
      final feedback = await ref.read(tutorRepositoryProvider).analyzePronunciation(
            targetLanguage: onboarding.targetLanguage,
            spokenText: text,
          );
      setState(() => _pronunciationFeedback = feedback);
    } catch (e) {
      setState(() => _pronunciationFeedback = 'Could not analyze that right now: $e');
    } finally {
      if (mounted) setState(() => _analyzing = false);
    }
  }

  Future<void> _getHint() async {
    setState(() { _gettingHint = true; _hint = null; });
    try {
      final onboarding = ref.read(onboardingProvider);
      final hint = await ref.read(tutorRepositoryProvider).getHint(
            targetLanguage: onboarding.targetLanguage,
            level: onboarding.level,
            context: widget.lastTutorMessage?.text ?? '',
          );
      setState(() => _hint = hint);
    } catch (e) {
      setState(() => _hint = 'Could not get a hint right now: $e');
    } finally {
      if (mounted) setState(() => _gettingHint = false);
    }
  }

  Future<void> _speakChunkSlowly(int index, String chunk) async {
    setState(() => _speakingChunkIndex = index);
    try {
      final onboarding = ref.read(onboardingProvider);
      final bytes = await ref.read(tutorRepositoryProvider).speak(
            text: chunk,
            targetLanguage: onboarding.targetLanguage,
            accent: onboarding.accent,
            gender: onboarding.gender,
          );
      await _player.setPlaybackRate(0.6);
      await _player.play(BytesSource(bytes));
    } catch (_) {
      // Fail quietly - this is a nice-to-have drill, not critical path.
    } finally {
      if (mounted) setState(() => _speakingChunkIndex = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final primary = Theme.of(context).colorScheme.primary;
    final tutorWords = (widget.lastTutorMessage?.text ?? '').split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toList();

    return DraggableScrollableSheet(
      initialChildSize: 0.85,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (context, scrollController) => Padding(
        padding: const EdgeInsets.all(20),
        child: ListView(
          controller: scrollController,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Advanced Speaking Toolkit',
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                IconButton(icon: const Icon(Icons.close), onPressed: () => Navigator.of(context).pop()),
              ],
            ),
            const SizedBox(height: 16),

            // ---- Pronunciation Grader ----
            _ToolCard(
              title: 'Pronunciation Grader',
              subtitle: 'Get tips on your last spoken phrase.',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  OutlinedButton.icon(
                    onPressed: _analyzing ? null : _analyzeSpeech,
                    icon: _analyzing
                        ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.graphic_eq),
                    label: Text(_analyzing ? 'Analyzing…' : 'Analyze My Speech'),
                  ),
                  if (_pronunciationFeedback != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 10),
                      child: Text(_pronunciationFeedback!, style: Theme.of(context).textTheme.bodyMedium),
                    ),
                ],
              ),
            ),

            // ---- Shadowing Engine ----
            _ToolCard(
              title: 'Shadowing Engine',
              subtitle: 'Tap a word from the tutor\'s last reply for slowed-down repetition audio.',
              child: tutorWords.isEmpty
                  ? const Text('No tutor reply yet this conversation.', style: TextStyle(color: Colors.grey))
                  : Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: tutorWords.asMap().entries.map((entry) {
                        final isSpeaking = _speakingChunkIndex == entry.key;
                        return ActionChip(
                          avatar: isSpeaking
                              ? const SizedBox(width: 12, height: 12, child: CircularProgressIndicator(strokeWidth: 2))
                              : null,
                          label: Text(entry.value),
                          onPressed: isSpeaking ? null : () => _speakChunkSlowly(entry.key, entry.value),
                        );
                      }).toList(),
                    ),
            ),

            // ---- Visual Phonetics ----
            _ToolCard(
              title: 'Visual Phonetics',
              subtitle: 'Basic text tips for tricky sounds - not a diagram tool.',
              trailing: Switch(value: _phoneticsOn, onChanged: (v) => setState(() => _phoneticsOn = v)),
              child: !_phoneticsOn
                  ? const SizedBox.shrink()
                  : Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: primary.withOpacity(0.06),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Text(
                        'Note: this is general guidance, not a verified anatomical diagram tool - '
                        'accurate mouth/tongue placement diagrams need a real linguistic source, which '
                        'isn\'t wired in yet. General tip: unfamiliar vowel sounds are usually the '
                        'biggest source of a strong accent - listen closely and exaggerate the mouth '
                        'shape when you repeat a new sound.',
                        style: TextStyle(fontSize: 12.5),
                      ),
                    ),
            ),

            // ---- Scaffolded Prompts ----
            _ToolCard(
              title: 'Scaffolded Prompts',
              subtitle: 'Need a nudge? Get a fill-in-the-blank template.',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  FilledButton.icon(
                    onPressed: _gettingHint ? null : _getHint,
                    icon: _gettingHint
                        ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Text('💡'),
                    label: Text(_gettingHint ? 'Thinking…' : 'Hint'),
                  ),
                  if (_hint != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 10),
                      child: Text(_hint!, style: Theme.of(context).textTheme.bodyMedium),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ToolCard extends StatelessWidget {
  final String title;
  final String subtitle;
  final Widget child;
  final Widget? trailing;
  const _ToolCard({required this.title, required this.subtitle, required this.child, this.trailing});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 14),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                if (trailing != null) trailing!,
              ],
            ),
            const SizedBox(height: 4),
            Text(subtitle, style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 12),
            child,
          ],
        ),
      ),
    );
  }
}
