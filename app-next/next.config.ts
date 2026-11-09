import type { NextConfig } from 'next';

const config: NextConfig = {
  // Prompt files are read at run time by lib/model; keep them with the server bundle if the app is ever traced or standalone.
  outputFileTracingIncludes: { '/api/**': ['./lib/model/prompts/**/*', './data/**/*'] },
  headers: async () => [{ source: '/:path*', headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }] }],
};
export default config;
