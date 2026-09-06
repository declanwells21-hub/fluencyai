import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../onboarding/data/profile_repository.dart';
import '../../onboarding/data/onboarding_provider.dart';
import '../../../shared/widgets/app_logo.dart';
import '../../../core/config/supabase_config.dart';
import 'intro_screen.dart';

/// First screen the app shows. Decides where to actually land:
/// - No session -> /auth
/// - Session but no saved profile yet -> /onboarding (new user, first time)
/// - Session with a saved profile -> restore it into onboardingProvider and
///   go straight to /dashboard.
class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen> {
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _bootstrap());
  }

  Future<void> _bootstrap() async {
    // Fail loudly and visibly instead of hanging forever with no clue why.
    if (!SupabaseConfig.isConfigured) {
      setState(() => _error =
          'App is not configured: SUPABASE_URL / SUPABASE_ANON_KEY are missing.\n\n'
          'Check Vercel -> Settings -> Environment Variables, confirm both have '
          'real values saved, then Redeploy.');
      return;
    }

    try {
      final session = Supabase.instance.client.auth.currentSession;
      if (session == null) {
        if (!mounted) return;
        bool seenIntro = false;
        try {
          final prefs = await SharedPreferences.getInstance();
          seenIntro = prefs.getBool(introSeenPrefsKey) ?? false;
        } catch (_) {
          // If prefs can't be read for some reason, just show the intro -
          // worse case is a returning user sees it again once.
        }
        if (mounted) context.go(seenIntro ? '/auth' : '/intro');
        return;
      }

      final profile = await ref
          .read(profileRepositoryProvider)
          .loadProfile()
          .timeout(const Duration(seconds: 10));
      if (profile != null && profile.tutorName != null) {
        final notifier = ref.read(onboardingProvider.notifier);
        notifier.setLanguage(profile.targetLanguage);
        if (profile.level != null) notifier.setLevel(profile.level!);
        notifier.setDailyGoal(profile.dailyGoalMinutes);
        notifier.setTutor(profile.tutorName!, profile.accent ?? '');
        notifier.setGender(profile.gender);
        if (profile.motivation != null) notifier.setMotivation(profile.motivation!);
        for (final goal in profile.goals) {
          notifier.toggleGoal(goal);
        }
        if (profile.frequency != null) notifier.setFrequency(profile.frequency!);
        for (final topic in profile.topics) {
          notifier.toggleTopic(topic);
        }
        if (profile.nativeLanguage != null) notifier.setNativeLanguage(profile.nativeLanguage!);
        if (mounted) context.go('/dashboard');
      } else {
        if (mounted) context.go('/onboarding');
      }
    } catch (e) {
      setState(() => _error = 'Could not start the app: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: _error == null
            ? const AppLogo(height: 44)
            : Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.error_outline, color: Theme.of(context).colorScheme.error, size: 36),
                    const SizedBox(height: 12),
                    Text(_error!, textAlign: TextAlign.center),
                    const SizedBox(height: 20),
                    FilledButton(
                      onPressed: () {
                        setState(() => _error = null);
                        _bootstrap();
                      },
                      child: const Text('Retry'),
                    ),
                  ],
                ),
              ),
      ),
    );
  }
}
