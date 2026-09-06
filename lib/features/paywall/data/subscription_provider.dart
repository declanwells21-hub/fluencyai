import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../onboarding/data/profile_repository.dart';

/// Free Tier conversation allowance - see the "Free Tier Limit" rule in the
/// paywall spec. Checked against UsageStats.todaySeconds before letting a
/// new conversation turn start (see ConversationScreen._startRecording).
const kFreeTierDailySeconds = 5 * 60;

enum SubscriptionTier { free, trialing, pro }

extension SubscriptionTierX on SubscriptionTier {
  /// Whether this tier should be gated behind the paywall for
  /// premium-only surfaces (Scenarios, Grammar, Phrase Bank, Stats) and the
  /// 5-minute/day conversation cap.
  bool get isFree => this == SubscriptionTier.free;
}

SubscriptionTier tierFromStatus(String? status) {
  switch (status) {
    case 'trialing':
      return SubscriptionTier.trialing;
    case 'active':
      return SubscriptionTier.pro;
    default:
      // Covers null (no row / never subscribed), 'free', and Stripe's
      // past_due/canceled/unpaid/incomplete/incomplete_expired/paused -
      // anything that isn't an in-good-standing paid subscription is
      // treated as free-tier in the app.
      return SubscriptionTier.free;
  }
}

/// The signed-in user's current tier, read from `profiles.subscription_status`
/// (kept up to date server-side by api/stripe-webhook.js - see
/// scripts/supabase_migration_subscription.sql for the column). Free until
/// proven otherwise, so a load failure or missing row never accidentally
/// unlocks paid content.
///
/// After returning from a Stripe Checkout browser tab, call
/// `ref.invalidate(subscriptionTierProvider)` (FluencyApp does this
/// automatically on app resume - see main.dart) to pick up the new status.
final subscriptionTierProvider = FutureProvider<SubscriptionTier>((ref) async {
  final status = await ref.watch(profileRepositoryProvider).loadSubscriptionStatus();
  return tierFromStatus(status);
});
