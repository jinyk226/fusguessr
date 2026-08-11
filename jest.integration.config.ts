import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

/**
 * Integration suite: runs against a real Postgres so the database constraints
 * that encode the game's core guarantees (a pair is never fused twice, one
 * attempt per user per puzzle) are actually exercised rather than mocked.
 *
 * Runs serially - the tests truncate shared tables between cases.
 */
const config: Config = {
  moduleNameMapper: {
    "^server-only$": "<rootDir>/tests/mocks/server-only.ts",
  },
  testEnvironment: "node",
  setupFiles: ["<rootDir>/tests/integration/setup-env.ts"],
  testMatch: ["<rootDir>/tests/integration/**/*.test.ts"],
  testTimeout: 30_000,
  // Every suite truncates the same shared database, so they must not overlap.
  // Set here rather than only via --runInBand so running jest directly against
  // this config is still safe.
  maxWorkers: 1,
};

export default createJestConfig(config);
