/**
 * JSON-file repository — the zero-setup default driver.
 *
 * Wraps the in-memory repo: load the file at boot, and after every mutation
 * write the whole snapshot back. Writes are coalesced (a burst of changes costs
 * one write) and atomic (temp file + rename) so a crash mid-write cannot leave a
 * half-written db.json behind.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../env.js';
import { createMemoryRepo, emptyCollections } from './memoryStore.js';

const WRITE_DEBOUNCE_MS = 60;

async function readSnapshot(filePath) {
  let text;
  try {
    text = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return emptyCollections();
    throw error;
  }
  if (!text.trim()) return emptyCollections();
  try {
    const parsed = JSON.parse(text);
    // Keep every collection the repo knows about — a file written before the
    // shared-expense collections existed simply has none of them.
    return {
      ...emptyCollections(),
      users: parsed.users || {},
      documents: parsed.documents || {},
      friendships: parsed.friendships || {},
      friendRequests: parsed.friendRequests || {},
      groups: parsed.groups || {},
      contacts: parsed.contacts || {},
    };
  } catch {
    // Refuse to start rather than silently continuing with an empty database —
    // that would look exactly like "all my data disappeared".
    throw new Error(
      `Could not parse the data file at ${filePath}. It may be corrupt.\n`
      + '  Fix or remove the file (move it aside to start fresh) and restart.',
    );
  }
}

export function createFileRepo(filePath = config.dataFile) {
  const target = path.resolve(filePath);
  const tempFile = `${target}.tmp`;
  let pending = null;        // latest snapshot waiting to be written
  let timer = null;
  let writing = Promise.resolve();
  let closed = false;

  const writeNow = async () => {
    if (!pending) return;
    const snapshot = pending;
    pending = null;
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(tempFile, JSON.stringify(snapshot, null, 2), 'utf8');
    await fs.rename(tempFile, target);
  };

  const flush = async () => {
    if (timer) { clearTimeout(timer); timer = null; }
    writing = writing.then(writeNow, writeNow);
    return writing;
  };

  const schedule = (snapshot) => {
    if (closed) return;
    pending = snapshot;
    if (timer) return;
    timer = setTimeout(() => { timer = null; flush().catch(reportWriteError); }, WRITE_DEBOUNCE_MS);
    if (typeof timer.unref === 'function') timer.unref();
  };

  const reportWriteError = (error) => {
    console.error(`[storage] failed to write ${target}:`, error.message);
  };

  return {
    driver: 'file',
    dataFile: target,

    async init() {
      const snapshot = await readSnapshot(target);
      const repo = createMemoryRepo(snapshot);
      repo.setChangeListener(schedule);
      // Delegate everything to the in-memory repo, keeping file-level extras.
      return Object.assign(Object.create(repo), {
        driver: 'file',
        dataFile: target,
        flush,
        async close() {
          closed = true;
          if (timer) { clearTimeout(timer); timer = null; }
          await writing.catch(() => {});
          await writeNow().catch(reportWriteError);
          repo.setChangeListener(null);
        },
      });
    },
  };
}
