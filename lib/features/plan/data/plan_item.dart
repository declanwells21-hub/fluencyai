import '../../phrasebank/data/phrase_entry.dart';
import '../../scenarios/data/scenario.dart';
import '../../grammar/data/grammar_topic.dart';

enum PlanItemKind { phrase, scenario, grammar }

PlanItemKind _kindFromString(String s) {
  switch (s) {
    case 'scenario':
      return PlanItemKind.scenario;
    case 'grammar':
      return PlanItemKind.grammar;
    default:
      return PlanItemKind.phrase;
  }
}

/// One item of the user's AI-generated study plan (see api/chat.js mode
/// "plan"): a single phrase, scenario, or grammar topic, tracked with its
/// own completed/completedAt so real progress can be measured against
/// exactly what was generated for this person - not a generic total.
class PlanItem {
  final String id;
  final PlanItemKind kind;
  final String title; // phrase text / scenario title / grammar topic title
  final Map<String, dynamic> payload; // the rest: translation, lines, explanation+examples
  final int sortOrder;
  final bool completed;
  final DateTime? completedAt;

  const PlanItem({
    required this.id,
    required this.kind,
    required this.title,
    required this.payload,
    required this.sortOrder,
    required this.completed,
    this.completedAt,
  });

  factory PlanItem.fromRow(Map<String, dynamic> row) => PlanItem(
        id: row['id'] as String,
        kind: _kindFromString(row['kind'] as String),
        title: row['title'] as String,
        payload: Map<String, dynamic>.from((row['payload'] as Map?) ?? {}),
        sortOrder: row['sort_order'] as int? ?? 0,
        completed: row['completed'] as bool? ?? false,
        completedAt: row['completed_at'] == null ? null : DateTime.tryParse(row['completed_at'] as String),
      );

  PlanItem copyWith({bool? completed, DateTime? completedAt}) => PlanItem(
        id: id,
        kind: kind,
        title: title,
        payload: payload,
        sortOrder: sortOrder,
        completed: completed ?? this.completed,
        completedAt: completedAt,
      );

  /// Reuses the existing Phrase Bank / Scenario / Grammar detail views
  /// instead of building new ones - a generated item looks and behaves
  /// exactly like a bundled one once it's on screen.
  PhraseEntry toPhraseEntry() =>
      PhraseEntry(text: title, translation: payload['translation'] as String? ?? '');

  Scenario toScenario() => Scenario(
        title: title,
        lines: ((payload['lines'] as List?) ?? [])
            .map((l) => ScenarioLine.fromJson(Map<String, dynamic>.from(l as Map)))
            .toList(),
      );

  GrammarTopic toGrammarTopic() => GrammarTopic(
        title: title,
        explanation: payload['explanation'] as String? ?? '',
        examples: ((payload['examples'] as List?) ?? [])
            .map((e) => GrammarExample.fromJson(Map<String, dynamic>.from(e as Map)))
            .toList(),
      );
}
