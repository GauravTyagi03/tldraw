import { CurrentChunkPart } from '../../shared/schema/PromptPartDefinitions'
import { AgentRequest } from '../../shared/types/AgentRequest'
import { AgentHelpers } from '../AgentHelpers'
import { PromptPartUtil, registerPromptPartUtil } from './PromptPartUtil'

/**
 * Provides context about the current lecture chunk being visualized.
 * Active only in 'visualize' mode during Phase 2 of lecture generation.
 *
 * Tells the LLM:
 * - Which chunk number this is
 * - The chunk's explanation text and visual intent
 * - What the previous chunks covered (for narrative continuity)
 */
export const CurrentChunkPartUtil = registerPromptPartUtil(
	class CurrentChunkPartUtil extends PromptPartUtil<CurrentChunkPart> {
		static override type = 'current-chunk' as const

		override getPart(_request: AgentRequest, _helpers: AgentHelpers): CurrentChunkPart {
			const { lecture } = this.agent
			const chunks = lecture.getChunks()
			const currentIndex = lecture.getCurrentVisualizingIndex()
			const chunk = chunks[currentIndex]

			// Build context from all prior chunks for narrative continuity
			const previousChunksContext = chunks
				.slice(0, currentIndex)
				.map((c, i) => `Chunk ${i + 1} ("${c.title}"): ${c.text}`)
				.join('\n\n')

			return {
				type: 'current-chunk',
				chunkIndex: currentIndex,
				totalChunks: chunks.length,
				title: chunk?.title ?? '',
				text: chunk?.text ?? '',
				intent: chunk?.intent ?? '',
				previousChunksContext,
			}
		}
	}
)
