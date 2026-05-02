import jwt from "jsonwebtoken";
import Auth from "../../models/authSchema.js";
import { getRedisClient, isRedisAvailable } from "../../redis.js";

// Cache TTL for isActive checks — 60 seconds.
// A disabled user will be blocked within 1 minute even if their JWT is still valid.
const ACTIVE_CACHE_TTL = 60;

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET environment variable is not set");
  return secret;
}

/**
 * Check whether a user account is still active.
 * Uses Redis as a short-lived cache to avoid a DB hit on every request.
 * Falls back to a direct DB query when Redis is unavailable.
 */
async function isAccountActive(authId) {
  const cacheKey = `auth:active:${authId}`;

  if (isRedisAvailable()) {
    const cached = await getRedisClient().get(cacheKey);
    if (cached !== null) return cached === "1";
  }

  const auth = await Auth.findById(authId).select("isActive").lean();
  const active = auth?.isActive !== false; // treat missing as active (safety)

  if (isRedisAvailable()) {
    await getRedisClient().set(cacheKey, active ? "1" : "0", "EX", ACTIVE_CACHE_TTL);
  }

  return active;
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  const queryToken = req.query?.token;
  const raw = header?.startsWith("Bearer ") ? header.split(" ")[1] : queryToken;

  if (!raw) return res.status(401).json({ error: "No token provided" });

  let decoded;
  try {
    decoded = jwt.verify(raw, getJwtSecret());
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired", code: "TOKEN_EXPIRED" });
    }
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  // Reject non-access tokens
  if (decoded.type && decoded.type !== "access") {
    return res.status(401).json({ error: "Invalid token type" });
  }

  req.user = decoded;

  // Check isActive asynchronously — block disabled accounts immediately
  isAccountActive(decoded.id)
    .then((active) => {
      if (!active) {
        return res.status(403).json({ error: "Account disabled", code: "ACCOUNT_DISABLED" });
      }
      next();
    })
    .catch((err) => {
      // If the DB check fails, allow the request through (fail open) to avoid
      // locking out users due to a transient DB error.
      console.error("[Auth] isActive check failed:", err.message);
      next();
    });
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ error: "Access denied" });
    }
    next();
  };
}

/**
 * Block write operations for viewer accounts.
 * Viewers can call any GET endpoint but all POST/PATCH/PUT/DELETE return 403.
 * Apply this after authMiddleware on any route group that has mutations.
 */
export function blockViewer(req, res, next) {
  if (req.user?.role === "viewer" && req.method !== "GET") {
    return res.status(403).json({ error: "Read-only account — this action is not allowed", code: "VIEWER_READONLY" });
  }
  next();
}
