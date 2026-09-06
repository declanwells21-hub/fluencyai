import 'package:flutter/material.dart';

/// A single choice in a motivation/goal/frequency/topic picker: a stable
/// `key` (what actually gets stored), an icon, and the label shown to the
/// user - kept separate so relabeling the UI later never touches saved data.
class OnboardingOption {
  final String key;
  final IconData icon;
  final String label;
  const OnboardingOption({required this.key, required this.icon, required this.label});
}

/// "Why do you want to learn {language}?" - single choice.
const List<OnboardingOption> kMotivations = [
  OnboardingOption(key: 'travel', icon: Icons.flight_takeoff_rounded, label: 'Travel or live abroad'),
  OnboardingOption(key: 'career', icon: Icons.work_outline_rounded, label: 'Get ahead in my career'),
  OnboardingOption(key: 'connect', icon: Icons.diversity_3_rounded, label: 'Connect with more people'),
  OnboardingOption(key: 'family', icon: Icons.family_restroom_rounded, label: 'Talk with family or a partner'),
  OnboardingOption(key: 'self', icon: Icons.auto_awesome_rounded, label: 'Personal challenge'),
  OnboardingOption(key: 'other', icon: Icons.more_horiz_rounded, label: 'Something else'),
];

/// "What would you like to focus on?" - multi choice.
const List<OnboardingOption> kGoals = [
  OnboardingOption(key: 'pronunciation', icon: Icons.record_voice_over_rounded, label: 'Sound more natural when I speak'),
  OnboardingOption(key: 'confidence', icon: Icons.psychology_rounded, label: 'Feel confident in real conversations'),
  OnboardingOption(key: 'vocabulary', icon: Icons.style_rounded, label: 'Build up useful words and phrases'),
  OnboardingOption(key: 'listening', icon: Icons.hearing_rounded, label: 'Understand native speakers better'),
  OnboardingOption(key: 'grammar', icon: Icons.rule_rounded, label: 'Get my grammar right'),
];

/// "How often do you want to practice?" - single choice.
const List<OnboardingOption> kFrequencies = [
  OnboardingOption(key: 'daily', icon: Icons.today_rounded, label: 'A few minutes every day'),
  OnboardingOption(key: 'weekly', icon: Icons.date_range_rounded, label: 'A few times a week'),
  OnboardingOption(key: 'monthly', icon: Icons.calendar_month_rounded, label: 'A few times a month'),
  OnboardingOption(key: 'undecided', icon: Icons.help_outline_rounded, label: "I'm not sure yet"),
];

/// "What topics are you interested in?" - multi choice, shown in a 2-column
/// grid. Used to steer which conversation topics come up first.
const List<OnboardingOption> kTopics = [
  OnboardingOption(key: 'entertainment', icon: Icons.theaters_rounded, label: 'Entertainment'),
  OnboardingOption(key: 'sports', icon: Icons.sports_basketball_rounded, label: 'Sports'),
  OnboardingOption(key: 'travel', icon: Icons.flight_rounded, label: 'Travel'),
  OnboardingOption(key: 'movies', icon: Icons.movie_rounded, label: 'Movies & TV'),
  OnboardingOption(key: 'business', icon: Icons.business_center_rounded, label: 'Work & Business'),
  OnboardingOption(key: 'dancing', icon: Icons.nightlife_rounded, label: 'Music & Dance'),
  OnboardingOption(key: 'socializing', icon: Icons.local_bar_rounded, label: 'Socializing'),
  OnboardingOption(key: 'social_media', icon: Icons.smartphone_rounded, label: 'Social Media'),
  OnboardingOption(key: 'culture', icon: Icons.museum_rounded, label: 'Culture & History'),
  OnboardingOption(key: 'gardening', icon: Icons.eco_rounded, label: 'Nature & Gardening'),
  OnboardingOption(key: 'dating', icon: Icons.favorite_border_rounded, label: 'Dating & Relationships'),
  OnboardingOption(key: 'yoga', icon: Icons.self_improvement_rounded, label: 'Wellness & Yoga'),
  OnboardingOption(key: 'shopping', icon: Icons.shopping_bag_rounded, label: 'Shopping'),
  OnboardingOption(key: 'photography', icon: Icons.camera_alt_rounded, label: 'Photography'),
  OnboardingOption(key: 'food', icon: Icons.restaurant_rounded, label: 'Food & Cooking'),
  OnboardingOption(key: 'biking', icon: Icons.directions_bike_rounded, label: 'Outdoors & Biking'),
  OnboardingOption(key: 'family', icon: Icons.family_restroom_rounded, label: 'Family'),
  OnboardingOption(key: 'handcraft', icon: Icons.brush_rounded, label: 'Arts & Crafts'),
  OnboardingOption(key: 'tech', icon: Icons.devices_rounded, label: 'Tech & Gadgets'),
  OnboardingOption(key: 'gaming', icon: Icons.sports_esports_rounded, label: 'Gaming'),
];

/// Looks up the display label for a stored option key within [options],
/// falling back to the raw key if it's ever out of sync (should be rare).
String onboardingLabel(List<OnboardingOption> options, String key) {
  for (final o in options) {
    if (o.key == key) return o.label;
  }
  return key;
}
