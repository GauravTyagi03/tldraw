/**
 * Local-storage-backed course/document store. This is a thin client-side layer
 * for Phase 0; Phase 2 swaps the implementation behind this same interface
 * for fetch() calls against the Worker REST API.
 *
 * Reactivity is provided via tldraw's atom() so components can subscribe to
 * mutations without re-reading localStorage on every render.
 */

import { atom, Atom } from 'tldraw'
import {
	apiCreateCourse,
	apiCreateSection,
	apiCreateSession,
	apiDeleteDocument,
	apiFetchIngestStatus,
	apiUploadDocument,
	fetchAllCourseData,
} from '../api/courseApi'
import { Course, Document, DocumentStatus, Section, TutorSession } from '../types'

const STORAGE_KEY = 'tldraw-tutor:courses-v1'

interface PersistedState {
	courses: Course[]
	sections: Section[]
	documents: Document[]
	sessions: TutorSession[]
}

function emptyState(): PersistedState {
	return { courses: [], sections: [], documents: [], sessions: [] }
}

function load(): PersistedState {
	if (typeof localStorage === 'undefined') return emptyState()
	try {
		const raw = localStorage.getItem(STORAGE_KEY)
		if (!raw) return emptyState()
		const parsed = JSON.parse(raw) as Partial<PersistedState>
		return {
			courses: parsed.courses ?? [],
			sections: parsed.sections ?? [],
			documents: parsed.documents ?? [],
			sessions: parsed.sessions ?? [],
		}
	} catch {
		return emptyState()
	}
}

function persist(state: PersistedState) {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
	} catch {
		// Quota exceeded or storage disabled — silently drop. The backend in
		// Phase 2 is the durable home for this data.
	}
}

function genId(prefix: string): string {
	return `${prefix}_${Math.random().toString(36).slice(2, 11)}`
}

function mergeById<T extends { id: string }>(local: T[], remote: T[]): T[] {
	const map = new Map<string, T>()
	for (const item of local) map.set(item.id, item)
	for (const item of remote) map.set(item.id, item)
	return [...map.values()]
}

const INGEST_POLL_MS = 2000
const INGEST_POLL_MAX_MS = 5 * 60 * 1000

class CourseStore {
	private readonly stateAtom: Atom<PersistedState>
	private readonly ingestPollTimers = new Map<string, ReturnType<typeof setInterval>>()
	private readonly ingestPollStartedAt = new Map<string, number>()

	constructor() {
		this.stateAtom = atom<PersistedState>('CourseStore.state', load())
	}

	getState(): PersistedState {
		return this.stateAtom.get()
	}

	getCourses(): Course[] {
		return this.stateAtom.get().courses
	}

	getCourse(id: string): Course | undefined {
		return this.stateAtom.get().courses.find((c) => c.id === id)
	}

	getSections(courseId: string): Section[] {
		return this.stateAtom
			.get()
			.sections.filter((s) => s.courseId === courseId)
			.sort((a, b) => a.position - b.position)
	}

	getDocuments(courseId: string, sectionId?: string | null): Document[] {
		return this.stateAtom.get().documents.filter((d) => {
			if (d.courseId !== courseId) return false
			if (sectionId === undefined) return true
			return d.sectionId === sectionId
		})
	}

	getSessions(courseId: string): TutorSession[] {
		return this.stateAtom
			.get()
			.sessions.filter((s) => s.courseId === courseId)
			.sort((a, b) => b.lastActiveAt - a.lastActiveAt)
	}

	getSession(id: string): TutorSession | undefined {
		return this.stateAtom.get().sessions.find((s) => s.id === id)
	}

	/** Load courses/documents/sessions from the Worker API when available. */
	async hydrateFromApi(): Promise<boolean> {
		try {
			const data = await fetchAllCourseData()
			const prev = this.getState()
			this.replaceState({
				courses: mergeById(prev.courses, data.courses),
				sections: mergeById(prev.sections, data.sections),
				documents: mergeById(prev.documents, data.documents),
				sessions: mergeById(prev.sessions, data.sessions),
			})
			this.pollPendingIngests()
			return true
		} catch {
			return false
		}
	}

	updateDocumentStatus(documentId: string, status: DocumentStatus): void {
		this.update((s) => ({
			...s,
			documents: s.documents.map((d) => (d.id === documentId ? { ...d, status } : d)),
		}))
	}

	pollPendingIngests(): void {
		for (const doc of this.getState().documents) {
			if (doc.status === 'pending' || doc.status === 'ingesting') {
				this.startIngestPolling(doc.id)
			}
		}
	}

	startIngestPolling(documentId: string): void {
		if (this.ingestPollTimers.has(documentId)) return
		this.ingestPollStartedAt.set(documentId, Date.now())

		const poll = async () => {
			const started = this.ingestPollStartedAt.get(documentId) ?? Date.now()
			if (Date.now() - started > INGEST_POLL_MAX_MS) {
				this.stopIngestPolling(documentId)
				return
			}
			try {
				const result = await apiFetchIngestStatus(documentId)
				if (result.status === 'ready' || result.status === 'failed') {
					this.updateDocumentStatus(documentId, result.status)
					this.stopIngestPolling(documentId)
				} else if (result.status === 'ingesting') {
					this.updateDocumentStatus(documentId, 'ingesting')
				}
			} catch {
				// API unavailable — stop polling
				this.stopIngestPolling(documentId)
			}
		}

		void poll()
		const timer = setInterval(() => void poll(), INGEST_POLL_MS)
		this.ingestPollTimers.set(documentId, timer)
	}

	stopIngestPolling(documentId: string): void {
		const timer = this.ingestPollTimers.get(documentId)
		if (timer) clearInterval(timer)
		this.ingestPollTimers.delete(documentId)
		this.ingestPollStartedAt.delete(documentId)
	}

	replaceState(state: PersistedState): void {
		this.stateAtom.set(state)
		persist(state)
	}

	async createCourseAsync(name: string): Promise<Course> {
		try {
			const course = await apiCreateCourse(name)
			this.update((s) => ({ ...s, courses: [...s.courses, course] }))
			return course
		} catch {
			return this.createCourse({ name })
		}
	}

	async createSectionAsync(courseId: string, name: string): Promise<Section> {
		try {
			const section = await apiCreateSection(courseId, name)
			this.update((s) => ({ ...s, sections: [...s.sections, section] }))
			return section
		} catch {
			return this.createSection(courseId, name)
		}
	}

	async createSessionAsync(courseId: string, title: string): Promise<TutorSession> {
		try {
			const session = await apiCreateSession(courseId, title)
			this.update((s) => ({ ...s, sessions: [...s.sessions, session] }))
			return session
		} catch {
			return this.createSession(courseId, title)
		}
	}

	async deleteDocumentAsync(documentId: string): Promise<boolean> {
		this.stopIngestPolling(documentId)
		try {
			await apiDeleteDocument(documentId)
			this.update((s) => ({
				...s,
				documents: s.documents.filter((d) => d.id !== documentId),
			}))
			return true
		} catch {
			this.update((s) => ({
				...s,
				documents: s.documents.filter((d) => d.id !== documentId),
			}))
			return false
		}
	}

	async uploadDocumentAsync(
		courseId: string,
		file: File,
		opts?: { sectionId?: string; title?: string }
	): Promise<Document> {
		try {
			const doc = await apiUploadDocument(courseId, file, opts)
			this.update((s) => ({ ...s, documents: [...s.documents, doc] }))
			this.startIngestPolling(doc.id)
			return doc
		} catch {
			return this.createDocument({
				courseId,
				sectionId: opts?.sectionId ?? null,
				title: opts?.title ?? file.name,
				sourceFilename: file.name,
				mimeType: file.type || 'application/octet-stream',
			})
		}
	}

	createCourse(input: Omit<Course, 'id' | 'createdAt'>): Course {
		const course: Course = {
			...input,
			id: genId('course'),
			createdAt: Date.now(),
		}
		this.update((s) => ({ ...s, courses: [...s.courses, course] }))
		return course
	}

	updateCourse(id: string, patch: Partial<Omit<Course, 'id'>>): void {
		this.update((s) => ({
			...s,
			courses: s.courses.map((c) => (c.id === id ? { ...c, ...patch } : c)),
		}))
	}

	deleteCourse(id: string): void {
		this.update((s) => ({
			courses: s.courses.filter((c) => c.id !== id),
			sections: s.sections.filter((sec) => sec.courseId !== id),
			documents: s.documents.filter((d) => d.courseId !== id),
			sessions: s.sessions.filter((sess) => sess.courseId !== id),
		}))
	}

	createSection(courseId: string, name: string): Section {
		const existing = this.getSections(courseId)
		const section: Section = {
			id: genId('section'),
			courseId,
			name,
			position: existing.length,
		}
		this.update((s) => ({ ...s, sections: [...s.sections, section] }))
		return section
	}

	createDocument(input: Omit<Document, 'id' | 'createdAt' | 'status'>): Document {
		const doc: Document = {
			...input,
			id: genId('doc'),
			status: 'pending',
			createdAt: Date.now(),
		}
		this.update((s) => ({ ...s, documents: [...s.documents, doc] }))
		return doc
	}

	createSession(courseId: string, title: string): TutorSession {
		const session: TutorSession = {
			id: genId('session'),
			courseId,
			title,
			createdAt: Date.now(),
			lastActiveAt: Date.now(),
		}
		this.update((s) => ({ ...s, sessions: [...s.sessions, session] }))
		return session
	}

	touchSession(id: string): void {
		this.update((s) => ({
			...s,
			sessions: s.sessions.map((sess) =>
				sess.id === id ? { ...sess, lastActiveAt: Date.now() } : sess
			),
		}))
	}

	private update(updater: (state: PersistedState) => PersistedState): void {
		const next = updater(this.stateAtom.get())
		this.stateAtom.set(next)
		persist(next)
	}

	// Used by useValue() to subscribe reactively
	get atom(): Atom<PersistedState> {
		return this.stateAtom
	}
}

export const courseStore = new CourseStore()
