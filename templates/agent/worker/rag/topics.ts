import { genId } from '../db/ids'
import type { Environment } from '../environment'
import { getProvidersForEnv } from '../providers'

interface ChunkWithVec {
	id: string
	text: string
	vector: Float32Array
}

/**
 * Simple k-means (k ≤ 20) over chunk embeddings, then label each cluster via the
 * voice LLM. Stores rows in `topics`.
 */
export async function extractTopicsForCourse(env: Environment, courseId: string): Promise<number> {
	const db = env.TUTOR_DB
	if (!db) throw new Error('TUTOR_DB not configured')

	const providers = getProvidersForEnv(env)
	const rows = await db
		.prepare(
			`SELECT c.id, c.text FROM chunks c
       INNER JOIN documents d ON d.id = c.document_id
       WHERE d.course_id = ? AND d.status = 'ready'
       LIMIT 500`
		)
		.bind(courseId)
		.all<{ id: string; text: string }>()

	if (rows.results.length === 0) return 0

	const chunks: ChunkWithVec[] = []
	const batchSize = 32
	for (let i = 0; i < rows.results.length; i += batchSize) {
		const batch = rows.results.slice(i, i + batchSize)
		const embeddings = await providers.embeddings.embed(batch.map((r) => r.text.slice(0, 800)))
		for (let j = 0; j < batch.length; j++) {
			chunks.push({ id: batch[j].id, text: batch[j].text, vector: embeddings[j] })
		}
	}

	const k = Math.min(20, Math.max(3, Math.round(Math.sqrt(chunks.length))))
	const assignments = kMeans(
		chunks.map((c) => c.vector),
		k
	)

	await db.prepare('DELETE FROM topics WHERE course_id = ?').bind(courseId).run()

	const clusters = new Map<number, ChunkWithVec[]>()
	for (let i = 0; i < chunks.length; i++) {
		const cluster = assignments[i] ?? 0
		if (!clusters.has(cluster)) clusters.set(cluster, [])
		clusters.get(cluster)!.push(chunks[i])
	}

	let created = 0
	for (const [, members] of clusters) {
		if (members.length < 2) continue
		const sample = members
			.slice(0, 5)
			.map((m, i) => `[${i + 1}] ${m.text.slice(0, 300)}`)
			.join('\n\n')
		const label = await labelCluster(env, sample)
		if (!label) continue
		const id = genId('topic')
		await db
			.prepare(
				`INSERT INTO topics (id, course_id, label, source_chunk_ids, embedding_centroid_vector_id)
         VALUES (?, ?, ?, ?, NULL)`
			)
			.bind(id, courseId, label, JSON.stringify(members.map((m) => m.id)))
			.run()
		created++
	}
	return created
}

async function labelCluster(env: Environment, sample: string): Promise<string> {
	const providers = getProvidersForEnv(env)
	let text = ''
	for await (const delta of providers.voiceLLM.streamChat([
		{
			role: 'system',
			content:
				'You label course material clusters with a short 2-5 word topic title. Reply with ONLY the title, no punctuation.',
		},
		{
			role: 'user',
			content: `Summarize these excerpts as one topic title:\n\n${sample}`,
		},
	])) {
		if (delta.type === 'text') text += delta.delta
	}
	return text.trim().slice(0, 80)
}

function kMeans(vectors: Float32Array[], k: number, maxIter = 12): number[] {
	if (vectors.length === 0) return []
	const dim = vectors[0].length
	const centroids: Float32Array[] = []
	for (let i = 0; i < k; i++) {
		centroids.push(vectors[Math.floor((i * vectors.length) / k)].slice())
	}
	const assignments = new Array(vectors.length).fill(0)

	for (let iter = 0; iter < maxIter; iter++) {
		for (let i = 0; i < vectors.length; i++) {
			let best = 0
			let bestScore = -Infinity
			for (let c = 0; c < k; c++) {
				const score = cosine(vectors[i], centroids[c])
				if (score > bestScore) {
					bestScore = score
					best = c
				}
			}
			assignments[i] = best
		}
		const sums = Array.from({ length: k }, () => new Float32Array(dim))
		const counts = new Array(k).fill(0)
		for (let i = 0; i < vectors.length; i++) {
			const a = assignments[i]
			counts[a]++
			for (let d = 0; d < dim; d++) sums[a][d] += vectors[i][d]
		}
		for (let c = 0; c < k; c++) {
			if (counts[c] === 0) continue
			for (let d = 0; d < dim; d++) centroids[c][d] = sums[c][d] / counts[c]
		}
	}
	return assignments
}

function cosine(a: Float32Array, b: Float32Array): number {
	let dot = 0
	let na = 0
	let nb = 0
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i]
		na += a[i] * a[i]
		nb += b[i] * b[i]
	}
	return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1)
}
