"""
Pulls REAL sentence data (and optionally real human audio recordings) from
Tatoeba's public REST API for one target language, paired with English
translations, and writes it in the exact JSON schema the Flutter app expects:

    assets/phrases/<code>.json =
        [{"text": "...", "translation": "...", "audio": "<code>_<id>.mp3" or null}]

WHY THIS RUNS ON YOUR MACHINE, NOT MINE: I tested this exact API
(api.tatoeba.org) directly and confirmed it's blocked from the sandboxed
environment I build in - only a short allowlist of developer-tool domains
(GitHub, PyPI, npm) are reachable there. Your machine has no such
restriction, so this works fine for you.

USAGE:
    pip install requests
    python pull_tatoeba.py deu                      # text only, random sample
    python pull_tatoeba.py spa --max 500
    python pull_tatoeba.py fra --with-audio          # also downloads real
                                                      # human pronunciation
                                                      # clips where available
    python pull_tatoeba.py spa --query estoy         # extra real examples
                                                      # for a Grammar topic
                                                      # (e.g. ser vs estar)
    python pull_tatoeba.py fra --query restaurant    # raw material for a
                                                      # Scenario theme - still
                                                      # needs arranging into
                                                      # an actual dialogue by
                                                      # hand, Tatoeba has no
                                                      # concept of dialogue

Language codes here are ISO 639-3 (Tatoeba's native format) - see
ISO1_TO_ISO3 below to map from our app's 2-letter codes.

Output:
    <code>.json                    -> copy into assets/phrases/<code2>.json
    audio/<code>_<id>.mp3          -> (only with --with-audio) copy the
                                       whole audio/ folder into
                                       assets/phrases/audio/
"""

import argparse
import json
import os
import re
import sys
import time

import requests

API_BASE = 'https://api.tatoeba.org'

ISO1_TO_ISO3 = {
    'en': 'eng', 'de': 'deu', 'es': 'spa', 'fr': 'fra', 'it': 'ita',
    'pt': 'por', 'ja': 'jpn', 'zh': 'cmn', 'ko': 'kor', 'ar': 'ara',
    'ru': 'rus', 'hi': 'hin', 'nl': 'nld', 'sv': 'swe', 'pl': 'pol',
    'tr': 'tur', 'vi': 'vie', 'th': 'tha', 'id': 'ind', 'el': 'ell',
    'he': 'heb', 'cs': 'ces', 'ro': 'ron', 'uk': 'ukr', 'sw': 'swh',
}
ISO3_TO_ISO1 = {v: k for k, v in ISO1_TO_ISO3.items()}

BLOCKLIST = re.compile(
    r'\b(die|dead|death|kill|murder|suicide|sex|sexual|drunk|drugs?|damn|'
    r'hell|stupid|idiot|fool|fat|ugly|hate|gun|weapon|blood|hurt|pain|'
    r'fired|fight|beer|wine|prostitut|rape|nazi|slave)\b',
    re.IGNORECASE,
)


def fetch_sentences(iso3, max_results, min_len, max_len, want_audio, query=None, tag=None):
    """Paginates through /unstable/sentences, filtering for clean licenses,
    a matching English translation, and reasonable length. If `query` is
    given, searches for sentences containing it (e.g. a word tied to a
    Grammar topic, or a theme word for a Scenario) instead of a random
    sample - useful for building Grammar/Scenario material, not just
    general Phrase Bank content."""
    results = []
    seen_translations = set()

    params = {
        'lang': iso3,
        'trans:lang': 'eng',
        'trans:is_direct': 'yes',
        'license': 'CC BY 2.0 FR,CC0 1.0',  # the live API rejects repeated "license" params
                                              # ("cannot be provided multiple times") despite what
                                              # the docs implied - one comma-joined value is correct
        'word_count': f'{max(1, min_len // 4)}-{max_len}',  # rough word-count proxy
        'sort': 'relevance' if query else 'random',
        'limit': 100,
        'showtrans': 'matching',
        'include': 'audios' if want_audio else None,
        'q': query,
        'tag': tag,
    }
    params = {k: v for k, v in params.items() if v is not None}

    url = f'{API_BASE}/unstable/sentences'
    while url and len(results) < max_results:
        resp = requests.get(url, params=params if url == f'{API_BASE}/unstable/sentences' else None, timeout=30)
        if resp.status_code != 200:
            print(f'API error {resp.status_code}: {resp.text[:300]}')
            break
        payload = resp.json()

        for sent in payload.get('data', []):
            text = sent.get('text', '').strip()
            if not (min_len <= len(text) <= max_len):
                continue
            translations = sent.get('translations', [])
            if not translations:
                continue
            translation_text = translations[0].get('text', '').strip()
            if len(translation_text) > 90 or BLOCKLIST.search(translation_text):
                continue
            key = translation_text.lower()
            if key in seen_translations:
                continue
            seen_translations.add(key)

            entry = {'text': text, 'translation': translation_text, 'audio': None}
            if want_audio:
                audios = sent.get('audios', [])
                if audios:
                    entry['_audio_id'] = audios[0]['id']  # resolved to a file after loop
            results.append(entry)
            if len(results) >= max_results:
                break

        paging = payload.get('paging', {})
        url = paging.get('next') if paging.get('has_next') else None
        time.sleep(0.2)  # be polite to a free public API

    return results


def download_audio(entry, lang_code, out_dir):
    audio_id = entry.pop('_audio_id', None)
    if not audio_id:
        return
    resp = requests.get(f'{API_BASE}/v1/audios/{audio_id}/file', timeout=30)
    if resp.status_code != 200:
        return  # author may not allow reuse outside Tatoeba (403) - skip silently
    os.makedirs(out_dir, exist_ok=True)
    filename = f'{lang_code}_{audio_id}.mp3'
    with open(os.path.join(out_dir, filename), 'wb') as f:
        f.write(resp.content)
    entry['audio'] = filename


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('lang', help='ISO 639-3 code, e.g. deu, spa, fra (see ISO1_TO_ISO3 for the mapping)')
    parser.add_argument('--max', type=int, default=400)
    parser.add_argument('--min-len', type=int, default=8)
    parser.add_argument('--max-len', type=int, default=26)
    parser.add_argument('--with-audio', action='store_true',
                         help='Also download real human pronunciation clips where Tatoeba has them (slower, adds mp3 files)')
    parser.add_argument('--query', default=None,
                         help='Search for sentences containing this word/phrase instead of a random sample - '
                              'useful for pulling extra real examples for a specific Grammar topic or a '
                              'Scenario theme (e.g. --query "restaurant" or --query estoy)')
    parser.add_argument('--tag', default=None,
                         help='Limit to sentences with this Tatoeba tag (e.g. idiom, proverb, colloquial)')
    args = parser.parse_args()

    iso1 = ISO3_TO_ISO1.get(args.lang, args.lang if args.lang in ISO1_TO_ISO3 else None)
    lang_code = ISO1_TO_ISO3.get(args.lang, args.lang)  # allow passing either format

    print(f'Fetching {args.lang}-eng sentence pairs from {API_BASE} ...')
    results = fetch_sentences(args.lang, args.max, args.min_len, args.max_len, args.with_audio,
                               query=args.query, tag=args.tag)
    print(f'Got {len(results)} clean pairs')

    if args.with_audio:
        print('Downloading audio clips (only where an author allows reuse)...')
        for i, entry in enumerate(results):
            download_audio(entry, args.lang, 'audio')
            if (i + 1) % 20 == 0:
                print(f'  {i + 1}/{len(results)}')
        with_audio_count = sum(1 for e in results if e.get('audio'))
        print(f'{with_audio_count}/{len(results)} phrases got a real audio clip')

    out_path = f'{args.lang}.json'
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False)
    print(f'Wrote {len(results)} phrase pairs to {out_path}')
    two_letter = iso1 or args.lang
    print(f'Copy this into fluency_flutter/assets/phrases/{two_letter}.json')
    if args.with_audio:
        print(f'Copy the audio/ folder into fluency_flutter/assets/phrases/audio/')


if __name__ == '__main__':
    main()
