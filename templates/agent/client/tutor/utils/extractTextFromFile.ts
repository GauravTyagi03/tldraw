/**
 * Client-side text extraction before upload. Handles formats that are awkward
 * in Workers (PDF). Plain text and markdown are read directly.
 */
export async function extractTextFromFile(file: File): Promise<string> {
	const name = file.name.toLowerCase()
	if (
		file.type.startsWith('text/') ||
		name.endsWith('.md') ||
		name.endsWith('.txt') ||
		name.endsWith('.json') ||
		name.endsWith('.csv')
	) {
		return (await file.text()).trim()
	}

	if (name.endsWith('.html') || name.endsWith('.htm')) {
		const html = await file.text()
		return html
			.replace(/<script[\s\S]*?<\/script>/gi, ' ')
			.replace(/<style[\s\S]*?<\/style>/gi, ' ')
			.replace(/<[^>]+>/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
	}

	// PDF: use pdf.js in the browser when available
	if (name.endsWith('.pdf') || file.type === 'application/pdf') {
		try {
			return await extractPdfText(file)
		} catch (e) {
			console.warn('PDF extraction failed', e)
			return ''
		}
	}

	return ''
}

async function extractPdfText(file: File): Promise<string> {
	const pdfjs = await import('pdfjs-dist')
	pdfjs.GlobalWorkerOptions.workerSrc = new URL(
		'pdfjs-dist/build/pdf.worker.min.mjs',
		import.meta.url
	).toString()

	const data = new Uint8Array(await file.arrayBuffer())
	const doc = await pdfjs.getDocument({ data }).promise
	const parts: string[] = []
	for (let i = 1; i <= doc.numPages; i++) {
		const page = await doc.getPage(i)
		const content = await page.getTextContent()
		const pageText = content.items.map((item) => ('str' in item ? item.str : '')).join(' ')
		parts.push(pageText)
	}
	return parts.join('\n\n').trim()
}
