import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/onboarding_state.dart';

class OnboardingNotifier extends StateNotifier<OnboardingData> {
  OnboardingNotifier() : super(const OnboardingData());

  void setLanguage(String code) => state = state.copyWith(targetLanguage: code);
  void setLevel(String level) => state = state.copyWith(level: level);
  void setDailyGoal(int minutes) => state = state.copyWith(dailyGoalMinutes: minutes);
  void setTutor(String name, String accent) =>
      state = state.copyWith(tutorName: name, accent: accent);
  void setGender(String gender) => state = state.copyWith(gender: gender);

  void setMotivation(String motivation) => state = state.copyWith(motivation: motivation);

  void toggleGoal(String goal) {
    final goals = List<String>.from(state.goals);
    goals.contains(goal) ? goals.remove(goal) : goals.add(goal);
    state = state.copyWith(goals: goals);
  }

  void setFrequency(String frequency) => state = state.copyWith(frequency: frequency);

  void toggleTopic(String topic) {
    final topics = List<String>.from(state.topics);
    topics.contains(topic) ? topics.remove(topic) : topics.add(topic);
    state = state.copyWith(topics: topics);
  }

  void setNativeLanguage(String code) => state = state.copyWith(nativeLanguage: code);
}

final onboardingProvider =
    StateNotifierProvider<OnboardingNotifier, OnboardingData>(
  (ref) => OnboardingNotifier(),
);
