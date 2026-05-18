import { ToolDefinition, VoiceLLMDelta, VoiceLLMProvider, VoiceMessage } from '../types'

interface WorkersAIBinding {
	run(model: string, input: Record<string, unknown>): Promise<unknown>
}

interface LlamaStreamChunk {
	response?: string
	tool_calls?: Array<{
		name: string
		arguments: unknown
	}>
}

/**
 * Llama 3.3 70B Instruct on Workers AI with streaming + tool use.
 *
 * Workers AI's chat API uses a slightly different shape than OpenAI:
 *   - response chunks contain `{ response: '...partial text...' }`
 *   - tool calls arrive at the end of generation as
 *     `{ tool_calls: [{ name, arguments: {...} }] }`
 * We normalize both to the shared `VoiceLLMDelta` shape so callers can be
 * agnostic about the underlying model.
 */
export class WorkersAIVoiceLLMProvider implements VoiceLLMProvider {
	readonly modelId: string

	constructor(
		private readonly ai: WorkersAIBinding,
		modelId: string = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
	) {
		if (!ai) throw new Error('WorkersAIVoiceLLMProvider: missing AI binding')
		this.modelId = modelId
	}

	async *streamChat(
		messages: VoiceMessage[],
		opts?: { tools?: ToolDefinition[]; temperature?: number; maxTokens?: number }
	): AsyncIterable<VoiceLLMDelta> {
		const input: Record<string, unknown> = {
			messages: messages.map(toLlamaMessage),
			stream: true,
			temperature: opts?.temperature ?? 0.7,
		}
		if (opts?.maxTokens) input.max_tokens = opts.maxTokens
		if (opts?.tools && opts.tools.length > 0) {
			input.tools = opts.tools.map((t) => ({
				name: t.name,
				description: t.description,
				parameters: t.parameters,
			}))
		}

		const stream = (await this.ai.run(this.modelId, input)) as ReadableStream<Uint8Array>
		if (!stream || typeof (stream as ReadableStream).getReader !== 'function') {
			throw new Error('WorkersAIVoiceLLMProvider: expected a ReadableStream from AI binding')
		}

		let toolCallSequence = 0
		let sawToolCall = false

		for await (const event of parseSSE(stream)) {
			if (event.data === '[DONE]') {
				yield { type: 'finish', reason: sawToolCall ? 'tool_calls' : 'stop' }
				return
			}

			let chunk: LlamaStreamChunk
			try {
				chunk = JSON.parse(event.data) as LlamaStreamChunk
			} catch {
				continue
			}

			if (typeof chunk.response === 'string' && chunk.response.length > 0) {
				yield { type: 'text', delta: chunk.response }
			}

			if (Array.isArray(chunk.tool_calls)) {
				for (const tc of chunk.tool_calls) {
					sawToolCall = true
					yield {
						type: 'tool_call',
						toolCallId: `tc_${++toolCallSequence}`,
						name: tc.name,
						arguments:
							typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments ?? {}),
					}
				}
			}
		}

		yield { type: 'finish', reason: sawToolCall ? 'tool_calls' : 'stop' }
	}
}

function toLlamaMessage(msg: VoiceMessage): Record<string, unknown> {
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
