import { describe, expect, it } from "vitest";
import { seedDatabase } from "../data/seed";
import { decryptEnvelope, encryptDb, isEnvelope } from "./team";

describe("team file", () => {
  it("round-trips with the right password and hides the data", async () => {
    const db = seedDatabase();
    db.settings.companyName = "Test Co";
    const env = await encryptDb(db, "correct horse");
    expect(isEnvelope(env)).toBe(true);
    expect(JSON.stringify(env)).not.toContain("Lakeside");
    const back = await decryptEnvelope(env, "correct horse");
    expect(back.settings.companyName).toBe("Test Co");
    expect(back.properties).toEqual(db.properties);
  });

  it("rejects a wrong password", async () => {
    const env = await encryptDb(seedDatabase(), "correct horse");
    await expect(decryptEnvelope(env, "wrong")).rejects.toThrow("Wrong team password.");
  });
});
