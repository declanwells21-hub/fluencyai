import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../shared/data/local_storage_service.dart';

const _storageKey = 'usage_stats';

class UsageStats {
  /// 'yyyy-MM-dd' -> seconds practiced that day. This is the source of
  /// truth for streak, today's minutes, and total minutes - all derived,
  /// nothing double-stored.
  final Map<String, int> secondsByDate;
  final int correctionsCount;

  const UsageStats({this.secondsByDate = const {}, this.correctionsCount = 0});

  static String _todayKey() {
    final now = DateTime.now();
    return '${now.year.toString().padLeft(4, '0')}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
  }

  int get todaySeconds => secondsByDate[_todayKey()] ?? 0;

  int get totalSeconds => secondsByDate.values.fold(0, (sum, s) => sum + s);

  /// Consecutive days practiced, counting backward from today. A day with
  /// zero recorded seconds breaks the streak. Today not yet having any time
  /// logged doesn't break it (you haven't missed today until it's over) -
  /// the streak just doesn't include today until you practice.
  int get currentStreakDays {
    int streak = 0;
    var date = DateTime.now();
    // If today has no practice yet, start counting from yesterday instead -
    // otherwise a mid-day check-in before practicing would show 0 unfairly.
    if ((secondsByDate[_dateKey(date)] ?? 0) == 0) {
      date = date.subtract(const Duration(days: 1));
    }
    while ((secondsByDate[_dateKey(date)] ?? 0) > 0) {
      streak++;
      date = date.subtract(const Duration(days: 1));
    }
    return streak;
  }

  static String _dateKey(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  Map<String, dynamic> toJson() => {'secondsByDate': secondsByDate, 'correctionsCount': correctionsCount};

  factory UsageStats.fromJson(Map<String, dynamic> json) => UsageStats(
        secondsByDate: (json['secondsByDate'] as Map?)?.map((k, v) => MapEntry(k as String, v as int)) ?? {},
        correctionsCount: json['correctionsCount'] as int? ?? 0,
      );
}

/// Real usage tracking, persisted on-device (shared_preferences, same
/// pattern as saved phrases/custom scenarios/grammar - not synced to
/// Supabase yet). Conversation screen calls addPracticeSeconds/addCorrection
/// as sessions happen; this is the only place that data is written.
class UsageStatsNotifier extends StateNotifier<UsageStats> {
  final _storage = LocalStorageService();

  UsageStatsNotifier() : super(const UsageStats()) {
    _load();
  }

  Future<void> _load() async {
    final raw = await _storage.loadList(_storageKey);
    if (raw.isNotEmpty) {
      state = UsageStats.fromJson(raw.first);
    }
  }

  Future<void> _persist() async {
    await _storage.saveList(_storageKey, [state.toJson()]);
  }

  Future<void> addPracticeSeconds(int seconds) async {
    if (seconds <= 0) return;
    final todayKey = UsageStats._todayKey();
    final updated = Map<String, int>.from(state.secondsByDate);
    updated[todayKey] = (updated[todayKey] ?? 0) + seconds;
    state = UsageStats(secondsByDate: updated, correctionsCount: state.correctionsCount);
    await _persist();
  }

  Future<void> addCorrection() async {
    state = UsageStats(secondsByDate: state.secondsByDate, correctionsCount: state.correctionsCount + 1);
    await _persist();
  }
}

final usageStatsProvider = StateNotifierProvider<UsageStatsNotifier, UsageStats>(
  (ref) => UsageStatsNotifier(),
);
