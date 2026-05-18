import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { TldrawUiToastsProvider } from 'tldraw'
import { CourseDataBootstrap } from './tutor/components/CourseDataBootstrap'
import { CoursePage } from './tutor/pages/CoursePage'
import { HomePage } from './tutor/pages/HomePage'
import { SessionPage } from './tutor/pages/SessionPage'

function App() {
	return (
		<TldrawUiToastsProvider>
			<BrowserRouter>
				<CourseDataBootstrap />
				<Routes>
					<Route path="/" element={<HomePage />} />
					<Route path="/courses/:courseId" element={<CoursePage />} />
					<Route path="/courses/:courseId/session/:sessionId" element={<SessionPage />} />
					<Route path="*" element={<Navigate to="/" replace />} />
				</Routes>
			</BrowserRouter>
		</TldrawUiToastsProvider>
	)
}

export default App
