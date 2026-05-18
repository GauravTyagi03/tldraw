import { useCallback, useEffect, useRef, useState } from 'react'
import type { SubtitleEntry } from '../components/SubtitleOverlay'
import type { VoiceButtonState } from '../components/VoiceButton'

export interface VoiceDrawRequest {
	intent?: string
	instructions: string
}

interface UseVoiceSessionOptions {
	courseId: string
	sessionId: string
	courseName?: string
	topicHint?: string
	onDraw?: (req: VoiceDrawRequest) => void
	enabled?: boolean
}

function wsUrl(sessionId: string): string {
	const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
	return `${proto}//${window.location.host}/api/voice?sessionId=${encodeURIComponent(sessionId)}`
}

/** Pick a MediaRecorder format Whisper accepts (Safari often needs mp4). */
function pickRecordingMimeType(): string {
	if (typeof MediaRecorder === 'undefined') return 'audio/webm'
	const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
	for (const mimeType of candidates) {
		if (MediaRecorder.isTypeSupported(mimeType)) return mimeType
	}
	return 'audio/webm'
}

export function useVoiceSession({
	courseId,
	sessionId,
	courseName,
	topicHint,
	onDraw,
	enabled = true,
}: UseVoiceSessionOptions) {
	const [state, setState] = useState<VoiceButtonState>('idle')
	const [subtitle, setSubtitle] = useState<SubtitleEntry | null>(null)
	const wsRef = useRef<WebSocket | null>(null)
	const mediaRef = useRef<MediaRecorder | null>(null)
	const recordingMimeRef = useRef<string>('audio/webm')
	const chunksRef = useRef<Blob[]>([])
	const audioContextRef = useRef<AudioContext | null>(null)
	const playQueueRef = useRef<Promise<void>>(Promise.resolve())

	const connectPromiseRef = useRef<Promise<WebSocket> | null>(null)

	const ensureConnected = useCallback((): Promise<WebSocket> => {
		if (!enabled) {
			return Promise.reject(new Error('Voice session disabled'))
		}
		const open = wsRef.current
		if (open?.readyState === WebSocket.OPEN) {
			return Promise.resolve(open)
		}
		if (connectPromiseRef.current) {
			return connectPromiseRef.current
		}

		const promise = new Promise<WebSocket>((resolve, reject) => {
			const ws = new WebSocket(wsUrl(sessionId))
			wsRef.current = ws
			ws.addEventListener('open', () => {
				ws.send(
					JSON.stringify({
						type: 'init',
						courseId,
						sessionId,
						courseName,
						topicHint,
					})
				)
				resolve(ws)
			})
			ws.addEventListener('message', (ev) => {
				const msg = JSON.parse(String(ev.data)) as Record<string, unknown>
				switch (msg.type) {
					case 'subtitle':
						setSubtitle({
							role: msg.role as 'user' | 'agent',
							text: String(msg.text),
						})
						break
					case 'agent_speaking':
						setState(msg.speaking ? 'speaking' : 'idle')
						break
					case 'audio_chunk': {
						const b64 = String(msg.audioBase64)
						playQueueRef.current = playQueueRef.current.then(() => playMp3Base64(b64))
						break
					}
					case 'draw':
						onDraw?.({
							intent: msg.intent ? String(msg.intent) : undefined,
							instructions: String(msg.instructions),
						})
						break
					case 'error':
						console.error('Voice session error', msg.message)
						setState('idle')
						break
				}
			})
			ws.addEventListener('error', () => {
				reject(new Error('Voice WebSocket connection failed'))
			})
			ws.addEventListener('close', (ev) => {
				wsRef.current = null
				connectPromiseRef.current = null
				if (!ev.wasClean && ev.code !== 1000) {
					console.warn('Voice WebSocket closed', ev.code, ev.reason)
				}
			})
		})

		connectPromiseRef.current = promise
		return promise
	}, [courseId, sessionId, courseName, topicHint, enabled, onDraw])

	useEffect(() => {
		return () => {
			wsRef.current?.close()
			wsRef.current = null
			connectPromiseRef.current = null
			mediaRef.current?.stop()
		}
	}, [])

	const sendText = useCallback(
		async (text: string) => {
			try {
				const ws = await ensureConnected()
				setState('processing')
				ws.send(JSON.stringify({ type: 'text_input', text }))
			} catch (e) {
				console.error('Voice session unavailable', e)
			}
		},
		[ensureConnected]
	)

	const startListening = useCallback(async () => {
		try {
			await ensureConnected()
		} catch (e) {
			console.error('Voice WebSocket connection failed', e)
			setState('disabled')
			return
		}
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
			const mimeType = pickRecordingMimeType()
			recordingMimeRef.current = mimeType
			const recorder = new MediaRecorder(stream, { mimeType })
			chunksRef.current = []
			recorder.ondataavailable = (e) => {
				if (e.data.size > 0) chunksRef.current.push(e.data)
			}
			recorder.onstop = async () => {
				stream.getTracks().forEach((t) => t.stop())
				const mime = recordingMimeRef.current
				const blob = new Blob(chunksRef.current, { type: mime })
				if (blob.size < 1000) {
					console.warn('Recording too short; try speaking a bit longer')
					setState('idle')
					return
				}
				const b64 = await blobToBase64(blob)
				const ws = wsRef.current
				if (ws?.readyState === WebSocket.OPEN) {
					setState('processing')
					ws.send(
						JSON.stringify({
							type: 'utterance_end',
							audioBase64: b64,
							mimeType: mime,
						})
					)
				} else {
					setState('idle')
				}
			}
			mediaRef.current = recorder
			recorder.start()
			setState('listening')
		} catch (e) {
			console.error('Microphone permission failed', e)
			setState('disabled')
		}
	}, [ensureConnected])

	const stopListening = useCallback(() => {
		const rec = mediaRef.current
		if (rec && rec.state !== 'inactive') {
			rec.stop()
		} else {
			setState('idle')
		}
	}, [])

	const interrupt = useCallback(() => {
		wsRef.current?.send(JSON.stringify({ type: 'interrupt' }))
		playQueueRef.current = Promise.resolve()
		setState('idle')
	}, [])

	const toggleMic = useCallback(() => {
		if (state === 'listening') {
			stopListening()
		} else if (state === 'speaking' || state === 'processing') {
			interrupt()
		} else {
			void startListening()
		}
	}, [state, startListening, stopListening, interrupt])

	return {
		state,
		subtitle,
		toggleMic,
		sendText,
		interrupt,
	}
}

async function playMp3Base64(b64: string): Promise<void> {
	if (!b64) return
	const binary = atob(b64)
	const bytes = new Uint8Array(binary.length)
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
	if (bytes.byteLength < 128) return

	const blob = new Blob([bytes], { type: 'audio/mpeg' })
	const url = URL.createObjectURL(blob)
	const audio = new Audio(url)
	try {
		await audio.play()
	} catch (e) {
		URL.revokeObjectURL(url)
		console.error('Audio playback failed', e)
		return
	}
	await new Promise<void>((resolve) => {
		audio.onended = () => {
			URL.revokeObjectURL(url)
			resolve()
		}
		audio.onerror = () => {
			URL.revokeObjectURL(url)
			resolve()
		}
	})
}

function blobToBase64(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => {
			const result = String(reader.result)
			const base64 = result.split(',')[1] ?? ''
			resolve(base64)
		}
		reader.onerror = reject
		reader.readAsDataURL(blob)
	})
}
