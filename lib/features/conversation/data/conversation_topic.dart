/// A single bundled practice topic shown in the topic picker's "Topics" tab
/// (grouped by [module], each with a small emoji so the list reads the same
/// as a real curriculum rather than a flat list of chat prompts).
class ConversationTopic {
  final String title;
  final String emoji;
  final String module;
  final String category; // 'general' | 'work' | 'ielts'
  const ConversationTopic({
    required this.title,
    required this.emoji,
    required this.module,
    this.category = 'general',
  });
}

/// Bundled, language-agnostic topic curriculum - the tutor still speaks and
/// replies in the learner's chosen target language, this just scopes what
/// the conversation is about. Personalized items generated from the user's
/// study plan (see PlanItem kind == scenario) are shown above these in the
/// topic picker, not merged into this list.
const List<ConversationTopic> kConversationTopics = [
  // Module 1 - absolute basics
  ConversationTopic(title: 'Saying Hello', emoji: '👋', module: 'Module 1'),
  ConversationTopic(title: 'Lovely Weather', emoji: '☀️', module: 'Module 1'),
  ConversationTopic(title: "What's Your Name", emoji: '🙋', module: 'Module 1'),
  ConversationTopic(title: 'Where Are You From', emoji: '🌍', module: 'Module 1'),
  ConversationTopic(title: 'How Old Are You', emoji: '🎂', module: 'Module 1'),
  ConversationTopic(title: 'How Big Is Your Family', emoji: '👪', module: 'Module 1'),

  // Module 2 - everyday needs
  ConversationTopic(title: "I'd Like Some Water", emoji: '💧', module: 'Module 2'),
  ConversationTopic(title: 'Ordering Food at a Restaurant', emoji: '🍽️', module: 'Module 2'),
  ConversationTopic(title: 'Asking for Directions', emoji: '🧭', module: 'Module 2'),
  ConversationTopic(title: 'Talking About Your Hobbies', emoji: '🎨', module: 'Module 2'),
  ConversationTopic(title: 'Shopping for Clothes', emoji: '👕', module: 'Module 2'),

  // Module 3 - work & routine (tagged 'work' so the Work chip can filter to these)
  ConversationTopic(title: 'Saying Hi to a Coworker', emoji: '🧑\u200d💼', module: 'Module 3', category: 'work'),
  ConversationTopic(title: 'Talking About Your Job', emoji: '💼', module: 'Module 3', category: 'work'),
  ConversationTopic(title: 'Scheduling a Meeting', emoji: '🗓️', module: 'Module 3', category: 'work'),
  ConversationTopic(title: 'Making Weekend Plans', emoji: '📅', module: 'Module 3'),

  // Module 4 - exam-style extended speaking (tagged 'ielts')
  ConversationTopic(title: 'Describe a Memorable Trip', emoji: '✈️', module: 'Module 4', category: 'ielts'),
  ConversationTopic(title: 'Talk About a Skill You Want to Learn', emoji: '📚', module: 'Module 4', category: 'ielts'),
  ConversationTopic(title: 'Describe Your Hometown', emoji: '🏙️', module: 'Module 4', category: 'ielts'),
  ConversationTopic(title: 'Discuss a Book or Film You Enjoyed', emoji: '🎬', module: 'Module 4', category: 'ielts'),
];
