export type DocumentStatus = 'pending' | 'ingesting' | 'ready' | 'failed'

export interface CourseRow {
	id: string
	name: string
	code: string | null
	description: string | null
	color: string | null
	instructor: string | null
	term: string | null
	embedding_model: string
	created_at: number
}

export interface SectionRow {
	id: string
	course_id: string
	name: string
	position: number
}

export interface DocumentRow {
	id: string
	course_id: string
	section_id: string | null
	title: string
	source_filename: string
	mime_type: string
	r2_key: string | null
	status: DocumentStatus
	created_at: number
}

export interface SessionRow {
	id: string
	course_id: string
	title: string
	created_at: number
	last_active_at: number
}

export interface MessageRow {
	id: string
	session_id: string
	role: string
	content: string
	audio_r2_key: string | null
	created_at: number
}
