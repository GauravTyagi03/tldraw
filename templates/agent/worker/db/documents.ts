import type { DocumentRow, DocumentStatus } from './types'

export async function getDocument(db: D1Database, id: string): Promise<DocumentRow | null> {
	return await db.prepare('SELECT * FROM documents WHERE id = ?').bind(id).first<DocumentRow>()
}

export async function setDocumentStatus(
	db: D1Database,
	id: string,
	status: DocumentStatus
): Promise<void> {
	await db.prepare('UPDATE documents SET status = ? WHERE id = ?').bind(status, id).run()
}

export async function insertChunk(
	db: D1Database,
	input: {
		id: string
		documentId: string
		position: number
		text: string
		pageNumber?: number
		charStart?: number
		charEnd?: number
	}
): Promise<void> {
	await db
		.prepare(
			`INSERT INTO chunks (id, document_id, position, text, page_number, char_start, char_end)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			input.id,
			input.documentId,
			input.position,
			input.text,
			input.pageNumber ?? null,
			input.charStart ?? null,
			input.charEnd ?? null
		)
		.run()
}

export async function deleteChunksForDocument(db: D1Database, documentId: string): Promise<void> {
	await db.prepare('DELETE FROM chunks WHERE document_id = ?').bind(documentId).run()
}

export async function deleteDocument(db: D1Database, id: string): Promise<boolean> {
	const result = await db.prepare('DELETE FROM documents WHERE id = ?').bind(id).run()
	return (result.meta.changes ?? 0) > 0
}
