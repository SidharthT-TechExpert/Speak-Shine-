import { getStatus, restartWhatsAppBot, logoutWhatsAppBot } from "../backend/services/whatsapp/whatsappService.js";

console.log("Checking WhatsApp status function...");
const status = getStatus();
console.log("Current status:", status);
console.log("✅ whatsappService module loaded successfully!");
process.exit(0);
