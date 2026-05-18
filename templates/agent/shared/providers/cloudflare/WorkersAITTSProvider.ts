import { TTSProvider } from '../types'

interface WorkersAIBinding {
	run(model: string, input: Record<string, unknown>): Promise<unknown>
}

/**
 * MeloTTS via Workers AI. The binding returns a non-streaming Buffer/Blob,
 * so we yield the entire payload as a single chunk. (The TTSProvider
 * interface accepts AsyncIterable so consumers can already handle this.)
 *
 * If/when Cloudflare ships streaming TTS, swap the implementation here —
 * the public API stays identical.
 */
export class WorkersAITTSProvider implements TTSProvider {
	readonly modelId = '@cf/myshell-ai/melotts'

	constructor(
		private readonly ai: WorkersAIBinding,
		private readonly defaultVoice: string = 'EN-US'
	) {
		if (!ai) throw new Error('WorkersAITTSProvider: missing AI binding')
	}

	async *synthesize(text: string, opts?: { voice?: string }): AsyncIterable<Uint8Array> {
		if (!text) return

		const result = (await this.ai.run(this.modelId, {
			prompt: text,
			lang: opts?.voice ?? this.defaultVoice,
		})) as { audio?: string }

		// The model returns base64-encoded mp3 audio. Decode in one go.
		const base64 = result.audio
		if (!base64) return
		yield base64ToBytes(base64)
	}
}

function base64ToBytes(base64: string): Uint8Array {
	const binary = atob(base64)
	const out = new Uint8Array(binary.length)
	for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
	return out
}
