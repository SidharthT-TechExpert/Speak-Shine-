import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import VideoReport, { normalizeVocabularyList } from "../../../models/videoReportSchema.js";

describe("VideoReport targetVocabulary & vocabularyUsed normalization (CastError prevention)", () => {
  const sampleExpressionObjects = [
    {
      expression: "From where I stand...",
      word: "From where I stand...",
      meaning: "Expressing personal viewpoint.",
      usage: "When sharing your personal perspective.",
      example: "From where I stand, Arjun's missed bus was a blessing in disguise because it led to a new friendship.",
      _id: new mongoose.Types.ObjectId("6af3da3a8e5641856b02d0cc"),
    },
    {
      expression: "The reason why I say this is...",
      word: "The reason why I say this is...",
      meaning: "Explaining the cause.",
      usage: "When giving justification for a claim.",
      example: "The reason why I say this is that Arjun's backup plan helped him keep his schedule intact.",
      _id: new mongoose.Types.ObjectId("6af3da3a8e5641856b02d0cd"),
    },
    {
      expression: "At the end of the day...",
      word: "At the end of the day...",
      meaning: "Summarizing final thought.",
      usage: "When concluding a discussion or reflection.",
      example: "At the end of the day, Arjun realized backup plans and friendships are inseparable.",
      _id: new mongoose.Types.ObjectId("6af3da3a8e5641856b02d0ce"),
    },
  ];

  it("normalizeVocabularyList extracts clean strings from expression objects, strings, mixed lists, and JSON strings", () => {
    expect(normalizeVocabularyList(sampleExpressionObjects)).toEqual([
      "From where I stand...",
      "The reason why I say this is...",
      "At the end of the day...",
    ]);
    expect(normalizeVocabularyList(["resilient", { word: "serendipity" }, "resilient"])).toEqual([
      "resilient",
      "serendipity",
    ]);
    expect(normalizeVocabularyList('["alpha", "beta"]')).toEqual(["alpha", "beta"]);
    expect(normalizeVocabularyList(null)).toEqual([]);
    expect(normalizeVocabularyList(undefined)).toBeUndefined();
  });

  it("VideoReport document save/validation succeeds without CastError when given expression objects", () => {
    const doc = new VideoReport({
      userId: new mongoose.Types.ObjectId(),
      phone: "9961714368",
      analysis: {
        targetVocabulary: sampleExpressionObjects,
        vocabularyUsed: [sampleExpressionObjects[0]],
      },
    });

    const validationErr = doc.validateSync();
    expect(validationErr).toBeUndefined();
    expect(Array.from(doc.analysis.targetVocabulary)).toEqual([
      "From where I stand...",
      "The reason why I say this is...",
      "At the end of the day...",
    ]);
    expect(Array.from(doc.analysis.vocabularyUsed)).toEqual([
      "From where I stand...",
    ]);
  });

  it("VideoReport findByIdAndUpdate and updateOne do not throw CastError when given expression objects", () => {
    const q1 = VideoReport.findByIdAndUpdate(new mongoose.Types.ObjectId(), {
      status: "completed",
      analysis: {
        targetVocabulary: sampleExpressionObjects,
      },
    });
    const casted1 = q1._castUpdate(q1.getUpdate());
    expect(casted1.$set.analysis.targetVocabulary).toEqual([
      "From where I stand...",
      "The reason why I say this is...",
      "At the end of the day...",
    ]);

    const q2 = VideoReport.updateOne(
      { _id: new mongoose.Types.ObjectId() },
      { $set: { "analysis.targetVocabulary": sampleExpressionObjects } }
    );
    const casted2 = q2._castUpdate(q2.getUpdate());
    expect(casted2.$set["analysis.targetVocabulary"]).toEqual([
      "From where I stand...",
      "The reason why I say this is...",
      "At the end of the day...",
    ]);
  });
});
