import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useValue } from 'tldraw'
import { apiFetchTopics, apiRefreshTopics } from '../api/courseApi'
import { AppLayout } from '../components/AppLayout'
import { courseStore } from '../store/CourseStore'
import { Topic } from '../types'

/**
 * Course landing page — the hub from which the whiteboard tutor branches off.
 * Phase 0 ships a minimal layout with four cards (syllabus, topics, sessions,
 * documents). Phase 4 fills in topics; Phase 6 polishes the syllabus editor.
 */
export function CoursePage() {
	const { courseId = '' } = useParams<{ courseId: string }>()
	const navigate = useNavigate()
	const course = useValue(`course:${courseId}`, () => courseStore.getCourse(courseId), [courseId])
	const sessions = useValue(`sessions:${courseId}`, () => courseStore.getSessions(courseId), [
		courseId,
	])
	const documents = useValue(`docs:${courseId}`, () => courseStore.getDocuments(courseId), [
		courseId,
	])

	const [topics, setTopics] = useState<Topic[]>([])
	const [topicsLoading, setTopicsLoading] = useState(false)

	const loadTopics = useCallback(async () => {
		try {
			const rows = await apiFetchTopics(courseId)
			setTopics(rows)
		} catch {
			setTopics([])
		}
	}, [courseId])

	useEffect(() => {
		void loadTopics()
	}, [loadTopics])

	const handleRefreshTopics = useCallback(async () => {
		setTopicsLoading(true)
		try {
			await apiRefreshTopics(courseId)
			await loadTopics()
		} finally {
			setTopicsLoading(false)
		}
	}, [courseId, loadTopics])

	const handleStartSession = useCallback(
		async (seedTitle?: string, topicLabel?: string) => {
			const title = seedTitle ?? `Session ${new Date().toLocaleString()}`
			const session = await courseStore.createSessionAsync(courseId, title)
			const q = topicLabel ? `?topic=${encodeURIComponent(topicLabel)}` : ''
			navigate(`/courses/${courseId}/session/${session.id}${q}`)
		},
		[courseId, navigate]
	)

	if (!course) {
		return (
			<AppLayout
				main={
					<div className="tutor-page">
						<div className="tutor-empty-state">
							<p>Course not found.</p>
							<button className="tutor-primary-btn" onClick={() => navigate('/')}>
								Back to courses
							</button>
						</div>
					</div>
				}
			/>
		)
	}

	return (
		<AppLayout
			main={
				<div className="tutor-page tutor-course-page">
					<header className="tutor-page-header">
						<div className="tutor-course-page-title-row">
							<h1>{course.name}</h1>
							<button className="tutor-primary-btn" onClick={() => handleStartSession()}>
								Start tutoring session
							</button>
						</div>
						{course.code && <div className="tutor-course-card-code">{course.code}</div>}
					</header>

					<section className="tutor-card">
						<h2 className="tutor-card-title">Syllabus</h2>
						<dl className="tutor-syllabus">
							<dt>Instructor</dt>
							<dd>{course.instructor ?? <em className="tutor-placeholder">Not set</em>}</dd>
							<dt>Term</dt>
							<dd>{course.term ?? <em className="tutor-placeholder">Not set</em>}</dd>
							<dt>Description</dt>
							<dd>
								{course.description ?? (
									<em className="tutor-placeholder">Add a course description</em>
								)}
							</dd>
						</dl>
					</section>

					<section className="tutor-card">
						<div className="tutor-card-title-row">
							<h2 className="tutor-card-title">Topics</h2>
							<button
								className="tutor-secondary-btn"
								onClick={() => void handleRefreshTopics()}
								disabled={topicsLoading}
							>
								{topicsLoading ? 'Indexing…' : 'Refresh topics'}
							</button>
						</div>
						{topics.length === 0 ? (
							<p className="tutor-card-empty">
								Upload documents, wait for indexing, then refresh topics.
							</p>
						) : (
							<div className="tutor-topic-grid">
								{topics.map((t) => (
									<button
										key={t.id}
										className="tutor-topic-chip"
										onClick={() => void handleStartSession(`Tutor: ${t.label}`, t.label)}
									>
										{t.label}
									</button>
								))}
							</div>
						)}
					</section>

					<section className="tutor-card">
						<h2 className="tutor-card-title">Past sessions</h2>
						{sessions.length === 0 ? (
							<p className="tutor-card-empty">No sessions yet.</p>
						) : (
							<ul className="tutor-session-list">
								{sessions.map((session) => (
									<li key={session.id} className="tutor-session-row">
										<button
											className="tutor-session-link"
											onClick={() => navigate(`/courses/${courseId}/session/${session.id}`)}
										>
											<span className="tutor-session-title">{session.title}</span>
											<span className="tutor-session-meta">
												{new Date(session.lastActiveAt).toLocaleString()}
											</span>
										</button>
									</li>
								))}
							</ul>
						)}
					</section>

					<section className="tutor-card">
						<h2 className="tutor-card-title">Documents</h2>
						{documents.length === 0 ? (
							<p className="tutor-card-empty">
								Upload course materials from the sidebar to enable RAG.
							</p>
						) : (
							<ul className="tutor-doc-list-flat">
								{documents.map((doc) => (
									<li key={doc.id} className="tutor-doc-flat-row">
										<span>{doc.title}</span>
										<span className="tutor-doc-flat-actions">
											<span className={`tutor-doc-badge tutor-doc-badge-${doc.status}`}>
												{doc.status}
											</span>
											<button
												type="button"
												className="tutor-doc-delete-btn"
												onClick={() => {
													if (!window.confirm(`Remove "${doc.title}" from this course?`)) {
														return
													}
													void courseStore.deleteDocumentAsync(doc.id)
												}}
												title="Remove document"
												aria-label={`Remove ${doc.title}`}
											>
												×
											</button>
										</span>
									</li>
								))}
							</ul>
						)}
					</section>
				</div>
			}
		/>
	)
}
