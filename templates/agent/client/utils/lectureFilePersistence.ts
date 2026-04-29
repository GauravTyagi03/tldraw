import { LectureSequenceFile } from '../../shared/types/LectureSequence'

/**
 * Save a lecture sequence to a JSON file.
 * Uses the File System Access API (Chrome/Edge) with a fallback to a download link.
 * The user will be prompted to choose a save location.
 */
export async function saveLectureSequenceToFile(file: LectureSequenceFile): Promise<void> {
	const json = JSON.stringify(file, null, 2)
	const filename = `lecture_${file.id}.json`

	if ('showSaveFilePicker' in window) {
		try {
			const handle = await (window as any).showSaveFilePicker({
				suggestedName: filename,
				types: [
					{
						description: 'Lecture sequence JSON',
						accept: { 'application/json': ['.json'] },
					},
				],
			})
			const writable = await handle.createWritable()
			await writable.write(json)
			await writable.close()
			return
		} catch (e: any) {
			// User cancelled or API not supported — fall through to download
			if (e?.name === 'AbortError') return
		}
	}

	// Fallback: trigger a browser download
	const blob = new Blob([json], { type: 'application/json' })
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = filename
	document.body.appendChild(a)
	a.click()
	document.body.removeChild(a)
	URL.revokeObjectURL(url)
}

/**
 * Load a lecture sequence from a JSON file.
 * Opens a file picker dialog.
 */
export function loadLectureSequenceFromFile(): Promise<LectureSequenceFile> {
	return new Promise((resolve, reject) => {
		const input = document.createElement('input')
		input.type = 'file'
		input.accept = '.json,application/json'

		input.onchange = async () => {
			const file = input.files?.[0]
			if (!file) {
				reject(new Error('No file selected'))
				return
			}
			try {
				const text = await file.text()
				const data = JSON.parse(text) as LectureSequenceFile
				resolve(data)
			} catch {
				reject(new Error('Failed to parse lecture file'))
			}
		}

		input.oncancel = () => reject(new Error('File selection cancelled'))
		input.click()
	})
}
