import { ReactNode } from 'react'
import { useValue } from 'tldraw'
import { layoutStore } from '../store/LayoutStore'
import { LeftRail } from './LeftRail'

interface AppLayoutProps {
	/** Content of the central area (canvas, course page, etc.) */
	main: ReactNode
	/** Optional right rail content. When omitted the right column is hidden. */
	right?: ReactNode
	/** Optional bottom-floating overlay (voice button + subtitles). */
	bottomOverlay?: ReactNode
}

/**
 * The 3-column collapsible shell used by every route. The rails are mounted
 * but their content varies — left is always the course/document tree.
 */
export function AppLayout({ main, right, bottomOverlay }: AppLayoutProps) {
	const { leftCollapsed, rightCollapsed } = useValue(
		'layout-state',
		() => layoutStore.getState(),
		[]
	)

	const hasRight = !!right

	const className = [
		'tutor-shell',
		leftCollapsed ? 'tutor-shell-left-collapsed' : 'tutor-shell-left-expanded',
		!hasRight
			? 'tutor-shell-right-hidden'
			: rightCollapsed
				? 'tutor-shell-right-collapsed'
				: 'tutor-shell-right-expanded',
	].join(' ')

	return (
		<div className={className}>
			<LeftRail />
			<main className="tutor-main">{main}</main>
			{hasRight && right}
			{bottomOverlay && <div className="tutor-bottom-overlay">{bottomOverlay}</div>}
		</div>
	)
}
