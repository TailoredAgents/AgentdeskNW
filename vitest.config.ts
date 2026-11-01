import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Existing synthetic provider receipts explicitly use Astra. Default-selection
// tests clear this fixture value; Sol's real-tool rehearsal has its own config.
export default defineConfig({resolve:{alias:{'@':path.resolve(path.dirname(fileURLToPath(import.meta.url)),'src')}},test:{include:['tests/**/*.test.ts'],fileParallelism:false,env:{AGENTDESK_DEMO:'true',AGENTDESK_ALLOW_PRODUCTION_DEMO:'true',OPENAI_MODEL:'gpt-6-astra'}}});
