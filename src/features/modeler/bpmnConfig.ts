/**
 * Shared bpmn-js configuration. Default colors are sentinels that the
 * stylesheet (styles/bpmn-theme.css) maps to theme variables.
 */
export const RENDERER_COLORS = {
  defaultFillColor: '#fffffe',
  defaultStrokeColor: '#010101',
  defaultLabelColor: '#010102'
};

export function viewerConfig() {
  return {
    bpmnRenderer: RENDERER_COLORS
  };
}

/**
 * bpmn-js shrinks external labels to exactly their measured text width on
 * import; its line-breaking heuristic then estimates break positions by
 * character proportion and may cut words (“Applicatio-n”). A few pixels of
 * slack avoid that. Must be applied before importing a diagram.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function patchLabelLayout(diagram: any) {
  const textRenderer = diagram.get('textRenderer');
  const original = textRenderer.getExternalLabelBounds.bind(textRenderer);
  textRenderer.getExternalLabelBounds = (bounds: { x: number; y: number; width: number; height: number }, text: string) => {
    const r = original(bounds, text);
    return { ...r, x: r.x - 4, width: r.width + 8 };
  };
}
