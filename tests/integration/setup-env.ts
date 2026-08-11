/**
 * Points the Prisma client at the dedicated test database before any test
 * module (and therefore any PrismaClient) is constructed.
 *
 * The name guard is not paranoia: these tests truncate every table between
 * cases, so a misconfigured DATABASE_URL would silently wipe a development
 * database mid-run.
 */

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:5432/fusguessr_test";

if (!/test/i.test(testDatabaseUrl)) {
  throw new Error(
    `Refusing to run integration tests against "${testDatabaseUrl}": the ` +
      `database name must contain "test".`,
  );
}

process.env.DATABASE_URL = testDatabaseUrl;
process.env.FUSGUESSR_FAKE_IMAGE_PIPELINE = "1";
process.env.ADMIN_EMAILS = "admin@example.com";
