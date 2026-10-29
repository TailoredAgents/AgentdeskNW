import type { NextConfig } from 'next';
const config: NextConfig = { serverExternalPackages: ['better-sqlite3'], poweredByHeader: false, outputFileTracingExcludes: {'*':['./data/**/*','./.env*','./.git/**/*']} };
export default config;
