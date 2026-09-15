import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/config/env.dart';

enum CheckoutPlan { founding, weekly, yearly }

/// Starts a Stripe Checkout Session and opens it in the browser - Stripe's
/// hosted checkout page handles the actual card entry, so no payment
/// details ever pass through this app.
///
/// `CheckoutPlan.founding` is a one-time lifetime payment (currently the
/// only option shown in the paywall). `weekly`/`yearly` are the original
/// recurring-subscription-with-3-day-trial flow - fully working below,
/// just not currently surfaced in the UI (see
/// lib/features/paywall/presentation/paywall_content.dart's
/// kShowSubscriptionPricing flag to bring it back). See
/// api/create-checkout-session.js for the server side of this call
/// (requires Stripe keys to be configured - see that file's header
/// comment).
abstract class CheckoutRepository {
  /// Returns false (never throws) if checkout couldn't be started - e.g.
  /// the proxy isn't signed in, or Stripe isn't configured yet - so the UI
  /// can show a clear message instead of silently doing nothing.
  Future<bool> startProTrial(CheckoutPlan plan);
}

class ProxyCheckoutRepository implements CheckoutRepository {
  final String baseUrl;
  ProxyCheckoutRepository({this.baseUrl = Env.proxyBaseUrl});

  @override
  Future<bool> startProTrial(CheckoutPlan plan) async {
    final user = Supabase.instance.client.auth.currentUser;
    if (user == null) return false;

    try {
      final res = await http.post(
        Uri.parse('$baseUrl/create-checkout-session'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'plan': plan.name, // 'founding' | 'weekly' | 'yearly'
          'userId': user.id,
          'email': user.email,
        }),
      );
      if (res.statusCode != 200) return false;

      final data = jsonDecode(res.body) as Map<String, dynamic>;
      final url = data['url'] as String?;
      if (url == null) return false;

      return await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    } catch (_) {
      return false;
    }
  }
}

final checkoutRepositoryProvider = Provider<CheckoutRepository>((ref) => ProxyCheckoutRepository());
