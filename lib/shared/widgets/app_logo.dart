import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';

/// The Fluency wordmark, matching the reference "Fluency AI" logo: bold
/// "Fluency" in the current theme's text color, with a small teal-to-cyan
/// "AI" badge riding high beside it. Flat by default - no boxed background -
/// so it reads correctly against any screen (light, dark, or the intro
/// screen's fixed navy), not just a dark tile.
class AppLogo extends StatelessWidget {
  final double height;
  final bool showContainer;
  const AppLogo({super.key, this.height = 40, this.showContainer = false});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final fontSize = height * 0.65;
    final wordColor = isDark ? Colors.white : AppColors.lightText;
    final aiGradient = LinearGradient(colors: [
      isDark ? AppColors.darkTeal : AppColors.lightTeal,
      isDark ? AppColors.darkCyan : AppColors.lightCyan,
    ]);

    final wordmark = Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ShaderMask(
          shaderCallback: (bounds) => aiGradient.createShader(bounds),
          child: Text(
            'F',
            style: TextStyle(
              fontSize: fontSize,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.5,
              height: 1,
              color: Colors.white, // masked by the gradient above
            ),
          ),
        ),
        Text(
          'luency',
          style: TextStyle(
            fontSize: fontSize,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.5,
            height: 1,
            color: wordColor,
          ),
        ),
        Padding(
          padding: EdgeInsets.only(top: fontSize * 0.05, left: 2),
          child: ShaderMask(
            shaderCallback: (bounds) => aiGradient.createShader(bounds),
            child: Text(
              'AI',
              style: TextStyle(
                fontSize: fontSize * 0.38,
                fontWeight: FontWeight.w800,
                height: 1,
                color: Colors.white, // masked by the gradient above
              ),
            ),
          ),
        ),
      ],
    );

    if (!showContainer) return wordmark;

    // Legacy boxed variant (dark rounded tile, gradient "F" + white
    // "luency") - kept in case a favicon/app-icon-style context ever needs
    // it again, but no longer used by default anywhere in the app.
    return Container(
      height: height * 2,
      width: height * 2,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: AppColors.darkBg,
        borderRadius: BorderRadius.circular(height * 0.5),
      ),
      child: FittedBox(
        child: Padding(
          padding: const EdgeInsets.all(4),
          child: RichText(
            text: TextSpan(
              style: TextStyle(fontSize: fontSize, fontWeight: FontWeight.w800, letterSpacing: -0.5, height: 1),
              children: [
                TextSpan(
                  text: 'F',
                  style: TextStyle(
                    foreground: Paint()
                      ..shader = const LinearGradient(
                        colors: [AppColors.darkTeal, AppColors.darkCyan],
                      ).createShader(Rect.fromLTWH(0, 0, fontSize, fontSize)),
                  ),
                ),
                const TextSpan(text: 'luency', style: TextStyle(color: Colors.white)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
