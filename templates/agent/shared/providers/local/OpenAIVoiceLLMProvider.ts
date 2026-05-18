import { ToolDefinition, VoiceLLMDelta, VoiceLLMProvider, VoiceMessage } from '../types'

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions'

interface OpenAIStreamChoice {
	delta?: {
		content?: string
		tool_calls?: Array<{
			index: number
			id?: string
			type?: 'function'
			function?: { name?: string; arguments?: string }
		}>
	}
	finish_reason?: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null
}

interface OpenAIStreamChunk {
	choices: OpenAIStreamChoice[]
}

export class OpenAIVoiceLLMProvider implements VoiceLLMProvider {
	readonly modelId: string

	constructor(
		private readonly apiKey: string,
		modelId: string = 'gpt-4o-mini'
	) {
		if (!apiKey) throw new Error('OpenAIVoiceLLMProvider: missing OPENAI_API_KEY')
		this.modelId = modelId
	}

	async *streamChat(
		messages: VoiceMessage[],
		opts?: { tools?: ToolDefinition[]; temperature?: number; maxTokens?: number }
	): AsyncIterable<VoiceLLMDelta> {
		const body: Record<string, unknown> = {
			model: this.modelId,
			messages: messages.map(toOpenAIMessage),
			stream: true,
			temperature: opts?.temperature ?? 0.7,
		}
		if (opts?.maxTokens) body.max_tokens = opts.maxTokens
		if (opts?.tools && opts.tools.length > 0) {
			body.tools = opts.tools.map((t) => ({
				type: 'function',
				function: {
					name: t.name,
					description: t.description,
					parameters: t.parameters,
				},
			}))
		}

		const response = await fetch(OPENAI_CHAT_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${this.apiKey}`,
			},
			body: JSON.stringify(body),
		})

		if (!response.ok) {
			const errText = await response.text().catch(() => '')
			throw new Error(`OpenAI chat stream failed (${response.status}): ${errText}`)
		}
		if (!response.body) throw new Error('OpenAI chat stream returned no body')

		// Track tool-call accumulator state per index, since OpenAI streams
		// arguments fragment-by-fragment under stable `index` values.
		const toolCallIds = new Map<number, string>()
		const toolCallNames = new Map<number, string>()

		for await (const event of parseSSE(response.body)) {
			if (event.data === '[DONE]') {
				yield { type: 'finish', reason: 'stop' }
				return
			}

			let chunk: OpenAIStreamChunk
			try {
				chunk = JSON.parse(event.data) as OpenAIStreamChunk
			} catch {
				continue
			}

			const choice = chunk.choices?.[0]
			if (!choice) continue

			const delta = choice.delta ?? {}
			if (typeof delta.content === 'string' && delta.content.length > 0) {
				yield { type: 'text', delta: delta.content }
			}

			if (delta.tool_calls) {
				for (const tc of delta.tool_calls) {
					if (typeof tc.index !== 'number') continue
					if (tc.id) toolCallIds.set(tc.index, tc.id)
					if (tc.function?.name) toolCallNames.set(tc.index, tc.function.name)
					const id = toolCallIds.get(tc.index) ?? `call_${tc.index}`
					const name = toolCallNames.get(tc.index) ?? ''
					const args = tc.function?.arguments ?? ''
					if (name && args) {
						yield {
							type: 'tool_call',
							toolCallId: id,
							name,
							arguments: args,
						}
					}
				}
			}

			if (choice.finish_reason) {
				const reason: VoiceLLMDelta = {
					type: 'finish',
					reason:
						choice.finish_reason === 'length'
							? 'length'
							: choice.finish_reason === 'tool_calls'
								? 'tool_calls'
								: 'stop',
				}
				yield reason
				return
			}
		}
	}
}

function toOpenAIMessage(msg: VoiceMessage): Record<string, unknown> {
	if (msg.role === 'tool') {
		return {
			role: 'tool',
			tool_call_id: msg.toolCallId,
			content: msg.content,
		}
	}
	return {
		role: msg.role,
		content: msg.content,
	}
}

interface SSEEvent {
	event?: string
	data: string
}

async function* parseSSE(stream: ReadableStream<Uint8Array>): AsyncIterable<SSEEvent> {
	const reader = stream.getReader()
	const decoder = new TextDecoder()
	let buffer = ''
	try {
		while (true) {
			const { value, done } = await reader.read()
			if (done) break
			buffer += decoder.decode(value, { stream: true })
			let idx: number
			while ((idx = buffer.indexOf('\n\n')) !== -1) {
				const raw = buffer.slice(0, idx)
				buffer = buffer.slice(idx + 2)
				const ev = parseSSEBlock(raw)
				if (ev) yield ev
			}
		}
	} finally {
		reader.releaseLock()
	}
}

function parseSSEBlock(raw: string): SSEEvent | null {
	let event: string | undefined
	const dataLines: string[] = []
	for (const line of raw.split('\n')) {
		if (line.startsWith(':') || line.length === 0) continue
		if (line.startsWith('event:')) {
			event = line.slice(6).trim()
		} else if (line.startsWith('data:')) {
			dataLines.push(line.slice(5).trim())
		}
	}
	if (dataLines.length === 0) return null
	return { event, data: dataLines.join('\n') }
}
