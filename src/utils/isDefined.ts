export const isDefined = <T>(item?: T | null): item is T =>
  typeof item !== "undefined" && item !== null;
