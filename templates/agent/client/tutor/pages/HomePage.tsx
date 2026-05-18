import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useValue } from 'tldraw'
import { AppLayout } from '../components/AppLayout'
import { courseStore } from '../store/CourseStore'

export function HomePage() {
	const courses = useValue('courses', () => courseStore.getCourses(), [])
	const navigate = useNavigate()

	const handleCreate = useCallback(async () => {
		const name = window.prompt('Course name?')
		if (!name) return
		const course = await courseStore.createCourseAsync(name)
		navigate(`/courses/${course.id}`)
	}, [navigate])

	return (
		<AppLayout
			main={
				<div className="tutor-page tutor-home-page">
					<header className="tutor-page-header">
						<h1>Your courses</h1>
						<p className="tutor-page-subtitle">
							Pick a course to open its tutor, or create a new one.
						</p>
					</header>
					{courses.length === 0 ? (
						<div className="tutor-empty-state">
							<p>You haven&apos;t added any courses yet.</p>
							<button className="tutor-primary-btn" onClick={handleCreate}>
								Create a course
							</button>
						</div>
					) : (
						<div className="tutor-course-grid">
							{courses.map((course) => (
								<button
									key={course.id}
									className="tutor-course-card"
									onClick={() => navigate(`/courses/${course.id}`)}
								>
									<div className="tutor-course-card-name">{course.name}</div>
									{course.code && <div className="tutor-course-card-code">{course.code}</div>}
									{course.description && (
										<div className="tutor-course-card-desc">{course.description}</div>
									)}
								</button>
							))}
							<button className="tutor-course-card tutor-course-card-add" onClick={handleCreate}>
								<span className="tutor-course-card-plus">+</span>
								<span>Add course</span>
							</button>
						</div>
					)}
				</div>
			}
		/>
	)
}
