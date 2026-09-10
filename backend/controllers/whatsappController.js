/**
 * backend/controllers/whatsappController.js
 */

import {
  getStatus,
  sendDailyPosterToGroup,
  sendDailySubmissionReportToGroup,
  getSubmissionReportSummary,
  getParticipatingGroups,
  restartWhatsAppBot,
  logoutWhatsAppBot,
  getMonthEndPrizeReportSummary,
  sendMonthEndPrizeReportToGroup,
  saveMonthEndPrizeSettings as savePrizeSettings,
} from "../services/whatsapp/whatsappService.js";
import Status from "../../models/statusSchema.js";

function maskPhoneNumber(phone) {
  if (!phone) return null;
  const p = String(phone).replace(/\D/g, "");
  const country = p.length > 10 ? `+${p.slice(0, p.length - 10)} ` : "+";
  const last4 = p.slice(-4);
  return `${country}••••• ••${last4}`;
}

function maskTargetGroup(jid) {
  if (!jid) return null;
  const [id, domain] = String(jid).split("@");
  if (!domain) return jid;
  const start = id.slice(0, 4);
  const end = id.slice(-4);
  return `${start}••••••••${end}@${domain}`;
}

export async function getWhatsAppStatus(req, res) {
  try {
    const status = getStatus();
    const dbStatus = await Status.findOne()
      .select("todayTopic todayQuestion todayCategory todayContentType todayImageUrl todayAudioUrl isPictureDescriptionDay isStorySummaryDay todayVocabulary todayImageInstructions")
      .lean();

    const submissionSummary = await getSubmissionReportSummary();

    return res.json({
      success: true,
      ...status,
      userPhone: maskPhoneNumber(status.userPhone),
      targetGroup: maskTargetGroup(status.targetGroup),
      submissionSummary,
      todayQuestion: dbStatus ? {
        topic: dbStatus.todayTopic,
        question: dbStatus.todayQuestion,
        category: dbStatus.todayCategory,
        contentType: dbStatus.todayContentType,
        imageUrl: dbStatus.todayImageUrl,
        audioUrl: dbStatus.todayAudioUrl,
        imageInstructions: dbStatus.todayImageInstructions,
        vocabulary: dbStatus.todayVocabulary,
        isPictureDescriptionDay: dbStatus.isPictureDescriptionDay,
        isStorySummaryDay: dbStatus.isStorySummaryDay,
      } : null,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function sendPoster(req, res) {
  try {
    const { topic, question, category, targetGroup } = req.body || {};
    const result = await sendDailyPosterToGroup({ topic, question, category, targetGroup });
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error("[WhatsAppController] sendPoster error:", err.message);
    return res.status(400).json({ success: false, error: err.message });
  }
}

export async function sendSubmissionReport(req, res) {
  try {
    const { targetGroup } = req.body || {};
    const result = await sendDailySubmissionReportToGroup({ targetGroup });
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error("[WhatsAppController] sendSubmissionReport error:", err.message);
    return res.status(400).json({ success: false, error: err.message });
  }
}

export async function sendSlotReport(req, res) {
  const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const y = nowIST.getFullYear();
  const mo = String(nowIST.getMonth() + 1).padStart(2, "0");
  const d = String(nowIST.getDate()).padStart(2, "0");
  const todayDate = `${y}-${mo}-${d}`;

  const { slotIndex, time, templateType, customTemplate, targetGroup } = req.body || {};
  try {
    const result = await sendDailySubmissionReportToGroup({
      targetGroup,
      timeSlot: time,
      templateType: templateType || "comprehensive",
      customTemplate: customTemplate || null,
    });

    // Update status for this slot in DB
    const status = await Status.findOne();
    if (status && Array.isArray(status.submissionReportSlots)) {
      const idx = (typeof slotIndex === "number" && slotIndex >= 0 && slotIndex < status.submissionReportSlots.length)
        ? slotIndex
        : status.submissionReportSlots.findIndex(s => s.time === time);
      
      if (idx !== -1) {
        status.submissionReportSlots[idx].lastSentDate = todayDate;
        status.submissionReportSlots[idx].lastSentTime = time || `${String(nowIST.getHours()).padStart(2, "0")}:${String(nowIST.getMinutes()).padStart(2, "0")}`;
        status.submissionReportSlots[idx].lastStatus = "success";
        status.submissionReportSlots[idx].lastError = null;
        status.submissionReportSlots[idx].lastSentAt = new Date();
        status.markModified("submissionReportSlots");
        await status.save();
      }
    }

    return res.json({ success: true, ...result });
  } catch (err) {
    console.error("[WhatsAppController] sendSlotReport error:", err.message);

    // Record failure in DB
    try {
      const status = await Status.findOne();
      if (status && Array.isArray(status.submissionReportSlots)) {
        const idx = (typeof slotIndex === "number" && slotIndex >= 0 && slotIndex < status.submissionReportSlots.length)
          ? slotIndex
          : status.submissionReportSlots.findIndex(s => s.time === time);
        
        if (idx !== -1) {
          status.submissionReportSlots[idx].lastSentDate = todayDate;
          status.submissionReportSlots[idx].lastSentTime = time || `${String(nowIST.getHours()).padStart(2, "0")}:${String(nowIST.getMinutes()).padStart(2, "0")}`;
          status.submissionReportSlots[idx].lastStatus = "failed";
          status.submissionReportSlots[idx].lastError = err.message || "Failed to dispatch WhatsApp report";
          status.submissionReportSlots[idx].lastSentAt = new Date();
          status.markModified("submissionReportSlots");
          await status.save();
        }
      }
    } catch {}

    return res.status(400).json({ success: false, error: err.message });
  }
}

export async function reconnectWhatsApp(req, res) {
  try {
    const { force } = req.body || req.query || {};
    await restartWhatsAppBot(!!force);
    return res.json({
      success: true,
      message: force ? "Session reset triggered. Generating fresh QR code..." : "Reconnection started.",
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function logoutWhatsApp(req, res) {
  try {
    await logoutWhatsAppBot();
    return res.json({ success: true, message: "Logged out from WhatsApp." });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function sendTestAdminAlert(req, res) {
  try {
    const { phone } = req.body || {};
    const { sendDeploymentNotification, sendAdminDirectMessage } = await import("../services/whatsapp/whatsappService.js");
    
    if (phone) {
      const Status = (await import("../../models/statusSchema.js")).default;
      await Status.updateOne({}, { $set: { adminNotifyPhone: phone } }, { upsert: true });
    }

    const result = await sendDeploymentNotification({
      status: "success",
      extra: { test: true, phone },
    });

    if (!result || result.success === false) {
      return res.status(400).json({ success: false, error: result?.message || result?.error || "Failed to send WhatsApp alert" });
    }
    return res.json({ success: true, message: `Test alert dispatched to ${result.recipient || "your WhatsApp number"}!`, recipient: result.recipient });
  } catch (err) {
    console.error("[WhatsAppController] sendTestAdminAlert error:", err.message);
    return res.status(400).json({ success: false, error: err.message });
  }
}

export async function getGroups(req, res) {
  try {
    const groups = await getParticipatingGroups();
    return res.json({ success: true, groups });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function getMonthEndPrizeSummary(req, res) {
  try {
    const { totalCollection, winnerCount, calculationMethod, customAmounts, customWinnerNames, footerNote } = req.query || {};
    const parsedCustom = customAmounts ? String(customAmounts).split(",").map(Number) : undefined;
    const parsedNames = customWinnerNames ? String(customWinnerNames).split(",") : undefined;

    const summary = await getMonthEndPrizeReportSummary({
      totalCollection: totalCollection != null && totalCollection !== "" ? Number(totalCollection) : undefined,
      winnerCount: winnerCount != null && winnerCount !== "" ? Number(winnerCount) : undefined,
      calculationMethod,
      customAmounts: parsedCustom,
      customWinnerNames: parsedNames,
      footerNote,
    });

    return res.json(summary);
  } catch (err) {
    console.error("[WhatsAppController] getMonthEndPrizeSummary error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function sendMonthEndPrizeReport(req, res) {
  try {
    const {
      targetGroup,
      totalCollection,
      winnerCount,
      calculationMethod,
      customAmounts,
      customWinnerNames,
      footerNote,
    } = req.body || {};

    const result = await sendMonthEndPrizeReportToGroup({
      targetGroup,
      totalCollection,
      winnerCount,
      calculationMethod,
      customAmounts,
      customWinnerNames,
      footerNote,
    });

    return res.json({ success: true, ...result });
  } catch (err) {
    console.error("[WhatsAppController] sendMonthEndPrizeReport error:", err.message);
    return res.status(400).json({ success: false, error: err.message });
  }
}

export async function saveMonthEndSettings(req, res) {
  try {
    const result = await savePrizeSettings(req.body);
    return res.json(result);
  } catch (err) {
    console.error("[WhatsAppController] saveMonthEndSettings error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}


