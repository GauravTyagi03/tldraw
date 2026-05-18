import type { Environment } from '../environment'
import { getProvidersForEnv } from '../providers'

export interface RetrievedChunk {
	id: string
	text: string
	score: number
	documentId: string
	courseId: string
	position: number
}

export async function retrieve(
	env: Environment,
	courseId: string,
	query: string,
	opts?: { topK?: number; documentId?: string; sectionId?: string }
): Promise<RetrievedChunk[]> {
	const db = env.TUTOR_DB
	if (!db) throw new Error('TUTOR_DB not configured')

	const topK = opts?.topK ?? 6
	const providers = getProvidersForEnv(env)
	const [queryVec] = await providers.embeddings.embed([query])

	const filter: Record<string, string> = { course_id: courseId }
	if (opts?.documentId) filter.document_id = opts.documentId
	if (opts?.sectionId) filter.section_id = opts.sectionId

	const matches = await providers.vectors.query(queryVec, { topK, filter })

	const results: RetrievedChunk[] = []
	for (const match of matches) {
		const chunkId = (match.metadata?.chunk_id as string) ?? match.id
		const row = await db.prepare('SELECT * FROM chunks WHERE id = ?').bind(chunkId).first<{
			id: string
			document_id: string
			position: number
			text: string
		}>()
		if (!row) continue
		results.push({
			id: row.id,
			text: row.text,
			score: match.score,
			documentId: row.document_id,
			courseId,
			position: row.position,
		})
	}
	return results
}
