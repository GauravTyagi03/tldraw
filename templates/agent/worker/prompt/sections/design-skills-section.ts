import { DesignSkillsPart } from '../../../shared/schema/PromptPartDefinitions'

export function buildDesignSkillsSection(part: DesignSkillsPart | undefined): string {
	if (!part || part.skills.length === 0) return ''

	const sections = part.skills.map((skill) => {
		return `### ${skill.title} (\`${skill.id}\`)

${skill.content}`
	})

	return `## Selected design skills

Apply these project-specific design skills while satisfying the user's request. They guide judgment and planning, but the JSON schema remains the source of truth for available actions.

${sections.join('\n\n')}`
}
