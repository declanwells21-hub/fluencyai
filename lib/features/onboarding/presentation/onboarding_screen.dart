import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:record/record.dart';
import 'package:path_provider/path_provider.dart';
import 'package:http/http.dart' as http;
import '../../../shared/data/languages.dart';
import '../../../shared/data/onboarding_options.dart';
import '../../../shared/widgets/gradient_button.dart';
import '../../../core/theme/app_theme.dart';
import '../../grammar/data/grammar_repository.dart';
import '../../scenarios/data/scenario_repository.dart';
import '../../phrasebank/data/phrase_bank_repository.dart';
import '../data/onboarding_provider.dart';
import '../data/profile_repository.dart';
import '../../plan/data/plan_repository.dart';
import '../models/onboarding_state.dart';
import '../../../shared/widgets/playful_background.dart';
import '../../../shared/widgets/colorful_icon.dart';

/// Onboarding flow: target language -> why they're learning it -> what to
/// focus on -> current level -> how often -> daily minutes -> topics they
/// enjoy -> AI tutor (voice + regional accent bundled together) -> native
/// language -> a real microphone permission check -> a personalized study
/// plan built from everything they just chose.
class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  int _step = 0;
  static const _totalSteps = 11;
  bool _saving = false;
  bool _buildingPlan = false;

  String _micStatus = 'Not tested';
  bool _micTesting = false;

  Future<void> _testMic() async {
    setState(() { _micTesting = true; _micStatus = 'Listening… speak now'; });
    final recorder = AudioRecorder();
    try {
      await recorder.hasPermission(); // may trigger the OS prompt on mobile

      final String path = kIsWeb
          ? 'mic_test_${DateTime.now().millisecondsSinceEpoch}.wav'
          : '${(await getTemporaryDirectory()).path}/mic_test_${DateTime.now().millisecondsSinceEpoch}.wav';

      await recorder.start(const RecordConfig(encoder: AudioEncoder.wav), path: path);
      await Future.delayed(const Duration(milliseconds: 1800));
      final resultPath = await recorder.stop();

      if (resultPath == null) {
        setState(() => _micStatus = '✗ No audio was captured - check mic permission in Settings');
        return;
      }

      final bytes = kIsWeb
          ? (await http.get(Uri.parse(resultPath))).bodyBytes
          : await File(resultPath).readAsBytes();

      if (bytes.length < 100) {
        setState(() => _micStatus = '✗ Recording was empty - check mic permission in Settings');
        return;
      }

      // This is the actual test: read the 16-bit PCM samples after the WAV
      // header and find the loudest one. A granted permission doesn't mean
      // the mic actually picked anything up - this catches a muted/dead mic
      // that a permission-only check (what this used to do) would miss.
      int maxAmplitude = 0;
      for (int i = 44; i + 1 < bytes.length; i += 2) {
        final sample = bytes[i] | (bytes[i + 1] << 8);
        final signed = sample >= 32768 ? sample - 65536 : sample;
        final abs = signed.abs();
        if (abs > maxAmplitude) maxAmplitude = abs;
      }

      if (maxAmplitude > 500) {
        setState(() => _micStatus = '✓ Microphone working (sound detected)');
      } else {
        setState(() => _micStatus =
            '⚠ No sound detected - try speaking louder, or check mic permission in Settings');
      }
    } catch (e) {
      setState(() => _micStatus = '✗ Could not access microphone: $e');
    } finally {
      await recorder.dispose();
      setState(() => _micTesting = false);
    }
  }

  Future<void> _finish(OnboardingData onboarding) async {
    setState(() => _saving = true);
    try {
      await ref.read(profileRepositoryProvider).saveProfile(onboarding);
    } catch (_) {
      // Don't strand the user on a save hiccup - the choices still live in
      // onboardingProvider for this session, they just won't have
      // persisted for next time.
    }
    try {
      final planRepo = ref.read(planRepositoryProvider);
      if (!await planRepo.hasExistingPlan()) {
        setState(() => _buildingPlan = true);
        await planRepo.generateAndSave(onboarding);
      }
    } catch (_) {
      // Non-fatal - the Plan tab has its own "Generate my plan" retry for
      // exactly this case (rate limit, network blip), so don't block
      // getting into the app over it.
    }
    if (mounted) context.go('/paywall');
  }

  @override
  Widget build(BuildContext context) {
    final onboarding = ref.watch(onboardingProvider);
    final notifier = ref.read(onboardingProvider.notifier);
    final tutors = kTutors[onboarding.targetLanguage] ?? kTutors['en']!;
    final targetLangName =
        kLanguages.firstWhere((l) => l.code == onboarding.targetLanguage, orElse: () => kLanguages.first).name;

    final isFinalStep = _step == _totalSteps - 1;

    Widget stepBody;
    String stepTitle;
    bool canContinue = true;
    switch (_step) {
      case 0:
        stepTitle = 'Target Language';
        stepBody = _LanguageStep(selected: onboarding.targetLanguage, onSelect: notifier.setLanguage);
        break;
      case 1:
        stepTitle = 'Your Motivation';
        canContinue = onboarding.motivation != null;
        stepBody = _OptionListStep(
          subtitle: "What's got you learning $targetLangName right now?",
          options: kMotivations,
          isSelected: (key) => onboarding.motivation == key,
          onTap: notifier.setMotivation,
        );
        break;
      case 2:
        stepTitle = 'Focus Areas';
        canContinue = onboarding.goals.isNotEmpty;
        stepBody = _OptionListStep(
          subtitle: "Pick everything you'd like extra help with.",
          options: kGoals,
          isSelected: (key) => onboarding.goals.contains(key),
          onTap: notifier.toggleGoal,
        );
        break;
      case 3:
        stepTitle = 'Your Current Level';
        stepBody = _LevelStep(selected: onboarding.level, onSelect: notifier.setLevel);
        break;
      case 4:
        stepTitle = 'Practice Frequency';
        canContinue = onboarding.frequency != null;
        stepBody = _OptionListStep(
          subtitle: 'Setting an intention now makes it a lot easier to stick with.',
          options: kFrequencies,
          isSelected: (key) => onboarding.frequency == key,
          onTap: notifier.setFrequency,
        );
        break;
      case 5:
        stepTitle = 'Daily Goal';
        stepBody = _DailyGoalStep(selected: onboarding.dailyGoalMinutes, onSelect: notifier.setDailyGoal);
        break;
      case 6:
        stepTitle = 'Topics You Enjoy';
        canContinue = onboarding.topics.length >= 3;
        stepBody = _TopicsGridStep(selected: onboarding.topics, onToggle: notifier.toggleTopic);
        break;
      case 7:
        stepTitle = 'Choose Your AI Tutor';
        stepBody = _TutorStep(
          tutors: tutors,
          selectedTutor: onboarding.tutorName,
          onSelectTutor: (tutor) {
            notifier.setTutor(tutor.name, tutor.accentTag);
            notifier.setGender(tutor.gender.toLowerCase());
          },
        );
        break;
      case 8:
        stepTitle = 'Your Native Language';
        canContinue = onboarding.nativeLanguage != null;
        stepBody = _NativeLanguageStep(
          targetLanguage: onboarding.targetLanguage,
          selected: onboarding.nativeLanguage,
          onSelect: notifier.setNativeLanguage,
        );
        break;
      case 9:
        stepTitle = 'Test Your Microphone';
        stepBody = _MicTestStep(status: _micStatus, testing: _micTesting, onTest: _testMic);
        break;
      default:
        stepTitle = '';
        stepBody = _StudyPlanStep(data: onboarding);
    }

    return Scaffold(
      body: PlayfulBackground(
        child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (!isFinalStep) ...[
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 12, 20, 0),
                child: Row(
                  children: [
                    _step > 0
                        ? IconButton(
                            icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
                            onPressed: () => setState(() => _step--),
                          )
                        : const SizedBox(width: 48),
                    Expanded(child: _StepDots(current: _step, total: _totalSteps)),
                    const SizedBox(width: 8),
                    Text('Step ${_step + 1} of $_totalSteps',
                        style: Theme.of(context).textTheme.bodySmall),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
                child: Text(
                  stepTitle,
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w800,
                    color: Theme.of(context).brightness == Brightness.dark
                        ? AppColors.darkText
                        : AppColors.lightText,
                  ),
                ),
              ),
            ],
            Expanded(
              child: Padding(
                padding: EdgeInsets.fromLTRB(20, isFinalStep ? 8 : 12, 20, 0),
                child: stepBody,
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(20),
              child: GradientButton(
                label: _saving
                    ? (_buildingPlan ? 'Building your plan…' : 'Saving…')
                    : (isFinalStep ? 'Get Started!' : 'Continue'),
                loading: _saving,
                onTap: _saving || (!isFinalStep && !canContinue)
                    ? null
                    : () async {
                        if (!isFinalStep) {
                          setState(() => _step++);
                          return;
                        }
                        await _finish(onboarding);
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

/// Consistent, higher-contrast subtitle style for the description line at
/// the top of each onboarding step - softer than the heading, but with
/// deliberate color/weight instead of falling back to a flat default.
class _StepSubtitle extends StatelessWidget {
  final String text;
  const _StepSubtitle(this.text);

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Text(
      text,
      style: TextStyle(
        fontSize: 14,
        height: 1.4,
        color: isDark ? AppColors.darkTextSoft : AppColors.lightTextSoft,
      ),
    );
  }
}

/// Small pill-segment progress indicator, matching the reference design.
class _StepDots extends StatelessWidget {
  final int current;
  final int total;
  const _StepDots({required this.current, required this.total});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final activeColor = isDark ? AppColors.darkTeal : AppColors.lightTeal;
    final inactiveColor = Theme.of(context).dividerColor;
    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: List.generate(total, (i) {
        final isActive = i <= current;
        return Container(
          width: isActive ? 20 : 9,
          height: 7,
          decoration: BoxDecoration(
            color: isActive ? activeColor : inactiveColor,
            borderRadius: BorderRadius.circular(4),
          ),
        );
      }),
    );
  }
}

class _LanguageStep extends StatelessWidget {
  final String selected;
  final ValueChanged<String> onSelect;
  const _LanguageStep({required this.selected, required this.onSelect});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _StepSubtitle('Choose the language you want to master. The whole app switches instantly.'),
        const SizedBox(height: 16),
        Expanded(
          child: GridView.builder(
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              childAspectRatio: 2.6,
            ),
            itemCount: kLanguages.length,
            itemBuilder: (context, i) {
              final lang = kLanguages[i];
              final isOn = lang.code == selected;
              return InkWell(
                onTap: () => onSelect(lang.code),
                borderRadius: BorderRadius.circular(16),
                child: Container(
                  decoration: BoxDecoration(
                    border: Border.all(
                      color: isOn ? Theme.of(context).colorScheme.primary : Theme.of(context).dividerColor,
                      width: isOn ? 2 : 1.5,
                    ),
                    borderRadius: BorderRadius.circular(16),
                    gradient: isOn
                        ? LinearGradient(colors: [
                            Theme.of(context).colorScheme.primary.withOpacity(0.12),
                            Theme.of(context).colorScheme.tertiary.withOpacity(0.12),
                          ])
                        : null,
                  ),
                  padding: const EdgeInsets.symmetric(horizontal: 14),
                  child: Row(
                    children: [
                      Text(lang.flag, style: const TextStyle(fontSize: 22)),
                      const SizedBox(width: 10),
                      Expanded(child: Text(lang.name, overflow: TextOverflow.ellipsis)),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

/// One selectable row: an icon in a circle, a label, and a checkmark when
/// selected. Shared look for every single-/multi-choice list step below.
class _OptionRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;
  final IconMood mood;
  const _OptionRow({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
    this.mood = IconMood.teal,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gradient = isDark ? AppColors.darkPrimaryGradient : AppColors.lightPrimaryGradient;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          border: Border.all(
            color: selected ? Theme.of(context).colorScheme.primary : Theme.of(context).dividerColor,
            width: selected ? 2 : 1.5,
          ),
          borderRadius: BorderRadius.circular(14),
          gradient: selected
              ? LinearGradient(colors: [
                  Theme.of(context).colorScheme.primary.withOpacity(0.10),
                  Theme.of(context).colorScheme.tertiary.withOpacity(0.10),
                ])
              : null,
        ),
        child: Row(
          children: [
            selected
                ? Container(
                    height: 38,
                    width: 38,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(shape: BoxShape.circle, gradient: gradient),
                    child: Icon(icon, size: 18, color: Colors.white),
                  )
                : ColorfulIcon(icon, mood: mood, size: 18, boxSize: 38),
            const SizedBox(width: 14),
            Expanded(child: Text(label, style: const TextStyle(fontWeight: FontWeight.w600))),
            if (selected)
              Icon(Icons.check_circle_rounded, color: Theme.of(context).colorScheme.primary, size: 20),
          ],
        ),
      ),
    );
  }
}

/// Single- or multi-select vertical list, driven entirely by [isSelected]/
/// [onTap] so the same widget serves motivation (single) and goals (multi).
class _OptionListStep extends StatelessWidget {
  final String subtitle;
  final List<OnboardingOption> options;
  final bool Function(String key) isSelected;
  final ValueChanged<String> onTap;
  const _OptionListStep({
    required this.subtitle,
    required this.options,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _StepSubtitle(subtitle),
        const SizedBox(height: 16),
        Expanded(
          child: ListView.separated(
            itemCount: options.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (context, i) {
              final o = options[i];
              return _OptionRow(
                icon: o.icon,
                label: o.label,
                selected: isSelected(o.key),
                onTap: () => onTap(o.key),
                mood: IconMood.values[i % IconMood.values.length],
              );
            },
          ),
        ),
      ],
    );
  }
}

/// 2-column grid of toggle chips for the topics-of-interest step. Requires
/// at least 3 picks (enforced by the Continue button in the parent screen).
class _TopicsGridStep extends StatelessWidget {
  final List<String> selected;
  final ValueChanged<String> onToggle;
  const _TopicsGridStep({required this.selected, required this.onToggle});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final accent = isDark ? AppColors.darkTeal : AppColors.lightTeal;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        RichText(
          text: TextSpan(
            style: Theme.of(context).textTheme.bodyMedium,
            children: [
              const TextSpan(text: 'Choose at least '),
              TextSpan(text: 'three', style: TextStyle(color: accent, fontWeight: FontWeight.bold)),
              const TextSpan(text: ' - this shapes which conversation topics come up first.'),
            ],
          ),
        ),
        const SizedBox(height: 6),
        Text('${selected.length} selected', style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(height: 12),
        Expanded(
          child: GridView.builder(
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              mainAxisSpacing: 10,
              crossAxisSpacing: 10,
              childAspectRatio: 2.7,
            ),
            itemCount: kTopics.length,
            itemBuilder: (context, i) {
              final t = kTopics[i];
              final isOn = selected.contains(t.key);
              final gradient = isDark ? AppColors.darkPrimaryGradient : AppColors.lightPrimaryGradient;
              return InkWell(
                onTap: () => onToggle(t.key),
                borderRadius: BorderRadius.circular(24),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(
                      color: isOn ? Theme.of(context).colorScheme.primary : Theme.of(context).dividerColor,
                      width: isOn ? 2 : 1.5,
                    ),
                    gradient: isOn ? gradient : null,
                  ),
                  child: Row(
                    children: [
                      Icon(
                        t.icon,
                        size: 16,
                        color: isOn
                            ? Colors.white
                            : ColorfulIcon.colorFor(IconMood.values[i % IconMood.values.length], isDark),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          t.label,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 12.5,
                            color: isOn ? Colors.white : null,
                            fontWeight: isOn ? FontWeight.w700 : FontWeight.w500,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _DailyGoalStep extends StatelessWidget {
  final int selected;
  final ValueChanged<int> onSelect;
  const _DailyGoalStep({required this.selected, required this.onSelect});

  static const _options = [5, 15, 30, 45, 60];

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _StepSubtitle('How many minutes a day can you commit?'),
        const SizedBox(height: 20),
        Row(
          children: _options.map((minutes) {
            final isOn = minutes == selected;
            return Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: InkWell(
                  onTap: () => onSelect(minutes),
                  borderRadius: BorderRadius.circular(14),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 18),
                    decoration: BoxDecoration(
                      gradient: isOn
                          ? (Theme.of(context).brightness == Brightness.dark
                              ? AppColors.darkPrimaryGradient
                              : AppColors.lightPrimaryGradient)
                          : null,
                      color: isOn ? null : Theme.of(context).colorScheme.surface,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: isOn ? Colors.transparent : Theme.of(context).dividerColor,
                      ),
                    ),
                    child: Column(
                      children: [
                        Text('$minutes',
                            style: TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.bold,
                              color: isOn ? Colors.white : null,
                            )),
                        Text('min',
                            style: TextStyle(
                              fontSize: 12,
                              color: isOn ? Colors.white70 : Theme.of(context).textTheme.bodySmall?.color,
                            )),
                      ],
                    ),
                  ),
                ),
              ),
            );
          }).toList(),
        ),
      ],
    );
  }
}

class _TutorStep extends StatelessWidget {
  final List<TutorVoice> tutors;
  final String? selectedTutor;
  final ValueChanged<TutorVoice> onSelectTutor;

  const _TutorStep({required this.tutors, required this.selectedTutor, required this.onSelectTutor});

  @override
  Widget build(BuildContext context) {
    return ListView(
      children: [
        const _StepSubtitle('Each voice speaks with a specific regional accent.'),
        const SizedBox(height: 16),
        ...tutors.asMap().entries.map((entry) => Card(
              child: RadioListTile<String>(
                secondary: ColorfulIcon(
                  Icons.record_voice_over_rounded,
                  mood: IconMood.values[entry.key % IconMood.values.length],
                ),
                title: Text(entry.value.name, style: const TextStyle(fontWeight: FontWeight.bold)),
                subtitle: Text('${entry.value.gender} · ${entry.value.accentTag}'),
                value: entry.value.name,
                groupValue: selectedTutor,
                onChanged: (_) => onSelectTutor(entry.value),
              ),
            )),
      ],
    );
  }
}

class _LevelStep extends StatelessWidget {
  final String? selected;
  final ValueChanged<String> onSelect;
  const _LevelStep({required this.selected, required this.onSelect});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _StepSubtitle('This tunes how your tutor speaks and corrects you.'),
        const SizedBox(height: 16),
        Expanded(
          child: ListView.separated(
            itemCount: kLevels.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (context, i) {
              final (code, title, desc) = kLevels[i];
              final isOn = selected == code;
              return InkWell(
                onTap: () => onSelect(code),
                borderRadius: BorderRadius.circular(14),
                child: Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    border: Border.all(
                      color: isOn ? Theme.of(context).colorScheme.primary : Theme.of(context).dividerColor,
                      width: isOn ? 2 : 1.5,
                    ),
                    borderRadius: BorderRadius.circular(14),
                    gradient: isOn
                        ? LinearGradient(colors: [
                            Theme.of(context).colorScheme.primary.withOpacity(0.10),
                            Theme.of(context).colorScheme.tertiary.withOpacity(0.10),
                          ])
                        : null,
                  ),
                  child: Row(
                    children: [
                      CircleAvatar(
                        radius: 20,
                        backgroundColor: isOn
                            ? Theme.of(context).colorScheme.primary
                            : Theme.of(context).colorScheme.surface,
                        child: Text(code,
                            style: TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 12,
                                color: isOn ? Colors.white : Theme.of(context).colorScheme.onSurface)),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(title, style: const TextStyle(fontWeight: FontWeight.bold)),
                            Text(desc, style: Theme.of(context).textTheme.bodySmall),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

/// Searchable single-select list of the user's native/fluent language, used
/// to tailor explanations and hints. Excludes whatever language they just
/// picked to learn.
class _NativeLanguageStep extends StatefulWidget {
  final String targetLanguage;
  final String? selected;
  final ValueChanged<String> onSelect;
  const _NativeLanguageStep({required this.targetLanguage, required this.selected, required this.onSelect});

  @override
  State<_NativeLanguageStep> createState() => _NativeLanguageStepState();
}

class _NativeLanguageStepState extends State<_NativeLanguageStep> {
  final _search = TextEditingController();

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final query = _search.text.trim().toLowerCase();
    final options = kLanguages
        .where((l) => l.code != widget.targetLanguage)
        .where((l) => query.isEmpty || l.name.toLowerCase().contains(query))
        .toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _StepSubtitle("We'll use this to tailor explanations and hints to how you learn best."),
        const SizedBox(height: 16),
        TextField(
          controller: _search,
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(
            hintText: 'Search',
            prefixIcon: const Icon(Icons.search),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
          ),
        ),
        const SizedBox(height: 12),
        Expanded(
          child: options.isEmpty
              ? const Center(child: Text('No languages match your search.'))
              : ListView.separated(
                  itemCount: options.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (context, i) {
                    final lang = options[i];
                    final isOn = lang.code == widget.selected;
                    return InkWell(
                      onTap: () => widget.onSelect(lang.code),
                      borderRadius: BorderRadius.circular(14),
                      child: Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          border: Border.all(
                            color: isOn ? Theme.of(context).colorScheme.primary : Theme.of(context).dividerColor,
                            width: isOn ? 2 : 1.5,
                          ),
                          borderRadius: BorderRadius.circular(14),
                          gradient: isOn
                              ? LinearGradient(colors: [
                                  Theme.of(context).colorScheme.primary.withOpacity(0.10),
                                  Theme.of(context).colorScheme.tertiary.withOpacity(0.10),
                                ])
                              : null,
                        ),
                        child: Row(
                          children: [
                            Text(lang.flag, style: const TextStyle(fontSize: 22)),
                            const SizedBox(width: 12),
                            Expanded(child: Text(lang.name, style: const TextStyle(fontWeight: FontWeight.w600))),
                            if (isOn)
                              Icon(Icons.check_circle_rounded,
                                  color: Theme.of(context).colorScheme.primary, size: 20),
                          ],
                        ),
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }
}

class _MicTestStep extends StatelessWidget {
  final String status;
  final bool testing;
  final VoidCallback onTest;
  const _MicTestStep({required this.status, required this.testing, required this.onTest});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _StepSubtitle("Let's make sure your mic works before your first real conversation. "
            "Tap the button below and say something out loud while it listens."),
        const SizedBox(height: 20),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Microphone', style: TextStyle(fontWeight: FontWeight.bold)),
                    Text(status, style: Theme.of(context).textTheme.bodySmall),
                  ],
                ),
                const SizedBox(height: 16),
                OutlinedButton.icon(
                  onPressed: testing ? null : onTest,
                  icon: const ColorfulIcon(Icons.mic, mood: IconMood.sky, size: 16, boxSize: 24),
                  label: Text(testing ? 'Listening…' : 'Test Microphone'),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

/// Real counts pulled from the offline content bundled for [targetLanguage]
/// (see assets/phrases, assets/grammar, assets/scenarios) - not made-up
/// marketing numbers, so this only ever shows what's actually there.
class _PlanContentCounts {
  final int phrases;
  final int grammar;
  final int scenarios;
  const _PlanContentCounts({required this.phrases, required this.grammar, required this.scenarios});
}

/// Final "reveal" screen: a real summary of everything picked during
/// onboarding, plus a live count of the content actually bundled for the
/// chosen target language.
class _StudyPlanStep extends StatefulWidget {
  final OnboardingData data;
  const _StudyPlanStep({required this.data});

  @override
  State<_StudyPlanStep> createState() => _StudyPlanStepState();
}

class _StudyPlanStepState extends State<_StudyPlanStep> {
  late final Future<_PlanContentCounts> _future = _load();

  Future<_PlanContentCounts> _load() async {
    final lang = widget.data.targetLanguage;
    final phrases = await PhraseBankRepository().getPhrases(lang);
    final grammar = await GrammarRepository().getTopics(lang);
    final scenarios = await ScenarioRepository().getScenarios(lang);
    return _PlanContentCounts(phrases: phrases.length, grammar: grammar.length, scenarios: scenarios.length);
  }

  AppLanguage? _findLanguage(String? code) {
    if (code == null) return null;
    for (final l in kLanguages) {
      if (l.code == code) return l;
    }
    return null;
  }

  String _levelLabel(String? code) {
    if (code == null) return 'Not set yet';
    for (final entry in kLevels) {
      final (levelCode, title, _) = entry;
      if (levelCode == code) return '$title ($levelCode)';
    }
    return code;
  }

  @override
  Widget build(BuildContext context) {
    final data = widget.data;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final targetLang = _findLanguage(data.targetLanguage) ?? kLanguages.first;
    final nativeLang = _findLanguage(data.nativeLanguage);
    final accent = isDark ? AppColors.darkTeal : AppColors.lightTeal;
    final gradient = isDark ? AppColors.darkTriGradient : AppColors.lightTriGradient;

    return FutureBuilder<_PlanContentCounts>(
      future: _future,
      builder: (context, snapshot) {
        final counts = snapshot.data;
        return SingleChildScrollView(
          child: Column(
            children: [
              const SizedBox(height: 4),
              SizedBox(
                height: 150,
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    Container(
                      height: 150,
                      width: 150,
                      decoration: BoxDecoration(shape: BoxShape.circle, color: accent.withOpacity(0.08)),
                    ),
                    Container(
                      height: 112,
                      width: 112,
                      decoration: BoxDecoration(shape: BoxShape.circle, color: accent.withOpacity(0.14)),
                    ),
                    Container(
                      height: 88,
                      width: 88,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(shape: BoxShape.circle, gradient: gradient),
                      child: Text(targetLang.flag, style: const TextStyle(fontSize: 34)),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 18),
              Text(
                'Your ${targetLang.name} plan is ready!',
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 6),
              Text('Starting level: ${_levelLabel(data.level)}',
                  style: Theme.of(context).textTheme.bodySmall),
              const SizedBox(height: 22),
              if (counts == null)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 16),
                  child: SizedBox(height: 24, width: 24, child: CircularProgressIndicator(strokeWidth: 2)),
                )
              else
                Row(
                  children: [
                    Expanded(
                      child: _PlanStat(
                        icon: Icons.chat_bubble_rounded,
                        mood: IconMood.cyan,
                        value: '${counts.phrases}',
                        label: counts.phrases == 1 ? 'phrase ready' : 'phrases ready',
                      ),
                    ),
                    Expanded(
                      child: _PlanStat(
                        icon: Icons.menu_book_rounded,
                        mood: IconMood.purple,
                        value: counts.grammar > 0 ? '${counts.grammar}' : 'Soon',
                        label: counts.grammar > 0
                            ? (counts.grammar == 1 ? 'grammar topic' : 'grammar topics')
                            : 'grammar guide',
                      ),
                    ),
                    Expanded(
                      child: _PlanStat(
                        icon: Icons.theater_comedy_rounded,
                        mood: IconMood.amber,
                        value: counts.scenarios > 0 ? '${counts.scenarios}' : 'Soon',
                        label: counts.scenarios > 0
                            ? (counts.scenarios == 1 ? 'scenario' : 'scenarios')
                            : 'scenarios',
                      ),
                    ),
                  ],
                ),
              const Divider(height: 36),
              Align(
                alignment: Alignment.centerLeft,
                child: Text('YOUR PLAN', style: Theme.of(context).textTheme.bodySmall),
              ),
              const SizedBox(height: 4),
              _PlanRow(
                icon: Icons.flag_rounded,
                mood: IconMood.amber,
                title: 'Motivation',
                value: data.motivation == null ? 'Not set' : onboardingLabel(kMotivations, data.motivation!),
              ),
              _PlanRow(
                icon: Icons.star_rounded,
                mood: IconMood.purple,
                title: 'Focus areas',
                value: data.goals.isEmpty
                    ? 'Not set'
                    : data.goals.map((g) => onboardingLabel(kGoals, g)).join(', '),
              ),
              _PlanRow(
                icon: Icons.event_repeat_rounded,
                mood: IconMood.sky,
                title: 'Practice frequency',
                value: data.frequency == null ? 'Not set' : onboardingLabel(kFrequencies, data.frequency!),
              ),
              _PlanRow(
                icon: Icons.timer_rounded,
                mood: IconMood.mint,
                title: 'Daily goal',
                value: '${data.dailyGoalMinutes} minutes a day',
              ),
              _PlanRow(
                icon: Icons.interests_rounded,
                mood: IconMood.cyan,
                title: 'Topics',
                value: data.topics.isEmpty
                    ? 'Not set'
                    : data.topics.map((t) => onboardingLabel(kTopics, t)).join(', '),
              ),
              _PlanRow(
                icon: Icons.record_voice_over_rounded,
                mood: IconMood.teal,
                title: 'AI tutor',
                value: data.tutorName == null ? 'Not set' : '${data.tutorName} · ${data.accent ?? ''}',
              ),
              if (nativeLang != null)
                _PlanRow(
                  icon: Icons.translate_rounded,
                  mood: IconMood.purple,
                  title: 'Native language',
                  value: '${nativeLang.flag} ${nativeLang.name}',
                ),
              const SizedBox(height: 8),
            ],
          ),
        );
      },
    );
  }
}

class _PlanStat extends StatelessWidget {
  final IconData icon;
  final String value;
  final String label;
  final IconMood mood;
  const _PlanStat({required this.icon, required this.value, required this.label, this.mood = IconMood.teal});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        ColorfulIcon(icon, mood: mood, size: 20, boxSize: 40),
        const SizedBox(height: 6),
        Text(value, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
        Text(label, textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall),
      ],
    );
  }
}

class _PlanRow extends StatelessWidget {
  final IconData icon;
  final String title;
  final String value;
  final IconMood mood;
  const _PlanRow({required this.icon, required this.title, required this.value, this.mood = IconMood.teal});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ColorfulIcon(icon, mood: mood, size: 16, boxSize: 32),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                Text(value, style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
