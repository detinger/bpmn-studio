/** Fit the diagram into the viewport, leaving room for the palette on the left. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fitWithPalette(diagram: any, paletteWidth = 70) {
  const canvas = diagram.get('canvas');
  canvas.zoom('fit-viewport', 'auto');
  const vb = canvas.viewbox();
  if (!vb || !Number.isFinite(vb.scale) || vb.scale <= 0) return;
  const scale = Math.min(vb.scale, 1);
  const outer = vb.outer;
  const inner = vb.inner;
  const availW = outer.width - paletteWidth - 40;
  const availH = outer.height - 40;
  const s = Math.min(1, availW / inner.width, availH / inner.height, scale * 1.0);
  const width = outer.width / s;
  const height = outer.height / s;
  const x = inner.x - (paletteWidth + 20) / s - (availW / s - inner.width) / 2;
  const y = inner.y - (height - inner.height) / 2;
  canvas.viewbox({ x, y, width, height });
}
