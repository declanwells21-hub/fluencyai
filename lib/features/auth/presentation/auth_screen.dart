import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../shared/widgets/gradient_button.dart';
import '../../../shared/widgets/app_logo.dart';
import '../data/rest_auth_repository.dart';
import '../data/auth_repository.dart';
import '../../../shared/widgets/playful_background.dart';
import '../../../shared/widgets/colorful_icon.dart';
import '../../../core/theme/app_theme.dart';

class AuthScreen extends ConsumerStatefulWidget {
  final bool initialSignUp;
  const AuthScreen({super.key, this.initialSignUp = true});

  @override
  ConsumerState<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends ConsumerState<AuthScreen> {
  bool _isSignUp = true;
  bool _termsAccepted = false;
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _obscure = true;
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _isSignUp = widget.initialSignUp;
  }

  void _showComingSoon(String provider) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Continuing with $provider (coming soon)')),
    );
  }

  Future<void> _submit() async {
    if (_isSignUp && !_termsAccepted) {
      setState(() => _error = 'Please agree to the Terms of Service and Privacy Policy.');
      return;
    }
    setState(() { _loading = true; _error = null; });
    final repo = ref.read(authRepositoryProvider);
    if (_isSignUp) {
      final outcome = await repo.signUp(_email.text, _password.text);
      setState(() => _loading = false);
      if (!mounted) return;
      switch (outcome) {
        case SignUpOutcome.success:
          context.go('/onboarding');
          break;
        case SignUpOutcome.needsConfirmation:
          context.push('/verify-email?email=${Uri.encodeComponent(_email.text.trim())}');
          break;
        case SignUpOutcome.failure:
          setState(() => _error = 'Please check your details and try again.');
          break;
      }
    } else {
      final ok = await repo.logIn(_email.text, _password.text);
      setState(() => _loading = false);
      if (ok && mounted) {
        context.go('/onboarding');
      } else {
        setState(() => _error = 'Please check your details and try again.');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final themeMode = ref.watch(themeModeProvider);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      body: PlayfulBackground(
        child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const AppLogo(height: 34),
                  Row(
                    children: [
                      const Text('☀', style: TextStyle(fontSize: 13)),
                      Switch(
                        value: themeMode == ThemeMode.dark,
                        onChanged: (_) => ref.read(themeModeProvider.notifier).toggle(),
                      ),
                      const Text('🌙', style: TextStyle(fontSize: 13)),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 12),
              ToggleButtons(
                isSelected: [_isSignUp, !_isSignUp],
                onPressed: (i) => setState(() => _isSignUp = i == 0),
                borderRadius: BorderRadius.circular(10),
                constraints: const BoxConstraints(minHeight: 42, minWidth: 140),
                children: const [
                  Text('Create Account'),
                  Text('Log In'),
                ],
              ),
              const SizedBox(height: 24),
              Text(_isSignUp ? 'Create your account' : 'Welcome back',
                  style: TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                    color: isDark ? AppColors.darkText : AppColors.lightText,
                  )),
              const SizedBox(height: 4),
              Text(
                _isSignUp
                    ? "Let's get your speaking practice started"
                    : 'Good to see you again',
                style: TextStyle(fontSize: 13.5, color: isDark ? AppColors.darkTextSoft : AppColors.lightTextSoft),
              ),
              const SizedBox(height: 20),
              OutlinedButton.icon(
                onPressed: () => _showComingSoon('Google'),
                icon: const ColorfulIcon(Icons.g_mobiledata, mood: IconMood.sky, size: 20, boxSize: 26),
                label: const Text('Continue with Google'),
                style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 12)),
              ),
              const SizedBox(height: 10),
              OutlinedButton.icon(
                onPressed: () => _showComingSoon('Apple'),
                icon: const ColorfulIcon(Icons.apple, mood: IconMood.purple, size: 16, boxSize: 26),
                label: const Text('Continue with Apple'),
                style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 12)),
              ),
              const SizedBox(height: 20),
              Row(children: const [
                Expanded(child: Divider()),
                Padding(padding: EdgeInsets.symmetric(horizontal: 10), child: Text('OR')),
                Expanded(child: Divider()),
              ]),
              const SizedBox(height: 20),
              TextField(
                controller: _email,
                decoration: const InputDecoration(
                  labelText: 'Email Address',
                  prefixIcon: Icon(Icons.mail_outline),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _password,
                obscureText: _obscure,
                decoration: InputDecoration(
                  labelText: 'Password',
                  prefixIcon: const Icon(Icons.lock_outline),
                  suffixIcon: IconButton(
                    icon: Icon(_obscure ? Icons.visibility : Icons.visibility_off),
                    onPressed: () => setState(() => _obscure = !_obscure),
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Row(children: [
                const ColorfulIcon(Icons.shield_outlined, mood: IconMood.mint, size: 13, boxSize: 22),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Highly encrypted — even our own team cannot view your password',
                    style: TextStyle(fontSize: 11.5, color: isDark ? AppColors.darkTextSoft : AppColors.lightTextSoft),
                  ),
                ),
              ]),
              if (!_isSignUp) ...[
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: () => context.push('/forgot-password'),
                    child: const Text('Forgot password?'),
                  ),
                ),
              ],
              if (_isSignUp) ...[
                const SizedBox(height: 16),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Checkbox(
                      value: _termsAccepted,
                      onChanged: (v) => setState(() => _termsAccepted = v ?? false),
                    ),
                    const Expanded(
                      child: Padding(
                        padding: EdgeInsets.only(top: 12),
                        child: Text.rich(
                          TextSpan(text: 'I agree to the ', children: [
                            TextSpan(text: 'Terms of Service', style: TextStyle(decoration: TextDecoration.underline)),
                            TextSpan(text: ' and '),
                            TextSpan(text: 'Privacy Policy', style: TextStyle(decoration: TextDecoration.underline)),
                          ]),
                          style: TextStyle(fontSize: 12.5),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
              if (_error != null) ...[
                const SizedBox(height: 8),
                Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
              ],
              const SizedBox(height: 16),
              GradientButton(
                loading: _loading,
                label: _isSignUp ? 'Create Account' : 'Log In',
                onTap: _loading ? null : _submit,
              ),
              const SizedBox(height: 12),
              Center(
                child: TextButton(
                  onPressed: () => setState(() => _isSignUp = !_isSignUp),
                  child: Text(_isSignUp ? 'Already have an account? Log In' : "Don't have an account? Sign Up"),
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
