import { isDefined } from "./isDefined";

describe("isDefined", () => {
  it("returns false for undefined", () => {
    expect(isDefined(undefined)).toBe(false);
  });
  it("returns false for null", () => {
    expect(isDefined(null)).toBe(false);
  });
  it("returns true for 0", () => {
    expect(isDefined(0)).toBe(true);
  });
  it("returns true for empty string", () => {
    expect(isDefined("")).toBe(true);
  });
});
