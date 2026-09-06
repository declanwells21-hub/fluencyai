class ScenarioLine {
  final String speaker;
  final String text;
  final String translation;
  const ScenarioLine({required this.speaker, required this.text, required this.translation});

  factory ScenarioLine.fromJson(Map<String, dynamic> json) => ScenarioLine(
        speaker: json['speaker'] as String,
        text: json['text'] as String,
        translation: json['translation'] as String,
      );
}

class Scenario {
  final String title;
  final List<ScenarioLine> lines;
  const Scenario({required this.title, required this.lines});

  factory Scenario.fromJson(Map<String, dynamic> json) => Scenario(
        title: json['title'] as String,
        lines: (json['lines'] as List).map((e) => ScenarioLine.fromJson(e)).toList(),
      );
}
