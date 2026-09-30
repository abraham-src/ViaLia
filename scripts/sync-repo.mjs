#!/usr/bin/env node
/**
 * Mantiene esta copia local al día con GitHub mientras trabajas: cada N segundos revisa
 * origin/main y, si hay commits nuevos de los colaboradores, los trae.
 *
 *   npm run sync                      # cada 20 s
 *   SYNC_INTERVAL_S=60 npm run sync   # otro intervalo
 *
 * Reglas para no romper tu trabajo:
 *   - Solo actualiza si no tienes cambios locales sin commit en archivos del repo.
 *   - Solo avanza en línea recta (fast-forward). Si tu rama y la remota divergieron,
 *     avisa y no toca nada: haz `git pull` a mano y resuelve.
 *   - Tras actualizar: `npm install` si cambió package.json o el lock, migraciones si cambió
 *     la base, y build de los paquetes compartidos si cambiaron. La web (Vite), la API y el
 *     simulador (tsx watch) recargan solos.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BRANCH = process.env.SYNC_BRANCH ?? 'main';
const INTERVAL_S = Math.max(5, Number(process.env.SYNC_INTERVAL_S ?? 20));

const time = () => new Date().toLocaleTimeString('es-MX', { hour12: false });
const log = (msg) => console.log(`[sync ${time()}] ${msg}`);

function git(...args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${(r.stderr || r.stdout).trim()}`);
  return r.stdout.trim();
}

function npm(...args) {
  log(`npm ${args.join(' ')}`);
  const r = spawnSync('npm', args, { cwd: root, stdio: 'inherit', shell: true });
  if (r.status !== 0) log(`⚠ falló "npm ${args.join(' ')}" (código ${r.status}); revisa arriba`);
}

let warned = '';
const warnOnce = (key, msg) => {
  if (warned === key) return;
  warned = key;
  log(msg);
};

function tick() {
  git('fetch', '--quiet', '--prune', 'origin', BRANCH);
  const remote = `origin/${BRANCH}`;
  const behind = Number(git('rev-list', '--count', `HEAD..${remote}`));
  const ahead = Number(git('rev-list', '--count', `${remote}..HEAD`));
  if (behind === 0) {
    if (ahead > 0) warnOnce(`ahead:${ahead}`, `Tienes ${ahead} commit(s) sin subir: usa git push.`);
    else warned = '';
    return;
  }
  if (ahead > 0) {
    warnOnce(
      `diverged:${ahead}:${behind}`,
      `⚠ Tu rama y GitHub divergieron (${ahead} local, ${behind} remoto). No actualizo: haz git pull y resuelve.`,
    );
    return;
  }
  const dirty = git('status', '--porcelain', '--untracked-files=no');
  if (dirty) {
    warnOnce(
      `dirty:${behind}`,
      `Hay ${behind} commit(s) nuevos en GitHub, pero tienes cambios sin commit. Haz commit (o stash) y los traigo.`,
    );
    return;
  }

  const files = git('diff', '--name-only', 'HEAD', remote).split('\n').filter(Boolean);
  const subjects = git('log', '--format=  · %h %an: %s', `HEAD..${remote}`);
  git('merge', '--ff-only', '--quiet', remote);
  warned = '';
  log(`✓ ${behind} commit(s) nuevos, ${files.length} archivo(s):\n${subjects}`);

  const changed = (re) => files.some((f) => re.test(f));
  if (changed(/(^|\/)package(-lock)?\.json$/)) npm('install');
  if (changed(/^packages\/shared-/)) npm('run', 'build:packages');
  if (changed(/^database\/(schema\.prisma|migrations\/)/)) {
    npm('run', 'prisma:generate', '-w', '@simu/api');
    npm('run', 'db:deploy');
  }
}

log(`Sincronizando con origin/${BRANCH} cada ${INTERVAL_S} s (Ctrl+C para detener)`);
const run = () => {
  try {
    tick();
  } catch (err) {
    warnOnce(`err:${err.message}`, `⚠ ${err.message}`);
  }
};
run();
setInterval(run, INTERVAL_S * 1000);
