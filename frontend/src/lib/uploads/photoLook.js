const DARK_BELOW = 55;
// Judged on the strongest 1% of edges, not the mean: interiors are mostly plain wall, so a mean
// flags sharp rooms, while a blurred photo has softened even its door frames and furniture edges.
const BLURRY_BELOW = 28;
const EDGE_PERCENTILE = 0.99;

/** A soft hint for the owner, never a refusal: a night shot can read as dark. */
export function photoLook(rgba, width) {
  const pixels = rgba.length / 4;
  if (!pixels || !width) return null;
  const edges = new Uint32Array(256);
  let brightness = 0;
  let previous = 0;
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const index = pixel * 4;
    const grey = (rgba[index] + rgba[index + 1] + rgba[index + 2]) / 3;
    brightness += grey;
    if (pixel % width) edges[Math.round(Math.abs(grey - previous))] += 1;
    previous = grey;
  }
  if (brightness / pixels < DARK_BELOW) return 'dark';
  const total = pixels - pixels / width;
  let below = 0;
  let strong = 0;
  while (strong < 255 && below + edges[strong] <= total * EDGE_PERCENTILE) below += edges[strong++];
  return strong < BLURRY_BELOW ? 'blurry' : null;
}
