import {
	Float32Embedding,
	VectorIndex,
	VectorMatch,
	VectorQueryFilter,
	VectorRecord,
} from '../types'

/**
 * Wraps the Cloudflare Vectorize binding. Vectorize natively supports metadata
 * filters, so we forward `filter` directly. Behavior is intentionally
 * indistinguishable from `D1CosineIndex` from the consumer's perspective.
 *
 * Note: Vectorize requires the index to be created with the matching number
 * of dimensions and metric (cosine recommended). See Phase 7 cutover steps
 * for `wrangler vectorize create`.
 */

interface VectorizeMatchesResult {
	matches: Array<{
		id: string
		score: number
		metadata?: Record<string, unknown>
	}>
}

interface VectorizeBinding {
	upsert(
		records: Array<{ id: string; values: number[]; metadata?: Record<string, unknown> }>
	): Promise<unknown>
	query(
		vector: number[],
		opts: {
			topK: number
			returnMetadata?: 'all' | 'none' | boolean
			filter?: Record<string, unknown>
		}
	): Promise<VectorizeMatchesResult>
	deleteByIds(ids: string[]): Promise<unknown>
	getByIds?(ids: string[]): Promise<Array<{ id: string; metadata?: Record<string, unknown> }>>
}

export class VectorizeIndex implements VectorIndex {
	readonly name: string
	readonly dimensions: number

	constructor(
		private readonly index: VectorizeBinding,
		opts: { name: string; dimensions: number }
	) {
		this.name = opts.name
		this.dimensions = opts.dimensions
	}

	async upsert(records: VectorRecord[]): Promise<void> {
		if (records.length === 0) return
		await this.index.upsert(
			records.map((r) => {
				if (r.vector.length !== this.dimensions) {
					throw new Error(
						`VectorizeIndex.upsert: vector dimension ${r.vector.length} != index dimension ${this.dimensions}`
					)
				}
				return {
					id: r.id,
					values: Array.from(r.vector),
					metadata: r.metadata,
				}
			})
		)
	}

	async query(
		vector: Float32Embedding,
		options: { topK: number; filter?: VectorQueryFilter }
	): Promise<VectorMatch[]> {
		if (vector.length !== this.dimensions) {
			throw new Error(
				`VectorizeIndex.query: vector dimension ${vector.length} != index dimension ${this.dimensions}`
			)
		}
		const result = await this.index.query(Array.from(vector), {
			topK: options.topK,
			returnMetadata: 'all',
			filter: options.filter as Record<string, unknown> | undefined,
		})
		return result.matches.map((m) => ({
			id: m.id,
			score: m.score,
			metadata: m.metadata,
		}))
	}

	async deleteByFilter(filter: VectorQueryFilter): Promise<{ deleted: number }> {
		// Vectorize does not currently support delete-by-filter; emulate by
		// fetching all candidates within the filter (top-K with K=10000) then
		// deleting by ids. For Phase 7, callers should also keep a chunk-id
		// mirror in D1 so we can delete by document_id without a query.
		const dummy = new Float32Array(this.dimensions)
		const result = await this.index.query(Array.from(dummy), {
			topK: 10000,
			returnMetadata: 'all',
			filter: filter as Record<string, unknown>,
		})
		const ids = result.matches.map((m) => m.id)
		if (ids.length === 0) return { deleted: 0 }
		await this.index.deleteByIds(ids)
		return { deleted: ids.length }
	}
}
