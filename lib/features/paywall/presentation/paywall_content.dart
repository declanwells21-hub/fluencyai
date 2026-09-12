import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_theme.dart';
import '../data/checkout_repository.dart';

/// The paywall's actual content - used both full-screen (right after
/// onboarding, see PaywallScreen) and inside a bottom sheet (the "touch any
/// feature button on Free Tier" overlay, see paywall_sheet.dart). Kept as
/// one widget so both places always show the exact same offer.
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
  CheckoutPlan _selectedPlan = CheckoutPlan.weekly;
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

          // --- Tier 1: Fluency Builder (Pro) - the only active, purchasable
          // plan. Purple gradient (brand CTA color) in place of the pink
          // used in the reference mock.
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(gradient: purpleGradient, borderRadius: BorderRadius.circular(22)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration:
                      BoxDecoration(color: Colors.white.withOpacity(0.18), borderRadius: BorderRadius.circular(20)),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.auto_awesome_rounded, size: 14, color: Colors.white),
                      SizedBox(width: 6),
                      Text('3-Day Free Trial Available',
                          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 12)),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Fluency Builder',
                              style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 19)),
                          Text('PRO',
                              style: TextStyle(
                                  color: Colors.white.withOpacity(0.85),
                                  fontWeight: FontWeight.w700,
                                  fontSize: 11,
                                  letterSpacing: 0.6)),
                        ],
                      ),
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          _selectedPlan == CheckoutPlan.weekly ? '\$5.99/week' : '\$39.99/year',
                          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 17),
                        ),
                        Text(
                          _selectedPlan == CheckoutPlan.weekly ? 'or \$39.99 / year' : 'or \$5.99 / week',
                          style: TextStyle(color: Colors.white.withOpacity(0.75), fontSize: 11.5),
                        ),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                const _Bullet('Unlimited conversation minutes'),
                const _Bullet('All standard scenarios and content unlocked'),
                const _Bullet('Up to 5 logged-in devices at once'),
                const SizedBox(height: 14),

                // Plan toggle - the reference mock shows both prices but
                // doesn't specify which one "Start Free Trial" charges, so
                // this makes that explicit and lets the person choose.
                Row(
                  children: [
                    Expanded(
                      child: _PlanChip(
                        label: 'Weekly',
                        selected: _selectedPlan == CheckoutPlan.weekly,
                        onTap: () => setState(() => _selectedPlan = CheckoutPlan.weekly),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _PlanChip(
                        label: 'Yearly · best value',
                        selected: _selectedPlan == CheckoutPlan.yearly,
                        onTap: () => setState(() => _selectedPlan = CheckoutPlan.yearly),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
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
                        ? SizedBox(
                            height: 18,
                            width: 18,
                            child: CircularProgressIndicator(strokeWidth: 2, color: purple),
                          )
                        : const Text('Start Free Trial — Requires Card',
                            style: TextStyle(fontWeight: FontWeight.w800)),
                  ),
                ),
              ],
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
