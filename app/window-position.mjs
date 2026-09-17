/** Clamp a translated window within its containing stage. Oversized windows stay centered. */
export function clampWindowPosition(position, frame, stage) {
  const axis = (value, start, end, size) => size > end - start ? (start + end - size) / 2 : Math.min(end - size, Math.max(start, value));
  return {
    x: axis(position.x, stage.left - frame.left, stage.right - frame.left, frame.width),
    y: axis(position.y, stage.top - frame.top, stage.bottom - frame.top, frame.height),
  };
}
