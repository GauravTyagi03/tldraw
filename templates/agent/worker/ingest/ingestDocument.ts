import * as docDb from '../db/documents'
import { genId } from '../db/ids'
import type { Environment } from '../environment'
import { getProvidersForEnv } from '../providers'
import { chunkText } from './chunkText'
import { extractTextFromBytes } from './extractText'

const BATCH_SIZE = 32

export async function ingestDocument(
	env: Environment,
	documentId: string,
	opts?: { preExtractedText?: string }
): Promise<void> {
	const db = env.TUTOR_DB
	if (!db) throw new Error('TUTOR_DB not configured')

	const doc = await docDb.getDocument(db, documentId)
	if (!doc) return

	await docDb.setDocumentStatus(db, documentId, 'ingesting')
	if (env.TUTOR_KV) {
		await env.TUTOR_KV.put(`ingest:${documentId}`, JSON.stringify({ status: 'ingesting' }), {
			expirationTtl: 3600,
		})
	}

	try {
		let text = opts?.preExtractedText?.trim() ?? ''

		if (!text && doc.r2_key && env.TUTOR_DOCUMENTS) {
			const obj = await env.TUTOR_DOCUMENTS.get(doc.r2_key)
			if (!obj) throw new Error('R2 object missing')
			const bytes = await obj.arrayBuffer()
			text = await extractTextFromBytes(bytes, {
				mimeType: doc.mime_type,
				filename: doc.source_filename,
			})
		}

		if (!text) {
			throw new Error('No text content to ingest')
		}

		await docDb.deleteChunksForDocument(db, documentId)

		const chunks = chunkText(text)
		if (chunks.length === 0) throw new Error('Document produced zero chunks')

		const providers = getProvidersForEnv(env)

		// Remove prior vectors for this document
		await providers.vectors.deleteByFilter({
			document_id: documentId,
		})

		for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
			const batch = chunks.slice(i, i + BATCH_SIZE)
			const embeddings = await providers.embeddings.embed(batch.map((c) => c.text))

			const records = batch.map((chunk, j) => {
				const chunkId = genId('chunk')
				return {
					id: chunkId,
					vector: embeddings[j],
					metadata: {
						course_id: doc.course_id,
						document_id: documentId,
						section_id: doc.section_id ?? '',
						chunk_id: chunkId,
						position: chunk.position,
					},
					chunk,
					chunkId,
				}
			})

			await providers.vectors.upsert(
				records.map((r) => ({
					id: r.id,
					vector: r.vector,
					metadata: r.metadata,
				}))
			)

			for (const r of records) {
				await docDb.insertChunk(db, {
					id: r.chunkId,
					documentId,
					position: r.chunk.position,
					text: r.chunk.text,
					charStart: r.chunk.charStart,
					charEnd: r.chunk.charEnd,
					pageNumber: r.chunk.pageNumber,
				})
			}
		}

		await docDb.setDocumentStatus(db, documentId, 'ready')
		if (env.TUTOR_KV) {
			await env.TUTOR_KV.put(
				`ingest:${documentId}`,
				JSON.stringify({ status: 'ready', chunkCount: chunks.length }),
				{ expirationTtl: 3600 }
			)
		}
	} catch (e) {
		console.error('ingestDocument failed', documentId, e)
		await docDb.setDocumentStatus(db, documentId, 'failed')
		if (env.TUTOR_KV) {
			await env.TUTOR_KV.put(
				`ingest:${documentId}`,
				JSON.stringify({
					status: 'failed',
					error: e instanceof Error ? e.message : String(e),
				}),
				{ expirationTtl: 3600 }
			)
		}
	}
}
