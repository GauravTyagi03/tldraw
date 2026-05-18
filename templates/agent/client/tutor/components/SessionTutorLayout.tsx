import { useCallback } from 'react'
import { ErrorBoundary } from 'tldraw'
import { useAgent } from '../../agent/TldrawAgentAppProvider'
import { ChatPanelFallback } from '../../components/ChatPanelFallback'
import { useVoiceSession } from '../voice/useVoiceSession'
import { SubtitleOverlay } from './SubtitleOverlay'
import { TutorConversationPanel } from './TutorConversationPanel'
import { TutorPanel } from './TutorPanel'
import { VoiceButton } from './VoiceButton'

interface SessionTutorLayoutProps {
	courseId: string
	sessionId: string
	courseName: string
	topicHint?: string
}

/** Tutor conversation + voice controls (rendered in the right rail; requires agent context). */
export function SessionTutorLayout({
	courseId,
	sessionId,
	courseName,
	topicHint,
}: SessionTutorLayoutProps) {
	const agent = useAgent()

	const handleDraw = useCallback(
		(req: { intent?: string; instructions: string }) => {
			const prompt = req.intent ? `${req.intent}\n\n${req.instructions}` : req.instructions
			agent.interrupt({
				input: {
					agentMessages: [prompt],
					bounds: agent.editor.getViewportPageBounds(),
					source: 'user',
					contextItems: agent.context.getItems(),
				},
			})
		},
		[agent]
	)

	const { state, subtitle, toggleMic, sendText } = useVoiceSession({
		courseId,
		sessionId,
		courseName,
		topicHint,
		onDraw: handleDraw,
	})

	return (
		<>
			<TutorPanel>
				<ErrorBoundary fallback={ChatPanelFallback}>
					<TutorConversationPanel
						sessionId={sessionId}
						agent={agent}
						onSendTextToVoice={sendText}
					/>
				</ErrorBoundary>
			</TutorPanel>
			<div className="tutor-bottom-overlay">
				<SubtitleOverlay entry={subtitle} />
				<VoiceButton state={state} onTap={toggleMic} />
			</div>
		</>
	)
}
