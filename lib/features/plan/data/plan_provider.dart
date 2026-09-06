import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'plan_item.dart';
import 'plan_repository.dart';

/// Holds the signed-in user's plan_items, loaded once and refreshed on
/// demand (pull-to-refresh, or right after generation). AsyncValue so the
/// Plan screen can show loading/error/data states without extra bookkeeping.
class PlanNotifier extends StateNotifier<AsyncValue<List<PlanItem>>> {
  final PlanRepository _repo;
  PlanNotifier(this._repo) : super(const AsyncValue.loading()) {
    refresh();
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    try {
      final items = await _repo.loadPlan();
      state = AsyncValue.data(items);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  /// Flips [item]'s completed state immediately in the UI, then persists it.
  /// Reverts to the server's actual state if the save fails, rather than
  /// leaving the UI showing progress that was never actually recorded.
  Future<void> toggleCompleted(PlanItem item) async {
    final current = state.value;
    if (current == null) return;
    final newCompleted = !item.completed;
    state = AsyncValue.data([
      for (final it in current)
        if (it.id == item.id)
          it.copyWith(completed: newCompleted, completedAt: newCompleted ? DateTime.now() : null)
        else
          it,
    ]);
    try {
      await _repo.setCompleted(item.id, newCompleted);
    } catch (_) {
      await refresh();
    }
  }
}

final planProvider = StateNotifierProvider<PlanNotifier, AsyncValue<List<PlanItem>>>(
  (ref) => PlanNotifier(ref.read(planRepositoryProvider)),
);
