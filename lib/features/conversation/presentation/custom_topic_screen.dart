import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../data/custom_topic.dart';
import '../data/custom_topic_repository.dart';
import '../../../shared/widgets/gradient_button.dart';
import 'conversation_screen.dart';

/// "What do you want to talk about?" form - matches the reference
/// prototype's Situation / Your Role / AI Role fields. Starting saves the
/// topic locally (so it shows up under the picker's Custom tab next time)
/// and drops straight into a conversation scoped to it.
class CustomTopicScreen extends ConsumerStatefulWidget {
  const CustomTopicScreen({super.key});

  @override
  ConsumerState<CustomTopicScreen> createState() => _CustomTopicScreenState();
}

class _CustomTopicScreenState extends ConsumerState<CustomTopicScreen> {
  final _situationCtrl = TextEditingController();
  final _yourRoleCtrl = TextEditingController();
  final _aiRoleCtrl = TextEditingController();

  @override
  void dispose() {
    _situationCtrl.dispose();
    _yourRoleCtrl.dispose();
    _aiRoleCtrl.dispose();
    super.dispose();
  }

  bool get _canStart => _situationCtrl.text.trim().isNotEmpty;

  Future<void> _start() async {
    final situation = _situationCtrl.text.trim();
    if (situation.isEmpty) return;
    final yourRole = _yourRoleCtrl.text.trim().isEmpty ? 'You' : _yourRoleCtrl.text.trim();
    final aiRole = _aiRoleCtrl.text.trim().isEmpty ? 'the other person' : _aiRoleCtrl.text.trim();

    final topic = CustomTopic(
      situation: situation,
      yourRole: yourRole,
      aiRole: aiRole,
      createdAt: DateTime.now(),
    );
    await ref.read(customTopicProvider.notifier).add(topic);

    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(
        builder: (_) => ConversationScreen(
          topicTitle: topic.title,
          situation: topic.situation,
          yourRole: topic.yourRole,
          aiRole: topic.aiRole,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 16, 24, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
                    onPressed: () => Navigator.of(context).maybePop(),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              const Text(
                'What do you want to talk about? 🤔',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 21, fontWeight: FontWeight.w800, height: 1.3),
              ),
              const SizedBox(height: 28),
              _FieldLabel('Situation'),
              const SizedBox(height: 8),
              TextField(
                controller: _situationCtrl,
                onChanged: (_) => setState(() {}),
                decoration: const InputDecoration(
                  hintText: 'e.g. Job Interview',
                  border: OutlineInputBorder(borderRadius: BorderRadius.all(Radius.circular(28))),
                ),
              ),
              const SizedBox(height: 20),
              _FieldLabel('Your Role'),
              const SizedBox(height: 8),
              TextField(
                controller: _yourRoleCtrl,
                decoration: const InputDecoration(
                  hintText: 'e.g. Job Candidate',
                  border: OutlineInputBorder(borderRadius: BorderRadius.all(Radius.circular(28))),
                ),
              ),
              const SizedBox(height: 20),
              _FieldLabel('AI Role'),
              const SizedBox(height: 8),
              TextField(
                controller: _aiRoleCtrl,
                decoration: const InputDecoration(
                  hintText: 'e.g. Job Interviewer',
                  border: OutlineInputBorder(borderRadius: BorderRadius.all(Radius.circular(28))),
                ),
              ),
              const Spacer(),
              GradientButton(label: 'Start', onTap: _canStart ? () => _start() : null),
            ],
          ),
        ),
      ),
    );
  }
}

class _FieldLabel extends StatelessWidget {
  final String label;
  const _FieldLabel(this.label);

  @override
  Widget build(BuildContext context) {
    return Text(label, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14));
  }
}
