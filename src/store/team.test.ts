import { describe, expect, it } from "vitest";
import { seedDatabase } from "../data/seed";
import { buildTeamFile, decryptTeamDb, isTeamFile, login, makeUser, newDataKey, resume } from "./team";

async function sample() {
  const key = newDataKey();
  const db = seedDatabase();
  db.settings.companyName = "Test Co";
  const users = [
    await makeUser(key, { id: "Admin", name: "Owner", role: "admin" }, "owner-pass-1"),
    await makeUser(key, { id: "staff1", name: "Staff One", role: "staff" }, "staff-pass-1"),
  ];
  return { db, file: await buildTeamFile(db, key, users) };
}

describe("team file", () => {
  it("each login unlocks the same database; the file itself is unreadable", async () => {
    const { db, file } = await sample();
    expect(isTeamFile(file)).toBe(true);
    expect(JSON.stringify(file)).not.toContain("Lakeside");
    for (const [id, pw, role] of [["admin", "owner-pass-1", "admin"], ["STAFF1 ", "staff-pass-1", "staff"]] as const) {
      const { session } = await login(file, id, pw);
      expect(session.user.role).toBe(role);
      const back = await decryptTeamDb(file, session.dataKey);
      expect(back.settings.companyName).toBe("Test Co");
      expect(back.properties).toEqual(db.properties);
    }
  });

  it("rejects wrong passwords and unknown users", async () => {
    const { file } = await sample();
    await expect(login(file, "staff1", "owner-pass-1")).rejects.toThrow("Wrong ID or password.");
    await expect(login(file, "nobody", "x")).rejects.toThrow("Wrong ID or password.");
  });

  it("a saved login stops working once the user is removed", async () => {
    const { file } = await sample();
    const { kek } = await login(file, "staff1", "staff-pass-1");
    const saved = { id: "staff1", kek: btoa(String.fromCharCode(...kek)) };
    expect(await resume(file, saved)).toBeDefined();
    const without = { ...file, users: file.users.filter((u) => u.id !== "staff1") };
    expect(await resume(without, saved)).toBeUndefined();
  });
});
