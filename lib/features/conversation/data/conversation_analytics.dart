/// One suggested improvement surfaced in the post-conversation report -
/// grouped by category (Grammar / Word Choice / More Natural / Pronunciation)
/// so the summary screen can color-code them the same way the rest of the
/// app already color-codes mistake badges (see AppColors doc comment).
class ConversationFix {
  final String category;
  final String original;
  final String better;
  final String note;
  final String? localTip;

  const ConversationFix({
    required this.category,
    required this.original,
    required this.better,
    required this.note,
    this.localTip,
  });

  factory ConversationFix.fromJson(Map<String, dynamic> json) => ConversationFix(
        category: (json['category'] as String? ?? 'Grammar').trim(),
        original: json['original'] as String? ?? '',
        better: json['better'] as String? ?? '',
        note: json['note'] as String? ?? '',
        localTip: json['localTip'] as String?,
      );
}

/// One row of the per-skill progress breakdown (Grammar/Vocabulary/Fluency/
/// Listening bars on the Skills tab).
class SkillProgress {
  final String name;
  final int percent;

  const SkillProgress({required this.name, required this.percent});

  factory SkillProgress.fromJson(Map<String, dynamic> json) => SkillProgress(
        name: json['name'] as String? ?? '',
        percent: ((json['percent'] as num?)?.round() ?? 0).clamp(0, 100),
      );
}

/// Everything shown on the post-conversation summary screen - built from a
/// single AI call (mode "analyze" in api/chat.js) grounded in the actual
/// transcript and the corrections already flagged live during the session.
class ConversationAnalytics {
  final int understoodPercent;
  final int repairMoves;
  final List<String> repairNotes;
  final String summaryHeadline;
  final List<ConversationFix> fixes;
  final List<SkillProgress> skills;

  const ConversationAnalytics({
    required this.understoodPercent,
    required this.repairMoves,
    required this.repairNotes,
    required this.summaryHeadline,
    required this.fixes,
    required this.skills,
  });

  factory ConversationAnalytics.fromJson(Map<String, dynamic> json) => ConversationAnalytics(
        understoodPercent: ((json['understoodPercent'] as num?)?.round() ?? 60).clamp(0, 100),
        repairMoves: (json['repairMoves'] as num?)?.round() ?? 0,
        repairNotes: (json['repairNotes'] as List?)?.map((e) => e.toString()).toList() ?? const [],
        summaryHeadline: json['summaryHeadline'] as String? ?? 'Nice work getting through that conversation.',
        fixes: (json['fixes'] as List?)
                ?.whereType<Map>()
                .map((e) => ConversationFix.fromJson(Map<String, dynamic>.from(e)))
                .toList() ??
            const [],
        skills: (json['skills'] as List?)
                ?.whereType<Map>()
                .map((e) => SkillProgress.fromJson(Map<String, dynamic>.from(e)))
                .toList() ??
            const [],
      );
}
