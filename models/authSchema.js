import mongoose from "mongoose";

const authSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true }, // e.g. "918848096746"
  password: { type: String, required: true },            // argon2 hash
  role: { type: String, enum: ["user", "trainer", "admin", "viewer"], default: "user" },
  userId: { type: String, default: null },               // linked WhatsApp JID
  name: { type: String, default: null },
  email: { type: String, default: null },                // admin email for OTP verification
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  
  // Security: Account lockout after failed login attempts
  failedLoginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date, default: null },
  
  // Security: OTP expiration and attempt limiting
  otpExpiry: { type: Date, default: null },
  otpAttempts: { type: Number, default: 0 },
  
  // Security: Refresh token rotation
  refreshTokens: [{ 
    token: String, 
    expiresAt: Date,
    createdAt: { type: Date, default: Date.now }
  }],
});

export default mongoose.model("Auth", authSchema);
