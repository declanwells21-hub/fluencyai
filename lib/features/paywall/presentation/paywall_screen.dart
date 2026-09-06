import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_theme.dart';
import 'paywall_content.dart';

/// SCREEN 4 of the onboarding->paywall->dashboard flow - pushed
/// automatically right after the Onboarding Wizard finishes (see
/// OnboardingScreen._finish), before the person ever sees the dashboard.
/// Dismissing it (X or "Continue exploring on Free Tier") takes them into
/// the app on the Free Tier; nothing here blocks that path.
class PaywallScreen extends StatelessWidget {
  const PaywallScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      backgroundColor: isDark ? AppColors.darkBg : AppColors.lightBg,
      body: SafeArea(
        child: PaywallContent(onContinueFree: () => context.go('/dashboard')),
      ),
    );
  }
}
