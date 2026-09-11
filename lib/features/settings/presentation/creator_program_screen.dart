import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

const _creatorsUrl = 'https://fluencyai.app/creators#apply';

class _LoopStep {
  const _LoopStep(this.number, this.title, this.body);
  final String number;
  final String title;
  final String body;
}

class _Faq {
  const _Faq(this.question, this.answer);
  final String question;
  final String answer;
}

/// Explains the Fluency Creator Program using the exact copy from
/// site/creators.html's pitch, "who we're looking for", "how it works",
/// and FAQ sections. The actual application form lives on the site (it
/// posts to /api/referral), so this screen ends with a button that takes
/// the user there to register, rather than duplicating the form here.
class CreatorProgramScreen extends StatelessWidget {
  const CreatorProgramScreen({super.key});

  static const _chips = [
    'German-learning TikTok',
    'Language-learning YouTube',
    'StudyTok',
    'AI-tool creators',
    'Students',
    'Polyglot creators',
    '"Learning German" Instagram pages',
    'People documenting their language-learning journey',
    'Small creators looking for affiliate opportunities',
  ];

  static const _loop = [
    _LoopStep('1', 'You see Fluency', 'You try the app, like it, and apply to the Creator Program.'),
    _LoopStep('2', 'You make a video', 'Real content — a lesson, a reaction, a "how I actually learned" story. Your link is in the caption or bio.'),
    _LoopStep('3', 'A viewer downloads Fluency', 'They click your link, land on fluencyai.app already tagged as yours, and download the app.'),
    _LoopStep('4', 'They subscribe', 'Once they upgrade to a paid plan, that subscription is attributed straight back to your code — automatically.'),
    _LoopStep('5', 'You earn commission', "No invoices, no chasing payment — it's tracked the moment they subscribe."),
    _LoopStep('6', 'You make more content', 'And the loop turns again — for you, and for every other creator in the program.'),
  ];

  static const _faqs = [
    _Faq(
      'How much commission do I earn?',
      '20% of what each subscriber you refer pays, for as long as they stay subscribed. Exact terms are confirmed when your application is approved.',
    ),
    _Faq(
      'Do I need a certain number of followers?',
      'No. A creator with 3,000 highly engaged language-learning followers is often more valuable than one with 100,000 unrelated ones. We look at content quality and audience fit, not follower count.',
    ),
    _Faq(
      'How do I get my referral link?',
      'Apply below. Once approved, you get a unique code and link (fluencyai.app/?ref=yourcode) that attributes every signup and subscription to you automatically.',
    ),
    _Faq(
      'When and how do I get paid?',
      'Commission is tracked automatically as your referrals subscribe. Payout schedule and method are confirmed when your application is approved.',
    ),
    _Faq(
      'Can I promote Fluency on more than one platform?',
      'Yes. Your referral link works the same wherever you share it — TikTok, YouTube, Instagram, Shorts, or anywhere else your audience is.',
    ),
  ];

  Future<void> _continueToSite(BuildContext context) async {
    final ok = await launchUrl(Uri.parse(_creatorsUrl), mode: LaunchMode.externalApplication);
    if (!ok && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not open the browser to continue.')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final textTheme = theme.textTheme;
    final bodyStyle = textTheme.bodyMedium!.copyWith(height: 1.5);

    return Scaffold(
      appBar: AppBar(title: const Text('Creator Program')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
          children: [
            Text(
              'Make content. Share your link.\nGet paid when people subscribe.',
              style: textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800, height: 1.15),
            ),
            const SizedBox(height: 14),
            Text(
              "You're already making language-learning content. The Fluency Creator Program pays you a commission every time someone finds Fluency AI through you and subscribes — no upfront deals, no minimum follower count.",
              style: bodyStyle,
            ),
            const SizedBox(height: 28),

            // ---- The pitch ----
            Text('The pitch', style: _eyebrow(theme)),
            const SizedBox(height: 8),
            Text(
              "We don't care about your follower count. We care whether your audience is actually learning a language.",
              style: textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: theme.colorScheme.primary.withOpacity(0.08),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: theme.colorScheme.primary.withOpacity(0.18)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text.rich(
                    TextSpan(
                      style: textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600, height: 1.4),
                      children: [
                        const TextSpan(text: 'A creator with '),
                        TextSpan(text: '3,000 followers', style: TextStyle(color: theme.colorScheme.primary)),
                        const TextSpan(text: ' making genuinely useful German-learning videos is worth more to us than one with '),
                        TextSpan(text: '100,000 followers', style: TextStyle(color: theme.colorScheme.primary)),
                        const TextSpan(text: ' who happen to be watching for something else entirely.'),
                      ],
                    ),
                  ),
                  const SizedBox(height: 10),
                  Text("That's the whole filter. Relevance beats reach.", style: textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600)),
                ],
              ),
            ),
            const SizedBox(height: 28),

            // ---- Who we're looking for ----
            Text("Who we're looking for", style: _eyebrow(theme)),
            const SizedBox(height: 8),
            Text(
              "If your audience is trying to learn a language, we want to hear from you.",
              style: textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            Text(
              "We're recruiting across every platform and every niche that touches language learning — big or small, as long as the content is real.",
              style: bodyStyle,
            ),
            const SizedBox(height: 14),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: _chips
                  .map((c) => Chip(
                        label: Text(c),
                        avatar: const Icon(Icons.check, size: 16),
                        backgroundColor: theme.colorScheme.surfaceContainerHighest,
                      ))
                  .toList(),
            ),
            const SizedBox(height: 28),

            // ---- How it works ----
            Text('How it works', style: _eyebrow(theme)),
            const SizedBox(height: 8),
            Text('One loop, and it keeps turning.', style: textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            Text(
              'Every creator we bring in becomes part of the same cycle — the more it turns, the more everyone in it earns.',
              style: bodyStyle,
            ),
            const SizedBox(height: 14),
            for (final step in _loop)
              Padding(
                padding: const EdgeInsets.only(bottom: 14),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 28,
                      height: 28,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(color: theme.colorScheme.primary, shape: BoxShape.circle),
                      child: Text(step.number, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 12)),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(step.title, style: textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w700)),
                          const SizedBox(height: 2),
                          Text(step.body, style: bodyStyle),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                border: Border.all(color: theme.dividerColor),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Text(
                'This is more scalable than paying upfront for ads — we only pay out once a creator has actually brought in a paying user. The best-performing creator videos often go on to become our paid ads too, so great content gets a second life.',
                style: bodyStyle,
              ),
            ),
            const SizedBox(height: 28),

            // ---- FAQ ----
            Text('FAQ', style: _eyebrow(theme)),
            const SizedBox(height: 8),
            Text('Questions creators actually ask.', style: textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            for (final faq in _faqs)
              Theme(
                data: theme.copyWith(dividerColor: Colors.transparent),
                child: ExpansionTile(
                  tilePadding: EdgeInsets.zero,
                  title: Text(faq.question, style: textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w700)),
                  childrenPadding: const EdgeInsets.only(bottom: 12),
                  expandedAlignment: Alignment.centerLeft,
                  children: [Text(faq.answer, style: bodyStyle)],
                ),
              ),
            const SizedBox(height: 20),

            // ---- CTA ----
            FilledButton.icon(
              onPressed: () => _continueToSite(context),
              icon: const Icon(Icons.open_in_new_rounded),
              label: const Text('Continue to site to register'),
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
            ),
            const SizedBox(height: 10),
            Text(
              'Applications are submitted on fluencyai.app — takes about two minutes.',
              textAlign: TextAlign.center,
              style: textTheme.bodySmall?.copyWith(color: textTheme.bodySmall?.color?.withOpacity(0.7)),
            ),
          ],
        ),
      ),
    );
  }

  TextStyle? _eyebrow(ThemeData theme) => theme.textTheme.labelSmall?.copyWith(
        color: theme.colorScheme.primary,
        fontWeight: FontWeight.w800,
        letterSpacing: 1.2,
      );
}
