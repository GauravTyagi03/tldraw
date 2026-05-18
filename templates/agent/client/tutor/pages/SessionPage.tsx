import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
	DefaultSizeStyle,
	TLComponents,
	Tldraw,
	TldrawOverlays,
	TLUiOverrides,
	useValue,
} from 'tldraw'
import { TldrawAgentApp } from '../../agent/TldrawAgentApp'
import {
	TldrawAgentAppContextProvider,
	TldrawAgentAppProvider,
} from '../../agent/TldrawAgentAppProvider'
import { CustomHelperButtons } from '../../components/CustomHelperButtons'
import { AgentViewportBoundsHighlights } from '../../components/highlights/AgentViewportBoundsHighlights'
import { AllContextHighlights } from '../../components/highlights/ContextHighlights'
import { TargetAreaTool } from '../../tools/TargetAreaTool'
import { TargetShapeTool } from '../../tools/TargetShapeTool'
import { AppLayout } from '../components/AppLayout'
import { SessionTutorLayout } from '../components/SessionTutorLayout'
import { TutorPanel } from '../components/TutorPanel'
import { courseStore } from '../store/CourseStore'

DefaultSizeStyle.setDefaultValue('s')

const tools = [TargetShapeTool, TargetAreaTool]

const overrides: TLUiOverrides = {
	tools: (editor, builtins) => ({
		...builtins,
		'target-area': {
			id: 'target-area',
			label: 'Pick Area',
			kbd: 'c',
			icon: 'tool-frame',
			onSelect() {
				editor.setCurrentTool('target-area')
			},
		},
		'target-shape': {
			id: 'target-shape',
			label: 'Pick Shape',
			kbd: 's',
			icon: 'tool-frame',
			onSelect() {
				editor.setCurrentTool('target-shape')
			},
		},
	}),
}

export function SessionPage() {
	const { courseId = '', sessionId = '' } = useParams<{
		courseId: string
		sessionId: string
	}>()
	const [searchParams] = useSearchParams()
	const navigate = useNavigate()
	const [app, setApp] = useState<TldrawAgentApp | null>(null)
	const appRef = useRef<TldrawAgentApp | null>(null)
	appRef.current = app

	const course = useValue(`course:${courseId}`, () => courseStore.getCourse(courseId), [courseId])
	const session = useValue(`session:${sessionId}`, () => courseStore.getSession(sessionId), [
		sessionId,
	])

	const topicHint = searchParams.get('topic') ?? undefined

	useEffect(() => {
		if (sessionId) courseStore.touchSession(sessionId)
	}, [sessionId])

	const handleUnmount = useCallback(() => setApp(null), [])

	// Stable components object — do not close over `app` or Tldraw remounts when the agent
	// becomes ready (which caused a loading ↔ white screen loop).
	const components: TLComponents = useMemo(
		() => ({
			HelperButtons: () => {
				const current = appRef.current
				if (!current) return null
				return (
					<TldrawAgentAppContextProvider app={current}>
						<CustomHelperButtons />
					</TldrawAgentAppContextProvider>
				)
			},
			Overlays: () => (
				<>
					<TldrawOverlays />
					{appRef.current && (
						<TldrawAgentAppContextProvider app={appRef.current}>
							<AgentViewportBoundsHighlights />
							<AllContextHighlights />
						</TldrawAgentAppContextProvider>
					)}
				</>
			),
		}),
		[]
	)

	if (!course || !session) {
		return (
			<AppLayout
				main={
					<div className="tutor-page">
						<div className="tutor-empty-state">
							<p>Session not found.</p>
							<button
								className="tutor-primary-btn"
								onClick={() => navigate(`/courses/${courseId}`)}
							>
								Back to course
							</button>
						</div>
					</div>
				}
			/>
		)
	}

	const persistenceKey = `tldraw-tutor:session:${session.id}`

	const canvas = useMemo(
		() => (
			<div className="tutor-canvas-host">
				<Tldraw
					persistenceKey={persistenceKey}
					tools={tools}
					overrides={overrides}
					components={components}
				>
					<TldrawAgentAppProvider onMount={setApp} onUnmount={handleUnmount} />
				</Tldraw>
			</div>
		),
		[persistenceKey, components]
	)

	// Always use the same AppLayout shell so <Tldraw> is never unmounted when the agent
	// finishes initializing.
	return (
		<AppLayout
			main={canvas}
			right={
				app ? (
					<TldrawAgentAppContextProvider app={app}>
						<SessionTutorLayout
							courseId={courseId}
							sessionId={sessionId}
							courseName={course.name}
							topicHint={topicHint}
						/>
					</TldrawAgentAppContextProvider>
				) : (
					<TutorPanel>
						<p className="tutor-session-loading">Starting session…</p>
					</TutorPanel>
				)
			}
		/>
	)
}
