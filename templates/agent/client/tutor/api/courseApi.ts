import { extractTextFromFile } from '../utils/extractTextFromFile'
import { Course, Document, Section, Topic, TutorMessage, TutorSession } from '../types'

const API_BASE = '/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(`${API_BASE}${path}`, {
		...init,
		headers: {
			...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
			...init?.headers,
		},
	})
	if (!res.ok) {
		const err = await res.text().catch(() => res.statusText)
		throw new Error(`API ${res.status}: ${err}`)
	}
	return (await res.json()) as T
}

interface ApiCourse {
	id: string
	name: string
	code?: string
	description?: string
	color?: string
	instructor?: string
	term?: string
	createdAt: number
}

interface ApiSection {
	id: string
	courseId: string
	name: string
	position: number
}

interface ApiDocument {
	id: string
	courseId: string
	sectionId: string | null
	title: string
	sourceFilename: string
	mimeType: string
	r2Key?: string
	status: Document['status']
	createdAt: number
}

interface ApiSession {
	id: string
	courseId: string
	title: string
	createdAt: number
	lastActiveAt: number
}

function toCourse(row: ApiCourse): Course {
	return {
		id: row.id,
		name: row.name,
		code: row.code,
		description: row.description,
		color: row.color,
		instructor: row.instructor,
		term: row.term,
		createdAt: row.createdAt,
	}
}

function toSection(row: ApiSection): Section {
	return { id: row.id, courseId: row.courseId, name: row.name, position: row.position }
}

function toDocument(row: ApiDocument): Document {
	return {
		id: row.id,
		courseId: row.courseId,
		sectionId: row.sectionId,
		title: row.title,
		sourceFilename: row.sourceFilename,
		mimeType: row.mimeType,
		r2Key: row.r2Key,
		status: row.status,
		createdAt: row.createdAt,
	}
}

function toSession(row: ApiSession): TutorSession {
	return {
		id: row.id,
		courseId: row.courseId,
		title: row.title,
		createdAt: row.createdAt,
		lastActiveAt: row.lastActiveAt,
	}
}

export async function fetchAllCourseData(): Promise<{
	courses: Course[]
	sections: Section[]
	documents: Document[]
	sessions: TutorSession[]
}> {
	const courses = (await request<ApiCourse[]>('/courses')).map(toCourse)
	const sections: Section[] = []
	const documents: Document[] = []
	const sessions: TutorSession[] = []

	await Promise.all(
		courses.map(async (course) => {
			const [secs, docs, sess] = await Promise.all([
				request<ApiSection[]>(`/courses/${course.id}/sections`),
				request<ApiDocument[]>(`/courses/${course.id}/documents`),
				request<ApiSession[]>(`/courses/${course.id}/sessions`),
			])
			sections.push(...secs.map(toSection))
			documents.push(...docs.map(toDocument))
			sessions.push(...sess.map(toSession))
		})
	)

	return { courses, sections, documents, sessions }
}

export async function apiCreateCourse(name: string): Promise<Course> {
	const row = await request<ApiCourse>('/courses', {
		method: 'POST',
		body: JSON.stringify({ name }),
	})
	return toCourse(row)
}

export async function apiCreateSection(courseId: string, name: string): Promise<Section> {
	const row = await request<ApiSection>(`/courses/${courseId}/sections`, {
		method: 'POST',
		body: JSON.stringify({ name }),
	})
	return toSection(row)
}

export async function apiCreateSession(courseId: string, title: string): Promise<TutorSession> {
	const row = await request<ApiSession>(`/courses/${courseId}/sessions`, {
		method: 'POST',
		body: JSON.stringify({ title }),
	})
	return toSession(row)
}

export async function apiUploadDocument(
	courseId: string,
	file: File,
	opts?: { sectionId?: string; title?: string }
): Promise<Document> {
	const extractedText = await extractTextFromFile(file)
	const form = new FormData()
	form.append('file', file)
	if (opts?.sectionId) form.append('sectionId', opts.sectionId)
	if (opts?.title) form.append('title', opts.title)
	if (extractedText) form.append('extractedText', extractedText)
	const row = await request<ApiDocument>(`/courses/${courseId}/documents`, {
		method: 'POST',
		body: form,
	})
	return toDocument(row)
}

export async function apiFetchMessages(sessionId: string): Promise<TutorMessage[]> {
	return await request<TutorMessage[]>(`/sessions/${sessionId}/messages`)
}

export async function apiPostMessage(
	sessionId: string,
	role: string,
	content: string
): Promise<TutorMessage> {
	return await request<TutorMessage>(`/sessions/${sessionId}/messages`, {
		method: 'POST',
		body: JSON.stringify({ role, content }),
	})
}

export async function apiFetchTopics(courseId: string): Promise<Topic[]> {
	return await request<Topic[]>(`/courses/${courseId}/topics`)
}

export async function apiRefreshTopics(courseId: string): Promise<{ topicsCreated: number }> {
	return await request<{ topicsCreated: number }>(`/courses/${courseId}/topics/refresh`, {
		method: 'POST',
	})
}

export interface IngestStatus {
	status: 'pending' | 'ingesting' | 'ready' | 'failed' | 'unknown'
	chunkCount?: number
	error?: string
}

export async function apiFetchIngestStatus(documentId: string): Promise<IngestStatus> {
	return await request<IngestStatus>(`/documents/${documentId}/ingest-status`)
}

export async function apiDeleteDocument(documentId: string): Promise<void> {
	await request<{ ok: true }>(`/documents/${documentId}`, { method: 'DELETE' })
}
