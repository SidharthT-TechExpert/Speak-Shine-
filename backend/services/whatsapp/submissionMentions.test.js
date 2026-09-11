import { describe, it, expect } from "vitest";
import { getUserMentionInfo, buildSubmissionReportMessage } from "./whatsappService.js";

describe("getUserMentionInfo", () => {
  it("normalizes 10-digit Indian phone number to 91 prefix", () => {
    const user = { name: "Muhammed Sinan", phone: "9061181938" };
    const { mentionTag, jids } = getUserMentionInfo(user);

    expect(mentionTag).toBe("919061181938");
    expect(jids).toContain("919061181938@s.whatsapp.net");
  });

  it("handles phone with +91 or existing 91 prefix", () => {
    const user = { name: "Abdul Fathah", phone: "+918848096746" };
    const { mentionTag, jids } = getUserMentionInfo(user);

    expect(mentionTag).toBe("918848096746");
    expect(jids).toContain("918848096746@s.whatsapp.net");
  });

  it("includes both phone JID and companion LID in jids array", () => {
    const user = {
      name: "Muhammed Sinan",
      phone: "9061181938",
      userId: "255030997299299@s.whatsapp.net",
    };
    const { mentionTag, jids } = getUserMentionInfo(user);

    // Visible tag prefers the clean 91 phone number
    expect(mentionTag).toBe("919061181938");
    // JIDs array contains both for maximum delivery and tag matching
    expect(jids).toContain("919061181938@s.whatsapp.net");
    expect(jids).toContain("255030997299299@s.whatsapp.net");
  });

  it("handles user with only userId JID and no phone", () => {
    const user = {
      name: "WhatsApp User",
      userId: "255030997299299@s.whatsapp.net",
    };
    const { mentionTag, jids } = getUserMentionInfo(user);

    expect(mentionTag).toBe("255030997299299");
    expect(jids).toContain("255030997299299@s.whatsapp.net");
  });
});

describe("buildSubmissionReportMessage with mentions", () => {
  it("formats pending students with @mention and display name", () => {
    const paidUsers = [
      { name: "Abdul Fathah", phone: "918848096746", completed: true, todayScore: 85 },
      { name: "Muhammed Sinan", phone: "9061181938", userId: "255030997299299@s.whatsapp.net", completed: false },
      { name: "Muhammed Nabhan", phone: "919061181938", completed: false },
    ];
    const submittedUsers = paidUsers.filter(u => u.completed);
    const pendingUsers = paidUsers.filter(u => !u.completed);

    const message = buildSubmissionReportMessage({
      paidUsers,
      submittedUsers,
      pendingUsers,
      templateType: "comprehensive",
    });

    // Check that pending list contains @mention and name
    expect(message).toContain("@919061181938 (Muhammed Sinan)");
    expect(message).toContain("@919061181938 (Muhammed Nabhan)");
    expect(message).toContain("✅ *SUBMITTED TODAY (1/3)*");
    expect(message).toContain("⏳ *PENDING SUBMISSIONS (2/3)*");
  });
});
