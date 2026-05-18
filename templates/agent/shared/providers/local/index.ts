/**
 * Local provider — uses OpenAI for embeddings/STT/TTS/voice LLM and a brute
 * force cosine index in D1. This is the development implementation; it runs
 * without any Cloudflare bindings beyond D1 (which Wrangler emulates locally).
 */

import { Providers } from '../types'
import { D1CosineIndex } from './D1CosineIndex'
import { OpenAIEmbeddingProvider } from './OpenAIEmbeddingProvider'
import { OpenAISTTProvider } from './OpenAISTTProvider'
import { OpenAITTSProvider } from './OpenAITTSProvider'
import { OpenAIVoiceLLMProvider } from './OpenAIVoiceLLMProvider'

export interface LocalProvidersConfig {
	openaiApiKey: string
	db: D1Database
	indexName?: string
	voiceModel?: string
	voiceName?: string
}

export function createLocalProviders(config: LocalProvidersConfig): Providers {
	const embeddings = new OpenAIEmbeddingProvider(config.openaiApiKey)
	const vectors = new D1CosineIndex(config.db, {
		name: config.indexName ?? 'tutor-chunks',
		dimensions: embeddings.dimensions,
	})
	const stt = new OpenAISTTProvider(config.openaiApiKey)
	const tts = new OpenAITTSProvider(config.openaiApiKey, config.voiceName)
	const voiceLLM = new OpenAIVoiceLLMProvider(config.openaiApiKey, config.voiceModel)
	return {
		mode: 'local',
		embeddings,
		vectors,
		stt,
		tts,
		voiceLLM,
	}
}

export {
	D1CosineIndex,
	OpenAIEmbeddingProvider,
	OpenAISTTProvider,
	OpenAITTSProvider,
	OpenAIVoiceLLMProvider,
}
