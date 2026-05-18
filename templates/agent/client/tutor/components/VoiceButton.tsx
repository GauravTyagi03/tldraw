import { useCallback } from 'react'

export type VoiceButtonState = 'idle' | 'listening' | 'processing' | 'speaking' | 'disabled'

interface VoiceButtonProps {
	state: VoiceButtonState
	onTap?: () => void
}

/**
 * Bottom-center push-to-talk button for the voice agent. Phase 0 ships the
 * visual states only; Phase 5 wires the WebSocket and audio capture.
 */
export function VoiceButton({ state, onTap }: VoiceButtonProps) {
	const handleClick = useCallback(() => {
		if (state === 'disabled') return
		onTap?.()
	}, [state, onTap])

	const label =
		state === 'listening'
			? 'Listening'
			: state === 'processing'
				? 'Thinking'
				: state === 'speaking'
					? 'Tutor speaking'
					: state === 'disabled'
						? 'Voice unavailable'
						: 'Tap to talk'

	return (
		<div className="tutor-voice-anchor">
			{state === 'speaking' && (
				<div className="tutor-voice-speaking-indicator" aria-live="polite">
					<span className="tutor-eq-bar" />
					<span className="tutor-eq-bar" />
					<span className="tutor-eq-bar" />
					<span className="tutor-voice-speaking-label">Tutor speaking</span>
				</div>
			)}
			<button
				className={`tutor-voice-btn tutor-voice-btn-${state}`}
				onClick={handleClick}
				title={label}
				aria-label={label}
				disabled={state === 'disabled'}
			>
				<VoiceIcon state={state} />
			</button>
		</div>
	)
}

function VoiceIcon({ state }: { state: VoiceButtonState }) {
	if (state === 'speaking') {
		return (
			<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden>
				<rect x="3" y="10" width="3" height="4" rx="1" fill="currentColor" />
				<rect x="8" y="7" width="3" height="10" rx="1" fill="currentColor" />
				<rect x="13" y="4" width="3" height="16" rx="1" fill="currentColor" />
				<rect x="18" y="9" width="3" height="6" rx="1" fill="currentColor" />
			</svg>
		)
	}
	if (state === 'processing') {
		return (
			<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden className="tutor-voice-spinner">
				<circle
					cx="12"
					cy="12"
					r="9"
					fill="none"
					stroke="currentColor"
					strokeWidth="2.5"
					strokeDasharray="14 56"
					strokeLinecap="round"
				/>
			</svg>
		)
	}
	return (
		<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
			<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" fill="currentColor" />
			<path
				d="M5 11a1 1 0 0 1 2 0 5 5 0 0 0 10 0 1 1 0 0 1 2 0 7 7 0 0 1-6 6.93V21a1 1 0 0 1-2 0v-3.07A7 7 0 0 1 5 11Z"
				fill="currentColor"
			/>
		</svg>
	)
}
