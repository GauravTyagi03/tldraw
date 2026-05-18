import { describe, expect, it } from 'vitest'
import { resolveDesignSkills } from './resolveDesignSkills'
import { DesignSkill } from './types'

const skills: DesignSkill[] = [
	{
		id: 'core',
		title: 'Core',
		description: 'Always on',
		triggers: [],
		priority: 100,
		alwaysInclude: true,
		content: 'core',
	},
	{
		id: 'layout',
		title: 'Layout',
		description: 'Layout',
		triggers: ['organize', 'layout'],
		priority: 80,
		alwaysInclude: false,
		content: 'layout',
	},
	{
		id: 'readability',
		title: 'Readability',
		description: 'Readability',
		triggers: ['readable', 'text'],
		priority: 70,
		alwaysInclude: false,
		content: 'readability',
	},
	{
		id: 'flow',
		title: 'Flow',
		description: 'Flow',
		triggers: ['flow', 'arrow'],
		priority: 60,
		alwaysInclude: false,
		content: 'flow',
	},
]

describe('resolveDesignSkills', () => {
	it('always includes foundational skills', () => {
		const result = resolveDesignSkills('draw a cat', skills)
		expect(result.selectedSkills.map((skill) => skill.id)).toEqual(['core'])
	})

	it('selects matching skills from prompt text', () => {
		const result = resolveDesignSkills('organize this layout and make text readable', skills)
		expect(result.selectedSkills.map((skill) => skill.id)).toEqual([
			'core',
			'layout',
			'readability',
		])
	})

	it('caps selected skills', () => {
		const result = resolveDesignSkills('organize layout readable text flow arrow', skills, {
			maxSkills: 3,
		})
		expect(result.selectedSkills.map((skill) => skill.id)).toEqual([
			'core',
			'layout',
			'readability',
		])
	})

	it('selects connector guidance for arrow feedback', () => {
		const result = resolveDesignSkills('the arrows are intersecting text', skills)
		expect(result.selectedSkills.map((skill) => skill.id)).toEqual(['core', 'readability', 'flow'])
	})
})
