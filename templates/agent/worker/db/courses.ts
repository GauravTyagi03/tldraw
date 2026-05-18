import { genId } from './ids'
import type { CourseRow, DocumentRow, MessageRow, SectionRow, SessionRow } from './types'

export async function listCourses(db: D1Database): Promise<CourseRow[]> {
	const result = await db.prepare('SELECT * FROM courses ORDER BY created_at DESC').all<CourseRow>()
	return result.results
}

export async function getCourse(db: D1Database, id: string): Promise<CourseRow | null> {
	return await db.prepare('SELECT * FROM courses WHERE id = ?').bind(id).first<CourseRow>()
}

export async function createCourse(
	db: D1Database,
	input: {
		name: string
		code?: string
		description?: string
		color?: string
		instructor?: string
		term?: string
		embeddingModel?: string
	}
): Promise<CourseRow> {
	const id = genId('course')
	const created_at = Date.now()
	const embedding_model = input.embeddingModel ?? 'text-embedding-3-small'
	await db
		.prepare(
			`INSERT INTO courses (id, name, code, description, color, instructor, term, embedding_model, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			id,
			input.name,
			input.code ?? null,
			input.description ?? null,
			input.color ?? null,
			input.instructor ?? null,
			input.term ?? null,
			embedding_model,
			created_at
		)
		.run()
	return {
		id,
		name: input.name,
		code: input.code ?? null,
		description: input.description ?? null,
		color: input.color ?? null,
		instructor: input.instructor ?? null,
		term: input.term ?? null,
		embedding_model,
		created_at,
	}
}

export async function updateCourse(
	db: D1Database,
	id: string,
	patch: Partial<{
		name: string
		code: string
		description: string
		color: string
		instructor: string
		term: string
	}>
): Promise<CourseRow | null> {
	const existing = await getCourse(db, id)
	if (!existing) return null

	const next = { ...existing, ...patch }
	await db
		.prepare(
			`UPDATE courses SET name = ?, code = ?, description = ?, color = ?, instructor = ?, term = ?
       WHERE id = ?`
		)
		.bind(next.name, next.code, next.description, next.color, next.instructor, next.term, id)
		.run()
	return next
}

export async function deleteCourse(db: D1Database, id: string): Promise<boolean> {
	const result = await db.prepare('DELETE FROM courses WHERE id = ?').bind(id).run()
	return (result.meta.changes ?? 0) > 0
}

export async function listSections(db: D1Database, courseId: string): Promise<SectionRow[]> {
	const result = await db
		.prepare('SELECT * FROM sections WHERE course_id = ? ORDER BY position ASC')
		.bind(courseId)
		.all<SectionRow>()
	return result.results
}

export async function createSection(
	db: D1Database,
	courseId: string,
	name: string
): Promise<SectionRow> {
	const existing = await listSections(db, courseId)
	const id = genId('section')
	const position = existing.length
	await db
		.prepare('INSERT INTO sections (id, course_id, name, position) VALUES (?, ?, ?, ?)')
		.bind(id, courseId, name, position)
		.run()
	return { id, course_id: courseId, name, position }
}

export async function listDocuments(db: D1Database, courseId: string): Promise<DocumentRow[]> {
	const result = await db
		.prepare('SELECT * FROM documents WHERE course_id = ? ORDER BY created_at DESC')
		.bind(courseId)
		.all<DocumentRow>()
	return result.results
}

export async function createDocument(
	db: D1Database,
	input: {
		courseId: string
		sectionId?: string | null
		title: string
		sourceFilename: string
		mimeType: string
		r2Key?: string
	}
): Promise<DocumentRow> {
	const id = genId('doc')
	const created_at = Date.now()
	await db
		.prepare(
			`INSERT INTO documents (id, course_id, section_id, title, source_filename, mime_type, r2_key, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
		)
		.bind(
			id,
			input.courseId,
			input.sectionId ?? null,
			input.title,
			input.sourceFilename,
			input.mimeType,
			input.r2Key ?? null,
			created_at
		)
		.run()
	return {
		id,
		course_id: input.courseId,
		section_id: input.sectionId ?? null,
		title: input.title,
		source_filename: input.sourceFilename,
		mime_type: input.mimeType,
		r2_key: input.r2Key ?? null,
		status: 'pending',
		created_at,
	}
}

export async function listSessions(db: D1Database, courseId: string): Promise<SessionRow[]> {
	const result = await db
		.prepare('SELECT * FROM sessions WHERE course_id = ? ORDER BY last_active_at DESC')
		.bind(courseId)
		.all<SessionRow>()
	return result.results
}

export async function createSession(
	db: D1Database,
	courseId: string,
	title: string
): Promise<SessionRow> {
	const id = genId('session')
	const now = Date.now()
	await db
		.prepare(
			'INSERT INTO sessions (id, course_id, title, created_at, last_active_at) VALUES (?, ?, ?, ?, ?)'
		)
		.bind(id, courseId, title, now, now)
		.run()
	return { id, course_id: courseId, title, created_at: now, last_active_at: now }
}

export async function touchSession(db: D1Database, sessionId: string): Promise<void> {
	await db
		.prepare('UPDATE sessions SET last_active_at = ? WHERE id = ?')
		.bind(Date.now(), sessionId)
		.run()
}

export async function listMessages(db: D1Database, sessionId: string): Promise<MessageRow[]> {
	const result = await db
		.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC')
		.bind(sessionId)
		.all<MessageRow>()
	return result.results
}
