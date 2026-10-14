const DARK_BELOW = 55;
const BLURRY_BELOW = 4;

/** A soft hint for the owner, never a refusal: a plain wall can read as blurry, a night shot as dark. */
export function photoLook(rgba, width) {
  const pixels = rgba.length / 4;
  if (!pixels || !width) return null;
  let brightness = 0;
  let sharpness = 0;
  let previous = 0;
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const index = pixel * 4;
    const grey = (rgba[index] + rgba[index + 1] + rgba[index + 2]) / 3;
    brightness += grey;
    if (pixel % width) sharpness += Math.abs(grey - previous);
    previous = grey;
  }
  if (brightness / pixels < DARK_BELOW) return 'dark';
  return sharpness / pixels < BLURRY_BELOW ? 'blurry' : null;
}
