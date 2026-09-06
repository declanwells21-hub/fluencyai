import 'package:flutter/material.dart';

/// Brand palette sampled directly from FLUENCY_THEME_COLORS.jpeg and
/// FLUENCY_LOGO.jpeg (pixel analysis, not eyeballed): a deep teal, a bright
/// cyan-teal, and a purple/indigo, on a near-black navy in dark mode -
/// matching the logo's own background color exactly.
///
/// Two later rounds of feedback shaped this further:
/// 1. Primary CTAs (Create Account, Continue, Get Started...) now use a
///    dedicated mint/spring-green, matching the "Start speaking" button
///    from the reference prototype - kept visually distinct from the
///    teal/cyan/purple used for headers, dots, and everything else.
/// 2. amber and sky were added so category tags, stat bars, and mistake
///    badges (More Natural / Word Choice / Grammar / Listening, etc.) can
///    each get their own color instead of everything being teal-on-teal,
///    matching the multi-color feedback UI from that same prototype.
class AppColors {
  // Light theme
  static const lightBg = Color(0xFFFFFFFF);
  static const lightSurface = Color(0xFFF3FBFA);
  static const lightSurface2 = Color(0xFFE3F5F3);
  static const lightText = Color(0xFF0B1F2A);
  static const lightTextSoft = Color(0xFF5C7278);
  static const lightBorder = Color(0xFFCFE8E5);

  static const lightTeal = Color(0xFF0EA5A0);
  // Sharper / more saturated than before - this is the "light blue, sky
  // blue" color that feedback asked to be more concentrated across the app.
  static const lightCyan = Color(0xFF00D4D4);
  static const lightSky = Color(0xFF2CB6F0);
  static const lightPurple = Color(0xFF5B4B9E);

  // Primary CTA color (Create Account, Continue, Get Started, Save...) -
  // matches the "Start speaking" button from the reference prototype.
  // Deliberately a different hue family from teal/cyan/purple so buttons
  // read as clearly actionable against the rest of the brand palette.
  static const lightMint = Color(0xFF17C990);
  static const lightMintDeep = Color(0xFF0DA876);

  // Purple family used for the CTA gradient (see lightCtaGradient below) -
  // a brighter, punchier pair than lightPurple/lightPurpleDeep so buttons
  // still read as clearly actionable, just from the purple hue family
  // instead of mint.
  static const lightPurpleBright = Color(0xFF8B6BF0);
  static const lightPurpleDeep = Color(0xFF5B3FC9);

  // Secondary accent for "word choice" / caution-style tags and stats.
  static const lightAmber = Color(0xFFE0A429);
  // Deeper amber used specifically for *text* inside a correction bubble -
  // lightAmber itself is too pale to read as body text on a near-white
  // background, this is just it darkened for contrast.
  static const lightAmberText = Color(0xFF8A5A12);

  // User vs. tutor chat bubble fills - solid, unmistakably different colors
  // (purple = you, teal-tinted = tutor) so a conversation reads at a glance
  // like a modern messaging app, instead of both sides being near-identical
  // pale tints of the same hue.
  static const lightUserBubble = lightPurple;
  static const lightTutorBubble = lightSurface2;
  static const lightTutorBubbleAccent = lightTeal;

  // Dark theme - navy background matches the logo's own bg exactly
  static const darkBg = Color(0xFF0A1424);
  static const darkSurface = Color(0xFF0F1C30);
  static const darkSurface2 = Color(0xFF152538);
  static const darkText = Color(0xFFE9F6F5);
  static const darkTextSoft = Color(0xFF9DB4B8);
  static const darkBorder = Color(0xFF223447);

  // Dimmed slightly from the original values - at full brightness these
  // read as near-neon against the near-black navy background and made
  // white button/card text hard to read (direct feedback on the Resume
  // Session card). Still clearly "teal/cyan", just not glowing.
  static const darkTeal = Color(0xFF119C93);
  static const darkCyan = Color(0xFF1FB8B0);
  static const darkSky = Color(0xFF2E9FD6);
  static const darkPurple = Color(0xFF7C63D6);

  static const darkMint = Color(0xFF16B37F);
  static const darkMintDeep = Color(0xFF0E8C63);
  static const darkAmber = Color(0xFFD1A13B);

  // User vs. tutor chat bubble fills - same idea as the light-theme pair
  // above, tuned to stay legible against the near-black navy background.
  // The tutor bubble is pure white (matching the reference design's white
  // card) rather than a dark tint - it reads as a clean, lit "card"
  // against the navy page background, exactly like the reference.
  static const darkUserBubble = darkPurpleDeep;
  static const darkTutorBubble = Colors.white;
  static const darkTutorBubbleAccent = darkCyan;

  // Purple family used for the CTA gradient in dark mode - brighter than
  // darkPurple so it still pops against the near-black navy background.
  static const darkPurpleBright = Color(0xFFA48CF5);
  static const darkPurpleDeep = Color(0xFF6B4FD6);

  static const danger = Color(0xFFE4574C);
  static const warn = Color(0xFFDFA23A);

  // Two-stop gradient (teal -> cyan) for headers/cards
  static const lightPrimaryGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [lightTeal, lightCyan],
  );
  static const darkPrimaryGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [darkTeal, darkCyan],
  );

  // The CTA gradient - Create Account / Continue / Get Started / Save /
  // "Let's go!" / "Start" all use this via GradientButton. Purple, matching
  // the app's purple/indigo brand accent (previously mint).
  static const lightCtaGradient = LinearGradient(
    begin: Alignment.centerLeft,
    end: Alignment.centerRight,
    colors: [lightPurpleDeep, lightPurpleBright],
  );
  static const darkCtaGradient = LinearGradient(
    begin: Alignment.centerLeft,
    end: Alignment.centerRight,
    colors: [darkPurpleDeep, darkPurpleBright],
  );

  // Three-stop gradient (teal -> cyan -> purple) for hero moments - matches
  // the logo's own teal-to-purple color story
  static const lightTriGradient = LinearGradient(
    begin: Alignment.centerLeft,
    end: Alignment.centerRight,
    colors: [lightTeal, lightCyan, lightPurple],
  );
  static const darkTriGradient = LinearGradient(
    begin: Alignment.centerLeft,
    end: Alignment.centerRight,
    colors: [darkTeal, darkCyan, darkPurple],
  );

  // Two-color combos used to give each feature section a distinct but
  // related identity, rotating through the same three brand colors.
  static const lightCyanPurpleGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [lightCyan, lightPurple],
  );
  static const darkCyanPurpleGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [darkCyan, darkPurple],
  );

  static const lightPurpleTealGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [lightPurple, lightTeal],
  );
  static const darkPurpleTealGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [darkPurple, darkTeal],
  );
}

class AppTheme {
  static ThemeData light = ThemeData(
    useMaterial3: true,
    brightness: Brightness.light,
    scaffoldBackgroundColor: AppColors.lightBg,
    colorScheme: ColorScheme.fromSeed(
      seedColor: AppColors.lightTeal,
      brightness: Brightness.light,
      primary: AppColors.lightTeal,
      secondary: AppColors.lightPurple,
      tertiary: AppColors.lightCyan,
      surface: AppColors.lightSurface,
      error: AppColors.danger,
    ),
    textTheme: const TextTheme(
      bodyMedium: TextStyle(color: AppColors.lightText),
      bodySmall: TextStyle(color: AppColors.lightTextSoft),
    ),
    dividerColor: AppColors.lightBorder,
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.lightSurface,
      labelStyle: const TextStyle(color: AppColors.lightTextSoft, fontWeight: FontWeight.w600),
      hintStyle: const TextStyle(color: AppColors.lightTextSoft),
      prefixIconColor: AppColors.lightTeal,
      suffixIconColor: AppColors.lightTextSoft,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: AppColors.lightBorder),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: AppColors.lightBorder),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: AppColors.lightTeal, width: 2),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: AppColors.danger),
      ),
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.lightBg,
      foregroundColor: AppColors.lightText,
      elevation: 0,
    ),
    checkboxTheme: CheckboxThemeData(
      fillColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected) ? AppColors.lightPurple : null,
      ),
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected) ? AppColors.lightTeal : null,
      ),
      trackColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected) ? AppColors.lightCyan : null,
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: AppColors.lightBg,
      indicatorColor: AppColors.lightPurple.withOpacity(0.14),
      iconTheme: WidgetStateProperty.resolveWith(
        (states) => IconThemeData(
          color: states.contains(WidgetState.selected) ? AppColors.lightPurple : AppColors.lightTextSoft,
        ),
      ),
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      color: AppColors.lightBg,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: AppColors.lightBorder, width: 1),
      ),
    ),
  );

  static ThemeData dark = ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    scaffoldBackgroundColor: AppColors.darkBg,
    colorScheme: ColorScheme.fromSeed(
      seedColor: AppColors.darkTeal,
      brightness: Brightness.dark,
      primary: AppColors.darkTeal,
      secondary: AppColors.darkPurple,
      tertiary: AppColors.darkCyan,
      surface: AppColors.darkSurface,
      error: AppColors.danger,
    ),
    textTheme: const TextTheme(
      bodyMedium: TextStyle(color: AppColors.darkText),
      bodySmall: TextStyle(color: AppColors.darkTextSoft),
    ),
    dividerColor: AppColors.darkBorder,
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.darkSurface2,
      labelStyle: const TextStyle(color: AppColors.darkTextSoft, fontWeight: FontWeight.w600),
      hintStyle: const TextStyle(color: AppColors.darkTextSoft),
      prefixIconColor: AppColors.darkCyan,
      suffixIconColor: AppColors.darkTextSoft,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: AppColors.darkBorder),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: AppColors.darkBorder),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: AppColors.darkCyan, width: 2),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: AppColors.danger),
      ),
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.darkBg,
      foregroundColor: AppColors.darkText,
      elevation: 0,
    ),
    checkboxTheme: CheckboxThemeData(
      fillColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected) ? AppColors.darkPurple : null,
      ),
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected) ? AppColors.darkTeal : null,
      ),
      trackColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected) ? AppColors.darkCyan : null,
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: AppColors.darkSurface,
      indicatorColor: AppColors.darkPurple.withOpacity(0.22),
      iconTheme: WidgetStateProperty.resolveWith(
        (states) => IconThemeData(
          color: states.contains(WidgetState.selected) ? AppColors.darkPurple : AppColors.darkTextSoft,
        ),
      ),
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      color: AppColors.darkSurface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: AppColors.darkBorder, width: 1),
      ),
    ),
  );
}
