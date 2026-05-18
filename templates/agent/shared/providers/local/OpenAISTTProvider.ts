import { STTProvider, STTResult } from '../types'

const OPENAI_TRANSCRIPTIONS_URL = 'https://api.openai.com/v1/audio/transcriptions'

interface OpenAITranscriptionResponse {
	text: string
}

export class OpenAISTTProvider implements STTProvider {
	readonly modelId = 'whisper-1'

	constructor(private readonly apiKey: string) {
		if (!apiKey) throw new Error('OpenAISTTProvider: missing OPENAI_API_KEY')
	}

	async transcribe(
		audio: ArrayBuffer | Uint8Array,
		opts?: { language?: string; mimeType?: string }
	): Promise<STTResult> {
		const mimeType = opts?.mimeType ?? 'audio/webm'
		const blob = new Blob([copyToArrayBuffer(audio)], { type: mimeType })
		const filename = `audio.${extensionForMimeType(mimeType)}`

		const form = new FormData()
		form.append('model', this.modelId)
		form.append('file', blob, filename)
		if (opts?.language) form.append('language', opts.language)
		form.append('response_format', 'json')

		const response = await fetch(OPENAI_TRANSCRIPTIONS_URL, {
			method: 'POST',
			headers: { Authorization: `Bearer ${this.apiKey}` },
			body: form,
		})

		if (!response.ok) {
			const text = await response.text().catch(() => '')
			throw new Error(`OpenAI STT request failed (${response.status}): ${text}`)
		}

		const json = (await response.json()) as OpenAITranscriptionResponse
		return { text: json.text ?? '' }
	}
}

/** OpenAI Whisper expects a filename with a supported extension. */
function extensionForMimeType(mimeType: string): string {
	const base = mimeType.split(';')[0]?.trim().toLowerCase() ?? ''
	if (base.includes('webm')) return 'webm'
	if (base.includes('mp4')) return 'mp4'
	if (base.includes('m4a')) return 'm4a'
	if (base.includes('mpeg') || base.includes('mp3')) return 'mp3'
	if (base.includes('ogg') || base.includes('oga')) return 'ogg'
	if (base.includes('wav')) return 'wav'
	if (base.includes('flac')) return 'flac'
	return 'webm'
}

/** Copy into a fresh ArrayBuffer so BlobPart typing is satisfied in strict TS. */
function copyToArrayBuffer(audio: ArrayBuffer | Uint8Array): ArrayBuffer {
	if (audio instanceof ArrayBuffer) {
		return audio.slice(0)
	}
	const out = new ArrayBuffer(audio.byteLength)
	new Uint8Array(out).set(audio)
	return out
}
