import { FormEventHandler, useCallback, useRef, useState } from 'react'
import { useValue } from 'tldraw'
import { useAgent } from '../agent/TldrawAgentAppProvider'
import { saveLectureSequenceToFile } from '../utils/lectureFilePersistence'
import { ChatHistory } from './chat-history/ChatHistory'
import { ChatInput } from './ChatInput'
import { LectureTab } from './lecture/LectureTab'
import { TodoList } from './TodoList'

type PanelTab = 'chat' | 'lecture'

export function ChatPanel() {
	const agent = useAgent()
	const chatInputRef = useRef<HTMLTextAreaElement>(null)
	const lectureInputRef = useRef<HTMLTextAreaElement>(null)
	const [activeTab, setActiveTab] = useState<PanelTab>('chat')
	// Track the prompt used to generate the current lecture (for export metadata)
	const [lecturePrompt, setLecturePrompt] = useState('')

	const hasLecture = useValue('hasLecture', () => agent.lecture.hasLecture(), [agent])

	// Chat tab: sends a message to the agent
	const handleChatSubmit = useCallback<FormEventHandler<HTMLFormElement>>(
		async (e) => {
			e.preventDefault()
			if (!chatInputRef.current) return
			const formData = new FormData(e.currentTarget)
			const value = formData.get('input') as string

			if (value === '') {
				agent.cancel()
				return
			}

			chatInputRef.current.value = ''

			agent.interrupt({
				input: {
					agentMessages: [value],
					bounds: agent.editor.getViewportPageBounds(),
					source: 'user',
					contextItems: agent.context.getItems(),
				},
			})
		},
		[agent]
	)

	// Lecture tab: generates a lecture from the typed topic
	const handleLectureSubmit = useCallback<FormEventHandler<HTMLFormElement>>(
		async (e) => {
			e.preventDefault()
			const formData = new FormData(e.currentTarget)
			const value = (formData.get('input') as string).trim()
			if (!value) return

			setLecturePrompt(value)

			try {
				await agent.generateLecture(value)
				// Auto-save after generation
				const file = agent.lecture.exportToFile(value, agent.modelName.getModelName())
				await saveLectureSequenceToFile(file)
			} catch (err) {
				console.error('Lecture generation failed:', err)
			}
		},
		[agent]
	)

	const handleNewChat = useCallback(() => {
		agent.reset()
	}, [agent])

	return (
		<div className="chat-panel tl-theme__dark">
			<div className="chat-header">
				<div className="chat-tabs">
					<button
						className={`chat-tab-btn ${activeTab === 'chat' ? 'active' : ''}`}
						onClick={() => setActiveTab('chat')}
					>
						Chat
					</button>
					<button
						className={`chat-tab-btn ${activeTab === 'lecture' ? 'active' : ''} ${hasLecture ? 'has-content' : ''}`}
						onClick={() => setActiveTab('lecture')}
					>
						Lecture
					</button>
				</div>
				<div className="chat-header-actions">
					<button className="new-chat-button" onClick={handleNewChat} title="New chat">
						+
					</button>
				</div>
			</div>

			{activeTab === 'chat' ? (
				<>
					<ChatHistory agent={agent} />
					<div className="chat-input-container">
						<TodoList agent={agent} />
						<ChatInput handleSubmit={handleChatSubmit} inputRef={chatInputRef} />
					</div>
				</>
			) : (
				<>
					<LectureTab agent={agent} lecturePrompt={lecturePrompt} />
					<div className="chat-input-container">
						<ChatInput
							handleSubmit={handleLectureSubmit}
							inputRef={lectureInputRef}
							placeholder="What should the lecture explain?"
						/>
					</div>
				</>
			)}
		</div>
	)
}
