import { RecordsDiff, TLEditorSnapshot, TLRecord } from 'tldraw'

/**
 * A serialized lecture chunk for saving to a JSON file.
 * RecordsDiff<TLRecord> is JSON-serializable (updated uses tuple [from, to]).
 */
export interface SerializedLectureChunk {
	index: number
	title: string
	text: string
	intent: string
	diff: RecordsDiff<TLRecord>
}

/**
 * The full lecture sequence file format.
 * Saved as JSON; can be imported to replay the lecture exactly.
 */
export interface LectureSequenceFile {
	version: '1.0'
	id: string
	title: string
	/** The original user prompt that generated this lecture */
	prompt: string
	createdAt: string
	modelName: string
	/** Canvas state before any lecture visuals were applied */
	baseSnapshot: TLEditorSnapshot
	chunks: SerializedLectureChunk[]
}
