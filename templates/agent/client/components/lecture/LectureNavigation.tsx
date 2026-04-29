interface LectureNavigationProps {
	currentIndex: number | null
	totalChunks: number
	onPrev: () => void
	onNext: () => void
	onExport: () => void
	onImport: () => void
}

/**
 * Navigation bar for the lecture tab.
 * Shows prev/next buttons, current position, and export/import controls.
 */
export function LectureNavigation({
	currentIndex,
	totalChunks,
	onPrev,
	onNext,
	onExport,
	onImport,
}: LectureNavigationProps) {
	const position = currentIndex !== null ? currentIndex + 1 : 0

	return (
		<div className="lecture-navigation">
			<div className="lecture-nav-controls">
				<button
					className="lecture-nav-btn"
					onClick={onPrev}
					disabled={currentIndex === null || currentIndex === 0}
					title="Previous chunk (↑)"
				>
					←
				</button>
				<span className="lecture-nav-position">
					{totalChunks > 0 ? `${position} of ${totalChunks}` : '—'}
				</span>
				<button
					className="lecture-nav-btn"
					onClick={onNext}
					disabled={currentIndex === null || currentIndex >= totalChunks - 1}
					title="Next chunk (↓)"
				>
					→
				</button>
			</div>
			<div className="lecture-nav-file">
				<button className="lecture-file-btn" onClick={onExport} title="Export lecture as JSON">
					Export
				</button>
				<button className="lecture-file-btn" onClick={onImport} title="Import lecture from JSON">
					Import
				</button>
			</div>
		</div>
	)
}
