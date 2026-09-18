export function isValidDirectiveHours(value: unknown): value is number[] {
  if (!Array.isArray(value) || value.length === 0) {
    return false;
  }
  let previous = -1;
  for (const entry of value) {
    const hour = entry as unknown;
    if (
      typeof hour !== 'number' ||
      !Number.isInteger(hour) ||
      hour < 0 ||
      hour > 23
    ) {
      return false;
    }
    if (hour <= previous) {
      return false;
    }
    previous = hour;
  }
  return true;
}
