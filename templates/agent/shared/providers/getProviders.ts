/**
 * Factory that selects between LocalProvider and CloudflareProvider based on
 * `env.PROVIDER_MODE`. This is the single integration point for the rest of
 * the worker — no other module should import a concrete provider class.
 *
 * - `PROVIDER_MODE=cloudflare` (production): uses Workers AI + Vectorize.
 * - `PROVIDER_MODE=local` (default for dev): uses OpenAI APIs and the
 *   D1CosineIndex brute-force vector store.
 */

import { createCloudflareProviders } from './cloudflare'
import { createLocalProviders } from './local'
import { Providers } from './types'

interface WorkersAIBinding {
	run(model: string, input: Record<string, unknown>): Promise<unknown>
}

interface VectorizeBinding {
	upsert(
		records: Array<{ id: string; values: number[]; metadata?: Record<string, unknown> }>
	): Promise<unknown>
	query(
		vector: number[],
		opts: {
			topK: number
			returnMetadata?: 'all' | 'none' | boolean
			filter?: Record<string, unknown>
		}
	): Promise<{
		matches: Array<{ id: string; score: number; metadata?: Record<string, unknown> }>
	}>
	deleteByIds(ids: string[]): Promise<unknown>
}

export interface ProviderEnv {
	PROVIDER_MODE?: 'local' | 'cloudflare' | string
	OPENAI_API_KEY?: string
	TUTOR_DB?: D1Database
	AI?: WorkersAIBinding
	VECTORIZE?: VectorizeBinding
	TUTOR_VECTOR_INDEX_NAME?: string
	TUTOR_VOICE_MODEL?: string
	TUTOR_VOICE_NAME?: string
}

/** Accepts worker Environment or a plain ProviderEnv bag. */
export function getProviders(env: ProviderEnv): Providers {
	const mode = (env.PROVIDER_MODE ?? 'local').toLowerCase()

	if (mode === 'cloudflare') {
		if (!env.AI) throw new Error('PROVIDER_MODE=cloudflare requires the `AI` binding')
		if (!env.VECTORIZE) {
			throw new Error('PROVIDER_MODE=cloudflare requires the `VECTORIZE` binding')
		}
		return createCloudflareProviders({
			ai: env.AI,
			vectorize: env.VECTORIZE as unknown as VectorizeBinding,
			indexName: env.TUTOR_VECTOR_INDEX_NAME,
			voiceModel: env.TUTOR_VOICE_MODEL,
			voiceName: env.TUTOR_VOICE_NAME,
		})
	}

	if (!env.OPENAI_API_KEY) {
		throw new Error('PROVIDER_MODE=local requires OPENAI_API_KEY in the env')
	}
	if (!env.TUTOR_DB) {
		throw new Error('PROVIDER_MODE=local requires the `TUTOR_DB` D1 binding')
	}
	return createLocalProviders({
		openaiApiKey: env.OPENAI_API_KEY,
		db: env.TUTOR_DB,
		indexName: env.TUTOR_VECTOR_INDEX_NAME,
		voiceModel: env.TUTOR_VOICE_MODEL,
		voiceName: env.TUTOR_VOICE_NAME,
	})
}
