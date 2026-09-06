import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';

/// A little rotation of the app's own brand colors (never colors outside
/// the theme) so that icons across the app each get their own personality
/// instead of being flat grey/black. Same list in light and dark - each
/// entry below picks the light/dark version of that hue automatically.
enum IconMood { teal, cyan, sky, purple, mint, amber }

/// Wraps an icon in a soft tinted "pill" using one of the app's brand
/// colors, picked either explicitly via [mood] or deterministically from
/// [seed] (e.g. pass the same string/int for the same icon everywhere so it
/// stays a consistent color across the app, e.g. seed: 0 for the first icon
/// in a list, seed: 1 for the next, or seed: icon.hashCode).
class ColorfulIcon extends StatelessWidget {
  final IconData icon;
  final IconMood? mood;
  final int seed;
  final double size;
  final double boxSize;
  final bool filled;

  const ColorfulIcon(
    this.icon, {
    super.key,
    this.mood,
    this.seed = 0,
    this.size = 18,
    this.boxSize = 34,
    this.filled = true,
  });

  /// Public accessor so other widgets (e.g. custom chip/grid layouts) can
  /// look up the same brand color a filled ColorfulIcon would use, without
  /// having to duplicate the mapping.
  static Color colorFor(IconMood mood, bool isDark) {
    switch (mood) {
      case IconMood.teal:
        return isDark ? AppColors.darkTeal : AppColors.lightTeal;
      case IconMood.cyan:
        return isDark ? AppColors.darkCyan : AppColors.lightCyan;
      case IconMood.sky:
        return isDark ? AppColors.darkSky : AppColors.lightSky;
      case IconMood.purple:
        return isDark ? AppColors.darkPurple : AppColors.lightPurple;
      case IconMood.mint:
        return isDark ? AppColors.darkMint : AppColors.lightMint;
      case IconMood.amber:
        return isDark ? AppColors.darkAmber : AppColors.lightAmber;
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final effectiveMood = mood ?? IconMood.values[seed % IconMood.values.length];
    final color = colorFor(effectiveMood, isDark);

    if (!filled) return Icon(icon, size: size, color: color);

    return Container(
      height: boxSize,
      width: boxSize,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: color.withOpacity(isDark ? 0.22 : 0.14),
        shape: BoxShape.circle,
      ),
      child: Icon(icon, size: size, color: color),
    );
  }
}
