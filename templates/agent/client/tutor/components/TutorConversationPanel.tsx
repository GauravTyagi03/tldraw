import { FormEventHandler, useCallback, useEffect, useRef, useState } from 'react'
import { TldrawAgent } from '../../agent/TldrawAgent'
import { apiFetchMessages, apiPostMessage } from '../api/courseApi'
import { TutorMessage } from '../types'

interface TutorConversationPanelProps {
	sessionId: string
	agent: TldrawAgent
	onSendTextToVoice?: (text: string) => void
}

export function TutorConversationPanel({
	sessionId,
	agent,
	onSendTextToVoice,
}: TutorConversationPanelProps) {
	const [messages, setMessages] = useState<TutorMessage[]>([])
	const [input, setInput] = useState('')
	const [canvasMode, setCanvasMode] = useState(false)
	const bottomRef = useRef<HTMLDivElement>(null)

	const loadMessages = useCallback(async () => {
		try {
			const rows = await apiFetchMessages(sessionId)
			setMessages(rows)
		} catch {
			// API unavailable — keep local list empty
		}
	}, [sessionId])

	useEffect(() => {
		void loadMessages()
		const interval = setInterval(loadMessages, 4000)
		return () => clearInterval(interval)
	}, [loadMessages])

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
	}, [messages])

	const handleSubmit = useCallback<FormEventHandler<HTMLFormElement>>(
		async (e) => {
			e.preventDefault()
			const text = input.trim()
			if (!text) return
			setInput('')

			if (canvasMode) {
				agent.interrupt({
					input: {
						agentMessages: [text],
						bounds: agent.editor.getViewportPageBounds(),
						source: 'user',
						contextItems: agent.context.getItems(),
					},
				})
				try {
					await apiPostMessage(sessionId, 'user', text)
				} catch {
					// local only
				}
			} else if (onSendTextToVoice) {
				onSendTextToVoice(text)
			}

			void loadMessages()
		},
		[agent, canvasMode, input, loadMessages, onSendTextToVoice, sessionId]
	)

	return (
		<div className="tutor-conversation-panel">
			<div className="tutor-conversation-header">
				<span className="tutor-conversation-title">Conversation</span>
				<label className="tutor-canvas-mode-toggle">
					<input
						type="checkbox"
						checked={canvasMode}
						onChange={(e) => setCanvasMode(e.target.checked)}
					/>
					Canvas agent
				</label>
			</div>
			<div className="tutor-conversation-feed">
				{messages.length === 0 ? (
					<p className="tutor-conversation-empty">
						Your tutoring conversation will appear here. Use the mic button to talk, or type below.
					</p>
				) : (
					messages.map((m) => (
						<div key={m.id} className={`tutor-conversation-turn tutor-turn-${m.role}`}>
							<span className="tutor-turn-role">{m.role === 'user' ? 'You' : 'Tutor'}</span>
							<p className="tutor-turn-text">{m.content}</p>
						</div>
					))
				)}
				<div ref={bottomRef} />
			</div>
			<form className="tutor-conversation-input" onSubmit={handleSubmit}>
				<textarea
					value={input}
					onChange={(e) => setInput(e.target.value)}
					placeholder={
						canvasMode ? 'Ask the canvas agent to draw or explain…' : 'Type to the tutor…'
					}
					rows={2}
					onKeyDown={(e) => {
						if (e.key === 'Enter' && !e.shiftKey) {
							e.preventDefault()
							e.currentTarget.form?.requestSubmit()
						}
					}}
				/>
				<button type="submit" disabled={!input.trim()}>
					Send
				</button>
			</form>
		</div>
	)
}
