import { EmbeddingProvider, Float32Embedding } from '../types'

const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings'

interface OpenAIEmbeddingResponse {
	data: Array<{ embedding: number[]; index: number }>
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
	readonly modelId = 'text-embedding-3-small'
	readonly dimensions = 1536

	constructor(private readonly apiKey: string) {
		if (!apiKey) throw new Error('OpenAIEmbeddingProvider: missing OPENAI_API_KEY')
	}

	async embed(texts: string[]): Promise<Float32Embedding[]> {
		if (texts.length === 0) return []

		const response = await fetch(OPENAI_EMBEDDINGS_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${this.apiKey}`,
			},
			body: JSON.stringify({
				model: this.modelId,
				input: texts,
			}),
		})

		if (!response.ok) {
			const text = await response.text().catch(() => '')
			throw new Error(`OpenAI embeddings request failed (${response.status}): ${text}`)
		}

		const json = (await response.json()) as OpenAIEmbeddingResponse
		// Sort by `index` to match input order (OpenAI guarantees this but be safe).
		const sorted = [...json.data].sort((a, b) => a.index - b.index)
		return sorted.map((d) => Float32Array.from(d.embedding))
	}
}
