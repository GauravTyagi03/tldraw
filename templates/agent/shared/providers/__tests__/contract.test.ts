import { beforeEach, describe, expect, it } from 'vitest'
import { VectorizeIndex } from '../cloudflare/VectorizeIndex'
import { D1CosineIndex } from '../local/D1CosineIndex'
import { VectorIndex, VectorRecord } from '../types'

/**
 * Contract test that runs the same suite against both VectorIndex
 * implementations. Catches drift between Local (D1Cosine) and Cloudflare
 * (Vectorize) when one is updated without the other.
 */

interface VectorizeMatchesResult {
	matches: Array<{ id: string; score: number; metadata?: Record<string, unknown> }>
}

class FakeVectorize {
	rows = new Map<string, { id: string; values: number[]; metadata?: Record<string, unknown> }>()

	async upsert(
		records: Array<{ id: string; values: number[]; metadata?: Record<string, unknown> }>
	) {
		for (const r of records) this.rows.set(r.id, r)
		return { count: records.length }
	}

	async query(
		vector: number[],
		opts: {
			topK: number
			returnMetadata?: 'all' | 'none' | boolean
			filter?: Record<string, unknown>
		}
	): Promise<VectorizeMatchesResult> {
		const queryNorm = norm(vector)
		const candidates: Array<{ id: string; score: number; metadata?: Record<string, unknown> }> = []
		for (const row of this.rows.values()) {
			if (opts.filter && !matchesFilter(row.metadata ?? {}, opts.filter)) continue
			const score =
				queryNorm === 0 ? 0 : dot(vector, row.values) / (queryNorm * norm(row.values) || 1)
			candidates.push({ id: row.id, score, metadata: row.metadata })
		}
		candidates.sort((a, b) => b.score - a.score)
		return { matches: candidates.slice(0, opts.topK) }
	}

	async deleteByIds(ids: string[]) {
		for (const id of ids) this.rows.delete(id)
		return { count: ids.length }
	}
}

function dot(a: number[], b: number[]): number {
	let s = 0
	for (let i = 0; i < a.length; i++) s += a[i] * b[i]
	return s
}

function norm(v: number[]): number {
	let s = 0
	for (let i = 0; i < v.length; i++) s += v[i] * v[i]
	return Math.sqrt(s)
}

function matchesFilter(
	metadata: Record<string, unknown>,
	filter: Record<string, unknown>
): boolean {
	for (const [k, v] of Object.entries(filter)) {
		if (v === undefined) continue
		if (metadata[k] !== v) return false
	}
	return true
}

// In-memory D1 fake (also used by D1CosineIndex.test.ts but kept inline so the
// contract suite is self-contained).
class FakeD1 {
	rows: Array<{ id: string; index_name: string; vector: ArrayBuffer; metadata: string }> = []

	prepare(query: string) {
		return new FakeStmt(this, query, [])
	}

	async batch(stmts: FakeStmt[]) {
		for (const s of stmts) await s.run()
		return []
	}
}

class FakeStmt {
	constructor(
		private readonly db: FakeD1,
		private readonly query: string,
		private values: unknown[]
	) {}

	bind(...values: unknown[]) {
		return new FakeStmt(this.db, this.query, values)
	}

	async run() {
		const q = this.query.toLowerCase().trim()
		if (q.startsWith('insert or replace')) {
			const [id, indexName, , vector, metadata] = this.values as [
				string,
				string,
				number,
				ArrayBuffer,
				string,
			]
			const existing = this.db.rows.findIndex((r) => r.id === id)
			const row = { id, index_name: indexName, vector, metadata }
			if (existing >= 0) this.db.rows[existing] = row
			else this.db.rows.push(row)
			return {}
		}
		if (q.startsWith('delete')) {
			const [id] = this.values as [string]
			this.db.rows = this.db.rows.filter((r) => r.id !== id)
			return {}
		}
		throw new Error(`FakeD1: unhandled ${this.query}`)
	}

	async all<T>() {
		const [indexName] = this.values as [string]
		const results = this.db.rows.filter((r) => r.index_name === indexName)
		return { results: results as unknown as T[] }
	}
}

function vec(values: number[]): Float32Array {
	return Float32Array.from(values)
}

interface IndexFactory {
	name: string
	build(): VectorIndex
}

const factories: IndexFactory[] = [
	{
		name: 'D1CosineIndex',
		build: () =>
			new D1CosineIndex(new FakeD1() as unknown as D1Database, {
				name: 'contract',
				dimensions: 3,
			}),
	},
	{
		name: 'VectorizeIndex',
		build: () => {
			const fv = new FakeVectorize()
			return new VectorizeIndex(fv, { name: 'contract', dimensions: 3 })
		},
	},
]

describe.each(factories)('VectorIndex contract: $name', ({ build }) => {
	let index: VectorIndex

	beforeEach(() => {
		index = build()
	})

	const records: VectorRecord[] = [
		{ id: 'a', vector: vec([1, 0, 0]), metadata: { course: 'cs101', kind: 'pdf' } },
		{ id: 'b', vector: vec([0, 1, 0]), metadata: { course: 'cs101', kind: 'md' } },
		{ id: 'c', vector: vec([0, 0, 1]), metadata: { course: 'cs102', kind: 'pdf' } },
	]

	it('returns top-K nearest neighbours by score (descending)', async () => {
		await index.upsert(records)
		const results = await index.query(vec([1, 0.1, 0]), { topK: 2 })
		expect(results).toHaveLength(2)
		expect(results[0].id).toBe('a')
		expect(results[0].score).toBeGreaterThan(results[1].score)
	})

	it('respects metadata filters', async () => {
		await index.upsert(records)
		const results = await index.query(vec([1, 1, 0]), {
			topK: 5,
			filter: { course: 'cs101' },
		})
		expect(results.map((r) => r.id).sort()).toEqual(['a', 'b'])
	})

	it('respects multi-key AND filter', async () => {
		await index.upsert(records)
		const results = await index.query(vec([1, 0, 0]), {
			topK: 5,
			filter: { course: 'cs101', kind: 'pdf' },
		})
		expect(results.map((r) => r.id)).toEqual(['a'])
	})

	it('returns empty array when index is empty', async () => {
		const results = await index.query(vec([1, 0, 0]), { topK: 3 })
		expect(results).toEqual([])
	})

	it('replaces vectors when upserting an existing id', async () => {
		await index.upsert([{ id: 'x', vector: vec([1, 0, 0]) }])
		await index.upsert([{ id: 'x', vector: vec([0, 1, 0]) }])
		const results = await index.query(vec([0, 1, 0]), { topK: 1 })
		expect(results[0].id).toBe('x')
		expect(results[0].score).toBeCloseTo(1, 4)
	})

	it('deletes by metadata filter', async () => {
		await index.upsert(records)
		const { deleted } = await index.deleteByFilter({ course: 'cs101' })
		expect(deleted).toBe(2)
		const remaining = await index.query(vec([1, 0, 0]), { topK: 5 })
		expect(remaining.map((r) => r.id)).toEqual(['c'])
	})

	it('rejects vectors with the wrong dimensionality', async () => {
		await expect(index.upsert([{ id: 'bad', vector: vec([1, 0]) }])).rejects.toThrow(/dimension/)
		await expect(index.query(vec([1, 0]), { topK: 1 })).rejects.toThrow(/dimension/)
	})
})
