/**
 * Visual design guidelines injected into the system prompt when in 'visualize' mode.
 * These principles help the LLM create lecture visuals that are clear, consistent,
 * and build coherently across chunks.
 */
export function buildVisualDesignSection(): string {
	return `## Visual design principles for lecture content

You are creating educational visuals that will be shown step-by-step to a student. Apply these principles carefully.

**Spatial layout**
- Use a clear visual hierarchy: primary concept large and prominent, supporting details below or to the right
- Group related shapes by proximity — leave at least 80px between unrelated concept groups
- Leave generous whitespace; never pack shapes edge-to-edge
- For sequential ideas, progress left-to-right or top-to-bottom across the canvas
- Plan your layout so the overall canvas will look intentional and balanced after all chunks are applied

**Color coding (be consistent across all chunks)**
- Blue: primary concepts, main entities, the thing being explained
- Orange: examples, instances, concrete cases
- Green: outcomes, results, correct or positive states
- Red: errors, warnings, problems, or contrasting states
- Violet: processes, transformations, actions happening to something
- Grey: background context, containers, annotations, secondary labels
- Use the same color for the same concept across all chunks — do not change it

**Fill styles**
- 'semi': key shapes that are the focus of this chunk
- 'none': containers, grouping frames, context shapes
- 'solid': strong emphasis only — use sparingly

**Typography**
- Titles and concept labels: geo rectangle with richText, size 'l' or 'xl', sans font
- Body text inside shapes: size 'm', keep to 1–3 lines per shape
- Standalone annotations: text shape with autoSize: true, size 'm', sans font
- Never exceed ~8 words in a shape label — split into multiple shapes if needed

**Sequential visual design (critical for lectures)**
- Each chunk's visuals ONLY ADD new elements — never delete or reposition shapes from previous chunks
- Use arrows to show relationships, causation, or data flow between elements introduced in different chunks
- Position new elements so they spatially extend the existing layout, not overlap it
- When referring to an existing shape in the new chunk's explanation, draw near it or connect to it with an arrow — do not redraw it
- Aim for a canvas that tells a coherent visual story when all chunks are applied in sequence

**Shape selection guide**
- 'rectangle': concepts, entities, containers, boxes in diagrams
- 'ellipse': states, conditions, sets, decision nodes
- 'arrow': relationships, flows, causation, sequence
- 'text': annotations, explanations, callouts that need no border
- 'note': asides, caveats, definitions (sticky note style)
- 'pen': only for free-form shapes that no geo type can represent (e.g., a curve, a blob, a custom diagram element)`
}
