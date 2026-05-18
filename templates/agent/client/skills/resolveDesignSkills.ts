import { DesignSkill, SkillResolverResult } from './types'

export interface ResolveDesignSkillsOptions {
	maxSkills?: number
}

const DEFAULT_MAX_SKILLS = 4

export function resolveDesignSkills(
	message: string,
	skills: DesignSkill[],
	options: ResolveDesignSkillsOptions = {}
): SkillResolverResult {
	const maxSkills = options.maxSkills ?? DEFAULT_MAX_SKILLS
	const normalizedMessage = normalize(message)

	const scoredSkills = skills.map((skill) => {
		const matchedTriggers = skill.triggers.filter((trigger) =>
			normalizedMessage.includes(normalize(trigger))
		)
		const score = matchedTriggers.length * 100 + skill.priority
		return {
			...skill,
			score,
			matchedTriggers,
			alwaysIncluded: skill.alwaysInclude,
		}
	})

	const selectedSkills = scoredSkills
		.filter((skill) => skill.alwaysIncluded || skill.matchedTriggers.length > 0)
		.sort((a, b) => {
			if (a.alwaysIncluded !== b.alwaysIncluded) return a.alwaysIncluded ? -1 : 1
			if (b.score !== a.score) return b.score - a.score
			return a.title.localeCompare(b.title)
		})
		.slice(0, maxSkills)

	return {
		selectedSkills,
		rationale: selectedSkills.map((skill) => {
			if (skill.alwaysIncluded && skill.matchedTriggers.length === 0) {
				return `${skill.id}: always included`
			}
			return `${skill.id}: matched ${skill.matchedTriggers.join(', ')}`
		}),
	}
}

function normalize(value: string): string {
	return value.toLowerCase().replace(/\s+/g, ' ').trim()
}
