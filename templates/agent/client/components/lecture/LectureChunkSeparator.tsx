/**
 * A subtle visual divider between lecture chunks.
 * Represents the moment the lecturer pauses to draw on the whiteboard.
 */
export function LectureChunkSeparator() {
	return (
		<div className="lecture-separator" aria-hidden>
			<span className="lecture-separator-icon">✎</span>
		</div>
	)
}
