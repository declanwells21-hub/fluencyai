import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

/// One clickable or plain run of text within a paragraph.
class TextRun {
  const TextRun.text(this.text) : mailto = null, onTap = null;
  const TextRun.mail(this.text, String email) : mailto = email, onTap = null;
  const TextRun.link(this.text, VoidCallback this.onTap) : mailto = null;

  final String text;
  final String? mailto;
  final VoidCallback? onTap;
}

class LegalSection {
  const LegalSection(this.heading, this.paragraphs, {this.bullets});
  final String heading;
  final List<List<TextRun>> paragraphs;
  final List<List<TextRun>>? bullets;
}

/// Renders a title, a "Last updated" line, and a list of sections - built
/// to render the exact same wording as the matching page on the site
/// (site/terms.html, site/privacy.html), just as native Flutter widgets
/// instead of a webview, so it works identically on mobile and web.
class LegalContentScreen extends StatelessWidget {
  const LegalContentScreen({
    super.key,
    required this.title,
    required this.updated,
    required this.sections,
  });

  final String title;
  final String updated;
  final List<LegalSection> sections;

  Future<void> _openMail(BuildContext context, String email) async {
    final uri = Uri(scheme: 'mailto', path: email);
    final ok = await launchUrl(uri);
    if (!ok && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Could not open your email app. Email us at $email')));
    }
  }

  Widget _richParagraph(BuildContext context, List<TextRun> runs, TextStyle base) {
    final linkStyle = base.copyWith(color: Theme.of(context).colorScheme.primary, decoration: TextDecoration.underline);
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Text.rich(
        TextSpan(
          children: runs.map((run) {
            if (run.mailto != null) {
              return TextSpan(
                text: run.text,
                style: linkStyle,
                recognizer: TapGestureRecognizer()..onTap = () => _openMail(context, run.mailto!),
              );
            }
            if (run.onTap != null) {
              return TextSpan(text: run.text, style: linkStyle, recognizer: TapGestureRecognizer()..onTap = run.onTap);
            }
            return TextSpan(text: run.text, style: base);
          }).toList(),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final bodyStyle = textTheme.bodyMedium!.copyWith(height: 1.5);

    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
          children: [
            Text(title, style: textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            Text(updated, style: textTheme.bodySmall?.copyWith(color: textTheme.bodySmall?.color?.withOpacity(0.6))),
            const SizedBox(height: 24),
            for (final section in sections) ...[
              Text(section.heading, style: textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              for (final p in section.paragraphs) _richParagraph(context, p, bodyStyle),
              if (section.bullets != null)
                Padding(
                  padding: const EdgeInsets.only(left: 4, bottom: 6),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      for (final b in section.bullets!)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('•  ', style: bodyStyle),
                              Expanded(child: _richParagraphInline(context, b, bodyStyle)),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
              const SizedBox(height: 20),
            ],
          ],
        ),
      ),
    );
  }

  Widget _richParagraphInline(BuildContext context, List<TextRun> runs, TextStyle base) {
    final linkStyle = base.copyWith(color: Theme.of(context).colorScheme.primary, decoration: TextDecoration.underline);
    return Text.rich(
      TextSpan(
        children: runs.map((run) {
          if (run.mailto != null) {
            return TextSpan(
              text: run.text,
              style: linkStyle,
              recognizer: TapGestureRecognizer()..onTap = () => _openMail(context, run.mailto!),
            );
          }
          if (run.onTap != null) {
            return TextSpan(text: run.text, style: linkStyle, recognizer: TapGestureRecognizer()..onTap = run.onTap);
          }
          return TextSpan(text: run.text, style: base);
        }).toList(),
      ),
    );
  }
}

const _supportEmail = 'fluencyai.support@gmail.com';

/// Exact text copy of site/terms.html.
class TermsOfServiceScreen extends StatelessWidget {
  const TermsOfServiceScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return LegalContentScreen(
      title: 'Terms of Service',
      updated: 'Last updated: September 9, 2026',
      sections: [
        const LegalSection('1. Agreement', [
          [
            TextRun.text(
              'By creating an account or using Fluency AI (the "App"), you agree to these Terms of Service. Fluency AI is operated by an individual developer, referred to here as "we" or "us". If you don\'t agree, please don\'t use the App.',
            ),
          ],
        ]),
        const LegalSection('2. What Fluency AI is', [
          [
            TextRun.text(
              'Fluency AI lets you have spoken conversations with an AI tutor that transcribes your speech, replies to you, corrects your mistakes, and speaks its reply back to you, in order to help you practice a language.',
            ),
          ],
        ]),
        const LegalSection('3. Eligibility', [
          [
            TextRun.text(
              "You must be at least 13 years old to use Fluency AI. If you're under 18, you should have a parent or guardian's permission.",
            ),
          ],
        ]),
        LegalSection('4. Your account', [
          [
            const TextRun.text("You're responsible for keeping your login credentials secure and for anything that happens under your account. Let us know at "),
            const TextRun.mail(_supportEmail, _supportEmail),
            const TextRun.text(' if you suspect unauthorized access.'),
          ],
        ]),
        const LegalSection(
          '5. Subscriptions, trial, and billing',
          [],
          bullets: [
            [TextRun.text('Fluency AI offers a 3-day free trial, after which a paid subscription begins automatically (currently \$5.99/week or \$39.99/year).')],
            [TextRun.text('A payment method is required to start the trial. You will not be charged until the trial ends, unless you cancel first.')],
            [TextRun.text("Subscriptions renew automatically until cancelled. You can cancel any time from inside the app; cancelling stops future renewals but doesn't refund the current billing period unless required by law.")],
            [TextRun.text("We don't store your full card details ourselves — payment is handled by a secure third-party payment processor.")],
          ],
        ),
        const LegalSection('6. Acceptable use', [
          [
            TextRun.text(
              "Please don't use Fluency AI to: break the law; harass, abuse, or harm others; attempt to reverse-engineer, scrape, or disrupt the service; or use the App to generate content that is illegal, hateful, or exploitative.",
            ),
          ],
        ]),
        const LegalSection('7. AI-generated content', [
          [
            TextRun.text(
              'Corrections, translations, and replies are generated using AI models and speech technology, and may occasionally be inaccurate or inappropriate. Fluency AI is a practice tool, not a certified translator, teacher, or source of professional advice — use your own judgment, especially for anything important.',
            ),
          ],
        ]),
        LegalSection('8. Your content', [
          [
            const TextRun.text(
              "You keep ownership of the voice recordings and messages you create. You can delete any conversation at any time, which also removes it from the AI's memory of your mistakes. By using the App, you allow us to process your recordings and transcripts (including sending them to the third-party providers listed in our ",
            ),
            TextRun.link('Privacy Policy', () {
              Navigator.of(context).push(MaterialPageRoute(builder: (_) => const PrivacyPolicyScreen()));
            }),
            const TextRun.text(') solely to provide the service to you.'),
          ],
        ]),
        const LegalSection('9. Intellectual property', [
          [
            TextRun.text(
              'The Fluency AI app, branding, and design are owned by us. You may not copy, resell, or redistribute the App or its content without permission.',
            ),
          ],
        ]),
        const LegalSection('10. Termination', [
          [
            TextRun.text(
              'You can stop using Fluency AI and delete your account at any time. We may suspend or terminate accounts that violate these terms.',
            ),
          ],
        ]),
        const LegalSection('11. Disclaimers and limitation of liability', [
          [
            TextRun.text(
              'Fluency AI is provided "as is," without warranties of any kind. To the fullest extent permitted by law, we are not liable for indirect, incidental, or consequential damages arising from your use of the App, including reliance on AI-generated corrections or translations.',
            ),
          ],
        ]),
        const LegalSection('12. Changes to these terms', [
          [
            TextRun.text(
              "We may update these terms from time to time. If we make material changes, we'll update the date at the top of this page. Continuing to use the App after a change means you accept the new terms.",
            ),
          ],
        ]),
        const LegalSection('13. Contact', [
          [
            TextRun.text('Questions about these terms: '),
            TextRun.mail(_supportEmail, _supportEmail),
            TextRun.text('.'),
          ],
        ]),
      ],
    );
  }
}

/// Exact text copy of site/privacy.html.
class PrivacyPolicyScreen extends StatelessWidget {
  const PrivacyPolicyScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return LegalContentScreen(
      title: 'Privacy Policy',
      updated: 'Last updated: September 9, 2026',
      sections: [
        const LegalSection('Who we are', [
          [
            TextRun.text('Fluency AI is developed and operated by an individual developer. If you have questions about this policy or your data, contact '),
            TextRun.mail(_supportEmail, _supportEmail),
            TextRun.text('.'),
          ],
        ]),
        const LegalSection(
          'What we collect',
          [],
          bullets: [
            [TextRun.text('Account information — your email address and password, and any onboarding details you provide (target language, tutor/accent choice, proficiency level).')],
            [TextRun.text("Voice recordings and transcripts — audio you record during a conversation, the text transcribed from it, and the AI's replies and corrections.")],
            [TextRun.text('Usage and activity data — things like time spent speaking, features used, and mistake patterns, so the app can track your progress.')],
            [TextRun.text('Payment information — if you subscribe, our payment processor handles your card details directly. We never see or store your full card number.')],
            [TextRun.text('Device and technical data — basic information like IP address and device/browser type, collected automatically for security and debugging.')],
          ],
        ),
        const LegalSection(
          'How we use it',
          [],
          bullets: [
            [TextRun.text('To run the core product: turning your speech into text, generating a spoken reply and correction, and speaking it back to you.')],
            [TextRun.text("To track your progress and personalize future conversations around mistakes you've made before.")],
            [TextRun.text('To process subscription payments and manage your trial/billing.')],
            [TextRun.text('To keep the app secure, debug issues, and improve the product over time.')],
          ],
        ),
        const LegalSection('Who we share it with', [
          [
            TextRun.text(
              'We use a small number of trusted third-party service providers to help operate Fluency AI — for example, to host our app and database, transcribe and generate spoken conversation, and process subscription payments. Each provider only receives the data it needs to perform its specific function, and each is bound by its own privacy and security practices.',
            ),
          ],
          [
            TextRun.text(
              'We do not sell your personal data to third parties, and we do not share your recordings or transcripts with anyone for advertising purposes.',
            ),
          ],
        ]),
        LegalSection('How long we keep it, and your control over it', [
          [
            const TextRun.text(
              "You can delete any individual conversation or recording from inside the app at any time — doing so removes it from our systems and from the context the AI uses to remember your mistakes. If you'd like your entire account and all associated data deleted, email ",
            ),
            const TextRun.mail(_supportEmail, _supportEmail),
            const TextRun.text(" and we'll process the request."),
          ],
        ]),
        const LegalSection('Children\'s privacy', [
          [
            TextRun.text(
              'Fluency AI is not directed at children under 13, and we do not knowingly collect personal information from them. If you believe a child has provided us with personal data, contact us and we\'ll remove it.',
            ),
          ],
        ]),
        LegalSection('Your rights', [
          [
            const TextRun.text('Depending on where you live, you may have the right to access, correct, export, or delete your personal data, or to object to certain processing. To exercise any of these, email '),
            const TextRun.mail(_supportEmail, _supportEmail),
            const TextRun.text('.'),
          ],
        ]),
        const LegalSection('Security', [
          [
            TextRun.text(
              "We rely on our providers' industry-standard security practices (encryption in transit, access controls) to protect your data. No method of transmission or storage is 100% secure, and we can't guarantee absolute security.",
            ),
          ],
        ]),
        const LegalSection('Changes to this policy', [
          [
            TextRun.text(
              "If this policy changes materially, we'll update the date at the top of this page. Continued use of Fluency AI after a change means you accept the updated policy.",
            ),
          ],
        ]),
        LegalSection('Contact', [
          [
            const TextRun.text('Questions, requests, or concerns about your data: '),
            const TextRun.mail(_supportEmail, _supportEmail),
            const TextRun.text('.'),
          ],
        ]),
      ],
    );
  }
}
