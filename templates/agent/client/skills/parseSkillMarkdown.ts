import { DesignSkill, DesignSkillMetadata } from './types'

const DEFAULT_METADATA: Omit<DesignSkillMetadata, 'id' | 'title' | 'description'> = {
	triggers: [],
	priority: 0,
	alwaysInclude: false,
}

export function parseSkillMarkdown(markdown: string): DesignSkill {
	const match = markdown.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
	if (!match) {
		throw new Error('Design skill markdown must start with frontmatter.')
	}

	const metadata = parseFrontmatter(match[1])
	const content = match[2].trim()

	if (!metadata.id) throw new Error('Design skill is missing id.')
	if (!metadata.title) throw new Error(`Design skill ${metadata.id} is missing title.`)
	if (!metadata.description) throw new Error(`Design skill ${metadata.id} is missing description.`)

	return {
		...DEFAULT_METADATA,
		...metadata,
		id: metadata.id,
		title: metadata.title,
		description: metadata.description,
		content,
	}
}

function parseFrontmatter(source: string): Partial<DesignSkillMetadata> {
	const result: Partial<DesignSkillMetadata> = {}
	const lines = source.split('\n')
	let currentListKey: keyof Pick<DesignSkillMetadata, 'triggers'> | null = null

	for (const rawLine of lines) {
		const line = rawLine.trim()
		if (!line) continue

		if (currentListKey && line.startsWith('- ')) {
			result[currentListKey] = [...(result[currentListKey] ?? []), line.slice(2).trim()]
			continue
		}

		currentListKey = null
		const separatorIndex = line.indexOf(':')
		if (separatorIndex === -1) continue

		const key = line.slice(0, separatorIndex).trim() as keyof DesignSkillMetadata
		const value = line.slice(separatorIndex + 1).trim()

		switch (key) {
			case 'id':
			case 'title':
			case 'description':
				result[key] = value
				break
			case 'priority':
				result.priority = Number(value)
				break
			case 'alwaysInclude':
				result.alwaysInclude = value === 'true'
				break
			case 'triggers':
				result.triggers = []
				currentListKey = 'triggers'
				break
		}
	}

	return result
}
