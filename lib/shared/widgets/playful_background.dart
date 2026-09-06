import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';

/// Soft, low-opacity color blobs behind a screen's content - the "make it a
/// little more playful, not too much" background for Conversation, Phrase
/// Bank, Scenarios, and Grammar, replacing a flat white page with a gentle
/// hint of the full brand palette (mint, sky, purple, amber) in the
/// corners. Content sits on top, fully readable, unaffected.
///
/// Dark mode gets the same treatment at a much lower opacity, so the extra
/// purple presence is felt without fighting the navy background + header
/// gradients already doing most of the work there.
class PlayfulBackground extends StatelessWidget {
  final Widget child;
  const PlayfulBackground({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    if (isDark) {
      return Stack(
        children: [
          Positioned.fill(child: Container(color: AppColors.darkBg)),
          Positioned(top: -80, right: -60, child: _blob(AppColors.darkPurple, 220, opacity: 0.10)),
          Positioned(bottom: -100, left: -70, child: _blob(AppColors.darkPurple, 200, opacity: 0.08)),
          child,
        ],
      );
    }

    return Stack(
      children: [
        Positioned.fill(child: Container(color: AppColors.lightBg)),
        Positioned(top: -70, right: -60, child: _blob(AppColors.lightMint, 190)),
        Positioned(top: 160, left: -90, child: _blob(AppColors.lightSky, 210)),
        Positioned(bottom: -110, right: -50, child: _blob(AppColors.lightPurple, 260, opacity: 0.13)),
        Positioned(bottom: 220, left: -70, child: _blob(AppColors.lightPurple, 170, opacity: 0.09)),
        Positioned(bottom: 20, left: -70, child: _blob(AppColors.lightAmber, 150)),
        child,
      ],
    );
  }

  Widget _blob(Color color, double size, {double opacity = 0.08}) {
    return Container(
      height: size,
      width: size,
      decoration: BoxDecoration(shape: BoxShape.circle, color: color.withOpacity(opacity)),
    );
  }
}
