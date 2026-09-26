import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_theme.dart';
import '../data/checkout_repository.dart';

/// The paywall's actual content - used both full-screen (right after
/// onboarding, see PaywallScreen) and inside a bottom sheet (the "touch any
/// feature button on Free Tier" overlay, see paywall_sheet.dart). Kept as
/// one widget so both places always show the exact same offer.
///
/// Shows all three real plans together - the $40 founding one-time offer,
/// and the $5.66/week or $39.99/year subscription (each with a 3-day free
/// trial) - as one card with a plan switcher, rather than picking just one
/// to show. The server side (api/create-checkout-session.js,
/// api/stripe-webhook.js) already fully supports all three; this is the
/// only file that changed to surface them together.

class PaywallContent extends ConsumerStatefulWidget {
  /// Called when the person closes the paywall without upgrading (X button
  /// or "Continue exploring on Free Tier"). The caller decides what that
  /// means - pop a route, dismiss a sheet, etc.
  final VoidCallback onContinueFree;
  final bool showCloseButton;

  const PaywallContent({super.key, required this.onContinueFree, this.showCloseButton = true});

  @override
  ConsumerState<PaywallContent> createState() => _PaywallContentState();
}

class _PaywallContentState extends ConsumerState<PaywallContent> {
  CheckoutPlan _selectedPlan = CheckoutPlan.founding;
  bool _startingCheckout = false;

  Future<void> _startTrial() async {
    setState(() => _startingCheckout = true);
    final ok = await ref.read(checkoutRepositoryProvider).startProTrial(_selectedPlan);
    if (!mounted) return;
    setState(() => _startingCheckout = false);
    if (!ok) {
      showDialog(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text("Checkout isn't available yet"),
          content: const Text(
            "We couldn't start checkout - payments may not be fully configured yet, or you're offline. "
            'Please try again in a moment.',
          ),
          actions: [TextButton(onPressed: () => Navigator.of(dialogContext).pop(), child: const Text('OK'))],
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final purpleGradient = isDark ? AppColors.darkCtaGradient : AppColors.lightCtaGradient;
    final purple = isDark ? AppColors.darkPurple : AppColors.lightPurple;
    final textColor = isDark ? AppColors.darkText : AppColors.lightText;
    final softColor = isDark ? AppColors.darkTextSoft : AppColors.lightTextSoft;

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text('Unlock Full Fluency',
                    style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: textColor)),
              ),
              if (widget.showCloseButton)
                InkWell(
                  onTap: widget.onContinueFree,
                  borderRadius: BorderRadius.circular(20),
                  child: Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(color: purple.withOpacity(0.12), shape: BoxShape.circle),
                    child: Icon(Icons.close_rounded, size: 18, color: purple),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            'Your Free Tier includes 5 minutes of conversation per day. Upgrade for unlimited practice.',
            style: TextStyle(fontSize: 14, color: softColor, height: 1.4),
          ),
          const SizedBox(height: 20),

          // --- Tier 1: the one real, purchasable offer, now shown as a
          // single card with a 3-way switcher (founding/weekly/yearly)
          // rather than three separate cards, so the layout stays as
          // compact as the old either/or version did.
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(gradient: purpleGradient, borderRadius: BorderRadius.circular(22)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: _planCardChildren(purple),
            ),
          ),
          const SizedBox(height: 16),

          // --- Tier 2 & 3: inactive placeholders, no logic - purely
          // informational "coming soon" cards.
          const _InactiveTierCard(title: 'Team Mastery'),
          const SizedBox(height: 12),
          const _InactiveTierCard(title: 'Exam Prep Suite'),
          const SizedBox(height: 16),

          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                side: BorderSide(color: purple.withOpacity(0.4)),
              ),
              onPressed: widget.onContinueFree,
              child: Text('Continue exploring on Free Tier',
                  style: TextStyle(color: purple, fontWeight: FontWeight.w700)),
            ),
          ),
        ],
      ),
    );
  }

  /// The one pricing card, switching between all three real plans -
  /// founding ($40 one-time), weekly ($5.66, 3-day trial), and yearly
  /// ($39.99, 3-day trial) - via the chip row at the top. Copy for each
  /// plan matches the site's own pricing section wording, so the message
  /// is consistent wherever someone sees it.
  List<Widget> _planCardChildren(Color purple) {
    final isFounding = _selectedPlan == CheckoutPlan.founding;
    final isWeekly = _selectedPlan == CheckoutPlan.weekly;

    return [
      // Plan switcher - three options rather than the old founding-only /
      // weekly-or-yearly toggle, so all three are visible and pickable at
      // once instead of one being hidden behind a flag.
      Row(
        children: [
          Expanded(
            child: _PlanChip(
              label: 'Founding · \$40 once',
              selected: isFounding,
              onTap: () => setState(() => _selectedPlan = CheckoutPlan.founding),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: _PlanChip(
              label: 'Weekly',
              selected: isWeekly,
              onTap: () => setState(() => _selectedPlan = CheckoutPlan.weekly),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: _PlanChip(
              label: 'Yearly',
              selected: _selectedPlan == CheckoutPlan.yearly,
              onTap: () => setState(() => _selectedPlan = CheckoutPlan.yearly),
            ),
          ),
        ],
      ),
      const SizedBox(height: 16),
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(color: Colors.white.withOpacity(0.18), borderRadius: BorderRadius.circular(20)),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.auto_awesome_rounded, size: 14, color: Colors.white),
            const SizedBox(width: 6),
            Text(
              isFounding ? 'Founding user price' : '3-Day Free Trial Available',
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 12),
            ),
          ],
        ),
      ),
      const SizedBox(height: 16),
      if (isFounding)
        Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            const Text('\$40', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 40, height: 1)),
            const SizedBox(width: 8),
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Text('once — not a year',
                  style: TextStyle(color: Colors.white.withOpacity(0.9), fontWeight: FontWeight.w600, fontSize: 13)),
            ),
          ],
        )
      else
        Text(
          isWeekly ? '\$5.66/week' : '\$39.99/year',
          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 28),
        ),
      const SizedBox(height: 6),
      Text(
        isFounding
            ? 'Everyone who joins before launch keeps lifetime access at this price. Afterwards Fluency AI becomes a yearly subscription, and founding accounts are never moved onto it.'
            : 'Try it free for 3 days, then \$${isWeekly ? '5.66 every week' : '39.99 every year'}. Cancel any time before the trial ends and you will not be charged.',
        style: TextStyle(color: Colors.white.withOpacity(0.85), fontSize: 12.5, height: 1.4),
      ),
      const SizedBox(height: 14),
      if (isFounding) ...[
        const _Bullet('Unlimited spoken conversation, for life'),
        const _Bullet('All forty languages, switch any time'),
        const _Bullet('Corrections, pronunciation breakdowns, mistake memory'),
        const _Bullet('Delete any recording, any time'),
      ] else ...[
        const _Bullet('Unlimited conversation minutes'),
        const _Bullet('All standard scenarios and content unlocked'),
        const _Bullet('Up to 5 logged-in devices at once'),
      ],
      const SizedBox(height: 16),
      SizedBox(
        width: double.infinity,
        child: FilledButton(
          style: FilledButton.styleFrom(
            backgroundColor: Colors.white,
            foregroundColor: purple,
            padding: const EdgeInsets.symmetric(vertical: 14),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          ),
          onPressed: _startingCheckout ? null : _startTrial,
          child: _startingCheckout
              ? SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2, color: purple))
              : Text(isFounding ? 'Create your account' : 'Start Free Trial — Requires Card',
                  style: const TextStyle(fontWeight: FontWeight.w800)),
        ),
      ),
      if (isFounding) ...[
        const SizedBox(height: 8),
        Text(
          'Register, download the app, speak your first sentence free. Pay the \$40 once, only when you decide to stay.',
          textAlign: TextAlign.center,
          style: TextStyle(color: Colors.white.withOpacity(0.75), fontSize: 11.5),
        ),
      ],
    ];
  }
}

class _Bullet extends StatelessWidget {
  final String text;
  const _Bullet(this.text);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.only(top: 6, right: 8),
            child: Icon(Icons.circle, size: 5, color: Colors.white),
          ),
          Expanded(child: Text(text, style: const TextStyle(color: Colors.white, fontSize: 13.5, height: 1.3))),
        ],
      ),
    );
  }
}

class _PlanChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _PlanChip({required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 8),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: selected ? Colors.white.withOpacity(0.22) : Colors.white.withOpacity(0.08),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: Colors.white.withOpacity(selected ? 0.6 : 0.2)),
        ),
        child: Text(label,
            style:
                TextStyle(color: Colors.white, fontSize: 12, fontWeight: selected ? FontWeight.w800 : FontWeight.w500)),
      ),
    );
  }
}

/// Tier 2 / Tier 3 placeholder card - greyed out, no onTap, "COMING SOON"
/// tag only, no description. Uses the app's own purple-tinted surface
/// instead of the reference mock's light blue, so it still reads as part
/// of the same brand palette.
class _InactiveTierCard extends StatelessWidget {
  final String title;
  const _InactiveTierCard({required this.title});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final purple = isDark ? AppColors.darkPurple : AppColors.lightPurple;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: purple.withOpacity(isDark ? 0.12 : 0.08),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: purple.withOpacity(0.25)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(title,
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: purple.withOpacity(0.75))),
          ),
          Text('COMING SOON',
              style: TextStyle(
                  fontSize: 10.5, fontWeight: FontWeight.w800, letterSpacing: 0.4, color: purple.withOpacity(0.6))),
        ],
      ),
    );
  }
}
