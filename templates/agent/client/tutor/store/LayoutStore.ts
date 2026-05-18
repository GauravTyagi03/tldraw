/**
 * UI layout state — sidebar collapse flags. Persisted to localStorage so the
 * layout survives reloads.
 */

import { atom, Atom } from 'tldraw'

interface LayoutState {
	leftCollapsed: boolean
	rightCollapsed: boolean
}

const STORAGE_KEYS = {
	left: 'tldraw-tutor:left-collapsed',
	right: 'tldraw-tutor:right-collapsed',
}

function readBool(key: string, fallback: boolean): boolean {
	if (typeof localStorage === 'undefined') return fallback
	const v = localStorage.getItem(key)
	if (v === null) return fallback
	return v === '1' || v === 'true'
}

function writeBool(key: string, value: boolean) {
	try {
		localStorage.setItem(key, value ? '1' : '0')
	} catch {
		// noop
	}
}

class LayoutStore {
	private readonly stateAtom: Atom<LayoutState>

	constructor() {
		this.stateAtom = atom<LayoutState>('LayoutStore.state', {
			leftCollapsed: readBool(STORAGE_KEYS.left, false),
			rightCollapsed: readBool(STORAGE_KEYS.right, false),
		})
	}

	get atom(): Atom<LayoutState> {
		return this.stateAtom
	}

	getState(): LayoutState {
		return this.stateAtom.get()
	}

	toggleLeft(): void {
		const next = !this.stateAtom.get().leftCollapsed
		this.stateAtom.update((s) => ({ ...s, leftCollapsed: next }))
		writeBool(STORAGE_KEYS.left, next)
	}

	toggleRight(): void {
		const next = !this.stateAtom.get().rightCollapsed
		this.stateAtom.update((s) => ({ ...s, rightCollapsed: next }))
		writeBool(STORAGE_KEYS.right, next)
	}

	setLeft(collapsed: boolean): void {
		this.stateAtom.update((s) => ({ ...s, leftCollapsed: collapsed }))
		writeBool(STORAGE_KEYS.left, collapsed)
	}

	setRight(collapsed: boolean): void {
		this.stateAtom.update((s) => ({ ...s, rightCollapsed: collapsed }))
		writeBool(STORAGE_KEYS.right, collapsed)
	}
}

export const layoutStore = new LayoutStore()
