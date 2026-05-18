export interface Environment {
	AGENT_DURABLE_OBJECT: DurableObjectNamespace
	VOICE_SESSION?: DurableObjectNamespace
	OPENAI_API_KEY: string
	ANTHROPIC_API_KEY: string
	GOOGLE_API_KEY: string
	PROVIDER_MODE?: 'local' | 'cloudflare' | string
	TUTOR_DB?: D1Database
	TUTOR_DOCUMENTS?: R2Bucket
	TUTOR_KV?: KVNamespace
	AI?: Ai
	VECTORIZE?: VectorizeIndex
	TUTOR_VECTOR_INDEX_NAME?: string
	TUTOR_VOICE_MODEL?: string
	TUTOR_VOICE_NAME?: string
}
