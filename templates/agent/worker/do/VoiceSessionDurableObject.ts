import { DurableObject } from 'cloudflare:workers'
import { touchSession } from '../db/courses'
import type { Environment } from '../environment'
import { buildVoiceTutorSystemPrompt, DISPATCH_DRAWING_TOOL } from '../prompt/voice-tutor-prompt'
import { getProvidersForEnv } from '../providers'
import { retrieve, RetrievedChunk } from '../rag/retrieve'

type ClientMsg =
	| { type: 'init'; courseId: string; sessionId: string; courseName?: string; topicHint?: string }
	| { type: 'utterance_end'; audioBase64: string; mimeType?: string }
	| { type: 'text_input'; text: string }
	| { type: 'interrupt' }
	| { type: 'canvas_summary'; summary: string }

type ServerMsg =
	| { type: 'subtitle'; role: 'user' | 'agent'; text: string; final: boolean }
	| { type: 'audio_chunk'; audioBase64: string }
	| { type: 'agent_speaking'; speaking: boolean }
	| { type: 'draw'; intent?: string; instructions: string }
	| { type: 'sources'; chunkIds: string[] }
	| { type: 'error'; message: string }

interface TurnMessage {
	role: 'user' | 'assistant'
	content: string
}

interface StudentModel {
	confidentTopics: string[]
	strugglingTopics: string[]
}

export class VoiceSessionDurableObject extends DurableObject<Environment> {
	private courseId = ''
	private sessionId = ''
	private courseName = 'Course'
	private topicHint = ''
	private history: TurnMessage[] = []
	private summary = ''
	private studentModel: StudentModel = { confidentTopics: [], strugglingTopics: [] }
	private speaking = false
	private abortController: AbortController | null = null

	override async fetch(request: Request): Promise<Response> {
		const pair = new WebSocketPair()
		const [client, server] = Object.values(pair)
		this.handleSession(server)
		return new Response(null, { status: 101, webSocket: client })
	}

	private handleSession(ws: WebSocket) {
		ws.accept()

		ws.addEventListener('message', async (event) => {
			try {
				const msg = JSON.parse(String(event.data)) as ClientMsg
				if (msg.type === 'init') {
					this.courseId = msg.courseId
					this.sessionId = msg.sessionId
					this.courseName = msg.courseName ?? 'Course'
					this.topicHint = msg.topicHint ?? ''
					return
				}
				if (msg.type === 'interrupt') {
					this.abortController?.abort()
					this.send(ws, { type: 'agent_speaking', speaking: false })
					return
				}
				if (msg.type === 'utterance_end') {
					const bytes = base64ToBytes(msg.audioBase64)
					const providers = getProvidersForEnv(this.env)
					const stt = await providers.stt.transcribe(bytes, {
						mimeType: msg.mimeType ?? 'audio/webm',
					})
					await this.handleUserTurn(ws, stt.text)
					return
				}
				if (msg.type === 'text_input') {
					await this.handleUserTurn(ws, msg.text)
				}
			} catch (e) {
				this.send(ws, {
					type: 'error',
					message: e instanceof Error ? e.message : String(e),
				})
			}
		})
	}

	private async handleUserTurn(ws: WebSocket, userText: string) {
		const text = userText.trim()
		if (!text || !this.courseId) return

		this.abortController?.abort()
		this.abortController = new AbortController()
		const signal = this.abortController.signal

		this.send(ws, { type: 'subtitle', role: 'user', text, final: true })
		await this.persist('user', text)

		let chunks: RetrievedChunk[] = []
		try {
			chunks = await retrieve(this.env, this.courseId, text, { topK: 6 })
		} catch (e) {
			console.warn('RAG retrieve failed', e)
		}

		this.history.push({ role: 'user', content: text })
		if (this.history.length > 20) {
			this.history = this.history.slice(-20)
		}

		const providers = getProvidersForEnv(this.env)
		const contextBlock = chunks.map((c, i) => `[${i + 1}] ${c.text.slice(0, 600)}`).join('\n\n')

		const messages = [
			{
				role: 'system' as const,
				content: buildVoiceTutorSystemPrompt({
					courseName: this.courseName,
					topicHint: this.topicHint,
					studentModel: this.studentModel,
					conversationSummary: this.summary,
				}),
			},
			...this.history.slice(0, -1).map((m) => ({
				role: m.role,
				content: m.content,
			})),
			{
				role: 'user' as const,
				content: `Course material excerpts:\n${contextBlock || '(no indexed materials yet)'}\n\nStudent said: ${text}`,
			},
		]

		if (chunks.length > 0) {
			this.send(ws, { type: 'sources', chunkIds: chunks.map((c) => c.id) })
		}

		let agentText = ''
		let sentenceBuffer = ''
		const toolArgBuffers = new Map<string, string>()

		this.send(ws, { type: 'agent_speaking', speaking: true })
		this.speaking = true

		try {
			for await (const delta of providers.voiceLLM.streamChat(messages, {
				tools: [DISPATCH_DRAWING_TOOL],
			})) {
				if (signal.aborted) break

				if (delta.type === 'text') {
					agentText += delta.delta
					sentenceBuffer += delta.delta
					this.send(ws, {
						type: 'subtitle',
						role: 'agent',
						text: agentText,
						final: false,
					})

					const { sentences, rest } = takeCompleteSentences(sentenceBuffer)
					sentenceBuffer = rest
					for (const sentence of sentences) {
						if (signal.aborted) break
						await this.speakSentence(ws, sentence, signal)
					}
				}

				if (delta.type === 'tool_call' && delta.name === 'dispatch_to_drawing_agent') {
					const key = delta.toolCallId
					const prev = toolArgBuffers.get(key) ?? ''
					toolArgBuffers.set(key, prev + delta.arguments)
					try {
						const args = JSON.parse(toolArgBuffers.get(key)!) as {
							intent?: string
							instructions?: string
						}
						if (args.instructions) {
							this.send(ws, {
								type: 'draw',
								intent: args.intent,
								instructions: args.instructions,
							})
						}
					} catch {
						// partial JSON
					}
				}
			}

			if (sentenceBuffer.trim() && !signal.aborted) {
				await this.speakSentence(ws, sentenceBuffer.trim(), signal)
			}

			if (agentText.trim()) {
				this.send(ws, {
					type: 'subtitle',
					role: 'agent',
					text: agentText.trim(),
					final: true,
				})
				this.history.push({ role: 'assistant', content: agentText.trim() })
				await this.persist('agent', agentText.trim())
				await this.maybeUpdateStudentModel(userText, agentText.trim())
			}
		} catch (e) {
			if (!signal.aborted) {
				this.send(ws, {
					type: 'error',
					message: e instanceof Error ? e.message : String(e),
				})
			}
		} finally {
			this.speaking = false
			this.send(ws, { type: 'agent_speaking', speaking: false })
		}
	}

	private async speakSentence(ws: WebSocket, sentence: string, signal: AbortSignal) {
		const providers = getProvidersForEnv(this.env)
		const parts: Uint8Array[] = []
		for await (const chunk of providers.tts.synthesize(sentence, { format: 'mp3' })) {
			if (signal.aborted) return
			if (chunk.byteLength > 0) parts.push(chunk)
		}
		if (parts.length === 0 || signal.aborted) return

		// Send one complete MP3 per sentence — stream fragments are not playable alone.
		const merged = concatBytes(parts)
		this.send(ws, { type: 'audio_chunk', audioBase64: bytesToBase64(merged) })
	}

	private async persist(role: string, content: string) {
		if (!this.sessionId || !this.env.TUTOR_DB) return
		const id = `msg_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
		const created_at = Date.now()
		await this.env.TUTOR_DB.prepare(
			`INSERT INTO messages (id, session_id, role, content, audio_r2_key, created_at)
       VALUES (?, ?, ?, ?, NULL, ?)`
		)
			.bind(id, this.sessionId, role, content, created_at)
			.run()
		await touchSession(this.env.TUTOR_DB, this.sessionId)
	}

	private async maybeUpdateStudentModel(userText: string, agentText: string) {
		// Lightweight heuristic update (full LLM structured output can come later)
		const lower = userText.toLowerCase()
		if (/\b(i don'?t|confus|not sure|what do you mean)\b/.test(lower)) {
			const topic = this.topicHint || 'current topic'
			if (!this.studentModel.strugglingTopics.includes(topic)) {
				this.studentModel.strugglingTopics.push(topic)
			}
		}
		if (/\b(got it|makes sense|understand|thanks)\b/.test(lower)) {
			const topic = this.topicHint || 'current topic'
			if (!this.studentModel.confidentTopics.includes(topic)) {
				this.studentModel.confidentTopics.push(topic)
			}
		}
		void agentText
	}

	private send(ws: WebSocket, msg: ServerMsg) {
		try {
			ws.send(JSON.stringify(msg))
		} catch {
			// socket closed
		}
	}
}

function takeCompleteSentences(buffer: string): { sentences: string[]; rest: string } {
	const sentences: string[] = []
	const parts = buffer.split(/(?<=[.!?])\s+/)
	if (parts.length <= 1) return { sentences, rest: buffer }
	for (let i = 0; i < parts.length - 1; i++) {
		const s = parts[i].trim()
		if (s) sentences.push(s)
	}
	return { sentences, rest: parts[parts.length - 1] ?? '' }
}

function base64ToBytes(b64: string): ArrayBuffer {
	const binary = atob(b64)
	const out = new Uint8Array(binary.length)
	for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
	return out.buffer
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = ''
	for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
	return btoa(binary)
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
	const total = chunks.reduce((n, c) => n + c.byteLength, 0)
	const merged = new Uint8Array(total)
	let offset = 0
	for (const chunk of chunks) {
		merged.set(chunk, offset)
		offset += chunk.byteLength
	}
	return merged
}
