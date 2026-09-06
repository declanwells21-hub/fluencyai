import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../shared/widgets/gradient_button.dart';
import '../../../shared/widgets/app_logo.dart';
import '../../../shared/widgets/playful_background.dart';
import '../../../shared/widgets/colorful_icon.dart';
import '../../../core/theme/app_theme.dart';
import '../data/supabase_auth_repository.dart';

/// Step 1 of "forgot password": the user types their email and we ask
/// Supabase to email a reset code (sent via Brevo). We then push straight
/// to the code + new-password screen - no link to click, no website
/// needed.
class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  ConsumerState<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final _email = TextEditingController();
  bool _loading = false;
  String? _error;

  Future<void> _submit() async {
    if (_email.text.trim().isEmpty) {
      setState(() => _error = 'Enter your email address first.');
      return;
    }
    setState(() { _loading = true; _error = null; });
    final repo = ref.read(authRepositoryProvider);
    final email = _email.text.trim();
    final ok = await repo.resetPasswordForEmail(email);
    setState(() => _loading = false);
    if (ok && mounted) {
      context.push('/reset-password?email=${Uri.encodeComponent(email)}');
    } else {
      setState(() => _error = 'Something went wrong. Try again.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      appBar: AppBar(title: const Text('Reset password')),
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
                  child: ColorfulIcon(Icons.lock_reset, mood: IconMood.purple, size: 26, boxSize: 56),
                ),
                const SizedBox(height: 16),
                Text('Forgot your password?',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 21,
                      fontWeight: FontWeight.w800,
                      color: isDark ? AppColors.darkText : AppColors.lightText,
                    )),
                const SizedBox(height: 8),
                Text(
                  "Enter the email you signed up with and we'll send you a code to reset your password.",
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 13.5, color: isDark ? AppColors.darkTextSoft : AppColors.lightTextSoft),
                ),
                const SizedBox(height: 24),
                TextField(
                  controller: _email,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(
                    labelText: 'Email Address',
                    prefixIcon: Icon(Icons.mail_outline),
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 8),
                  Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                ],
                const SizedBox(height: 20),
                GradientButton(
                  loading: _loading,
                  label: 'Send reset code',
                  onTap: _loading ? null : _submit,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
