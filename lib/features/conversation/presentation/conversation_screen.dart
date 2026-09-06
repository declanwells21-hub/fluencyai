import 'dart:async';
import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:record/record.dart';
import 'package:audioplayers/audioplayers.dart';
import 'package:path_provider/path_provider.dart';
import 'package:http/http.dart' as http;

import '../data/chat_message.dart';
import '../data/tutor_repository.dart';
import '../data/conversation_analytics.dart';
import '../../onboarding/data/onboarding_provider.dart';
import '../../../core/theme/app_theme.dart';
import '../../stats/data/usage_stats_repository.dart';
import '../../../shared/widgets/playful_background.dart';
import 'advanced_toolkit_sheet.dart';
import 'save_phrase_sheet.dart';
import 'conversation_summary_screen.dart';
import '../../paywall/data/subscription_provider.dart';
import '../../paywall/presentation/paywall_sheet.dart';

class ConversationScreen extends ConsumerStatefulWidget {
  /// When set (via the topic picker or a custom topic), the conversation is
  /// scoped to this topic/roleplay instead of being plain free-chat. All
  /// null means unscoped free-chat - unchanged from before this feature.
  final String? topicTitle;
  final String? situation;
  final String? yourRole;
  final String? aiRole;

  const ConversationScreen({
    super.key,
    this.topicTitle,
    this.situation,
    this.yourRole,
    this.aiRole,
  });

  @override
  ConsumerState<ConversationScreen> createState() => _ConversationScreenState();
}

class _ConversationScreenState extends ConsumerState<ConversationScreen> {
  final _recorder = AudioRecorder();
  final _player = AudioPlayer();
  final List<ChatMessage> _messages = [];
  bool _isRecording = false;
  bool _isProcessing = false;
  bool _isSpeaking = false; // tutor audio currently playing (fresh or replayed)
  int? _playingIndex; // index into _messages of the bubble currently playing, if any
  String? _recordPath;
  // Translations are shown by default under each tutor bubble (matching the
  // reference prototype) - this tracks which indexes the user has hidden via
  // the eye-slash toggle, rather than which ones are shown. Index-based
  // (not object-based) because _handleReply swaps in a new ChatMessage
  // instance at the same index once TTS audio arrives.
  final Set<int> _hiddenTranslationIndexes = {};
  String _tone = 'nice'; // 'nice' | 'strict' | 'funny'
  double _speed = 1.0;
  Stopwatch _sessionStopwatch = Stopwatch()..start();
  Duration _lastFlushedElapsed = Duration.zero;

  bool _paused = false;
  String? _errorMessage;
  Future<void> Function()? _retryAction;

  @override
  void dispose() {
    _flushPracticeTime();
    _recorder.dispose();
    _player.dispose();
    super.dispose();
  }

  void _showError(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: Theme.of(context).colorScheme.error),
    );
  }

  /// Records however much time has elapsed since the last flush into
  /// persistent stats (Stats tab, Dashboard snapshot). This is the only
  /// place practice time actually gets written - called on pause, on
  /// starting a new conversation, and on leaving the screen, so time is
  /// never lost and never double-counted.
  void _flushPracticeTime() {
    final delta = _sessionStopwatch.elapsed - _lastFlushedElapsed;
    if (delta.inSeconds > 0) {
      ref.read(usageStatsProvider.notifier).addPracticeSeconds(delta.inSeconds);
    }
    _lastFlushedElapsed = _sessionStopwatch.elapsed;
  }

  // ---------------- Recording ----------------

  Future<void> _startRecording() async {
    if (_paused) return;

    // Free Tier Limit: 5 minutes of conversation per day (see the paywall
    // spec) - checked against real practiced time, not just this session,
    // so it holds even across multiple short conversations in one day.
    final tier = await ref.read(subscriptionTierProvider.future);
    if (tier.isFree && ref.read(usageStatsProvider).todaySeconds >= kFreeTierDailySeconds) {
      if (mounted) await showPaywallSheet(context);
      return;
    }

    try {
      await _recorder.hasPermission();

      final String path;
      if (kIsWeb) {
        path = 'turn_${DateTime.now().millisecondsSinceEpoch}.wav';
      } else {
        final dir = await getTemporaryDirectory();
        path = '${dir.path}/turn_${DateTime.now().millisecondsSinceEpoch}.wav';
      }
      _recordPath = path;
      await _recorder.start(const RecordConfig(encoder: AudioEncoder.wav), path: path);
      setState(() => _isRecording = true);
    } catch (e) {
      _showError('Could not start the microphone: $e');
    }
  }

  Future<void> _stopRecordingAndProcess() async {
    String? resultPath;
    try {
      resultPath = await _recorder.stop();
    } catch (e) {
      setState(() => _isRecording = false);
      _showError('Could not stop the recording: $e');
      return;
    }
    setState(() => _isRecording = false);

    if (resultPath == null) {
      _showError('No audio was captured - try holding the button a little longer.');
      return;
    }

    try {
      final bytes = await _readAudioBytes(resultPath);
      await _handleAudio(bytes);
    } catch (e) {
      _showError('Could not read the recording: $e');
    }
  }

  /// "Stop" button: immediately cancels whatever's currently in flight -
  /// an active recording (discarded, not processed) or currently-playing
  /// tutor audio - without ending the whole session.
  Future<void> _stopCurrentAction() async {
    if (_isRecording) {
      await _recorder.stop();
      setState(() => _isRecording = false);
    }
    await _player.stop();
    setState(() { _isProcessing = false; _isSpeaking = false; _playingIndex = null; });
  }

  void _togglePause() {
    if (!_paused) _flushPracticeTime(); // flush before stopping the clock
    setState(() {
      _paused = !_paused;
      if (_paused) {
        _sessionStopwatch.stop();
      } else {
        _sessionStopwatch.start();
      }
    });
  }

  Future<void> _startNewConversation() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Start New Conversation?'),
        content: const Text('This clears the current conversation history. It is not saved anywhere.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialogContext).pop(false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.of(dialogContext).pop(true), child: const Text('Start New')),
        ],
      ),
    );
    if (confirmed != true) return;

    _flushPracticeTime();
    await _player.stop();
    if (_isRecording) await _recorder.stop();
    setState(() {
      _messages.clear();
      _errorMessage = null;
      _retryAction = null;
      _isRecording = false;
      _isProcessing = false;
      _isSpeaking = false;
      _playingIndex = null;
      _hiddenTranslationIndexes.clear();
      _paused = false;
      _sessionStopwatch = Stopwatch()..start();
      _lastFlushedElapsed = Duration.zero;
    });
  }

  /// "End Conversation" - distinct from "New conversation" above, which
  /// silently discards the session. This flushes practice time, asks the AI
  /// for a grounded end-of-session report (mode "analyze" in api/chat.js),
  /// then pushes the summary screen. Only clears the board once the
  /// summary is actually closed, so the transcript stays available the
  /// whole time the report is up.
  Future<void> _endConversation() async {
    if (_messages.isEmpty) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('End Conversation?'),
        content: const Text(
          "You'll see your practice summary - understood %, fixes worth reviewing, "
          'and a skill breakdown for this session.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialogContext).pop(false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.of(dialogContext).pop(true), child: const Text('End & Review')),
        ],
      ),
    );
    if (confirmed != true) return;

    _flushPracticeTime();
    await _player.stop();
    if (_isRecording) await _recorder.stop();

    final duration = _sessionStopwatch.elapsed;
    final transcriptSnapshot = List<ChatMessage>.from(_messages);
    final onboarding = ref.read(onboardingProvider);

    setState(() { _isRecording = false; _isProcessing = true; _errorMessage = null; _retryAction = null; });

    ConversationAnalytics analytics;
    try {
      analytics = await ref.read(tutorRepositoryProvider).analyzeConversation(
            targetLanguage: onboarding.targetLanguage,
            level: onboarding.level,
            tutorName: onboarding.tutorName,
            history: transcriptSnapshot,
            duration: duration,
          );
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isProcessing = false;
        _errorMessage = 'Could not build your session summary: $e';
        _retryAction = _endConversation;
      });
      return;
    }
    if (!mounted) return;
    setState(() => _isProcessing = false);

    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => ConversationSummaryScreen(
        analytics: analytics,
        spokenDuration: duration,
        transcript: transcriptSnapshot,
        targetLanguage: onboarding.targetLanguage,
        accent: onboarding.accent,
        gender: onboarding.gender,
      ),
    ));

    // The summary was closed - the session is genuinely over now, so reset
    // the board for a fresh conversation (same reset as "New conversation").
    if (mounted) {
      setState(() {
        _messages.clear();
        _errorMessage = null;
        _retryAction = null;
        _isRecording = false;
        _isProcessing = false;
        _isSpeaking = false;
        _playingIndex = null;
        _hiddenTranslationIndexes.clear();
        _paused = false;
        _sessionStopwatch = Stopwatch()..start();
        _lastFlushedElapsed = Duration.zero;
      });
    }
  }

  /// Opens the "Save to Phrase Bank" sheet for any phrase tapped from a
  /// bubble - the student's own line, the tutor's reply, or a correction.
  void _openSavePhraseSheet(String text) {
    final onboarding = ref.read(onboardingProvider);
    showSavePhraseSheet(
      context: context,
      ref: ref,
      text: text,
      phraseLanguage: onboarding.targetLanguage,
    );
  }

  Future<Uint8List> _readAudioBytes(String path) async {
    if (kIsWeb) {
      final res = await http.get(Uri.parse(path));
      return res.bodyBytes;
    }
    return File(path).readAsBytes();
  }

  // ---------------- Pipeline: STT -> Chat -> TTS, each stage independently retryable ----------------

  Future<void> _handleAudio(Uint8List audioBytes) async {
    setState(() { _isProcessing = true; _errorMessage = null; _retryAction = null; });
    final repo = ref.read(tutorRepositoryProvider);
    final onboarding = ref.read(onboardingProvider);

    String transcript;
    try {
      transcript = await repo.transcribe(audioBytes, targetLanguage: onboarding.targetLanguage);
    } catch (e) {
      setState(() {
        _isProcessing = false;
        _errorMessage = 'Could not understand the audio: $e';
        _retryAction = () => _handleAudio(audioBytes);
      });
      return;
    }

    if (transcript.trim().isEmpty) {
      setState(() => _isProcessing = false);
      _showError("Didn't catch that - try speaking a bit louder or closer to the mic.");
      return;
    }

    setState(() => _messages.add(ChatMessage(text: transcript, isUser: true)));
    await _handleTranscript(transcript);
  }

  Future<void> _handleTranscript(String transcript) async {
    setState(() { _isProcessing = true; _errorMessage = null; _retryAction = null; });
    final repo = ref.read(tutorRepositoryProvider);
    final onboarding = ref.read(onboardingProvider);

    ChatMessage reply;
    try {
      reply = await repo.getTutorReply(
        targetLanguage: onboarding.targetLanguage,
        level: onboarding.level,
        tutorName: onboarding.tutorName,
        accent: onboarding.accent,
        tone: _tone,
        history: _messages,
        userText: transcript,
        topic: widget.topicTitle,
        situation: widget.situation,
        yourRole: widget.yourRole,
        aiRole: widget.aiRole,
      );
    } catch (e) {
      setState(() {
        _isProcessing = false;
        _errorMessage = 'Could not get a reply: $e';
        _retryAction = () => _handleTranscript(transcript);
      });
      return;
    }

    setState(() => _messages.add(reply));
    if (reply.correction != null) {
      ref.read(usageStatsProvider.notifier).addCorrection();
    }
    await _handleReply(reply);
  }

  Future<void> _handleReply(ChatMessage reply) async {
    setState(() { _isProcessing = true; _errorMessage = null; _retryAction = null; });
    final repo = ref.read(tutorRepositoryProvider);
    final onboarding = ref.read(onboardingProvider);

    try {
      final audioBytes = await repo.speak(
        text: reply.text,
        targetLanguage: onboarding.targetLanguage,
        accent: onboarding.accent,
        gender: onboarding.gender,
      );
      // Keep the bytes on the message itself so the ▶ replay control on the
      // bubble can play it again later without another TTS round trip.
      final index = _messages.indexOf(reply);
      if (index != -1) {
        setState(() => _messages[index] = reply.copyWith(audioBytes: audioBytes));
      }
      await _playAudio(audioBytes, index: index == -1 ? null : index);
    } catch (e) {
      setState(() {
        _errorMessage = 'Could not play the reply audio: $e';
        _retryAction = () => _handleReply(reply);
      });
    } finally {
      setState(() => _isProcessing = false);
    }
  }

  /// Plays raw TTS bytes and tracks [_isSpeaking] around it, so the header
  /// waveform can show a "AI is talking" state - shared by both the fresh
  /// reply above and the per-bubble replay button below.
  Future<void> _playAudio(Uint8List audioBytes, {int? index}) async {
    setState(() {
      _isSpeaking = true;
      _playingIndex = index;
    });
    try {
      await _player.setPlaybackRate(_speed);
      await _player.play(BytesSource(audioBytes));
      await _player.onPlayerComplete.first;
    } catch (_) {
      // Non-fatal - worst case the waveform just stops a little early.
    } finally {
      if (mounted) setState(() { _isSpeaking = false; _playingIndex = null; });
    }
  }

  Future<void> _replayMessage(int index) async {
    final bytes = _messages[index].audioBytes;
    if (bytes == null) return;
    await _player.stop();
    await _playAudio(bytes, index: index);
  }

  void _toggleTranslationVisibility(int index) {
    setState(() {
      _hiddenTranslationIndexes.contains(index)
          ? _hiddenTranslationIndexes.remove(index)
          : _hiddenTranslationIndexes.add(index);
    });
  }

  ChatMessage? get _lastUserMessage {
    try {
      return _messages.reversed.firstWhere((m) => m.isUser);
    } catch (_) {
      return null;
    }
  }

  ChatMessage? get _lastTutorMessage {
    try {
      return _messages.reversed.firstWhere((m) => !m.isUser);
    } catch (_) {
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    final onboarding = ref.watch(onboardingProvider);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final initials = (onboarding.tutorName ?? 'AI')
        .split(' ')
        .map((w) => w.isNotEmpty ? w[0] : '')
        .take(2)
        .join();

    return Scaffold(
      body: PlayfulBackground(
        child: SafeArea(
        child: Column(
          children: [
            // Gradient avatar canvas header
            Container(
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 14),
              decoration: BoxDecoration(
                gradient: isDark ? AppColors.darkCyanPurpleGradient : AppColors.lightCyanPurpleGradient,
                borderRadius: const BorderRadius.all(Radius.circular(28)),
              ),
              child: Column(
                children: [
                  Row(
                    children: [
                      if (Navigator.of(context).canPop())
                        Padding(
                          padding: const EdgeInsets.only(right: 4),
                          child: IconButton(
                            icon: const Icon(Icons.arrow_back_ios_new_rounded, color: Colors.white, size: 18),
                            tooltip: 'Change topic',
                            onPressed: () => Navigator.of(context).maybePop(),
                          ),
                        ),
                      Container(
                        height: 52,
                        width: 52,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: [Colors.white, isDark ? AppColors.darkSurface2 : AppColors.lightSurface2],
                          ),
                          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.15), blurRadius: 8, offset: const Offset(0, 2))],
                        ),
                        child: Text(
                          initials,
                          style: TextStyle(
                            color: isDark ? AppColors.darkTeal : AppColors.lightTeal,
                            fontWeight: FontWeight.w800,
                            fontSize: 14,
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(onboarding.tutorName ?? 'Tutor',
                                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                            Text(
                              widget.topicTitle ?? onboarding.accent ?? 'Standard accent',
                              style: const TextStyle(color: Colors.white70, fontSize: 12),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                        ),
                      ),
                      _SessionTimer(stopwatch: _sessionStopwatch, paused: _paused),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      const Text('🐢', style: TextStyle(fontSize: 15)),
                      const SizedBox(width: 6),
                      Expanded(
                        child: SliderTheme(
                          data: SliderTheme.of(context).copyWith(
                            activeTrackColor: Colors.white,
                            inactiveTrackColor: Colors.white24,
                            thumbColor: Colors.white,
                          ),
                          child: Slider(
                            value: _speed,
                            min: 0.5,
                            max: 1.5,
                            divisions: 4,
                            label: '${_speed.toStringAsFixed(2)}x',
                            onChanged: (v) => setState(() => _speed = v),
                          ),
                        ),
                      ),
                      Text('${_speed.toStringAsFixed(2)}x', style: const TextStyle(color: Colors.white, fontSize: 12)),
                    ],
                  ),
                  Row(
                    children: [
                      ...['nice', 'strict', 'funny'].map((t) {
                        final selected = _tone == t;
                        return Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: GestureDetector(
                            onTap: () => setState(() => _tone = t),
                            child: AnimatedContainer(
                              duration: const Duration(milliseconds: 150),
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                              decoration: BoxDecoration(
                                color: selected ? Colors.white : Colors.white.withOpacity(0.16),
                                borderRadius: BorderRadius.circular(20),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  if (selected) ...[
                                    Icon(Icons.check_rounded,
                                        size: 14, color: isDark ? AppColors.darkPurple : AppColors.lightPurple),
                                    const SizedBox(width: 3),
                                  ],
                                  Text(
                                    t[0].toUpperCase() + t.substring(1),
                                    style: TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w600,
                                      color: selected
                                          ? (isDark ? AppColors.darkPurple : AppColors.lightPurple)
                                          : Colors.white,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        );
                      }),
                      const Spacer(),
                      Container(
                        decoration: const BoxDecoration(color: Colors.white24, shape: BoxShape.circle),
                        child: IconButton(
                          icon: const Icon(Icons.flag_circle_rounded, color: Colors.white, size: 20),
                          tooltip: 'End conversation & see summary',
                          onPressed: _messages.isEmpty ? null : _endConversation,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        decoration: const BoxDecoration(color: Colors.white24, shape: BoxShape.circle),
                        child: IconButton(
                          icon: const Text('⚙️', style: TextStyle(fontSize: 16)),
                          tooltip: 'Advanced Speaking Toolkit',
                          onPressed: () => showAdvancedToolkit(
                            context: context,
                            ref: ref,
                            lastUserMessage: _lastUserMessage,
                            lastTutorMessage: _lastTutorMessage,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),

            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: _messages.length,
                itemBuilder: (context, i) {
                  final message = _messages[i];
                  return _MessageBubble(
                    message: message,
                    isPlaying: _isSpeaking && _playingIndex == i,
                    translationHidden: _hiddenTranslationIndexes.contains(i),
                    onReplay: message.audioBytes == null ? null : () => _replayMessage(i),
                    onToggleTranslation:
                        message.translation == null ? null : () => _toggleTranslationVisibility(i),
                    onSavePhrase: _openSavePhraseSheet,
                  );
                },
              ),
            ),

            if (_isProcessing) const LinearProgressIndicator(),

            if (_errorMessage != null)
              Container(
                width: double.infinity,
                margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.error.withOpacity(0.08),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: Theme.of(context).colorScheme.error.withOpacity(0.3)),
                ),
                child: Row(
                  children: [
                    Icon(Icons.error_outline, color: Theme.of(context).colorScheme.error, size: 18),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(_errorMessage!,
                          style: TextStyle(color: Theme.of(context).colorScheme.error, fontSize: 12.5)),
                    ),
                    if (_retryAction != null)
                      TextButton(
                        onPressed: () {
                          final action = _retryAction!;
                          setState(() => _errorMessage = null);
                          action();
                        },
                        child: const Text('Retry'),
                      ),
                  ],
                ),
              ),

            Stack(
              clipBehavior: Clip.none,
              children: [
                // Decorative blobs - a soft filled purple blob bottom-left,
                // and a matching purple "ghost" outline circle bottom-right
                // - pure decoration, sat behind the status pill/waveform/
                // buttons, giving the control panel a bit of life at rest.
                Positioned(
                  left: -40,
                  bottom: -20,
                  child: _Blob(
                    size: 130,
                    color: isDark ? AppColors.darkPurple : AppColors.lightPurple,
                    filled: true,
                  ),
                ),
                Positioned(
                  right: -30,
                  bottom: 30,
                  child: _Blob(
                    size: 110,
                    color: isDark ? AppColors.darkPurple : AppColors.lightPurple,
                    filled: false,
                  ),
                ),
                Column(
                  children: [
                    const SizedBox(height: 10),
                    _StatusPill(
                      label: _paused
                          ? 'Paused'
                          : (_isRecording
                              ? 'Recording… release to send'
                              : (_isProcessing
                                  ? 'Thinking…'
                                  : (_isSpeaking ? 'AI is talking…' : 'Ready when you are'))),
                    ),
                    const SizedBox(height: 10),
                    _RadioWave(active: _isRecording || _isSpeaking),
                    const SizedBox(height: 6),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(24, 8, 24, 4),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                        children: [
                          _CircleControlButton(
                            glyph: _paused ? '▶️' : '⏸️',
                            onTap: _togglePause,
                            tooltip: _paused ? 'Resume' : 'Pause',
                          ),
                          _CircleControlButton(
                            glyph: '■',
                            onTap: (_isRecording || _isProcessing) ? _stopCurrentAction : null,
                            tooltip: 'Stop',
                          ),
                          GestureDetector(
                            onLongPressStart: _paused ? null : (_) => _startRecording(),
                            onLongPressEnd: _paused ? null : (_) => _stopRecordingAndProcess(),
                            child: Container(
                              height: 84,
                              width: 84,
                              alignment: Alignment.center,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                gradient: _paused
                                    ? null
                                    : (isDark ? AppColors.darkPrimaryGradient : AppColors.lightPrimaryGradient),
                                color: _paused ? Colors.grey : null,
                                boxShadow: _paused
                                    ? null
                                    : [
                                        // Two-layer glow: a soft wide ring
                                        // (spread, no blur) plus a deeper
                                        // blurred glow beneath it - the mic
                                        // should read as "lit up", not just
                                        // shadowed.
                                        BoxShadow(
                                          color: (isDark ? AppColors.darkTeal : AppColors.lightTeal).withOpacity(0.16),
                                          spreadRadius: 8,
                                        ),
                                        BoxShadow(
                                          color: (isDark ? AppColors.darkTeal : AppColors.lightTeal).withOpacity(0.4),
                                          blurRadius: 24,
                                          offset: const Offset(0, 8),
                                        ),
                                      ],
                              ),
                              child: Text(_isRecording ? '⏹️' : '🎙️', style: const TextStyle(fontSize: 30)),
                            ),
                          ),
                          _CircleControlButton(
                            glyph: '↻',
                            onTap: _messages.isEmpty ? null : _startNewConversation,
                            tooltip: 'New conversation',
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
      ),
    );
  }
}

class _SessionTimer extends StatefulWidget {
  final Stopwatch stopwatch;
  final bool paused;
  const _SessionTimer({required this.stopwatch, required this.paused});

  @override
  State<_SessionTimer> createState() => _SessionTimerState();
}

class _SessionTimerState extends State<_SessionTimer> {
  late Timer _ticker;

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _ticker.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.stopwatch.elapsed;
    final mm = d.inMinutes.remainder(60).toString().padLeft(2, '0');
    final ss = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    return Text('$mm:$ss', style: const TextStyle(color: Colors.white70, fontSize: 12));
  }
}

/// The colorful "radio wave" - lives at the bottom of the screen near the
/// mic button so it's a constant little spot of color on the page, not
/// something that pops in and out. Sits flat/static at rest; once the user
/// starts speaking (recording) or the tutor's reply starts playing, the
/// bars start moving to show who currently has the floor. Bars sweep
/// through the brand teal -> cyan -> purple gradient left to right, same
/// as the reference design, in both themes.
class _RadioWave extends StatefulWidget {
  final bool active;
  const _RadioWave({required this.active});

  @override
  State<_RadioWave> createState() => _RadioWaveState();
}

class _RadioWaveState extends State<_RadioWave> with SingleTickerProviderStateMixin {
  static const _barCount = 11;
  late final AnimationController _controller =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 900));

  @override
  void initState() {
    super.initState();
    if (widget.active) _controller.repeat();
  }

  @override
  void didUpdateWidget(_RadioWave oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.active && !oldWidget.active) {
      _controller.repeat();
    } else if (!widget.active && oldWidget.active) {
      _controller.stop();
      _controller.value = 0;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final stops = [
      isDark ? AppColors.darkTeal : AppColors.lightTeal,
      isDark ? AppColors.darkCyan : AppColors.lightCyan,
      isDark ? AppColors.darkPurple : AppColors.lightPurple,
    ];

    return SizedBox(
      height: 44,
      width: 260,
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, _) {
          return Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: List.generate(_barCount, (i) {
              double heightFactor;
              if (widget.active) {
                final phase = _controller.value * 2 * math.pi + i * 0.8;
                heightFactor = 0.25 + 0.75 * ((math.sin(phase) + 1) / 2);
              } else {
                // Resting state: a gentle, unmoving "sound bar" shape (not a
                // flat line) so it still reads as a waveform before anyone
                // has spoken - matches the reference's always-visible bars.
                const restingFactors = [0.25, 0.45, 0.7, 0.9, 1.0, 0.85, 0.6, 0.4, 0.55, 0.35, 0.2];
                heightFactor = restingFactors[i % restingFactors.length];
              }
              // Position each bar's color along the teal -> cyan -> purple
              // sweep, same gradient family used everywhere else in the app.
              final t = i / (_barCount - 1);
              final color = t < 0.5
                  ? Color.lerp(stops[0], stops[1], t * 2)!
                  : Color.lerp(stops[1], stops[2], (t - 0.5) * 2)!;
              return Container(
                width: 4,
                height: 40 * heightFactor,
                decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(3)),
              );
            }),
          );
        },
      ),
    );
  }
}

/// The "●●● Ready when you are" pill above the waveform - a single place
/// that always tells the learner what's happening right now (recording,
/// thinking, the tutor talking, paused, or just idle), styled as a teal
/// outline pill so it reads clearly on both the dark navy background and a
/// plain white/light one.
class _StatusPill extends StatelessWidget {
  final String label;
  const _StatusPill({required this.label});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final teal = isDark ? AppColors.darkTeal : AppColors.lightTeal;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: teal.withOpacity(isDark ? 0.16 : 0.10),
        borderRadius: BorderRadius.circular(30),
        border: Border.all(color: teal.withOpacity(0.55)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          ...List.generate(
            3,
            (i) => Padding(
              padding: const EdgeInsets.only(right: 4),
              child: CircleAvatar(radius: 3, backgroundColor: teal),
            ),
          ),
          const SizedBox(width: 4),
          Text(label, style: TextStyle(color: teal, fontWeight: FontWeight.w600, fontSize: 12.5)),
        ],
      ),
    );
  }
}

/// A small circular icon button used for Pause/Stop/New in the bottom
/// control row, flanking the big mic button - dims itself when [onTap] is
/// null instead of just going the default greyed-out Material look, so it
/// stays visually consistent with the rest of this screen's custom style.
class _CircleControlButton extends StatelessWidget {
  final String glyph;
  final VoidCallback? onTap;
  final String tooltip;
  const _CircleControlButton({required this.glyph, required this.onTap, required this.tooltip});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final enabled = onTap != null;
    final bg = isDark ? AppColors.darkSurface2 : AppColors.lightSurface2;

    return Tooltip(
      message: tooltip,
      child: Opacity(
        opacity: enabled ? 1 : 0.4,
        child: Material(
          color: bg,
          shape: const CircleBorder(),
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: onTap,
            child: SizedBox(
              height: 52,
              width: 52,
              child: Center(child: Text(glyph, style: const TextStyle(fontSize: 18))),
            ),
          ),
        ),
      ),
    );
  }
}

/// Purely decorative background shape used in the control panel - a
/// solid, blurred circle ([filled] true) or a thin unfilled "ghost" ring
/// ([filled] false), matching the reference design's two blobs.
class _Blob extends StatelessWidget {
  final double size;
  final Color color;
  final bool filled;
  const _Blob({required this.size, required this.color, required this.filled});

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Container(
        height: size,
        width: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: filled
              ? RadialGradient(
                  center: const Alignment(-0.4, -0.4),
                  colors: [color.withOpacity(0.55), color.withOpacity(0.15)],
                )
              : null,
          border: filled ? null : Border.all(color: color.withOpacity(0.5), width: 1.5),
        ),
      ),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  final ChatMessage message;
  final bool isPlaying;
  final bool translationHidden;
  final VoidCallback? onReplay;
  final VoidCallback? onToggleTranslation;
  final void Function(String text)? onSavePhrase;

  const _MessageBubble({
    required this.message,
    this.isPlaying = false,
    this.translationHidden = false,
    this.onReplay,
    this.onToggleTranslation,
    this.onSavePhrase,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final purple = isDark ? AppColors.darkPurple : AppColors.lightPurple;
    final align = message.isUser ? Alignment.centerRight : Alignment.centerLeft;

    // Solid, unmistakably different fills for each side of the
    // conversation - purple for you, teal-tinted for the tutor - rather
    // than both being near-identical pale tints of the same color.
    final bubbleColor = message.isUser
        ? (isDark ? AppColors.darkUserBubble : AppColors.lightUserBubble)
        : (isDark ? AppColors.darkTutorBubble : AppColors.lightTutorBubble);
    final tutorAccent = isDark ? AppColors.darkTutorBubbleAccent : AppColors.lightTutorBubbleAccent;
    // The tutor bubble is a light card in BOTH themes (pure white in dark
    // mode, pale teal-tinted in light mode) - so its text is always dark,
    // never the theme's near-white darkText color, or it'd be unreadable
    // against its own white card in dark mode.
    final textColor = message.isUser ? Colors.white : AppColors.lightText;

    final showTranslationText = message.translation != null && !translationHidden;
    // Copied to locals: public fields on a widget aren't promoted by the
    // null-safety analyzer (they could theoretically be shadowed by a
    // subclass getter), so `if (onReplay != null)` alone doesn't let us
    // pass `onReplay` where a non-nullable VoidCallback is expected -
    // dart2js correctly rejects that even though dartanalyzer/VM don't
    // always flag it. Locals promote fine.
    final replay = onReplay;
    final toggleTranslation = onToggleTranslation;
    final savePhrase = onSavePhrase;

    return Column(
      crossAxisAlignment:
          message.isUser ? CrossAxisAlignment.end : CrossAxisAlignment.start,
      children: [
        Align(
          alignment: align,
          child: Container(
            margin: const EdgeInsets.symmetric(vertical: 4),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            constraints: const BoxConstraints(maxWidth: 300),
            decoration: BoxDecoration(
              color: bubbleColor,
              borderRadius: BorderRadius.circular(20),
              // A teal accent border on the tutor's side only - the user
              // bubble is a solid fill so it doesn't need one, but the
              // tutor bubble is a pale/white card and benefits from a
              // crisp edge plus a soft shadow to read as a lifted card.
              border: message.isUser ? null : Border.all(color: tutorAccent.withOpacity(0.25)),
              boxShadow: message.isUser
                  ? null
                  : [BoxShadow(color: Colors.black.withOpacity(0.12), blurRadius: 10, offset: const Offset(0, 3))],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(message.text, style: TextStyle(color: textColor)),
                // Replay / translate / hide / save row. Replay+translate are
                // tutor-only (nothing to replay/translate on the user's own
                // line); Save applies to either side, so the row can appear
                // on user bubbles purely for the save button.
                if (savePhrase != null || (!message.isUser && (replay != null || toggleTranslation != null))) ...[
                  const SizedBox(height: 6),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (!message.isUser && replay != null)
                        _BubbleIconButton(
                          icon: isPlaying ? Icons.volume_up_rounded : Icons.volume_up_outlined,
                          color: isPlaying ? purple : null,
                          tooltip: 'Replay audio',
                          onTap: replay,
                        ),
                      if (!message.isUser && toggleTranslation != null) ...[
                        _BubbleIconButton(
                          icon: Icons.translate_rounded,
                          color: showTranslationText ? purple : null,
                          tooltip: 'Translation',
                          onTap: toggleTranslation,
                        ),
                        _BubbleIconButton(
                          icon: translationHidden ? Icons.visibility_off_rounded : Icons.visibility_rounded,
                          tooltip: translationHidden ? 'Show translation' : 'Hide translation',
                          onTap: toggleTranslation,
                        ),
                      ],
                      if (savePhrase != null)
                        _BubbleIconButton(
                          icon: Icons.bookmark_add_outlined,
                          tooltip: 'Save to Phrase Bank',
                          color: message.isUser ? Colors.white70 : null,
                          onTap: () => savePhrase(message.text),
                        ),
                      if (isPlaying) ...[
                        const SizedBox(width: 4),
                        _MiniWave(color: purple),
                      ],
                    ],
                  ),
                ],
                if (showTranslationText)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                      message.translation!,
                      // Fixed soft-gray, not the theme's bodySmall color -
                      // the tutor bubble is always a light card, so this
                      // needs to read against white/pale-teal in both
                      // themes, not the dark navy page background.
                      style: const TextStyle(fontStyle: FontStyle.italic, fontSize: 12.5, color: AppColors.lightTextSoft),
                    ),
                  ),
              ],
            ),
          ),
        ),
        if (message.correction != null)
          Align(
            alignment: Alignment.centerLeft,
            child: Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(10),
              constraints: const BoxConstraints(maxWidth: 280),
              decoration: BoxDecoration(
                color: (isDark ? AppColors.darkAmber : AppColors.lightAmber).withOpacity(isDark ? 0.16 : 0.14),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: (isDark ? AppColors.darkAmber : AppColors.lightAmber).withOpacity(0.5)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Correction: ${message.correction}',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 12.5,
                      color: isDark ? AppColors.darkAmber : AppColors.lightAmberText,
                    ),
                  ),
                  if (message.explanation != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(
                        message.explanation!,
                        style: TextStyle(color: isDark ? AppColors.darkText : AppColors.lightText, fontSize: 12),
                      ),
                    ),
                  if (savePhrase != null)
                    Align(
                      alignment: Alignment.centerRight,
                      child: _BubbleIconButton(
                        icon: Icons.bookmark_add_outlined,
                        tooltip: 'Save corrected version to Phrase Bank',
                        color: isDark ? AppColors.darkAmber : AppColors.lightAmberText,
                        onTap: () => savePhrase(message.correction!),
                      ),
                    ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

/// Small tappable icon used in the bubble's action row (replay / translate /
/// hide) - deliberately compact so three of them plus a mini waveform still
/// fit comfortably under a short reply.
class _BubbleIconButton extends StatelessWidget {
  final IconData icon;
  final Color? color;
  final String tooltip;
  final VoidCallback onTap;
  const _BubbleIconButton({required this.icon, this.color, required this.tooltip, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(4),
          // Fixed soft-gray default (not the theme's icon color) - same
          // reasoning as the translation text above: this always sits on a
          // light tutor-bubble card, in both themes.
          child: Icon(icon, size: 16, color: color ?? AppColors.lightTextSoft),
        ),
      ),
    );
  }
}

/// A tiny purple wave, shown inline next to a bubble whose audio is
/// currently playing - a quieter echo of the header's [_RadioWave] scaled
/// down to fit inside a chat bubble.
class _MiniWave extends StatefulWidget {
  final Color color;
  const _MiniWave({required this.color});

  @override
  State<_MiniWave> createState() => _MiniWaveState();
}

class _MiniWaveState extends State<_MiniWave> with SingleTickerProviderStateMixin {
  late final AnimationController _controller =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 800))..repeat();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 12,
      width: 28,
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, _) {
          return Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: List.generate(4, (i) {
              final phase = _controller.value * 2 * math.pi + i * 1.1;
              final heightFactor = 0.3 + 0.7 * ((math.sin(phase) + 1) / 2);
              return Container(
                width: 2.5,
                height: 12 * heightFactor,
                decoration: BoxDecoration(color: widget.color, borderRadius: BorderRadius.circular(2)),
              );
            }),
          );
        },
      ),
    );
  }
}
