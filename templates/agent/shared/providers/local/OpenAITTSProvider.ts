import { TTSProvider } from '../types'

const OPENAI_TTS_URL = 'https://api.openai.com/v1/audio/speech'

export class OpenAITTSProvider implements TTSProvider {
	readonly modelId = 'tts-1'

	constructor(
		private readonly apiKey: string,
		private readonly defaultVoice: string = 'alloy'
	) {
		if (!apiKey) throw new Error('OpenAITTSProvider: missing OPENAI_API_KEY')
	}

	async *synthesize(
		text: string,
		opts?: { voice?: string; format?: 'mp3' | 'opus' | 'wav' }
	): AsyncIterable<Uint8Array> {
		if (!text) return

		const response = await fetch(OPENAI_TTS_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${this.apiKey}`,
			},
			body: JSON.stringify({
				model: this.modelId,
				input: text,
				voice: opts?.voice ?? this.defaultVoice,
				response_format: opts?.format ?? 'mp3',
			}),
		})

		if (!response.ok) {
			const errText = await response.text().catch(() => '')
			throw new Error(`OpenAI TTS request failed (${response.status}): ${errText}`)
		}

		if (!response.body) throw new Error('OpenAI TTS returned no body')

		const reader = response.body.getReader()
		try {
			while (true) {
				const { value, done } = await reader.read()
				if (done) break
				if (value && value.byteLength > 0) yield value
			}
		} finally {
			reader.releaseLock()
		}
	}
}
