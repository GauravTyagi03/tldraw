/**
 * Cloudflare provider — uses Workers AI for embeddings/STT/TTS/voice LLM and
 * Vectorize for the vector index. This is the production implementation,
 * dormant until `PROVIDER_MODE=cloudflare` is set in the env.
 *
 * The bindings (`AI`, `VECTORIZE`) must be declared in `wrangler.toml`.
 */

import { Providers } from '../types'
import { VectorizeIndex } from './VectorizeIndex'
import { WorkersAIEmbeddingProvider } from './WorkersAIEmbeddingProvider'
import { WorkersAISTTProvider } from './WorkersAISTTProvider'
import { WorkersAITTSProvider } from './WorkersAITTSProvider'
import { WorkersAIVoiceLLMProvider } from './WorkersAIVoiceLLMProvider'

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

export interface CloudflareProvidersConfig {
	ai: WorkersAIBinding
	vectorize: VectorizeBinding
	indexName?: string
	voiceModel?: string
	voiceName?: string
}

export function createCloudflareProviders(config: CloudflareProvidersConfig): Providers {
	const embeddings = new WorkersAIEmbeddingProvider(config.ai)
	const vectors = new VectorizeIndex(config.vectorize, {
		name: config.indexName ?? 'tutor-chunks',
		dimensions: embeddings.dimensions,
	})
	const stt = new WorkersAISTTProvider(config.ai)
	const tts = new WorkersAITTSProvider(config.ai, config.voiceName)
	const voiceLLM = new WorkersAIVoiceLLMProvider(config.ai, config.voiceModel)
	return {
		mode: 'cloudflare',
		embeddings,
		vectors,
		stt,
		tts,
		voiceLLM,
	}
}

export {
	VectorizeIndex,
	WorkersAIEmbeddingProvider,
	WorkersAISTTProvider,
	WorkersAITTSProvider,
	WorkersAIVoiceLLMProvider,
}
