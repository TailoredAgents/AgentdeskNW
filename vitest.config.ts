import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export default defineConfig({resolve:{alias:{'@':path.resolve(path.dirname(fileURLToPath(import.meta.url)),'src')}},test:{include:['tests/**/*.test.ts'],fileParallelism:false,env:{AGENTDESK_DEMO:'true',AGENTDESK_ALLOW_PRODUCTION_DEMO:'true'}}});
