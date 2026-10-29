import { getDb, closeDb } from '../src/server/db';
import { prepareDemoScenario } from '../src/server/demo-scenario';
import { validateHostedDemo } from '../src/server/demo-config';
validateHostedDemo();
try {
  getDb();
  if (process.env.AGENTDESK_PREPARE_DEMO === 'true') prepareDemoScenario();
  console.log('Demo storage is ready.');
} finally { closeDb(); }
