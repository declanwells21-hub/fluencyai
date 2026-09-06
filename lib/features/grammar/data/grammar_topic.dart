class GrammarExample {
  final String text;
  final String note;
  const GrammarExample({required this.text, required this.note});

  factory GrammarExample.fromJson(Map<String, dynamic> json) =>
      GrammarExample(text: json['text'] as String, note: json['note'] as String);
}

class GrammarTopic {
  final String title;
  final String explanation;
  final List<GrammarExample> examples;
  const GrammarTopic({required this.title, required this.explanation, required this.examples});

  factory GrammarTopic.fromJson(Map<String, dynamic> json) => GrammarTopic(
        title: json['title'] as String,
        explanation: json['explanation'] as String,
        examples: ((json['examples'] as List?) ?? [])
            .map((e) => GrammarExample.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}
