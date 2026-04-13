import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
	test: {
		poolOptions: {
			workers: {
				wrangler: { configPath: './wrangler.jsonc' },
				miniflare: {
					// Test-only secrets — never used in production
					bindings: {
						JWT_SECRET: 'test-jwt-secret-vitest',
						RESEND_API_KEY: 'test-resend-key',
						FROM_EMAIL: 'test@example.com',
						APP_URL: 'https://test.example.com',
					},
				},
			},
		},
	},
});
