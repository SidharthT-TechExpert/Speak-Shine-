import mongoose from "mongoose";

/**
 * PendingRegistration — holds new user signups awaiting admin approval.
 * Stored permanently until an admin approves or rejects the registration.
 */
const pendingRegistrationSchema = new mongoose.Schema({
  phone:        { type: String, required: true, unique: true }, // normalised 10-digit
  name:         { type: String, required: true },
  password:     { type: String, required: true },               // argon2 hash
  referralCode: { type: String, default: null },               // referral code of inviter
  createdAt:    { type: Date, default: Date.now },
});

export default mongoose.model("PendingRegistration", pendingRegistrationSchema);
