import { useEffect } from 'react'
import { courseStore } from '../store/CourseStore'

/** On mount, sync course data from the Worker API when the backend is available. */
export function CourseDataBootstrap() {
	useEffect(() => {
		void courseStore.hydrateFromApi().then((ok) => {
			if (!ok) courseStore.pollPendingIngests()
		})
	}, [])
	return null
}
