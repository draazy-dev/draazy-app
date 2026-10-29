import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));

const MODELS = [
  {
    target: 'public/models/face_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
    sha256: '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff',
  },
];

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function readIfMatching(file, sha256) {
  try {
    const bytes = await readFile(file);
    return digest(bytes) === sha256 ? bytes : null;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function download(url, sha256) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const actual = digest(bytes);
  if (actual !== sha256) {
    throw new Error(`Digest mismatch for ${url}\n  expected ${sha256}\n  received ${actual}`);
  }
  return bytes;
}

for (const { target, url, sha256 } of MODELS) {
  const file = path.join(root, target);
  const name = path.basename(target);

  if (await readIfMatching(file, sha256)) {
    console.log(`= ${name} already present and verified`);
    continue;
  }

  const cached = path.join(root, 'node_modules/.cache/models', name);
  let bytes = await readIfMatching(cached, sha256);

  if (bytes) {
    console.log(`+ ${name} restored from cache`);
  } else {
    console.log(`. ${name} downloading...`);
    bytes = await download(url, sha256);
    await mkdir(path.dirname(cached), { recursive: true });
    await writeFile(cached, bytes);
  }

  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
  console.log(`+ ${name} written to ${target} (${bytes.length.toLocaleString()} bytes)`);
}
