import { DesignSkillsPart } from '../../shared/schema/PromptPartDefinitions'
import { AgentRequest } from '../../shared/types/AgentRequest'
import { DESIGN_SKILLS } from '../skills'
import { resolveDesignSkills } from '../skills/resolveDesignSkills'
import { PromptPartUtil, registerPromptPartUtil } from './PromptPartUtil'

export const DesignSkillsPartUtil = registerPromptPartUtil(
	class DesignSkillsPartUtil extends PromptPartUtil<DesignSkillsPart> {
		static override type = 'designSkills' as const

		override getPart(request: AgentRequest): DesignSkillsPart {
			const result = resolveDesignSkills(request.agentMessages.join('\n'), DESIGN_SKILLS)

			return {
				type: 'designSkills',
				skills: result.selectedSkills.map((skill) => ({
					id: skill.id,
					title: skill.title,
					description: skill.description,
					content: skill.content,
					score: skill.score,
					matchedTriggers: skill.matchedTriggers,
					alwaysIncluded: skill.alwaysIncluded,
				})),
				rationale: result.rationale,
			}
		}
	}
)
