import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'

export default defineWorkersConfig({
  test: {
    coverage: {
      provider: 'istanbul',
    },
    poolOptions: {
      workers: {
        main: './src/index.ts',
        wrangler: { configPath: './wrangler.toml' },
        compatibilityFlags: ['nodejs_compat'],
        miniflare: {
          r2Buckets: ['BUCKET'],
        },
        // host: '127.0.0.1',
        // port: 8787,
      },
    },
  },
})
