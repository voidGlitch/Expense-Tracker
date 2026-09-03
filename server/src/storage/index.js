/**
 * Storage driver factory (SRS §11 — storage is pluggable behind one interface).
 *
 *   file   (default) JSON file on disk, zero setup
 *   mongo            MongoDB / Atlas, set MONGODB_URI in .env
 *   memory           in-process only, used by the test suite
 *
 * Every driver's init() resolves to the same repository shape, so nothing above
 * this file knows or cares which one is in use. The mongo driver is imported
 * lazily so file-driver users never pay to load mongoose.
 */
import { config } from '../env.js';
import { createFileRepo } from './fileStore.js';
import { createMemoryRepo } from './memoryStore.js';

/** Build and connect the configured repository. */
export async function openRepo(driver = config.storageDriver) {
  if (driver === 'mongo') {
    const { createMongoRepo } = await import('./mongoStore.js');
    return createMongoRepo().init();
  }
  if (driver === 'memory') return createMemoryRepo().init();
  return createFileRepo().init();
}

export { createFileRepo, createMemoryRepo };
