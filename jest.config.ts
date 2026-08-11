import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

/**
 * Unit suite: pure logic and components only. No database, no network.
 * Deliberately fast enough to run on every save - the DB-backed suite lives in
 * jest.integration.config.ts and runs separately.
 */
const config: Config = {
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testMatch: ["<rootDir>/tests/unit/**/*.test.ts", "<rootDir>/tests/unit/**/*.test.tsx"],
  collectCoverageFrom: ["lib/**/*.ts", "!lib/**/*.d.ts"],
};

export default createJestConfig(config);
