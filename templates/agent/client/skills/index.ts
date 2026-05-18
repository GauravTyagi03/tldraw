import colorSemantics from './color-semantics.md?raw'
import connectorsFlow from './connectors-flow.md?raw'
import feedbackOverrides from './feedback-overrides.md?raw'
import layoutComposition from './layout-composition.md?raw'
import { parseSkillMarkdown } from './parseSkillMarkdown'
import reviewRefinement from './review-refinement.md?raw'
import textReadability from './text-readability.md?raw'
import { DesignSkill } from './types'
import visualHierarchy from './visual-hierarchy.md?raw'
import whiteboardCore from './whiteboard-core.md?raw'

export const DESIGN_SKILLS: DesignSkill[] = [
	whiteboardCore,
	feedbackOverrides,
	layoutComposition,
	visualHierarchy,
	textReadability,
	connectorsFlow,
	colorSemantics,
	reviewRefinement,
].map(parseSkillMarkdown)

assertUniqueSkillIds(DESIGN_SKILLS)

function assertUniqueSkillIds(skills: DesignSkill[]) {
	const ids = new Set<string>()
	for (const skill of skills) {
		if (ids.has(skill.id)) {
			throw new Error(`Duplicate design skill id: ${skill.id}`)
		}
		ids.add(skill.id)
	}
}
