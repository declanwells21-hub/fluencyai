/// A user-defined roleplay topic created via the "Create a custom topic"
/// form (Situation / Your Role / AI Role), saved locally so it can be
/// resumed later from the Custom tab of the topic picker.
class CustomTopic {
  final String situation;
  final String yourRole;
  final String aiRole;
  final DateTime createdAt;

  const CustomTopic({
    required this.situation,
    required this.yourRole,
    required this.aiRole,
    required this.createdAt,
  });

  /// Shown as the row title in the Custom tab / conversation header.
  String get title => situation;

  factory CustomTopic.fromJson(Map<String, dynamic> json) => CustomTopic(
        situation: json['situation'] as String? ?? '',
        yourRole: json['yourRole'] as String? ?? '',
        aiRole: json['aiRole'] as String? ?? '',
        createdAt: json['createdAt'] != null
            ? DateTime.tryParse(json['createdAt'] as String) ?? DateTime.now()
            : DateTime.now(),
      );

  Map<String, dynamic> toJson() => {
        'situation': situation,
        'yourRole': yourRole,
        'aiRole': aiRole,
        'createdAt': createdAt.toIso8601String(),
      };
}
