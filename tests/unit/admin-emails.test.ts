import { isAdminEmail, parseAdminEmails } from "@/lib/auth/admin-emails";

describe("parseAdminEmails", () => {
  it("splits, trims and lowercases", () => {
    expect(parseAdminEmails(" Alice@Example.com , bob@example.com ")).toEqual([
      "alice@example.com",
      "bob@example.com",
    ]);
  });

  it("returns nothing for an unset or empty value", () => {
    expect(parseAdminEmails(undefined)).toEqual([]);
    expect(parseAdminEmails("")).toEqual([]);
    expect(parseAdminEmails("  ,  , ")).toEqual([]);
  });
});

describe("isAdminEmail", () => {
  const allowlist = "owner@example.com,second@example.com";

  it("matches regardless of case or padding", () => {
    expect(isAdminEmail("owner@example.com", allowlist)).toBe(true);
    expect(isAdminEmail("  OWNER@Example.COM  ", allowlist)).toBe(true);
  });

  it("rejects an address that is not listed", () => {
    expect(isAdminEmail("someone@example.com", allowlist)).toBe(false);
  });

  it("rejects a missing address", () => {
    expect(isAdminEmail(null, allowlist)).toBe(false);
    expect(isAdminEmail(undefined, allowlist)).toBe(false);
    expect(isAdminEmail("", allowlist)).toBe(false);
  });

  it("grants nobody admin when the allowlist is unset", () => {
    // Fail closed: a missing env var must not mean "everyone is an admin".
    expect(isAdminEmail("owner@example.com", undefined)).toBe(false);
    expect(isAdminEmail("owner@example.com", "")).toBe(false);
  });

  it("does not match on a substring", () => {
    expect(isAdminEmail("owner@example.com.attacker.test", allowlist)).toBe(
      false,
    );
    expect(isAdminEmail("notowner@example.com", allowlist)).toBe(false);
  });
});
