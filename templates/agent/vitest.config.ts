import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		environment: 'node',
		include: ['client/**/*.{test,spec}.{ts,tsx}', 'shared/**/*.{test,spec}.{ts,tsx}'],
		exclude: ['node_modules/**', 'dist/**', '.tsbuild/**', '.wrangler/**'],
	},
})
