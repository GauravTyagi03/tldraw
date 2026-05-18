/**
 * Core types for the tutor platform. These mirror the eventual D1 schema
 * landing in Phase 2. For now they live client-side and back onto localStorage.
 */

export type DocumentStatus = 'pending' | 'ingesting' | 'ready' | 'failed'

export interface Course {
	id: string
	name: string
	code?: string
	description?: string
	color?: string
	instructor?: string
	term?: string
	createdAt: number
}

export interface Section {
	id: string
	courseId: string
	name: string
	position: number
}

export interface Document {
	id: string
	courseId: string
	sectionId: string | null
	title: string
	sourceFilename: string
	mimeType: string
	r2Key?: string
	status: DocumentStatus
	createdAt: number
}

export interface TutorSession {
	id: string
	courseId: string
	title: string
	createdAt: number
	lastActiveAt: number
}

export interface TutorMessage {
	id: string
	sessionId: string
	role: 'user' | 'agent' | 'system'
	content: string
	audioR2Key?: string
	createdAt: number
}

export interface Topic {
	id: string
	courseId: string
	label: string
	sourceChunkIds?: string[]
}
