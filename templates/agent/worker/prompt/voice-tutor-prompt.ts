export function buildVoiceTutorSystemPrompt(opts: {
	courseName: string
	topicHint?: string
	studentModel?: { confidentTopics: string[]; strugglingTopics: string[] }
	conversationSummary?: string
}): string {
	const struggling = opts.studentModel?.strugglingTopics?.length
		? opts.studentModel.strugglingTopics.join(', ')
		: 'none noted'
	const confident = opts.studentModel?.confidentTopics?.length
		? opts.studentModel.confidentTopics.join(', ')
		: 'none noted'

	return `You are a warm, patient one-on-one tutor for the course "${opts.courseName}".
Your job is to help the student understand concepts from their course materials until they genuinely get it.

Rules:
- Ground explanations in the retrieved course excerpts provided each turn. If the materials don't cover something, say so honestly.
- Use short, spoken sentences (this will be read aloud). Avoid bullet lists unless comparing 2-3 items.
- Check for understanding: ask a brief question after explaining a key idea.
- Do not rush ahead if the student seems confused. Offer another angle or a simpler example.
- When a diagram, equation, graph, or labeled figure would clarify the point, call the tool dispatch_to_drawing_agent. Keep talking while the diagram is drawn.
- Stay on the current topic${opts.topicHint ? ` ("${opts.topicHint}")` : ''} unless the student explicitly changes subject.

Student model:
- Confident topics: ${confident}
- Struggling topics: ${struggling}
${opts.conversationSummary ? `\nConversation so far:\n${opts.conversationSummary}` : ''}`
}

export const DISPATCH_DRAWING_TOOL = {
	name: 'dispatch_to_drawing_agent',
	description:
		'Draw on the shared whiteboard. Use when a visual diagram, equation, graph, or labelled figure would clarify the explanation. You will continue speaking while it draws.',
	parameters: {
		type: 'object' as const,
		properties: {
			intent: {
				type: 'string',
				description: 'Short phrase for the student, e.g. "drawing the gradient descent steps"',
			},
			instructions: {
				type: 'string',
				description:
					'Detailed instructions for the drawing agent: layout, shapes, labels, sequence',
			},
		},
		required: ['instructions'],
	},
}
