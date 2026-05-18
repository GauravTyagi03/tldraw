import { ExecutionContext } from '@cloudflare/workers-types'
import { WorkerEntrypoint } from 'cloudflare:workers'
import { AutoRouter, cors, error, IRequest } from 'itty-router'
import { Environment } from './environment'
import * as api from './routes/api'
import { stream } from './routes/stream'
import { handleVoiceWebSocket } from './routes/voice'

const { preflight, corsify } = cors({ origin: '*' })

const router = AutoRouter<IRequest, [env: Environment, ctx: ExecutionContext]>({
	before: [preflight],
	finally: [corsify],
	catch: (e) => {
		console.error(e)
		return error(e)
	},
})
	.post('/stream', stream)
	// Courses
	.get('/api/courses', api.listCourses)
	.post('/api/courses', api.createCourse)
	.get('/api/courses/:courseId', api.getCourse)
	.patch('/api/courses/:courseId', api.updateCourse)
	.delete('/api/courses/:courseId', api.deleteCourse)
	// Sections
	.get('/api/courses/:courseId/sections', api.listSections)
	.post('/api/courses/:courseId/sections', api.createSection)
	// Documents
	.get('/api/courses/:courseId/documents', api.listDocuments)
	.post('/api/courses/:courseId/documents', api.uploadDocument)
	.delete('/api/documents/:documentId', api.deleteDocument)
	.get('/api/documents/:documentId/ingest-status', api.getIngestStatus)
	.get('/api/courses/:courseId/topics', api.listTopics)
	.post('/api/courses/:courseId/topics/refresh', api.refreshTopics)
	.post('/api/courses/:courseId/retrieve', api.ragRetrieve)
	// Sessions
	.get('/api/courses/:courseId/sessions', api.listSessions)
	.post('/api/courses/:courseId/sessions', api.createSession)
	// Messages
	.get('/api/sessions/:sessionId/messages', api.listMessages)
	.post('/api/sessions/:sessionId/messages', api.createMessage)

export default class extends WorkerEntrypoint<Environment> {
	override fetch(request: Request): Promise<Response> {
		const url = new URL(request.url)
		if (
			url.pathname === '/api/voice' &&
			request.headers.get('Upgrade')?.toLowerCase() === 'websocket'
		) {
			return handleVoiceWebSocket(request, this.env)
		}
		return router.fetch(request, this.env, this.ctx)
	}
}

// Make the durable object available to the cloudflare worker
export { AgentDurableObject } from './do/AgentDurableObject'
export { VoiceSessionDurableObject } from './do/VoiceSessionDurableObject'
