import { useCallback, useEffect, useRef } from 'react'
import { useValue } from 'tldraw'
import { ChatHistoryActionItem } from '../../../shared/types/ChatHistoryItem'
import { TldrawAgent } from '../../agent/TldrawAgent'
import {
	loadLectureSequenceFromFile,
	saveLectureSequenceToFile,
} from '../../utils/lectureFilePersistence'
import { getActionInfo } from '../chat-history/getActionInfo'
import { LectureChunkSeparator } from './LectureChunkSeparator'
import { LectureChunkText } from './LectureChunkText'
import { LectureNavigation } from './LectureNavigation'

interface LectureTabProps {
	agent: TldrawAgent
	/** The original prompt used to generate the lecture (tracked in ChatPanel) */
	lecturePrompt: string
}

/**
 * The student-facing lecture tab.
 *
 * Renders chunk texts as flowing prose with subtle drawing-moment separators.
 * Active chunk is full opacity; inactive chunks are faded.
 * Navigating a chunk updates the canvas to reflect cumulative diffs up to that point.
 *
 * Keyboard: ↑/↓ arrows navigate between chunks when this tab is visible.
 */
export function LectureTab({ agent, lecturePrompt }: LectureTabProps) {
	const chunks = useValue('lectureChunks', () => agent.lecture.getChunks(), [agent])
	const currentIndex = useValue('lectureCurrentIndex', () => agent.lecture.getCurrentChunkIndex(), [
		agent,
	])
	const isGenerating = useValue('lectureIsGenerating', () => agent.lecture.isGenerating(), [agent])
	const modelName = useValue('modelName', () => agent.modelName.getModelName(), [agent])

	// Last few agent actions from chat history — shown as a trace during generation
	const recentActions = useValue(
		'recentActions',
		() => {
			if (!agent.lecture.isGenerating()) return []
			return agent.chat
				.getHistory()
				.filter(
					(item): item is ChatHistoryActionItem => item.type === 'action' && item.action.complete
				)
				.slice(-6)
		},
		[agent]
	)

	const scrollRef = useRef<HTMLDivElement>(null)
	const activeChunkRef = useRef<HTMLDivElement>(null)

	// Scroll active chunk into view when it changes
	useEffect(() => {
		if (activeChunkRef.current) {
			activeChunkRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
		}
	}, [currentIndex])

	// Keyboard navigation
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
				e.preventDefault()
				const idx = currentIndex ?? -1
				if (e.key === 'ArrowUp' && idx > 0) {
					agent.lecture.navigateToChunk(idx - 1)
				} else if (e.key === 'ArrowDown' && idx < chunks.length - 1) {
					agent.lecture.navigateToChunk(idx + 1)
				}
			}
		}
		window.addEventListener('keydown', handler)
		return () => window.removeEventListener('keydown', handler)
	}, [agent, currentIndex, chunks.length])

	const handleNavigate = useCallback(
		(index: number) => {
			agent.lecture.navigateToChunk(index)
		},
		[agent]
	)

	const handlePrev = useCallback(() => {
		if (currentIndex !== null && currentIndex > 0) {
			agent.lecture.navigateToChunk(currentIndex - 1)
		}
	}, [agent, currentIndex])

	const handleNext = useCallback(() => {
		if (currentIndex !== null && currentIndex < chunks.length - 1) {
			agent.lecture.navigateToChunk(currentIndex + 1)
		}
	}, [agent, currentIndex, chunks.length])

	const handleExport = useCallback(async () => {
		const file = agent.lecture.exportToFile(lecturePrompt, modelName)
		await saveLectureSequenceToFile(file)
	}, [agent, lecturePrompt, modelName])

	const handleImport = useCallback(async () => {
		try {
			const file = await loadLectureSequenceFromFile()
			agent.lecture.importFromFile(file)
		} catch {
			// User cancelled or invalid file — ignore silently
		}
	}, [agent])

	const visualizingIndex = agent.lecture.getCurrentVisualizingIndex()

	return (
		<div className="lecture-tab">
			<div className="lecture-scroll" ref={scrollRef}>
				{chunks.length === 0 && !isGenerating && (
					<div className="lecture-tab-empty">
						<p>
							Type a topic below and press Enter to generate a lecture, or import a saved JSON file.
						</p>
					</div>
				)}

				{isGenerating && chunks.length === 0 && (
					<div className="lecture-generating-placeholder">
						<p>Planning lecture outline…</p>
					</div>
				)}

				{chunks.map((chunk, i) => (
					<div key={chunk.id} ref={currentIndex === i ? activeChunkRef : undefined}>
						<LectureChunkText
							chunk={chunk}
							isActive={currentIndex === i}
							onClick={() => handleNavigate(i)}
						/>
						{i < chunks.length - 1 && <LectureChunkSeparator />}
					</div>
				))}
			</div>

			{isGenerating && (
				<div className="lecture-progress-area">
					<div className="lecture-progress">
						{chunks.length === 0
							? 'Phase 1 — planning outline…'
							: `Phase 2 — drawing chunk ${visualizingIndex + 1} of ${chunks.length}…`}
					</div>

					{recentActions.length > 0 && (
						<div className="lecture-trace">
							{recentActions.map((item, i) => {
								const info = getActionInfo(item.action, agent)
								if (!info.description) return null
								return (
									<div key={i} className="lecture-trace-item">
										{info.description}
									</div>
								)
							})}
						</div>
					)}
				</div>
			)}

			<LectureNavigation
				currentIndex={currentIndex}
				totalChunks={chunks.length}
				onPrev={handlePrev}
				onNext={handleNext}
				onExport={handleExport}
				onImport={handleImport}
			/>
		</div>
	)
}
