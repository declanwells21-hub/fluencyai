import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';

/// Hero CTA button - the mint "Start speaking" color from the reference
/// prototype. Used anywhere a screen's primary action deserves to be the
/// visual anchor (Create Account, onboarding "Continue"/"Get Started",
/// Save, Generate...). Deliberately its own color family (mint, not the
/// teal/cyan/purple used elsewhere) so it's unmistakably "the button to
/// tap" on any screen.
class GradientButton extends StatelessWidget {
  final String label;
  final bool loading;
  final VoidCallback? onTap;
  const GradientButton({super.key, required this.label, this.loading = false, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Material(
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Ink(
          decoration: BoxDecoration(
            gradient: isDark ? AppColors.darkCtaGradient : AppColors.lightCtaGradient,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Container(
            height: 52,
            alignment: Alignment.center,
            child: loading
                ? const SizedBox(
                    height: 18,
                    width: 18,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : Text(label,
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
          ),
        ),
      ),
    );
  }
}
