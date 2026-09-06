import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../shared/widgets/gradient_button.dart';
import '../../../shared/widgets/app_logo.dart';
import '../../../shared/widgets/playful_background.dart';
import '../../../shared/widgets/colorful_icon.dart';
import '../../../core/theme/app_theme.dart';
import '../data/supabase_auth_repository.dart';

/// Shown right after sign up. Supabase emailed a code (via Brevo) - the
/// user types it here instead of clicking a link, so there's no need for a
/// working website or deep links.
class VerifyEmailScreen extends ConsumerStatefulWidget {
  final String email;
  const VerifyEmailScreen({super.key, required this.email});

  @override
  ConsumerState<VerifyEmailScreen> createState() => _VerifyEmailScreenState();
}

class _VerifyEmailScreenState extends ConsumerState<VerifyEmailScreen> {
  final _code = TextEditingController();
  bool _loading = false;
  bool _resending = false;
  String? _error;
  String? _info;

  Future<void> _verify() async {
    if (_code.text.trim().length < 6) {
      setState(() => _error = 'Enter the code from your email.');
      return;
    }
    setState(() { _loading = true; _error = null; _info = null; });
    final repo = ref.read(authRepositoryProvider);
    final ok = await repo.verifySignUpCode(widget.email, _code.text.trim());
    setState(() => _loading = false);
    if (ok && mounted) {
      context.go('/onboarding');
    } else {
      setState(() => _error = 'That code is wrong or expired. Try again or resend a new one.');
    }
  }

  Future<void> _resend() async {
    setState(() { _resending = true; _error = null; _info = null; });
    final repo = ref.read(authRepositoryProvider);
    final ok = await repo.resendSignUpCode(widget.email);
    setState(() {
      _resending = false;
      _info = ok ? 'A new code has been sent to ${widget.email}.' : null;
      if (!ok) _error = 'Could not resend the code. Try again in a moment.';
    });
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      appBar: AppBar(title: const Text('Verify your email')),
      body: PlayfulBackground(
        child: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Center(child: AppLogo(height: 34)),
                const SizedBox(height: 24),
                const Center(
                  child: ColorfulIcon(Icons.mark_email_read_outlined, mood: IconMood.sky, size: 26, boxSize: 56),
                ),
                const SizedBox(height: 16),
                Text('We sent a code to ${widget.email}',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      color: isDark ? AppColors.darkText : AppColors.lightText,
                    )),
                const SizedBox(height: 8),
                Text(
                  'Enter the verification code from that email to finish creating your account.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 13.5, color: isDark ? AppColors.darkTextSoft : AppColors.lightTextSoft),
                ),
                const SizedBox(height: 24),
                TextField(
                  controller: _code,
                  keyboardType: TextInputType.number,
                  maxLength: 10,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 24,
                    letterSpacing: 8,
                    fontWeight: FontWeight.bold,
                    color: isDark ? AppColors.darkCyan : AppColors.lightTeal,
                  ),
                  decoration: const InputDecoration(counterText: ''),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 8),
                  Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                ],
                if (_info != null) ...[
                  const SizedBox(height: 8),
                  Text(_info!, style: TextStyle(color: isDark ? AppColors.darkMint : AppColors.lightMintDeep)),
                ],
                const SizedBox(height: 20),
                GradientButton(
                  loading: _loading,
                  label: 'Verify',
                  onTap: _loading ? null : _verify,
                ),
                const SizedBox(height: 12),
                Center(
                  child: TextButton(
                    onPressed: _resending ? null : _resend,
                    child: Text(_resending ? 'Sending...' : "Didn't get a code? Resend"),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
