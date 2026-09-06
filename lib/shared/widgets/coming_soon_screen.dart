import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';
import 'section_header.dart';

/// Shared placeholder for tabs that are part of the prototype's design but
/// out of scope for the Phase 1+2 demo (built in Phase 3). Still gets the
/// same gradient header treatment as the real screens so the app doesn't
/// suddenly go flat/unbranded on an unfinished tab.
class ComingSoonScreen extends StatelessWidget {
  final String title;
  final String emoji;
  const ComingSoonScreen({super.key, required this.title, required this.emoji});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            SectionHeader(
              icon: Icons.bar_chart,
              title: title,
              subtitle: 'Coming in Phase 3',
              gradient: isDark ? AppColors.darkCyanPurpleGradient : AppColors.lightCyanPurpleGradient,
            ),
            Expanded(
              child: Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(emoji, style: const TextStyle(fontSize: 40)),
                    const SizedBox(height: 12),
                    Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 6),
                    const Text('Coming in Phase 3', style: TextStyle(color: Colors.grey)),
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
