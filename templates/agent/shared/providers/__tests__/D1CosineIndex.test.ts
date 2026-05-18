import { beforeEach, describe, expect, it } from 'vitest'
import { D1CosineIndex } from '../local/D1CosineIndex'

/**
 * Pure-JS test of the D1CosineIndex using an in-memory fake D1 driver. We
 * exercise upsert/query/delete to lock down the cosine math and metadata
 * filter semantics without spinning up Wrangler.
 */

interface FakeRow {
	id: string
	index_name: string
	dimensions: number
	vector: ArrayBuffer
	metadata: string
}

class FakeD1 {
	rows: FakeRow[] = []

	prepare(query: string): FakePreparedStatement {
		return new FakePreparedStatement(this, query, [])
	}

	async batch(stmts: FakePreparedStatement[]): Promise<unknown> {
		for (const s of stmts) await s.run()
		return []
	}
}

class FakePreparedStatement {
	constructor(
		private readonly db: FakeD1,
		private readonly query: string,
		private values: unknown[]
	) {}

	bind(...values: unknown[]): FakePreparedStatement {
		return new FakePreparedStatement(this.db, this.query, values)
	}

	async run(): Promise<unknown> {
		const q = this.query.toLowerCase().trim()
		if (q.startsWith('insert or replace into vector_records')) {
			const [id, indexName, dims, vector, metadata] = this.values as [
				string,
				string,
				number,
				ArrayBuffer,
				string,
			]
			const existing = this.db.rows.findIndex((r) => r.id === id)
			const row: FakeRow = {
				id,
				index_name: indexName,
				dimensions: dims,
				vector,
				metadata,
			}
			if (existing >= 0) this.db.rows[existing] = row
			else this.db.rows.push(row)
			return { meta: { rows_written: 1 } }
		}
		if (q.startsWith('delete from vector_records')) {
			const [id] = this.values as [string]
			this.db.rows = this.db.rows.filter((r) => r.id !== id)
			return { meta: { rows_written: 1 } }
		}
		throw new Error(`FakeD1: unhandled run() for query: ${this.query}`)
	}

	async all<T>(): Promise<{ results: T[] }> {
		const q = this.query.toLowerCase().trim()
		if (q.startsWith('select id, vector, metadata from vector_records')) {
			const [indexName] = this.values as [string]
			const results = this.db.rows.filter((r) => r.index_name === indexName)
			return { results: results as unknown as T[] }
		}
		if (q.startsWith('select id, metadata from vector_records')) {
			const [indexName] = this.values as [string]
			const results = this.db.rows
				.filter((r) => r.index_name === indexName)
				.map((r) => ({ id: r.id, metadata: r.metadata }))
			return { results: results as unknown as T[] }
		}
		throw new Error(`FakeD1: unhandled all() for query: ${this.query}`)
	}
}

function vec(values: number[]): Float32Array {
	return Float32Array.from(values)
}

describe('D1CosineIndex', () => {
	let db: FakeD1
	let index: D1CosineIndex

	beforeEach(() => {
		db = new FakeD1()
		// Cast through unknown — the fake satisfies the structural shape but
		// not the full @cloudflare/workers-types interface.
		index = new D1CosineIndex(db as unknown as D1Database, {
			name: 'test',
			dimensions: 3,
		})
	})

	it('upserts and queries by cosine similarity', async () => {
		await index.upsert([
			{ id: 'a', vector: vec([1, 0, 0]), metadata: { tag: 'red' } },
			{ id: 'b', vector: vec([0, 1, 0]), metadata: { tag: 'blue' } },
			{ id: 'c', vector: vec([0, 0, 1]), metadata: { tag: 'green' } },
		])

		const results = await index.query(vec([1, 0.1, 0]), { topK: 2 })
		expect(results.map((r) => r.id)).toEqual(['a', 'b'])
		expect(results[0].score).toBeGreaterThan(results[1].score)
	})

	it('applies metadata filter', async () => {
		await index.upsert([
			{ id: 'a', vector: vec([1, 0, 0]), metadata: { course: 'cs101' } },
			{ id: 'b', vector: vec([0.9, 0.1, 0]), metadata: { course: 'cs102' } },
			{ id: 'c', vector: vec([0.95, 0.05, 0]), metadata: { course: 'cs101' } },
		])

		const results = await index.query(vec([1, 0, 0]), {
			topK: 5,
			filter: { course: 'cs101' },
		})
		expect(results.map((r) => r.id).sort()).toEqual(['a', 'c'])
	})

	it('replaces existing vectors on upsert', async () => {
		await index.upsert([{ id: 'a', vector: vec([1, 0, 0]) }])
		await index.upsert([{ id: 'a', vector: vec([0, 1, 0]) }])
		const results = await index.query(vec([0, 1, 0]), { topK: 1 })
		expect(results[0].id).toBe('a')
		expect(results[0].score).toBeCloseTo(1, 4)
	})

	it('deletes by filter', async () => {
		await index.upsert([
			{ id: 'a', vector: vec([1, 0, 0]), metadata: { course: 'cs101' } },
			{ id: 'b', vector: vec([0, 1, 0]), metadata: { course: 'cs102' } },
		])

		const { deleted } = await index.deleteByFilter({ course: 'cs101' })
		expect(deleted).toBe(1)

		const remaining = await index.query(vec([1, 0, 0]), { topK: 5 })
		expect(remaining.map((r) => r.id)).toEqual(['b'])
	})

	it('throws on dimension mismatch', async () => {
		await expect(index.upsert([{ id: 'a', vector: vec([1, 0]) }])).rejects.toThrow(/dimension/)
		await expect(index.query(vec([1, 0]), { topK: 1 })).rejects.toThrow(/dimension/)
	})

	it('returns empty when index is empty', async () => {
		const results = await index.query(vec([1, 0, 0]), { topK: 5 })
		expect(results).toEqual([])
	})
})
