import {
	Float32Embedding,
	VectorIndex,
	VectorMatch,
	VectorQueryFilter,
	VectorRecord,
} from '../types'

/**
 * Brute-force cosine-similarity vector index backed by D1. Vectors are stored
 * as Float32Array BLOBs; queries fetch all matching rows (after metadata
 * filter) and compute cosine in-memory.
 *
 * This is the development-time stand-in for Cloudflare Vectorize. Both work in
 * workerd and locally; this one scales linearly so it's only suitable for
 * dev-sized corpora (a few thousand chunks). Behavior is otherwise identical
 * to `VectorizeIndex`.
 *
 * Required schema (created via the Phase 2 migration):
 *
 *   CREATE TABLE vector_records (
 *     id TEXT PRIMARY KEY,
 *     index_name TEXT NOT NULL,
 *     dimensions INTEGER NOT NULL,
 *     vector BLOB NOT NULL,
 *     metadata TEXT NOT NULL DEFAULT '{}'
 *   );
 *   CREATE INDEX idx_vector_records_index ON vector_records (index_name);
 *
 * Metadata is stored as JSON; filters are applied in JS rather than via SQL
 * to keep the schema generic. Phase 4 may add specific indexed columns for
 * hot filter keys (e.g. course_id) once we have measurements.
 */
export class D1CosineIndex implements VectorIndex {
	readonly dimensions: number
	readonly name: string

	constructor(
		private readonly db: D1Database,
		opts: { name: string; dimensions: number }
	) {
		this.name = opts.name
		this.dimensions = opts.dimensions
	}

	async upsert(records: VectorRecord[]): Promise<void> {
		if (records.length === 0) return
		const stmt = this.db.prepare(
			'INSERT OR REPLACE INTO vector_records (id, index_name, dimensions, vector, metadata) VALUES (?, ?, ?, ?, ?)'
		)
		const batch = records.map((r) => {
			if (r.vector.length !== this.dimensions) {
				throw new Error(
					`D1CosineIndex.upsert: vector dimension ${r.vector.length} != index dimension ${this.dimensions}`
				)
			}
			const buf = floatArrayToBuffer(r.vector)
			return stmt.bind(r.id, this.name, this.dimensions, buf, JSON.stringify(r.metadata ?? {}))
		})
		await this.db.batch(batch)
	}

	async query(
		vector: Float32Embedding,
		options: { topK: number; filter?: VectorQueryFilter }
	): Promise<VectorMatch[]> {
		if (vector.length !== this.dimensions) {
			throw new Error(
				`D1CosineIndex.query: vector dimension ${vector.length} != index dimension ${this.dimensions}`
			)
		}

		const result = await this.db
			.prepare('SELECT id, vector, metadata FROM vector_records WHERE index_name = ?')
			.bind(this.name)
			.all<{ id: string; vector: ArrayBuffer; metadata: string }>()

		const queryNorm = norm(vector)
		const matches: VectorMatch[] = []

		for (const row of result.results) {
			const metadata = parseMetadata(row.metadata)
			if (!matchesFilter(metadata, options.filter)) continue
			const candidate = bufferToFloatArray(row.vector, this.dimensions)
			const score = cosineSimilarity(vector, candidate, queryNorm, norm(candidate))
			matches.push({ id: row.id, score, metadata })
		}

		matches.sort((a, b) => b.score - a.score)
		return matches.slice(0, options.topK)
	}

	async deleteByFilter(filter: VectorQueryFilter): Promise<{ deleted: number }> {
		// Fetch ids matching the filter (metadata-driven, so we filter in JS) then delete.
		const result = await this.db
			.prepare('SELECT id, metadata FROM vector_records WHERE index_name = ?')
			.bind(this.name)
			.all<{ id: string; metadata: string }>()

		const idsToDelete: string[] = []
		for (const row of result.results) {
			if (matchesFilter(parseMetadata(row.metadata), filter)) {
				idsToDelete.push(row.id)
			}
		}
		if (idsToDelete.length === 0) return { deleted: 0 }

		const stmt = this.db.prepare('DELETE FROM vector_records WHERE id = ?')
		await this.db.batch(idsToDelete.map((id) => stmt.bind(id)))
		return { deleted: idsToDelete.length }
	}
}

function floatArrayToBuffer(arr: Float32Array): ArrayBuffer {
	// Copy to ensure we own the underlying buffer (arr.buffer may be a view).
	const out = new ArrayBuffer(arr.byteLength)
	new Float32Array(out).set(arr)
	return out
}

function bufferToFloatArray(buf: ArrayBuffer, expected: number): Float32Array {
	const arr = new Float32Array(buf)
	if (arr.length !== expected) {
		throw new Error(`D1CosineIndex: stored vector has ${arr.length} dims, expected ${expected}`)
	}
	return arr
}

function parseMetadata(raw: string): Record<string, unknown> {
	if (!raw) return {}
	try {
		return JSON.parse(raw) as Record<string, unknown>
	} catch {
		return {}
	}
}

function matchesFilter(
	metadata: Record<string, unknown>,
	filter: VectorQueryFilter | undefined
): boolean {
	if (!filter) return true
	for (const [key, value] of Object.entries(filter)) {
		if (value === undefined) continue
		if (metadata[key] !== value) return false
	}
	return true
}

function norm(v: Float32Array): number {
	let sum = 0
	for (let i = 0; i < v.length; i++) sum += v[i] * v[i]
	return Math.sqrt(sum)
}

function cosineSimilarity(a: Float32Array, b: Float32Array, normA: number, normB: number): number {
	if (normA === 0 || normB === 0) return 0
	let dot = 0
	for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
	return dot / (normA * normB)
}

// D1Database / D1PreparedStatement are globals from @cloudflare/workers-types.
