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
  testEnvironment: "node",
  setupFiles: ["<rootDir>/tests/integration/setup-env.ts"],
  testMatch: ["<rootDir>/tests/integration/**/*.test.ts"],
  testTimeout: 30_000,
};

export default createJestConfig(config);
