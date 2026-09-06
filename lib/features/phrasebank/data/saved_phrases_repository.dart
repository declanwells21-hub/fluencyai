import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../shared/data/local_storage_service.dart';
import 'saved_phrase.dart';

const _storageKey = 'saved_phrases';

/// StateNotifier so every screen showing a save icon updates instantly when
/// a phrase is saved/unsaved from anywhere else in the app - Phrase Bank,
/// Live Search, Grammar examples, Scenario lines all share this one list.
class SavedPhrasesNotifier extends StateNotifier<List<SavedPhrase>> {
  final _storage = LocalStorageService();
  SavedPhrasesNotifier() : super([]) {
    _load();
  }

  Future<void> _load() async {
    final raw = await _storage.loadList(_storageKey);
    state = raw.map((e) => SavedPhrase.fromJson(e)).toList();
  }

  bool isSaved(String text, String language) =>
      state.any((p) => p.matches(text, language));

  Future<void> toggle(SavedPhrase phrase) async {
    if (isSaved(phrase.text, phrase.language)) {
      state = state.where((p) => !p.matches(phrase.text, phrase.language)).toList();
    } else {
      state = [...state, phrase];
    }
    await _storage.saveList(_storageKey, state.map((p) => p.toJson()).toList());
  }

  /// Adds a phrase only if it isn't already saved - unlike [toggle], this
  /// never removes anything. Used for auto-save flows (e.g. the
  /// post-conversation summary saving its "better" phrases) where calling
  /// [toggle] on an already-saved phrase would incorrectly un-save it.
  Future<void> saveIfNew(SavedPhrase phrase) async {
    if (isSaved(phrase.text, phrase.language)) return;
    state = [...state, phrase];
    await _storage.saveList(_storageKey, state.map((p) => p.toJson()).toList());
  }

  Future<void> remove(SavedPhrase phrase) async {
    state = state.where((p) => !p.matches(phrase.text, phrase.language)).toList();
    await _storage.saveList(_storageKey, state.map((p) => p.toJson()).toList());
  }
}

final savedPhrasesProvider = StateNotifierProvider<SavedPhrasesNotifier, List<SavedPhrase>>(
  (ref) => SavedPhrasesNotifier(),
);
