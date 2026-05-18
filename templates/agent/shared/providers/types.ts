/**
 * Provider interfaces. Both LocalProvider (OpenAI + cosine-over-D1) and
 * CloudflareProvider (Workers AI + Vectorize) implement the same contract.
 *
 * The factory in `getProviders.ts` selects between them based on
 * `env.PROVIDER_MODE`. Application code should ALWAYS depend on `Providers`
 * and never import concrete classes directly.
 */

export type Float32Embedding = Float32Array

export interface EmbeddingProvider {
	/** The model identifier, used to detect cross-model index drift. */
	readonly modelId: string
	/** Vector dimension. Mismatched dimensions across calls will throw. */
	readonly dimensions: number
	/** Embed a batch of texts. Returns one vector per input, in order. */
	embed(texts: string[]): Promise<Float32Embedding[]>
}

export interface VectorMatch {
	id: string
	score: number
	metadata?: Record<string, unknown>
}

export interface VectorRecord {
	id: string
	vector: Float32Embedding
	metadata?: Record<string, unknown>
}

export interface VectorQueryFilter {
	/** Equality filter on metadata keys. Multiple keys = AND. */
	[key: string]: string | number | boolean | undefined
}

export interface VectorIndex {
	/** Logical index name (e.g. 'tutor-chunks'). */
	readonly name: string
	/** Expected vector dimension. */
	readonly dimensions: number
	/** Insert or replace records. */
	upsert(records: VectorRecord[]): Promise<void>
	/** Top-K nearest neighbour query. */
	query(
		vector: Float32Embedding,
		options: { topK: number; filter?: VectorQueryFilter }
	): Promise<VectorMatch[]>
	/** Delete records matching a metadata filter. */
	deleteByFilter(filter: VectorQueryFilter): Promise<{ deleted: number }>
}

export interface STTResult {
	text: string
	/** Optional word-level timestamps (when supported by the model). */
	words?: Array<{ word: string; start: number; end: number }>
}

export interface STTProvider {
	transcribe(
		audio: ArrayBuffer | Uint8Array,
		opts?: { language?: string; mimeType?: string }
	): Promise<STTResult>
}

export interface TTSProvider {
	/**
	 * Synthesize speech for `text` and stream output audio chunks. The audio
	 * format (mp3/opus/etc) is provider-specific; consumers should pass it
	 * through to the browser as-is.
	 */
	synthesize(
		text: string,
		opts?: { voice?: string; format?: 'mp3' | 'opus' | 'wav' }
	): AsyncIterable<Uint8Array>
}

export interface ToolDefinition {
	name: string
	description: string
	parameters: Record<string, unknown> // JSON schema
}

export type VoiceMessage =
	| { role: 'system' | 'user' | 'assistant'; content: string }
	| { role: 'tool'; toolCallId: string; content: string }

export type VoiceLLMDelta =
	| { type: 'text'; delta: string }
	| {
			type: 'tool_call'
			toolCallId: string
			name: string
			arguments: string // JSON string (may be partial deltas — caller buffers)
	  }
	| { type: 'finish'; reason: 'stop' | 'tool_calls' | 'length' | 'error' }

export interface VoiceLLMProvider {
	readonly modelId: string
	streamChat(
		messages: VoiceMessage[],
		opts?: { tools?: ToolDefinition[]; temperature?: number; maxTokens?: number }
	): AsyncIterable<VoiceLLMDelta>
}

export interface Providers {
	mode: 'local' | 'cloudflare'
	embeddings: EmbeddingProvider
	vectors: VectorIndex
	stt: STTProvider
	tts: TTSProvider
	voiceLLM: VoiceLLMProvider
}
