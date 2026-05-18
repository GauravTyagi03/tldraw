import { useCallback, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useValue } from 'tldraw'
import { courseStore } from '../store/CourseStore'
import { layoutStore } from '../store/LayoutStore'
import { Course, Document, Section } from '../types'

export function LeftRail() {
	const collapsed = useValue('left-collapsed', () => layoutStore.getState().leftCollapsed, [])

	if (collapsed) {
		return <CollapsedLeftRail />
	}

	return <ExpandedLeftRail />
}

function CollapsedLeftRail() {
	return (
		<aside className="tutor-rail tutor-rail-left tutor-rail-collapsed">
			<button
				className="tutor-rail-toggle"
				onClick={() => layoutStore.toggleLeft()}
				title="Show courses"
				aria-label="Show courses"
			>
				<span className="tutor-rail-toggle-icon">{'›'}</span>
			</button>
		</aside>
	)
}

function ExpandedLeftRail() {
	const courses = useValue('courses', () => courseStore.getCourses(), [])
	const navigate = useNavigate()
	const { courseId } = useParams<{ courseId?: string }>()

	const handleCreate = useCallback(async () => {
		const name = window.prompt('Course name?')
		if (!name) return
		const course = await courseStore.createCourseAsync(name)
		navigate(`/courses/${course.id}`)
	}, [navigate])

	return (
		<aside className="tutor-rail tutor-rail-left">
			<div className="tutor-rail-header">
				<h2 className="tutor-rail-title">Courses</h2>
				<div className="tutor-rail-header-actions">
					<button
						className="tutor-rail-icon-btn"
						onClick={handleCreate}
						title="Add course"
						aria-label="Add course"
					>
						+
					</button>
					<button
						className="tutor-rail-icon-btn"
						onClick={() => layoutStore.toggleLeft()}
						title="Collapse sidebar"
						aria-label="Collapse sidebar"
					>
						{'‹'}
					</button>
				</div>
			</div>

			<div className="tutor-rail-body">
				{courses.length === 0 ? (
					<div className="tutor-rail-empty">
						<p>No courses yet.</p>
						<button className="tutor-rail-cta" onClick={handleCreate}>
							Create your first course
						</button>
					</div>
				) : (
					<ul className="tutor-course-list">
						{courses.map((course) => (
							<CourseTreeItem key={course.id} course={course} active={course.id === courseId} />
						))}
					</ul>
				)}
			</div>
		</aside>
	)
}

function CourseTreeItem({ course, active }: { course: Course; active: boolean }) {
	const [expanded, setExpanded] = useState(active)
	const navigate = useNavigate()
	const sections = useValue(`sections:${course.id}`, () => courseStore.getSections(course.id), [
		course.id,
	])
	const looseDocs = useValue(
		`loose-docs:${course.id}`,
		() => courseStore.getDocuments(course.id, null),
		[course.id]
	)

	return (
		<li className={`tutor-course-item ${active ? 'active' : ''}`}>
			<div className="tutor-course-row">
				<button
					className="tutor-course-disclosure"
					onClick={() => setExpanded((e) => !e)}
					aria-label={expanded ? 'Collapse course' : 'Expand course'}
				>
					{expanded ? '▾' : '▸'}
				</button>
				<button
					className="tutor-course-name"
					onClick={() => navigate(`/courses/${course.id}`)}
					title={course.name}
				>
					{course.name}
				</button>
			</div>
			{expanded && (
				<ul className="tutor-section-list">
					{sections.map((section) => (
						<SectionTreeItem key={section.id} section={section} />
					))}
					{looseDocs.map((doc) => (
						<DocumentRow key={doc.id} doc={doc} />
					))}
					<li className="tutor-add-section">
						<button
							className="tutor-add-section-btn"
							onClick={async () => {
								const name = window.prompt('Section name?')
								if (name) await courseStore.createSectionAsync(course.id, name)
							}}
						>
							+ Add section
						</button>
					</li>
					<li className="tutor-add-section">
						<label className="tutor-upload-label">
							+ Upload document
							<input
								type="file"
								className="tutor-upload-input"
								accept=".pdf,.md,.txt,.docx,.pptx"
								onChange={async (e) => {
									const file = e.target.files?.[0]
									if (!file) return
									await courseStore.uploadDocumentAsync(course.id, file)
									e.target.value = ''
								}}
							/>
						</label>
					</li>
				</ul>
			)}
		</li>
	)
}

function SectionTreeItem({ section }: { section: Section }) {
	const [expanded, setExpanded] = useState(true)
	const docs = useValue(
		`docs:${section.id}`,
		() => courseStore.getDocuments(section.courseId, section.id),
		[section.id, section.courseId]
	)
	return (
		<li className="tutor-section-item">
			<div className="tutor-section-row">
				<button className="tutor-section-disclosure" onClick={() => setExpanded((e) => !e)}>
					{expanded ? '▾' : '▸'}
				</button>
				<span className="tutor-section-name" title={section.name}>
					{section.name}
				</span>
			</div>
			{expanded && (
				<ul className="tutor-doc-list">
					{docs.length === 0 ? (
						<li className="tutor-doc-empty">No documents</li>
					) : (
						docs.map((doc) => <DocumentRow key={doc.id} doc={doc} />)
					)}
				</ul>
			)}
		</li>
	)
}

function DocumentRow({ doc }: { doc: Document }) {
	const handleDelete = useCallback(
		async (e: React.MouseEvent) => {
			e.preventDefault()
			e.stopPropagation()
			if (!window.confirm(`Remove "${doc.title}" from this course?`)) return
			await courseStore.deleteDocumentAsync(doc.id)
		},
		[doc.id, doc.title]
	)

	return (
		<li className={`tutor-doc-row tutor-doc-status-${doc.status}`}>
			<span className="tutor-doc-name" title={doc.title}>
				{doc.title}
			</span>
			<DocumentStatusBadge status={doc.status} />
			<button
				type="button"
				className="tutor-doc-delete-btn"
				onClick={(e) => void handleDelete(e)}
				title="Remove document"
				aria-label={`Remove ${doc.title}`}
			>
				×
			</button>
		</li>
	)
}

function DocumentStatusBadge({ status }: { status: Document['status'] }) {
	const label =
		status === 'ready'
			? 'ready'
			: status === 'ingesting'
				? 'indexing…'
				: status === 'failed'
					? 'failed'
					: 'pending'
	return <span className={`tutor-doc-badge tutor-doc-badge-${status}`}>{label}</span>
}
