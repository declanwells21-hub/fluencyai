class OnboardingData {
  final String targetLanguage; // e.g. 'de' - the language being LEARNED
  final String? level; // 'A1','A2','B1'...
  final int dailyGoalMinutes;
  final String? tutorName;
  final String? accent;
  final String gender; // 'female' | 'male'

  // Captured right after the target language is picked, used to tailor the
  // rest of onboarding and shown back on the final study-plan screen.
  final String? motivation; // single choice, e.g. 'travel'
  final List<String> goals; // multi-choice, e.g. ['pronunciation','confidence']
  final String? frequency; // single choice, e.g. 'daily'
  final List<String> topics; // multi-choice, e.g. ['travel','food']
  final String? nativeLanguage; // language code the learner already speaks

  const OnboardingData({
    this.targetLanguage = 'es',
    this.level,
    this.dailyGoalMinutes = 15,
    this.tutorName,
    this.accent,
    this.gender = 'female',
    this.motivation,
    this.goals = const [],
    this.frequency,
    this.topics = const [],
    this.nativeLanguage,
  });

  OnboardingData copyWith({
    String? targetLanguage,
    String? level,
    int? dailyGoalMinutes,
    String? tutorName,
    String? accent,
    String? gender,
    String? motivation,
    List<String>? goals,
    String? frequency,
    List<String>? topics,
    String? nativeLanguage,
  }) {
    return OnboardingData(
      targetLanguage: targetLanguage ?? this.targetLanguage,
      level: level ?? this.level,
      dailyGoalMinutes: dailyGoalMinutes ?? this.dailyGoalMinutes,
      tutorName: tutorName ?? this.tutorName,
      accent: accent ?? this.accent,
      gender: gender ?? this.gender,
      motivation: motivation ?? this.motivation,
      goals: goals ?? this.goals,
      frequency: frequency ?? this.frequency,
      topics: topics ?? this.topics,
      nativeLanguage: nativeLanguage ?? this.nativeLanguage,
    );
  }
}
