import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../shared/data/local_storage_service.dart';
import 'custom_topic.dart';

const _storageKey = 'custom_topics';

/// Persists custom topics (Situation / Your Role / AI Role) created from the
/// topic picker's "Custom" tab, so they survive app restarts without needing
/// a backend - same on-device pattern as CustomScenarioNotifier.
class CustomTopicNotifier extends StateNotifier<List<CustomTopic>> {
  final _storage = LocalStorageService();
  CustomTopicNotifier() : super([]) {
    _load();
  }

  Future<void> _load() async {
    final raw = await _storage.loadList(_storageKey);
    state = raw.map((e) => CustomTopic.fromJson(e)).toList();
  }

  Future<void> add(CustomTopic topic) async {
    state = [topic, ...state];
    await _persist();
  }

  Future<void> remove(CustomTopic topic) async {
    state = state.where((t) => t.createdAt != topic.createdAt).toList();
    await _persist();
  }

  Future<void> _persist() async {
    await _storage.saveList(_storageKey, state.map((t) => t.toJson()).toList());
  }
}

final customTopicProvider = StateNotifierProvider<CustomTopicNotifier, List<CustomTopic>>(
  (ref) => CustomTopicNotifier(),
);
