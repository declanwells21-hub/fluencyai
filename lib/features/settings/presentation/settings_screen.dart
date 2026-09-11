import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/section_header.dart';
import '../../../shared/widgets/playful_background.dart';
import '../../../shared/widgets/colorful_icon.dart';
import '../../../shared/data/languages.dart';
import '../../../shared/data/onboarding_options.dart';
import '../../auth/data/rest_auth_repository.dart';
import '../../onboarding/data/onboarding_provider.dart';
import '../../onboarding/data/profile_repository.dart';
import 'legal_content_screen.dart';
import 'creator_program_screen.dart';

// Matches the address used across the site (site/terms.html,
// site/privacy.html) exactly - keep these in sync if that ever changes.
const _kSupportEmail = 'fluencyai.support@gmail.com';
const _kDiscordInviteUrl = 'https://discord.gg/your-invite';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  String _languageName(String? code) {
    if (code == null) return 'Not set';
    return kLanguages
        .firstWhere((l) => l.code == code, orElse: () => AppLanguage(code: code, name: code, flag: ''))
        .name;
  }

  String _levelTitle(String? code) {
    if (code == null) return 'Not set';
    for (final l in kLevels) {
      if (l.$1 == code) return '${l.$1} · ${l.$2}';
    }
    return code;
  }

  Future<void> _openUrl(BuildContext context, String url) async {
    final uri = Uri.parse(url);
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not open that link.')));
    }
  }

  Future<void> _pickLanguage(BuildContext context, WidgetRef ref) async {
    final code = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _PickerSheet(
        title: 'Learning Language',
        itemCount: kLanguages.length,
        itemBuilder: (context, i) {
          final lang = kLanguages[i];
          final isOn = lang.code == ref.read(onboardingProvider).targetLanguage;
          return ListTile(
            leading: Text(lang.flag, style: const TextStyle(fontSize: 22)),
            title: Text(lang.name),
            trailing: isOn ? Icon(Icons.check_circle_rounded, color: ColorfulIcon.colorFor(IconMood.sky, Theme.of(context).brightness == Brightness.dark)) : null,
            onTap: () => Navigator.of(context).pop(lang.code),
          );
        },
      ),
    );
    if (code == null || !context.mounted) return;
    ref.read(onboardingProvider.notifier).setLanguage(code);
    unawaited(ref.read(profileRepositoryProvider).saveProfile(ref.read(onboardingProvider)));
  }

  Future<void> _pickLevel(BuildContext context, WidgetRef ref) async {
    final code = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _PickerSheet(
        title: 'Language Level',
        itemCount: kLevels.length,
        itemBuilder: (context, i) {
          final (levelCode, title, desc) = kLevels[i];
          final isOn = levelCode == ref.read(onboardingProvider).level;
          final isDark = Theme.of(context).brightness == Brightness.dark;
          return ListTile(
            leading: CircleAvatar(
              radius: 16,
              backgroundColor: (isDark ? AppColors.darkPurple : AppColors.lightPurple).withOpacity(isDark ? 0.22 : 0.14),
              child: Text(levelCode,
                  style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      color: isDark ? AppColors.darkPurple : AppColors.lightPurple)),
            ),
            title: Text(title),
            subtitle: Text(desc, maxLines: 1, overflow: TextOverflow.ellipsis),
            trailing: isOn ? Icon(Icons.check_circle_rounded, color: isDark ? AppColors.darkPurple : AppColors.lightPurple) : null,
            onTap: () => Navigator.of(context).pop(levelCode),
          );
        },
      ),
    );
    if (code == null || !context.mounted) return;
    ref.read(onboardingProvider.notifier).setLevel(code);
    unawaited(ref.read(profileRepositoryProvider).saveProfile(ref.read(onboardingProvider)));
  }

  Future<void> _confirmDeleteAccount(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Delete Account?'),
        content: const Text(
          'This permanently deletes your account and everything tied to it - your plan, progress, and '
          'saved phrases. This cannot be undone.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialogContext).pop(false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger, foregroundColor: Colors.white),
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Delete Account'),
          ),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;

    final ok = await ref.read(authRepositoryProvider).deleteAccount();
    if (!context.mounted) return;
    if (ok) {
      context.go('/auth');
    } else {
      showDialog(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text("Couldn't delete your account"),
          content: Text('Please email $_kSupportEmail and we\'ll take care of it for you.'),
          actions: [TextButton(onPressed: () => Navigator.of(dialogContext).pop(), child: const Text('OK'))],
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final themeMode = ref.watch(themeModeProvider);
    final isDark = themeMode == ThemeMode.dark;
    final onboarding = ref.watch(onboardingProvider);

    final topicsLabel =
        onboarding.topics.isEmpty ? 'Not set' : onboarding.topics.map((t) => onboardingLabel(kTopics, t)).join(', ');
    final motivationLabel =
        onboarding.motivation == null ? 'Not set' : onboardingLabel(kMotivations, onboarding.motivation!);

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            SectionHeader(
              icon: Icons.person_rounded,
              title: 'Profile',
              subtitle: 'Your plan, appearance, account & support',
              gradient: isDark ? AppColors.darkPurpleTealGradient : AppColors.lightPurpleTealGradient,
            ),
            Expanded(
              child: PlayfulBackground(
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    Card(
                      child: SwitchListTile(
                        title: const Text('Dark Mode'),
                        secondary: ColorfulIcon(
                          isDark ? Icons.nightlight_round : Icons.wb_sunny,
                          mood: IconMood.amber,
                          boxSize: 36,
                        ),
                        value: isDark,
                        onChanged: (_) => ref.read(themeModeProvider.notifier).toggle(),
                      ),
                    ),
                    const SizedBox(height: 20),

                    _SectionLabel('Personal Plan'),
                    _SettingsGroup(children: [
                      _SettingsRow(
                        icon: Icons.badge_outlined,
                        mood: IconMood.teal,
                        title: 'Native Language',
                        value: _languageName(onboarding.nativeLanguage),
                      ),
                      _SettingsRow(
                        icon: Icons.public_rounded,
                        mood: IconMood.sky,
                        title: 'Learning Language',
                        value: _languageName(onboarding.targetLanguage),
                        showChevron: true,
                        onTap: () => _pickLanguage(context, ref),
                      ),
                      _SettingsRow(
                        icon: Icons.bar_chart_rounded,
                        mood: IconMood.purple,
                        title: 'Language Level',
                        value: _levelTitle(onboarding.level),
                        showChevron: true,
                        onTap: () => _pickLevel(context, ref),
                      ),
                      _SettingsRow(
                        icon: Icons.track_changes_rounded,
                        mood: IconMood.amber,
                        title: 'Motivation',
                        value: motivationLabel,
                      ),
                      _SettingsRow(
                        icon: Icons.outlined_flag_rounded,
                        mood: IconMood.mint,
                        title: 'Topics',
                        value: topicsLabel,
                      ),
                    ]),
                    const SizedBox(height: 20),

                    _SectionLabel('Support & feedback'),
                    _SettingsGroup(children: [
                      _SettingsRow(
                        icon: Icons.mail_outline_rounded,
                        mood: IconMood.sky,
                        title: 'Support Email',
                        showChevron: true,
                        onTap: () => _openUrl(context, 'mailto:$_kSupportEmail'),
                      ),
                      _SettingsRow(
                        icon: Icons.forum_outlined,
                        mood: IconMood.purple,
                        title: 'Join Discord',
                        showChevron: true,
                        onTap: () => _openUrl(context, _kDiscordInviteUrl),
                      ),
                      _SettingsRow(
                        icon: Icons.thumb_up_alt_outlined,
                        mood: IconMood.teal,
                        title: 'Creator Program',
                        showChevron: true,
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(builder: (_) => const CreatorProgramScreen()),
                        ),
                      ),
                    ]),
                    const SizedBox(height: 20),

                    _SectionLabel('Legal'),
                    _SettingsGroup(children: [
                      _SettingsRow(
                        icon: Icons.article_outlined,
                        mood: IconMood.teal,
                        title: 'Terms of Service',
                        showChevron: true,
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(builder: (_) => const TermsOfServiceScreen()),
                        ),
                      ),
                      _SettingsRow(
                        icon: Icons.info_outline_rounded,
                        mood: IconMood.sky,
                        title: 'Privacy Policy',
                        showChevron: true,
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(builder: (_) => const PrivacyPolicyScreen()),
                        ),
                      ),
                    ]),
                    const SizedBox(height: 20),

                    _SectionLabel('About'),
                    _SettingsGroup(children: [
                      _SettingsRow(
                        icon: Icons.info_outline,
                        mood: IconMood.cyan,
                        title: 'Credits',
                        value: 'Data sources & licenses',
                        showChevron: true,
                        onTap: () => showDialog(
                          context: context,
                          builder: (dialogContext) => AlertDialog(
                            title: const Text('Credits'),
                            content: const Text(
                              'Some example sentences and audio in this app are sourced from an open, '
                              'community-contributed multilingual sentence database and used under '
                              'Creative Commons licenses (CC BY 2.0 FR / CC0 1.0).',
                            ),
                            actions: [
                              TextButton(
                                  onPressed: () => Navigator.of(dialogContext).pop(), child: const Text('Close')),
                            ],
                          ),
                        ),
                      ),
                    ]),
                    const SizedBox(height: 20),

                    _SectionLabel('Account'),
                    _SettingsGroup(children: [
                      _SettingsRow(
                        icon: Icons.logout_rounded,
                        mood: IconMood.amber,
                        title: 'Log Out',
                        danger: true,
                        showChevron: true,
                        onTap: () async {
                          await ref.read(authRepositoryProvider).logOut();
                          if (context.mounted) context.go('/auth');
                        },
                      ),
                    ]),
                    const SizedBox(height: 20),

                    _SectionLabel('Danger Zone'),
                    _SettingsGroup(children: [
                      _SettingsRow(
                        icon: Icons.person_remove_outlined,
                        mood: IconMood.amber,
                        title: 'Delete Account',
                        danger: true,
                        showChevron: true,
                        onTap: () => _confirmDeleteAccount(context, ref),
                      ),
                    ]),
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

/// Plain caption above a settings group, e.g. "Personal Plan" - matches the
/// section labels in the reference design.
class _SectionLabel extends StatelessWidget {
  final String text;
  const _SectionLabel(this.text);

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 0, 4, 8),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w700,
          color: isDark ? AppColors.darkTextSoft : AppColors.lightTextSoft,
        ),
      ),
    );
  }
}

/// One rounded card holding several rows with thin dividers between them -
/// matches the reference design's grouped sections (rather than one Card
/// per row).
class _SettingsGroup extends StatelessWidget {
  final List<Widget> children;
  const _SettingsGroup({required this.children});

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.antiAlias,
      margin: EdgeInsets.zero,
      child: Column(
        children: [
          for (var i = 0; i < children.length; i++) ...[
            children[i],
            if (i != children.length - 1) const Divider(height: 1),
          ],
        ],
      ),
    );
  }
}

/// One row inside a [_SettingsGroup] - a tinted leading icon, a title, an
/// optional right-aligned value, and an optional chevron for rows that are
/// tappable (edit a setting, open a link, navigate somewhere).
class _SettingsRow extends StatelessWidget {
  final IconData icon;
  final IconMood mood;
  final String title;
  final String? value;
  final bool showChevron;
  final Color? titleColor;
  final bool danger;
  final VoidCallback? onTap;

  const _SettingsRow({
    required this.icon,
    required this.mood,
    required this.title,
    this.value,
    this.showChevron = false,
    this.titleColor,
    this.danger = false,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final resolvedTitleColor = danger ? AppColors.danger : titleColor;
    return ListTile(
      leading: danger
          ? Icon(icon, color: AppColors.danger, size: 22)
          : ColorfulIcon(icon, mood: mood, boxSize: 34, size: 17),
      title: Text(title, style: resolvedTitleColor != null ? TextStyle(color: resolvedTitleColor) : null),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (value != null)
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 150),
              child: Text(
                value!,
                textAlign: TextAlign.end,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 13.5,
                  color: isDark ? AppColors.darkTextSoft : AppColors.lightTextSoft,
                ),
              ),
            ),
          if (showChevron) ...[
            const SizedBox(width: 2),
            Icon(Icons.chevron_right_rounded, size: 20, color: isDark ? AppColors.darkTextSoft : AppColors.lightTextSoft),
          ],
        ],
      ),
      onTap: onTap,
    );
  }
}

/// Shared bottom-sheet shell for the Learning Language / Language Level
/// pickers - a title bar with a close button, then a scrollable list.
class _PickerSheet extends StatelessWidget {
  final String title;
  final int itemCount;
  final Widget Function(BuildContext, int) itemBuilder;

  const _PickerSheet({required this.title, required this.itemCount, required this.itemBuilder});

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.only(top: 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 4, 12, 8),
              child: Row(
                children: [
                  Text(title, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
                  const Spacer(),
                  IconButton(icon: const Icon(Icons.close_rounded), onPressed: () => Navigator.of(context).pop()),
                ],
              ),
            ),
            ConstrainedBox(
              constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.6),
              child: ListView.builder(
                shrinkWrap: true,
                itemCount: itemCount,
                itemBuilder: itemBuilder,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
