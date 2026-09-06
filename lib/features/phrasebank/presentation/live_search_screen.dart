import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:audioplayers/audioplayers.dart';
import '../../../shared/data/tts_locales.dart';
import '../data/tatoeba_live_repository.dart';
import '../../../shared/widgets/save_phrase_button.dart';
import '../../../shared/widgets/playful_background.dart';
import '../../../shared/widgets/colorful_icon.dart';
import '../../../core/theme/app_theme.dart';

/// This is deliberately a separate screen from Phrase Bank's offline list -
/// it calls an online sentence database, so it needs internet and results
/// aren't reviewed/curated the way the bundled ja.json data was.
class LiveSearchScreen extends ConsumerStatefulWidget {
  final String targetLanguage;
  const LiveSearchScreen({super.key, required this.targetLanguage});

  @override
  ConsumerState<LiveSearchScreen> createState() => _LiveSearchScreenState();
}

class _LiveSearchScreenState extends ConsumerState<LiveSearchScreen> {
  final _controller = TextEditingController();
  final _themeController = TextEditingController();
  final _tts = FlutterTts();
  final _player = AudioPlayer();
  List<LiveSearchResult> _results = [];
  List<ThemeList> _themeMatches = [];
  ThemeList? _activeTheme;
  bool _loading = false;
  bool _themeLoading = false;
  String? _error;
  int? _playingId;
  bool _browsingByTheme = false;

  @override
  void dispose() {
    _controller.dispose();
    _themeController.dispose();
    _tts.stop();
    _player.dispose();
    super.dispose();
  }

  Future<void> _search() async {
    final query = _controller.text.trim();
    if (query.isEmpty) return;
    setState(() { _loading = true; _error = null; _activeTheme = null; });
    try {
      final repo = ref.read(tatoebaLiveRepositoryProvider);
      final results = await repo.search(targetLanguage: widget.targetLanguage, query: query);
      setState(() => _results = results);
    } catch (e) {
      setState(() => _error = 'Search failed: $e\n\nCheck you have an internet connection.');
    } finally {
      setState(() => _loading = false);
    }
  }

  /// Step 1 of theme browsing: find named collections matching a keyword -
  /// no ID numbers, no scripts, just typing a word like "restaurant".
  Future<void> _findThemes() async {
    final keyword = _themeController.text.trim();
    if (keyword.isEmpty) return;
    setState(() { _themeLoading = true; _error = null; _themeMatches = []; });
    try {
      final repo = ref.read(tatoebaLiveRepositoryProvider);
      final matches = await repo.findThemeLists(keyword);
      setState(() => _themeMatches = matches);
      if (matches.isEmpty) {
        setState(() => _error = 'No themed collections found for "$keyword" - try a different word.');
      }
    } catch (e) {
      setState(() => _error = 'Theme search failed: $e\n\nCheck you have an internet connection.');
    } finally {
      setState(() => _themeLoading = false);
    }
  }

  /// Step 2: tapping a found theme pulls every sentence in that collection.
  Future<void> _openTheme(ThemeList theme) async {
    setState(() { _loading = true; _error = null; _activeTheme = theme; _themeMatches = []; });
    try {
      final repo = ref.read(tatoebaLiveRepositoryProvider);
      final results = await repo.search(targetLanguage: widget.targetLanguage, listId: theme.id);
      setState(() => _results = results);
    } catch (e) {
      setState(() => _error = 'Could not load that collection: $e');
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _play(LiveSearchResult result) async {
    setState(() => _playingId = result.id);
    try {
      if (result.audioId != null) {
        final repo = ref.read(tatoebaLiveRepositoryProvider);
        await _player.play(UrlSource(repo.audioUrl(result.audioId!)));
        await _player.onPlayerComplete.first;
      } else {
        final locale = kTtsLocales[widget.targetLanguage] ?? 'en-US';
        await _tts.setLanguage(locale);
        final completer = Completer<void>();
        _tts.setCompletionHandler(() => completer.complete());
        _tts.speak(result.text);
        await completer.future;
      }
    } catch (_) {
      // Fail quietly on playback - the text result itself is still useful.
    } finally {
      if (mounted) setState(() => _playingId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Search Online')),
      body: PlayfulBackground(
        child: Column(
        children: [
          Container(
            width: double.infinity,
            color: Theme.of(context).colorScheme.secondary.withOpacity(0.08),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                const ColorfulIcon(Icons.public, mood: IconMood.sky, size: 14, boxSize: 24),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Live results from an online sentence database - needs internet, not reviewed like the offline Phrase Bank',
                    style: TextStyle(
                      fontSize: 11,
                      color: Theme.of(context).brightness == Brightness.dark
                          ? AppColors.darkTextSoft
                          : AppColors.lightTextSoft,
                    ),
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              children: [
                if (!_browsingByTheme) ...[
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _controller,
                          decoration: const InputDecoration(
                            hintText: 'Search any word or phrase…',
                            border: OutlineInputBorder(),
                            isDense: true,
                          ),
                          onSubmitted: (_) => _search(),
                        ),
                      ),
                      const SizedBox(width: 8),
                      FilledButton(onPressed: _loading ? null : _search, child: const Text('Search')),
                    ],
                  ),
                ] else ...[
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _themeController,
                          decoration: const InputDecoration(
                            hintText: 'Browse a theme, e.g. "restaurant", "travel"…',
                            border: OutlineInputBorder(),
                            isDense: true,
                          ),
                          onSubmitted: (_) => _findThemes(),
                        ),
                      ),
                      const SizedBox(width: 8),
                      FilledButton(onPressed: _themeLoading ? null : _findThemes, child: const Text('Find')),
                    ],
                  ),
                ],
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton(
                    onPressed: () => setState(() {
                      _browsingByTheme = !_browsingByTheme;
                      _error = null;
                      _themeMatches = [];
                    }),
                    child: Text(
                      _browsingByTheme ? 'Search by word instead' : 'Browse a themed collection instead',
                      style: const TextStyle(fontSize: 12),
                    ),
                  ),
                ),
              ],
            ),
          ),
          if (_loading || _themeLoading) const LinearProgressIndicator(),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ),
          if (_activeTheme != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Chip(label: Text('Collection: ${_activeTheme!.name}')),
              ),
            ),
          if (_themeMatches.isNotEmpty)
            Expanded(
              child: ListView.separated(
                padding: const EdgeInsets.all(12),
                itemCount: _themeMatches.length,
                separatorBuilder: (_, __) => const SizedBox(height: 8),
                itemBuilder: (context, i) {
                  final t = _themeMatches[i];
                  return Card(
                    child: ListTile(
                      leading: const ColorfulIcon(Icons.folder_open, mood: IconMood.amber, boxSize: 36),
                      title: Text(t.name),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => _openTheme(t),
                    ),
                  );
                },
              ),
            )
          else
            Expanded(
              child: ListView.separated(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                itemCount: _results.length,
                separatorBuilder: (_, __) => const SizedBox(height: 8),
                itemBuilder: (context, i) {
                  final r = _results[i];
                  final isPlaying = _playingId == r.id;
                  return Card(
                    child: ListTile(
                      title: Text(r.text, style: const TextStyle(fontWeight: FontWeight.bold)),
                      subtitle: Text(r.translation),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          IconButton(
                            icon: isPlaying
                                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                                : ColorfulIcon(
                                    r.audioId != null ? Icons.record_voice_over : Icons.volume_up,
                                    mood: r.audioId != null ? IconMood.purple : IconMood.sky,
                                    size: 18,
                                    boxSize: 30,
                                  ),
                            onPressed: isPlaying ? null : () => _play(r),
                          ),
                          SavePhraseButton(
                            text: r.text,
                            translation: r.translation,
                            language: widget.targetLanguage,
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
        ],
      ),
      ),
    );
  }
}
