import { STTProvider, STTResult } from '../types'

interface WorkersAIBinding {
	run(model: string, input: Record<string, unknown>): Promise<unknown>
}

interface WhisperResponse {
	text?: string
	words?: Array<{ word: string; start: number; end: number }>
}

export class WorkersAISTTProvider implements STTProvider {
	readonly modelId = '@cf/openai/whisper-large-v3-turbo'

	constructor(private readonly ai: WorkersAIBinding) {
		if (!ai) throw new Error('WorkersAISTTProvider: missing AI binding')
	}

	async transcribe(
		audio: ArrayBuffer | Uint8Array,
		opts?: { language?: string }
	): Promise<STTResult> {
		const bytes = audio instanceof Uint8Array ? audio : new Uint8Array(audio)
		const result = (await this.ai.run(this.modelId, {
			audio: Array.from(bytes),
			language: opts?.language,
		})) as WhisperResponse
		return {
			text: result.text ?? '',
			words: result.words,
		}
	}
}
