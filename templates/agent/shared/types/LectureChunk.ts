import { RecordsDiff, TLRecord } from 'tldraw'

/**
 * A single chunk of a lecture sequence.
 * Each chunk has student-facing text and a visual diff that gets applied
 * to the canvas when navigating to this chunk.
 */
export interface LectureChunk {
	/** Unique identifier for this chunk */
	id: string
	/** Zero-based index in the lecture sequence */
	index: number
	/** Short title — used internally by the LLM for organization. NOT displayed to students. */
	title: string
	/** The explanation text — written in lecture-script voice, shown in the Lecture tab */
	text: string
	/** Director's notes for what visuals to draw — passed to the LLM in Phase 2. NOT shown to students. */
	intent: string
	/** Editor diff applied to the canvas for this chunk. Null until Phase 2 completes for this chunk. */
	diff: RecordsDiff<TLRecord> | null
	/** Generation status of this chunk */
	status: 'outline' | 'visualizing' | 'complete'
}
