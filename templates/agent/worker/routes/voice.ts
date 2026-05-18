import { Environment } from '../environment'

/**
 * Upgrade `/api/voice` to the voice session durable object.
 * Must receive the runtime `Request` (not itty-router's wrapper) so `stub.fetch(request)`
 * works in local dev and production.
 */
export async function handleVoiceWebSocket(request: Request, env: Environment): Promise<Response> {
	if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
		return new Response('Expected WebSocket', { status: 426 })
	}
	if (!env.VOICE_SESSION) {
		return new Response('Voice session not configured', { status: 503 })
	}

	const url = new URL(request.url)
	const sessionId = url.searchParams.get('sessionId') ?? 'default'
	const id = env.VOICE_SESSION.idFromName(sessionId)
	const stub = env.VOICE_SESSION.get(id)
	return stub.fetch(request)
}
