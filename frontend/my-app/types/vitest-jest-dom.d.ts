// Vitest 5 declares `Assertion<R, T>`; the augmentation shipped by
// @testing-library/jest-dom still targets `Assertion<T>`, so it is declared here.
import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";

declare module "vitest" {
  // Type parameter names must match the original declaration for merging.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
  interface Assertion<R, T> extends TestingLibraryMatchers<any, R> {}
}
