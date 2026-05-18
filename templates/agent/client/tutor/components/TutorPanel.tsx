import { ReactNode } from 'react'
import { useValue } from 'tldraw'
import { layoutStore } from '../store/LayoutStore'

interface TutorPanelProps {
	children: ReactNode
}

/**
 * The right-hand rail that hosts the tutor conversation feed. In Phase 0 it
 * wraps the existing ChatPanel so functionality is preserved while we build
 * out routing and the new layout shell. Phase 5 will replace the inner content
 * with a single conversation timeline (voice transcripts + drawing dispatches).
 */
export function TutorPanel({ children }: TutorPanelProps) {
	const collapsed = useValue('right-collapsed', () => layoutStore.getState().rightCollapsed, [])

	if (collapsed) {
		return (
			<aside className="tutor-rail tutor-rail-right tutor-rail-collapsed">
				<button
					className="tutor-rail-toggle"
					onClick={() => layoutStore.toggleRight()}
					title="Show tutor"
					aria-label="Show tutor"
				>
					<span className="tutor-rail-toggle-icon">{'‹'}</span>
				</button>
			</aside>
		)
	}

	return (
		<aside className="tutor-rail tutor-rail-right">
			<div className="tutor-rail-header">
				<h2 className="tutor-rail-title">Tutor</h2>
				<div className="tutor-rail-header-actions">
					<button
						className="tutor-rail-icon-btn"
						onClick={() => layoutStore.toggleRight()}
						title="Collapse sidebar"
						aria-label="Collapse sidebar"
					>
						{'›'}
					</button>
				</div>
			</div>
			<div className="tutor-rail-body tutor-rail-body-flush">{children}</div>
		</aside>
	)
}
