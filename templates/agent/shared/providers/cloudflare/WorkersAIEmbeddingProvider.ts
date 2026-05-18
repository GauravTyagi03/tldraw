import { EmbeddingProvider, Float32Embedding } from '../types'

interface WorkersAIBinding {
	run(model: string, input: Record<string, unknown>): Promise<unknown>
}

interface BGEResponse {
	shape?: number[]
	data?: number[][]
}

export class WorkersAIEmbeddingProvider implements EmbeddingProvider {
	readonly modelId = '@cf/baai/bge-base-en-v1.5'
	readonly dimensions = 768

	constructor(private readonly ai: WorkersAIBinding) {
		if (!ai) throw new Error('WorkersAIEmbeddingProvider: missing AI binding')
	}

	async embed(texts: string[]): Promise<Float32Embedding[]> {
		if (texts.length === 0) return []
		const result = (await this.ai.run(this.modelId, { text: texts })) as BGEResponse
		if (!result?.data) {
			throw new Error('WorkersAI BGE returned no data')
		}
		return result.data.map((row) => Float32Array.from(row))
	}
}
