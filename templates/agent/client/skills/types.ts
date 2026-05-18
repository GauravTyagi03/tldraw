export interface DesignSkillMetadata {
	id: string
	title: string
	description: string
	triggers: string[]
	priority: number
	alwaysInclude: boolean
}

export interface DesignSkill extends DesignSkillMetadata {
	content: string
}

export interface ResolvedDesignSkill extends DesignSkill {
	score: number
	matchedTriggers: string[]
	alwaysIncluded: boolean
}

export interface SkillResolverResult {
	selectedSkills: ResolvedDesignSkill[]
	rationale: string[]
}
