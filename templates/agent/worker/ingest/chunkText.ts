export interface TextChunk {
	text: string
	position: number
	charStart: number
	charEnd: number
	pageNumber?: number
}

const CHARS_PER_TOKEN = 4
const CHUNK_TOKENS = 500
const OVERLAP_TOKENS = 50

/**
 * Split text into overlapping chunks (~500 tokens, 50 token overlap).
 */
export function chunkText(fullText: string): TextChunk[] {
	const normalized = fullText.replace(/\r\n/g, '\n').trim()
	if (!normalized) return []

	const chunkChars = CHUNK_TOKENS * CHARS_PER_TOKEN
	const overlapChars = OVERLAP_TOKENS * CHARS_PER_TOKEN
	const step = Math.max(1, chunkChars - overlapChars)

	const chunks: TextChunk[] = []
	let position = 0

	for (let start = 0; start < normalized.length; start += step) {
		const end = Math.min(normalized.length, start + chunkChars)
		const text = normalized.slice(start, end).trim()
		if (!text) continue
		chunks.push({
			text,
			position: position++,
			charStart: start,
			charEnd: end,
		})
		if (end >= normalized.length) break
	}

	return chunks
}
