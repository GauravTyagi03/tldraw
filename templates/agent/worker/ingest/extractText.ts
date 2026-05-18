/**
 * Server-side text extraction for formats we can handle in Workers without
 * heavy native deps. PDF/DOCX/PPTX should send `extractedText` from the browser.
 */
export async function extractTextFromBytes(
	bytes: ArrayBuffer,
	opts: { mimeType: string; filename: string }
): Promise<string> {
	const { mimeType, filename } = opts
	const lower = filename.toLowerCase()

	if (
		mimeType.startsWith('text/') ||
		lower.endsWith('.md') ||
		lower.endsWith('.txt') ||
		lower.endsWith('.json') ||
		lower.endsWith('.csv')
	) {
		return new TextDecoder('utf-8', { fatal: false }).decode(bytes).trim()
	}

	if (lower.endsWith('.html') || lower.endsWith('.htm')) {
		const html = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
		return stripHtml(html)
	}

	throw new Error(
		`Unsupported format for server extraction: ${mimeType || filename}. Upload .txt/.md or provide extracted text from the client.`
	)
}

function stripHtml(html: string): string {
	return html
		.replace(/<script[\s\S]*?<\/script>/gi, ' ')
		.replace(/<style[\s\S]*?<\/style>/gi, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
}
