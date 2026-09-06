// GET /api/tatoeba-lists?q=restaurant
// Lets the app search themed sentence collections by name, without the
// person ever running a script. There's no live search-by-name endpoint for
// this on the public API - only a bulk export contains list names - so this
// function downloads that export once, decompresses+parses it, and caches
// the result in memory for the life of this serverless instance (subsequent
// searches reuse the cached list instead of re-downloading).
//
// The decompression (bz2) and archive-parsing (tar) logic here was verified
// locally against a hand-made file in the exact same tar.bz2 format before
// this was written - what's NOT verified is the live download itself, since
// the source domain is blocked from the sandbox this was built in. If this
// 500s, that's the first thing to check.

const bz2 = require('unbzip2-stream');
const { Readable } = require('stream');

const LISTS_URL = 'https://downloads.tatoeba.org/exports/user_lists.tar.bz2';

let cachedLists = null; // survives across warm invocations of the same instance

function bz2ToBuffer(compressedBuffer) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    Readable.from([compressedBuffer])
      .pipe(bz2())
      .on('data', (c) => chunks.push(c))
      .on('end', () => resolve(Buffer.concat(chunks)))
      .on('error', reject);
  });
}

// Minimal tar reader - the export is a single-file tar archive, so this
// just needs to find the first regular file entry, not handle a full
// general-purpose tar (directories, multiple entries, etc.)
function parseTarSingleFile(buffer) {
  let offset = 0;
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    if (!name) break;
    const sizeOctal = header.subarray(124, 136).toString('utf8').replace(/\0.*$/, '').trim();
    const size = parseInt(sizeOctal, 8) || 0;
    const typeFlag = header[156];
    offset += 512;
    if (typeFlag === 0 || typeFlag === 48) {
      return { name, content: buffer.subarray(offset, offset + size) };
    }
    offset += Math.ceil(size / 512) * 512;
  }
  return null;
}

async function loadLists() {
  if (cachedLists) return cachedLists;

  const res = await fetch(LISTS_URL);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const compressed = Buffer.from(await res.arrayBuffer());
  const decompressed = await bz2ToBuffer(compressed);
  const file = parseTarSingleFile(decompressed);
  if (!file) throw new Error('Could not find the lists file inside the archive');

  const text = file.content.toString('utf8');
  // Fields: List id [tab] Username [tab] Date created [tab] Date last modified [tab] List name [tab] Editable by
  const lists = text
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t'))
    .filter((cols) => cols.length >= 5 && cols[0] && cols[4])
    .map((cols) => ({ id: cols[0], name: cols[4] }));

  cachedLists = lists;
  return lists;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { q } = req.query;
    const query = String(q || '').trim().toLowerCase();
    if (!query) return res.status(200).json({ results: [] });

    const lists = await loadLists();
    const matches = lists.filter((l) => l.name.toLowerCase().includes(query)).slice(0, 25);
    return res.status(200).json({ results: matches });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
};
