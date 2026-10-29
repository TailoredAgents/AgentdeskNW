import { existsSync } from 'node:fs';
import { closeDb } from '../src/server/db';
import { prepareDemoScenario } from '../src/server/demo-scenario';
import { validateHostedDemo } from '../src/server/demo-config';
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
try {
  validateHostedDemo();
  const result = prepareDemoScenario();
  console.log(result.prepared ? 'Fictional presentation workspace prepared. Fourteen-day demo trials are active; no payments or messages were sent.' : 'Presentation workspace already prepared. Existing work and trial expiration were preserved.');
} finally { closeDb(); }
