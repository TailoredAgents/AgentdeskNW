import type { NextConfig } from 'next';
const config: NextConfig = { devIndicators: false, serverExternalPackages: ['better-sqlite3','unpdf'], poweredByHeader: false, outputFileTracingIncludes: {'/api/**/*':['./scripts/extract-document-pdf.mjs','./node_modules/unpdf/dist/**/*']}, outputFileTracingExcludes: {'*':['./data/**/*','./.env*','./.git/**/*']} };
export default config;
