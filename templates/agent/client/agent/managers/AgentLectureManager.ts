import { Atom, atom, RecordsDiff, TLEditorSnapshot, TLRecord } from 'tldraw'
import { LectureChunk } from '../../../shared/types/LectureChunk'
import { LectureSequenceFile } from '../../../shared/types/LectureSequence'
import type { TldrawAgent } from '../TldrawAgent'
import { BaseAgentManager } from './BaseAgentManager'

/**
 * Manages the lecture sequence state for an agent.
 *
 * A lecture is a series of (text chunk, visual diff) pairs generated in two phases:
 * - Phase 1 (outline): LLM generates chunk titles, text, and visual intents
 * - Phase 2 (visualize): LLM generates canvas shapes for each chunk in sequence
 *
 * After generation, the user can navigate between chunks via the Lecture tab.
 * Navigating to chunk N replays the base snapshot + all diffs 0..N onto the canvas.
 */
export class AgentLectureManager extends BaseAgentManager {
	/** All lecture chunks (grows during Phase 1 and Phase 2) */
	private $chunks: Atom<LectureChunk[]>
	/** Which chunk the canvas currently reflects (null = no lecture active) */
	private $currentChunkIndex: Atom<number | null>
	/** Which chunk index is currently being visualized in Phase 2 */
	private $currentVisualizingIndex: Atom<number>
	/** Whether generation (Phase 1 or Phase 2) is in progress */
	private $isGenerating: Atom<boolean>
	/** Canvas snapshot before any lecture visuals were applied */
	private baseSnapshot: TLEditorSnapshot | null = null
	private chunkIdCounter = 0

	constructor(agent: TldrawAgent) {
		super(agent)
		this.$chunks = atom('lecture.chunks', [])
		this.$currentChunkIndex = atom('lecture.currentChunkIndex', null)
		this.$currentVisualizingIndex = atom('lecture.visualizingIndex', 0)
		this.$isGenerating = atom('lecture.isGenerating', false)
	}

	// ==================== Reading state ====================

	getChunks(): LectureChunk[] {
		return this.$chunks.get()
	}

	getCurrentChunkIndex(): number | null {
		return this.$currentChunkIndex.get()
	}

	getCurrentVisualizingIndex(): number {
		return this.$currentVisualizingIndex.get()
	}

	isGenerating(): boolean {
		return this.$isGenerating.get()
	}

	hasLecture(): boolean {
		return this.$chunks.get().length > 0
	}

	// ==================== Phase 1: outline ====================

	/**
	 * Called at the start of lecture generation.
	 * Saves the current canvas state as the base snapshot and resets all lecture state.
	 */
	startLecture(): void {
		this.baseSnapshot = this.agent.editor.getSnapshot()
		this.$chunks.set([])
		this.$currentChunkIndex.set(null)
		this.$currentVisualizingIndex.set(0)
		this.$isGenerating.set(true)
		this.chunkIdCounter = 0
	}

	/**
	 * Called by LectureChunkActionUtil when a lecture-chunk action completes.
	 * Registers a new chunk from the outline phase.
	 */
	addOutlineChunk(partial: { title: string; text: string; intent: string }): void {
		const id = String(this.chunkIdCounter++)
		const index = this.$chunks.get().length
		this.$chunks.update((chunks) => [
			...chunks,
			{ id, index, status: 'outline' as const, diff: null, ...partial },
		])
	}

	// ==================== Phase 2: visual generation ====================

	/**
	 * Sets which chunk is currently being visualized.
	 * Called by generateLecture() before each per-chunk LLM call.
	 */
	setVisualizingIndex(index: number): void {
		this.$currentVisualizingIndex.set(index)
		this.$chunks.update((chunks) =>
			chunks.map((c) => (c.index === index ? { ...c, status: 'visualizing' as const } : c))
		)
	}

	/**
	 * Stores the merged visual diff for a completed chunk.
	 * Called by generateLecture() after each per-chunk LLM call finishes.
	 */
	setChunkDiff(index: number, diff: RecordsDiff<TLRecord> | null): void {
		this.$chunks.update((chunks) =>
			chunks.map((c) => (c.index === index ? { ...c, diff, status: 'complete' as const } : c))
		)
	}

	// ==================== Navigation ====================

	/**
	 * Navigates the canvas to show the cumulative state up to and including the target chunk.
	 * Restores the base snapshot, then applies diffs 0..targetIndex in sequence.
	 */
	navigateToChunk(targetIndex: number): void {
		const chunks = this.$chunks.get()
		if (!this.baseSnapshot || targetIndex < 0 || targetIndex >= chunks.length) return

		const { editor } = this.agent

		// Restore base canvas state
		editor.loadSnapshot(this.baseSnapshot)

		// Apply diffs cumulatively up to targetIndex
		for (let i = 0; i <= targetIndex; i++) {
			const chunk = chunks[i]
			if (chunk?.diff) {
				editor.store.applyDiff(chunk.diff)
			}
		}

		this.$currentChunkIndex.set(targetIndex)
	}

	/**
	 * Called when all chunks have been visualized.
	 * Marks generation as complete and navigates to the first chunk.
	 */
	finishGeneration(): void {
		this.$isGenerating.set(false)
		this.navigateToChunk(0)
	}

	// ==================== Persistence ====================

	/**
	 * Exports the current lecture sequence as a serializable object for saving to a JSON file.
	 */
	exportToFile(prompt: string, modelName: string): LectureSequenceFile {
		const chunks = this.$chunks.get()
		return {
			version: '1.0',
			id: `lecture-${Date.now()}`,
			title: chunks[0]?.title ?? 'Untitled Lecture',
			prompt,
			createdAt: new Date().toISOString(),
			modelName,
			baseSnapshot: this.baseSnapshot!,
			chunks: chunks.map((c) => ({
				index: c.index,
				title: c.title,
				text: c.text,
				intent: c.intent,
				diff: c.diff ?? ({ added: {}, updated: {}, removed: {} } as RecordsDiff<TLRecord>),
			})),
		}
	}

	/**
	 * Imports a lecture sequence from a saved JSON file.
	 * Restores all chunks and navigates to the first chunk.
	 */
	importFromFile(file: LectureSequenceFile): void {
		this.baseSnapshot = file.baseSnapshot
		this.chunkIdCounter = file.chunks.length
		this.$chunks.set(
			file.chunks.map((c) => ({
				id: String(c.index),
				index: c.index,
				title: c.title,
				text: c.text,
				intent: c.intent,
				diff: c.diff,
				status: 'complete' as const,
			}))
		)
		this.$isGenerating.set(false)
		this.navigateToChunk(0)
	}

	// ==================== Lifecycle ====================

	reset(): void {
		this.$chunks.set([])
		this.$currentChunkIndex.set(null)
		this.$currentVisualizingIndex.set(0)
		this.$isGenerating.set(false)
		this.baseSnapshot = null
		this.chunkIdCounter = 0
	}
}
