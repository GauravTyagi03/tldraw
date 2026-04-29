import { LectureChunkAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

/**
 * Handles the 'lecture-chunk' action, which is emitted during Phase 1 (outline generation).
 * Each completed action registers a new chunk in AgentLectureManager.
 * This action does NOT modify the canvas.
 */
export const LectureChunkActionUtil = registerActionUtil(
	class LectureChunkActionUtil extends AgentActionUtil<LectureChunkAction> {
		static override type = 'lecture-chunk' as const

		/** Outline actions don't belong in the regular chat history */
		override savesToHistory(): boolean {
			return false
		}

		override applyAction(action: Streaming<LectureChunkAction>, _helpers: AgentHelpers): void {
			// Wait for the full action before registering — partial data isn't useful here
			if (!action.complete) return

			this.agent.lecture.addOutlineChunk({
				title: action.title,
				text: action.text,
				intent: action.intent,
			})
		}

		override getInfo(action: Streaming<LectureChunkAction>) {
			return {
				description: action.complete
					? `Outline chunk: "${action.title}"`
					: 'Planning lecture chunk…',
			}
		}
	}
)
