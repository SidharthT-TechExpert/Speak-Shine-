import { describe, it, expect } from "vitest";
import { formatGroupJid } from "./whatsappService.js";

describe("formatGroupJid", () => {
  it("returns empty string when jid is falsy", () => {
    expect(formatGroupJid("")).toBe("");
    expect(formatGroupJid(null)).toBe("");
    expect(formatGroupJid(undefined)).toBe("");
  });

  it("appends @g.us if only numeric group ID is provided", () => {
    expect(formatGroupJid("120363123456789012")).toBe("120363123456789012@g.us");
    expect(formatGroupJid("  120363123456789012  ")).toBe("120363123456789012@g.us");
  });

  it("keeps full group JID intact if it already ends with @g.us", () => {
    expect(formatGroupJid("120363123456789012@g.us")).toBe("120363123456789012@g.us");
    expect(formatGroupJid(" 120363123456789012@g.us ")).toBe("120363123456789012@g.us");
  });

  it("keeps user JID intact if it ends with @s.whatsapp.net", () => {
    expect(formatGroupJid("919876543210@s.whatsapp.net")).toBe("919876543210@s.whatsapp.net");
  });
});
