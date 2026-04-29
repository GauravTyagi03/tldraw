import { LectureChunk } from '../../../shared/types/LectureChunk'

interface LectureChunkTextProps {
	chunk: LectureChunk
	isActive: boolean
	onClick: () => void
}

/**
 * Renders one lecture chunk as a student-facing paragraph.
 * No title, no agent UI — just the prose text.
 *
 * Active chunk: full opacity. Inactive: ~35% opacity.
 * Clicking navigates the canvas to this chunk's state.
 */
export function LectureChunkText({ chunk, isActive, onClick }: LectureChunkTextProps) {
	const statusClass =
		chunk.status === 'visualizing' ? 'visualizing' : isActive ? 'active' : 'inactive'

	return (
		<div
			className={`lecture-chunk ${statusClass}`}
			onClick={onClick}
			role="button"
			tabIndex={0}
			onKeyDown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') onClick()
			}}
		>
			{chunk.status === 'outline' ? (
				<p className="lecture-chunk-placeholder">…</p>
			) : (
				<p>{chunk.text}</p>
			)}
		</div>
	)
}
