import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/gradient_button.dart';
import '../../../shared/widgets/app_logo.dart';

/// Key used to remember that the user has already been through the intro
/// carousel once, so returning users go straight to /auth instead of seeing
/// it again every time they open the app without a session.
const introSeenPrefsKey = 'has_seen_intro';

class _IntroSlide {
  final IconData icon;
  final String titleStart;
  final String titleHighlight;
  final String subtitle;
  final List<_Chip> chips;
  const _IntroSlide({
    required this.icon,
    required this.titleStart,
    required this.titleHighlight,
    required this.subtitle,
    required this.chips,
  });
}

/// A small floating decorative pill, echoing a chat-bubble preview. Purely
/// cosmetic - positioned around the hero icon on each slide.
class _Chip {
  final IconData icon;
  final double top;
  final double? left;
  final double? right;
  final double angle;
  final double width;
  const _Chip({
    required this.icon,
    required this.top,
    this.left,
    this.right,
    this.angle = 0,
    this.width = 120,
  });
}

const _slides = [
  _IntroSlide(
    icon: Icons.mic_rounded,
    titleStart: 'The App That Lets You',
    titleHighlight: 'Speak',
    subtitle:
        'Skip the flashcards. Have real spoken conversations with an AI '
        'tutor, starting from your very first lesson.',
    chips: [
      _Chip(icon: Icons.chat_bubble_rounded, top: 10, left: 8, angle: -0.06, width: 132),
      _Chip(icon: Icons.check_circle_rounded, top: 70, right: 4, angle: 0.05, width: 110),
      _Chip(icon: Icons.graphic_eq_rounded, top: 150, left: 20, angle: 0.04, width: 100),
    ],
  ),
  _IntroSlide(
    icon: Icons.forum_rounded,
    titleStart: 'Real Conversations,',
    titleHighlight: 'Not Just Videos',
    subtitle:
        'Pick your language and an AI tutor with a real accent, then talk '
        'it out. Your tutor responds to what you actually say and gently '
        'corrects your mistakes.',
    chips: [
      _Chip(icon: Icons.record_voice_over_rounded, top: 0, left: 0, angle: -0.05, width: 140),
      _Chip(icon: Icons.close_rounded, top: 90, right: 10, angle: 0.08, width: 90),
      _Chip(icon: Icons.check_rounded, top: 160, left: 40, angle: -0.03, width: 100),
    ],
  ),
  _IntroSlide(
    icon: Icons.auto_awesome_rounded,
    titleStart: 'Powered By Cutting Edge',
    titleHighlight: 'AI Technology',
    subtitle:
        'Get instant, personalized feedback on your grammar and '
        'pronunciation after almost everything you say.',
    chips: [
      _Chip(icon: Icons.spellcheck_rounded, top: 6, right: 6, angle: 0.06, width: 128),
      _Chip(icon: Icons.thumb_up_rounded, top: 100, left: 4, angle: -0.05, width: 100),
      _Chip(icon: Icons.trending_up_rounded, top: 170, right: 30, angle: 0.03, width: 112),
    ],
  ),
  _IntroSlide(
    icon: Icons.menu_book_rounded,
    titleStart: 'Learn Real Phrases',
    titleHighlight: 'Natives Actually Use',
    subtitle:
        'Explore scenario-based roleplays, grammar guides, and a saved '
        'phrase bank - every phrase comes with native audio.',
    chips: [
      _Chip(icon: Icons.bookmark_rounded, top: 4, left: 12, angle: -0.04, width: 112),
      _Chip(icon: Icons.travel_explore_rounded, top: 90, right: 0, angle: 0.06, width: 132),
      _Chip(icon: Icons.volume_up_rounded, top: 165, left: 30, angle: -0.03, width: 96),
    ],
  ),
];

/// The very first thing an unauthenticated user sees, before /auth: a short
/// carousel introducing what Fluency actually does. Shown once per device
/// (see [introSeenPrefsKey]); after that, SplashScreen sends users with no
/// session straight to /auth.
class IntroScreen extends StatefulWidget {
  const IntroScreen({super.key});

  @override
  State<IntroScreen> createState() => _IntroScreenState();
}

class _IntroScreenState extends State<IntroScreen> {
  final _controller = PageController();
  int _page = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _markSeen() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(introSeenPrefsKey, true);
    } catch (_) {
      // Non-fatal - worst case the carousel shows again next launch.
    }
  }

  Future<void> _continueTo(String mode) async {
    await _markSeen();
    if (mounted) context.go('/auth?mode=$mode');
  }

  @override
  Widget build(BuildContext context) {
    // The intro carousel always uses the reference prototype's dark navy
    // look (see the "You've studied enough" screenshot) - it's a fixed
    // first-impression moment, independent of whatever light/dark theme
    // the user later picks for the rest of the app.
    const isDark = true;
    return Scaffold(
      backgroundColor: AppColors.darkBg,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 16, 24, 0),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Theme(
                    data: ThemeData(brightness: Brightness.dark),
                    child: const AppLogo(height: 28),
                  ),
                  TextButton(
                    style: TextButton.styleFrom(foregroundColor: Colors.white70),
                    onPressed: () => _continueTo('signup'),
                    child: const Text('Skip'),
                  ),
                ],
              ),
            ),
            Expanded(
              child: PageView.builder(
                controller: _controller,
                itemCount: _slides.length,
                onPageChanged: (i) => setState(() => _page = i),
                itemBuilder: (context, i) => _SlideView(slide: _slides[i], isDark: isDark),
              ),
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(_slides.length, (i) {
                final active = i == _page;
                return AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  margin: const EdgeInsets.symmetric(horizontal: 4),
                  height: 8,
                  width: active ? 22 : 8,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(4),
                    gradient: active
                        ? (isDark ? AppColors.darkCyanPurpleGradient : AppColors.lightCyanPurpleGradient)
                        : null,
                    color: active ? null : (isDark ? AppColors.darkBorder : AppColors.lightBorder),
                  ),
                );
              }),
            ),
            const SizedBox(height: 24),
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 0, 24, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  GradientButton(label: "Let's go!", onTap: () => _continueTo('signup')),
                  const SizedBox(height: 12),
                  Center(
                    child: TextButton(
                      onPressed: () => _continueTo('login'),
                      child: Text.rich(
                        TextSpan(
                          text: 'Already got an account? ',
                          style: TextStyle(
                            color: isDark ? AppColors.darkTextSoft : AppColors.lightTextSoft,
                          ),
                          children: [
                            TextSpan(
                              text: 'Log In',
                              style: TextStyle(
                                color: isDark ? AppColors.darkCyan : AppColors.lightTeal,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SlideView extends StatelessWidget {
  final _IntroSlide slide;
  final bool isDark;
  const _SlideView({required this.slide, required this.isDark});

  @override
  Widget build(BuildContext context) {
    // Purple-forward hero gradient (was the teal-cyan-purple tri-gradient) -
    // gives the intro carousel more of the app's purple accent per feedback,
    // while still resolving into brand teal at the tail end.
    final gradient = isDark ? AppColors.darkPurpleTealGradient : AppColors.lightPurpleTealGradient;
    final softBg = isDark ? AppColors.darkSurface : AppColors.lightSurface;
    final textColor = isDark ? AppColors.darkText : AppColors.lightText;
    final softText = isDark ? AppColors.darkTextSoft : AppColors.lightTextSoft;

    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 28),
      child: Column(
        children: [
          const SizedBox(height: 8),
          SizedBox(
            height: 240,
            child: Stack(
              alignment: Alignment.center,
              clipBehavior: Clip.none,
              children: [
                // Concentric rings behind the hero icon, echoing a mic
                // "listening" animation.
                _ring(220, gradient.colors.first.withOpacity(0.08)),
                _ring(170, gradient.colors.first.withOpacity(0.14)),
                Container(
                  height: 120,
                  width: 120,
                  decoration: BoxDecoration(shape: BoxShape.circle, gradient: gradient),
                  child: Icon(slide.icon, color: Colors.white, size: 52),
                ),
                for (final chip in slide.chips)
                  Positioned(
                    top: chip.top,
                    left: chip.left,
                    right: chip.right,
                    child: Transform.rotate(
                      angle: chip.angle,
                      child: _FloatingChip(icon: chip.icon, width: chip.width, isDark: isDark),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 28),
          RichText(
            textAlign: TextAlign.center,
            text: TextSpan(
              style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800, height: 1.25, color: textColor),
              children: [
                TextSpan(text: '${slide.titleStart} '),
                TextSpan(
                  text: slide.titleHighlight,
                  style: TextStyle(
                    color: Colors.white,
                    backgroundColor: (isDark ? AppColors.darkPurple : AppColors.lightPurple),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          Text(
            slide.subtitle,
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 14.5, height: 1.4, color: softText),
          ),
          const SizedBox(height: 8),
          // Subtle divider strip to echo the brand surface tone without
          // adding real content.
          Container(height: 1, color: softBg),
        ],
      ),
    );
  }

  Widget _ring(double size, Color color) {
    return Container(
      height: size,
      width: size,
      decoration: BoxDecoration(shape: BoxShape.circle, color: color),
    );
  }
}

/// Small decorative "message preview" pill: a colored circular icon plus
/// two placeholder bars, echoing a chat bubble without showing real text.
class _FloatingChip extends StatelessWidget {
  final IconData icon;
  final double width;
  final bool isDark;
  const _FloatingChip({required this.icon, required this.width, required this.isDark});

  @override
  Widget build(BuildContext context) {
    final bg = isDark ? AppColors.darkSurface2 : AppColors.lightSurface2;
    final barColor = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final gradient = isDark ? AppColors.darkCyanPurpleGradient : AppColors.lightCyanPurpleGradient;
    return Container(
      width: width,
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(color: Colors.black.withOpacity(isDark ? 0.25 : 0.06), blurRadius: 10, offset: const Offset(0, 4)),
        ],
      ),
      child: Row(
        children: [
          Container(
            height: 22,
            width: 22,
            decoration: BoxDecoration(shape: BoxShape.circle, gradient: gradient),
            child: Icon(icon, size: 13, color: Colors.white),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(height: 5, width: double.infinity, decoration: BoxDecoration(color: barColor, borderRadius: BorderRadius.circular(3))),
                const SizedBox(height: 5),
                Container(height: 5, width: width * 0.5, decoration: BoxDecoration(color: barColor, borderRadius: BorderRadius.circular(3))),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
