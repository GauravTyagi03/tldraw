export interface SubtitleEntry {
	role: 'user' | 'agent'
	text: string
}

interface SubtitleOverlayProps {
	entry: SubtitleEntry | null
}

/**
 * A docked subtitle strip that sits just above the voice button. Phase 0
 * ships the visual; Phase 5 streams entries from the VoiceSessionDO.
 */
export function SubtitleOverlay({ entry }: SubtitleOverlayProps) {
	if (!entry || !entry.text) return null
	return (
		<div
			className={`tutor-subtitles tutor-subtitles-${entry.role}`}
			role="status"
			aria-live="polite"
		>
			<span className="tutor-subtitle-role">{entry.role === 'user' ? 'You' : 'Tutor'}</span>
			<span className="tutor-subtitle-text">{entry.text}</span>
		</div>
	)
}
