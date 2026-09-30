// Deletes the E2E gateway outbox so every run starts with an empty store-and-forward queue.
import { rmSync } from 'node:fs';

const file = process.argv[2];
for (const suffix of ['', '-wal', '-shm']) rmSync(`${file}${suffix}`, { force: true });
