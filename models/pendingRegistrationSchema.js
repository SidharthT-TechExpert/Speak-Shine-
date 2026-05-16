import mongoose from "mongoose";

/**
 * PendingRegistration — holds new user signups awaiting admin approval.
 * Auto-deleted by MongoDB TTL index after 24 hours if not approved.
 */
const pendingRegistrationSchema = new mongoose.Schema({
  phone:     { type: String, required: true, unique: true }, // normalised 10-digit
  name:      { type: String, required: true },
  password:  { type: String, required: true },               // argon2 hash
  createdAt: { type: Date, default: Date.now, index: { expires: "24h" } }, // TTL
});

export default mongoose.model("PendingRegistration", pendingRegistrationSchema);
