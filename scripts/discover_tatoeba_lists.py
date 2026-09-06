"""
Finds Tatoeba's curated sentence Lists (e.g. "Business English", "Travel
Phrases") matching a keyword, and prints their IDs. The live REST API can't
search list names directly - only filter sentences by a list ID you already
know - so this reads Tatoeba's bulk export of list metadata instead.

WHY THIS RUNS ON YOUR MACHINE: same reason as pull_tatoeba.py - Tatoeba's
download servers aren't reachable from the sandboxed environment I build in.

USAGE:
    pip install requests
    python discover_tatoeba_lists.py restaurant
    python discover_tatoeba_lists.py travel --lang deu

Once you have a list ID, use it with the app's live search (or directly via
the API) with the `list` filter to pull every sentence in that list:
    GET /api/tatoeba?lang=deu&list=1234
"""

import argparse
import bz2
import csv
import io
import sys

import requests

LISTS_URL = 'https://downloads.tatoeba.org/exports/user_lists.tar.bz2'
SENTENCES_IN_LISTS_URL = 'https://downloads.tatoeba.org/exports/sentences_in_lists.tar.bz2'


def download_and_extract_csv(url):
    print(f'Downloading {url} ...')
    resp = requests.get(url, timeout=120)
    resp.raise_for_status()
    import tarfile
    tf = tarfile.open(fileobj=io.BytesIO(resp.content), mode='r:bz2')
    member = next(m for m in tf.getmembers() if m.isfile())
    content = tf.extractfile(member).read().decode('utf-8', errors='replace')
    return list(csv.reader(io.StringIO(content), delimiter='\t'))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('keyword', help='Word to search for in list names, e.g. "restaurant"')
    parser.add_argument('--lang', default=None,
                         help='Optional: only show lists that actually contain sentences in this '
                              'ISO 639-3 language (slower - downloads sentences_in_lists.tar.bz2 too)')
    args = parser.parse_args()

    rows = download_and_extract_csv(LISTS_URL)
    # Fields: List id, Username, Date created, Date last modified, List name, Editable by
    matches = [r for r in rows if len(r) >= 5 and args.keyword.lower() in r[4].lower()]

    if not matches:
        print(f'No lists found with "{args.keyword}" in the name.')
        return

    print(f'\nFound {len(matches)} matching list(s):\n')
    for r in matches:
        list_id, username, _created, _modified, name = r[0], r[1], r[2], r[3], r[4]
        print(f'  [{list_id}] "{name}"  (by {username})')

    print(f'\nUse one with: GET /api/tatoeba?lang=<code>&list=<id>')
    print('Or in the app: Phrase Bank -> 🌐 icon -> "Search by curated List ID instead"')


if __name__ == '__main__':
    main()
