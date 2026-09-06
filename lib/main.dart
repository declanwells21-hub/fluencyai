import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';
import 'core/theme/theme_provider.dart';
import 'core/config/supabase_config.dart';
import 'features/paywall/data/subscription_provider.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  if (SupabaseConfig.isConfigured) {
    try {
      await Supabase.initialize(url: SupabaseConfig.url, anonKey: SupabaseConfig.anonKey)
          .timeout(const Duration(seconds: 10));
    } catch (_) {
      // Network hiccup / hang during startup (e.g. slow or blocked request
      // on first load). Don't block runApp forever - let the app launch so
      // the splash screen's own error handling can take over instead of the
      // browser being stuck on the loading indicator with no way out.
    }
  }
  // If not configured, the app still launches - the splash screen shows a
  // clear on-screen error instead of hanging, so this is safe either way.

  runApp(const ProviderScope(child: FluencyApp()));
}

class FluencyApp extends ConsumerStatefulWidget {
  const FluencyApp({super.key});

  @override
  ConsumerState<FluencyApp> createState() => _FluencyAppState();
}

class _FluencyAppState extends ConsumerState<FluencyApp> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Coming back from the Stripe Checkout browser tab (or just reopening
    // the app) is the one moment the subscription status could have
    // changed server-side without this app knowing yet - refetch it so a
    // completed purchase clears the paywall promptly instead of waiting
    // for some unrelated screen to happen to re-read it.
    if (state == AppLifecycleState.resumed) {
      ref.invalidate(subscriptionTierProvider);
    }
  }

  @override
  Widget build(BuildContext context) {
    final themeMode = ref.watch(themeModeProvider);
    return MaterialApp.router(
      title: 'FLUENCY',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: themeMode,
      routerConfig: appRouter,
    );
  }
}
