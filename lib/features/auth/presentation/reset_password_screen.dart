import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../shared/widgets/gradient_button.dart';
import '../../../shared/widgets/app_logo.dart';
import '../../../shared/widgets/playful_background.dart';
import '../../../shared/widgets/colorful_icon.dart';
import '../../../core/theme/app_theme.dart';
import '../data/supabase_auth_repository.dart';

/// Step 2 of "forgot password". The user types the code that was emailed
/// to them plus a new password, all in one screen - no link to click, no
/// website/deep-link setup required.
class ResetPasswordScreen extends ConsumerStatefulWidget {
  final String email;
  const ResetPasswordScreen({super.key, required this.email});

  @override
  ConsumerState<ResetPasswordScreen> createState() => _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends ConsumerState<ResetPasswordScreen> {
  final _code = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  bool _obscure = true;
  bool _loading = false;
  bool _resending = false;
  String? _error;
  String? _info;

  Future<void> _submit() async {
    if (_code.text.trim().length < 6) {
      setState(() => _error = 'Enter the code from your email.');
      return;
    }
    if (_password.text.length < 6) {
      setState(() => _error = 'Password must be at least 6 characters.');
      return;
    }
    if (_password.text != _confirm.text) {
      setState(() => _error = "Passwords don't match.");
      return;
    }
    setState(() { _loading = true; _error = null; _info = null; });
    final repo = ref.read(authRepositoryProvider);
    final verified = await repo.verifyRecoveryCode(widget.email, _code.text.trim());
    if (!verified) {
      setState(() { _loading = false; _error = 'That code is wrong or expired. Try again or resend a new one.'; });
      return;
    }
    final updated = await repo.updatePassword(_password.text);
    setState(() => _loading = false);
    if (updated && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Password updated. You are now logged in.')),
      );
      context.go('/dashboard');
    } else {
      setState(() => _error = 'Could not update your password. Try again.');
    }
  }

  Future<void> _resend() async {
    setState(() { _resending = true; _error = null; _info = null; });
    final repo = ref.read(authRepositoryProvider);
    final ok = await repo.resetPasswordForEmail(widget.email);
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
      appBar: AppBar(title: const Text('Set a new password')),
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
                  child: ColorfulIcon(Icons.key_outlined, mood: IconMood.teal, size: 26, boxSize: 56),
                ),
                const SizedBox(height: 16),
                Text('Enter the code sent to ${widget.email}',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 15.5,
                      fontWeight: FontWeight.w700,
                      color: isDark ? AppColors.darkText : AppColors.lightText,
                    )),
                const SizedBox(height: 16),
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
                const SizedBox(height: 12),
                Text('Choose a new password',
                    style: TextStyle(
                      fontSize: 15.5,
                      fontWeight: FontWeight.w700,
                      color: isDark ? AppColors.darkText : AppColors.lightText,
                    )),
                const SizedBox(height: 12),
                TextField(
                  controller: _password,
                  obscureText: _obscure,
                  decoration: InputDecoration(
                    labelText: 'New password',
                    prefixIcon: const Icon(Icons.lock_outline),
                    suffixIcon: IconButton(
                      icon: Icon(_obscure ? Icons.visibility : Icons.visibility_off),
                      onPressed: () => setState(() => _obscure = !_obscure),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _confirm,
                  obscureText: _obscure,
                  decoration: const InputDecoration(
                    labelText: 'Confirm new password',
                    prefixIcon: Icon(Icons.lock_outline),
                  ),
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
                  label: 'Update password',
                  onTap: _loading ? null : _submit,
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
