import { ExecutionContext } from '@cloudflare/workers-types'
import { IRequest, json } from 'itty-router'
import * as courseDb from '../db/courses'
import * as docDb from '../db/documents'
import { genId } from '../db/ids'
import type { CourseRow, DocumentRow, MessageRow, SectionRow, SessionRow } from '../db/types'
import { Environment } from '../environment'
import { ingestDocument } from '../ingest/ingestDocument'
import { getProvidersForEnv } from '../providers'
import { retrieve } from '../rag/retrieve'
import { extractTopicsForCourse } from '../rag/topics'

function requireDb(env: Environment): D1Database {
	if (!env.TUTOR_DB) throw new Error('TUTOR_DB binding is not configured')
	return env.TUTOR_DB
}

function rowToCourse(row: CourseRow) {
	return {
		id: row.id,
		name: row.name,
		code: row.code ?? undefined,
		description: row.description ?? undefined,
		color: row.color ?? undefined,
		instructor: row.instructor ?? undefined,
		term: row.term ?? undefined,
		embeddingModel: row.embedding_model,
		createdAt: row.created_at,
	}
}

function rowToSection(row: SectionRow) {
	return {
		id: row.id,
		courseId: row.course_id,
		name: row.name,
		position: row.position,
	}
}

function rowToDocument(row: DocumentRow) {
	return {
		id: row.id,
		courseId: row.course_id,
		sectionId: row.section_id,
		title: row.title,
		sourceFilename: row.source_filename,
		mimeType: row.mime_type,
		r2Key: row.r2_key ?? undefined,
		status: row.status,
		createdAt: row.created_at,
	}
}

function rowToSession(row: SessionRow) {
	return {
		id: row.id,
		courseId: row.course_id,
		title: row.title,
		createdAt: row.created_at,
		lastActiveAt: row.last_active_at,
	}
}

function rowToMessage(row: MessageRow) {
	return {
		id: row.id,
		sessionId: row.session_id,
		role: row.role,
		content: row.content,
		audioR2Key: row.audio_r2_key ?? undefined,
		createdAt: row.created_at,
	}
}

export async function listCourses(_req: IRequest, env: Environment) {
	const rows = await courseDb.listCourses(requireDb(env))
	return json(rows.map(rowToCourse))
}

export async function createCourse(req: IRequest, env: Environment) {
	const body = (await req.json()) as {
		name?: string
		code?: string
		description?: string
		color?: string
		instructor?: string
		term?: string
	}
	if (!body.name?.trim()) {
		return json({ error: 'name is required' }, { status: 400 })
	}
	const row = await courseDb.createCourse(requireDb(env), {
		name: body.name.trim(),
		code: body.code,
		description: body.description,
		color: body.color,
		instructor: body.instructor,
		term: body.term,
	})
	return json(rowToCourse(row), { status: 201 })
}

export async function getCourse(req: IRequest, env: Environment) {
	const id = req.params.courseId
	const row = await courseDb.getCourse(requireDb(env), id)
	if (!row) return json({ error: 'not found' }, { status: 404 })
	return json(rowToCourse(row))
}

export async function updateCourse(req: IRequest, env: Environment) {
	const id = req.params.courseId
	const body = (await req.json()) as Record<string, string>
	const row = await courseDb.updateCourse(requireDb(env), id, {
		name: body.name,
		code: body.code,
		description: body.description,
		color: body.color,
		instructor: body.instructor,
		term: body.term,
	})
	if (!row) return json({ error: 'not found' }, { status: 404 })
	return json(rowToCourse(row))
}

export async function deleteCourse(req: IRequest, env: Environment) {
	const id = req.params.courseId
	const ok = await courseDb.deleteCourse(requireDb(env), id)
	if (!ok) return json({ error: 'not found' }, { status: 404 })
	return json({ ok: true })
}

export async function listSections(req: IRequest, env: Environment) {
	const courseId = req.params.courseId
	const rows = await courseDb.listSections(requireDb(env), courseId)
	return json(rows.map(rowToSection))
}

export async function createSection(req: IRequest, env: Environment) {
	const courseId = req.params.courseId
	const body = (await req.json()) as { name?: string }
	if (!body.name?.trim()) {
		return json({ error: 'name is required' }, { status: 400 })
	}
	const row = await courseDb.createSection(requireDb(env), courseId, body.name.trim())
	return json(rowToSection(row), { status: 201 })
}

export async function listDocuments(req: IRequest, env: Environment) {
	const courseId = req.params.courseId
	const rows = await courseDb.listDocuments(requireDb(env), courseId)
	return json(rows.map(rowToDocument))
}

export async function uploadDocument(req: IRequest, env: Environment, ctx: ExecutionContext) {
	const courseId = req.params.courseId
	const database = requireDb(env)

	if (!req.headers.get('content-type')?.includes('multipart/form-data')) {
		return json({ error: 'expected multipart/form-data' }, { status: 400 })
	}

	const form = await req.formData()
	const file = form.get('file')
	const sectionId = form.get('sectionId')
	const titleField = form.get('title')
	const extractedTextField = form.get('extractedText')

	if (!(file instanceof File)) {
		return json({ error: 'file is required' }, { status: 400 })
	}

	const docId = genId('doc')
	const r2Key = `courses/${courseId}/${docId}/${file.name}`

	if (env.TUTOR_DOCUMENTS) {
		await env.TUTOR_DOCUMENTS.put(r2Key, file.stream(), {
			httpMetadata: { contentType: file.type || 'application/octet-stream' },
		})
	}

	const row = await courseDb.createDocument(database, {
		courseId,
		sectionId: typeof sectionId === 'string' && sectionId ? sectionId : null,
		title: (typeof titleField === 'string' && titleField.trim()) || file.name || 'Untitled',
		sourceFilename: file.name,
		mimeType: file.type || 'application/octet-stream',
		r2Key: env.TUTOR_DOCUMENTS ? r2Key : undefined,
	})

	const preExtractedText = typeof extractedTextField === 'string' ? extractedTextField : undefined

	ctx.waitUntil(ingestDocument(env, row.id, { preExtractedText }))

	return json(rowToDocument(row), { status: 201 })
}

export async function deleteDocument(req: IRequest, env: Environment) {
	const documentId = req.params.documentId
	const db = requireDb(env)
	const doc = await docDb.getDocument(db, documentId)
	if (!doc) {
		return json({ error: 'document not found' }, { status: 404 })
	}

	try {
		const providers = getProvidersForEnv(env)
		await providers.vectors.deleteByFilter({ document_id: documentId })
	} catch (e) {
		console.warn('vector delete failed', documentId, e)
	}

	if (doc.r2_key && env.TUTOR_DOCUMENTS) {
		try {
			await env.TUTOR_DOCUMENTS.delete(doc.r2_key)
		} catch (e) {
			console.warn('R2 delete failed', doc.r2_key, e)
		}
	}

	if (env.TUTOR_KV) {
		await env.TUTOR_KV.delete(`ingest:${documentId}`)
	}

	const deleted = await docDb.deleteDocument(db, documentId)
	if (!deleted) {
		return json({ error: 'document not found' }, { status: 404 })
	}

	return json({ ok: true })
}

export async function getIngestStatus(req: IRequest, env: Environment) {
	const documentId = req.params.documentId
	if (!env.TUTOR_KV) {
		return json({ status: 'unknown' })
	}
	const raw = await env.TUTOR_KV.get(`ingest:${documentId}`)
	if (!raw) return json({ status: 'unknown' })
	return json(JSON.parse(raw))
}

export async function listTopics(req: IRequest, env: Environment) {
	const courseId = req.params.courseId
	const db = requireDb(env)
	const result = await db
		.prepare('SELECT id, course_id, label, source_chunk_ids FROM topics WHERE course_id = ?')
		.bind(courseId)
		.all<{ id: string; course_id: string; label: string; source_chunk_ids: string }>()
	return json(
		result.results.map((t) => ({
			id: t.id,
			courseId: t.course_id,
			label: t.label,
			sourceChunkIds: JSON.parse(t.source_chunk_ids || '[]') as string[],
		}))
	)
}

export async function refreshTopics(req: IRequest, env: Environment) {
	const courseId = req.params.courseId
	const count = await extractTopicsForCourse(env, courseId)
	return json({ topicsCreated: count })
}

export async function ragRetrieve(req: IRequest, env: Environment) {
	const courseId = req.params.courseId
	const body = (await req.json()) as { query?: string; topK?: number }
	if (!body.query?.trim()) {
		return json({ error: 'query is required' }, { status: 400 })
	}
	const chunks = await retrieve(env, courseId, body.query.trim(), { topK: body.topK ?? 6 })
	return json({ chunks })
}

export async function createMessage(req: IRequest, env: Environment) {
	const sessionId = req.params.sessionId
	const body = (await req.json()) as { role?: string; content?: string; audioR2Key?: string }
	if (!body.role || !body.content) {
		return json({ error: 'role and content are required' }, { status: 400 })
	}
	const db = requireDb(env)
	const id = genId('msg')
	const created_at = Date.now()
	await db
		.prepare(
			`INSERT INTO messages (id, session_id, role, content, audio_r2_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
		)
		.bind(id, sessionId, body.role, body.content, body.audioR2Key ?? null, created_at)
		.run()
	await courseDb.touchSession(db, sessionId)
	return json(
		{
			id,
			sessionId,
			role: body.role,
			content: body.content,
			audioR2Key: body.audioR2Key,
			createdAt: created_at,
		},
		{ status: 201 }
	)
}

export async function listSessions(req: IRequest, env: Environment) {
	const courseId = req.params.courseId
	const rows = await courseDb.listSessions(requireDb(env), courseId)
	return json(rows.map(rowToSession))
}

export async function createSession(req: IRequest, env: Environment) {
	const courseId = req.params.courseId
	const body = (await req.json()) as { title?: string }
	const title = body.title?.trim() || `Session ${new Date().toLocaleString()}`
	const row = await courseDb.createSession(requireDb(env), courseId, title)
	return json(rowToSession(row), { status: 201 })
}

export async function listMessages(req: IRequest, env: Environment) {
	const sessionId = req.params.sessionId
	const rows = await courseDb.listMessages(requireDb(env), sessionId)
	return json(rows.map(rowToMessage))
}
