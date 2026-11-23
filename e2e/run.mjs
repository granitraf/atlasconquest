// Runs the browser checks. Needs Google Chrome installed; starts its own servers.
//   npm run verify                  every suite
//   npm run verify -- game          one suite: map | game | mobile | production
//   npm run verify -- game iceland  one section of the game suite
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, preview } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const DEV_SUITES = ['map', 'game', 'mobile'];
const wanted = process.argv[2];
const extra = process.argv.slice(3);
const wants = (suite) => !wanted || wanted === suite;

/** Runs a Node script in a child process with a clean NODE_ENV; resolves true if it exits 0. */
function node(args, env = {}) {
  return new Promise((resolve) => {
    const childEnv = { ...process.env, ...env };
    // The dev server sets NODE_ENV=development in this process. A build that inherited it
    // would silently be a development build, so children never inherit it.
    delete childEnv.NODE_ENV;
    const child = spawn(process.execPath, args, { stdio: 'inherit', cwd: root, env: childEnv });
    child.on('exit', (code) => resolve(code === 0));
  });
}

function run(suite, url) {
  console.log(`\n######## ${suite} ########`);
  return node([join(here, `${suite}.mjs`), ...extra], { ATLAS_URL: url });
}

let failed = 0;

if (DEV_SUITES.some(wants)) {
  // Development server: these suites read game state through the dev-only window.__atlas hook.
  const server = await createServer({ root, server: { port: 5199 }, logLevel: 'error' });
  await server.listen();
  const url = server.resolvedUrls.local[0];
  console.log(`Dev server at ${url}`);
  for (const suite of DEV_SUITES.filter(wants)) if (!(await run(suite, url))) failed++;
  await server.close();
}

if (wants('production')) {
  // Exactly what `npm run build` does after type-checking.
  const built = await node([join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--logLevel', 'error']);
  if (!built) {
    console.log('Production build failed.');
    process.exit(1);
  }
  const server = await preview({ root, preview: { port: 4199 }, logLevel: 'error' });
  const url = server.resolvedUrls.local[0];
  console.log(`\nProduction preview at ${url}`);
  if (!(await run('production', url))) failed++;
  await new Promise((resolve) => server.httpServer.close(resolve));
}

console.log(failed ? `\n${failed} suite(s) had failures.` : '\nAll suites passed.');
process.exit(failed ? 1 : 0);
