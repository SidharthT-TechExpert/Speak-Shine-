import jwt from "jsonwebtoken";
import Auth from "../../models/authSchema.js";
import { getRedisClient, isRedisAvailable } from "../config/redis.js";

// Cache TTL for isActive checks — 60 seconds.
// A disabled user will be blocked within 1 minute even if their JWT is still valid.
const ACTIVE_CACHE_TTL = 60;

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET environment variable is not set");
  return secret;
}

/**
 * Resolve the request-scoped account context (isActive + PII) from the DB.
 * The JWT now carries only { id, role }, so phone/name are looked up here and
 * never travel inside the token. Uses Redis as a short-lived cache to avoid a
 * DB hit on every request; falls back to a direct DB query when Redis is down.
 */
async function resolveAccount(authId) {
  const cacheKey = `auth:ctx:${authId}`;

  if (isRedisAvailable()) {
    const cached = await getRedisClient().get(cacheKey);
    if (cached) {
      try { return JSON.parse(cached); } catch { /* fall through to DB */ }
    }
  }

  const auth = await Auth.findById(authId).select("isActive phone name").lean();
  const ctx = {
    isActive: auth?.isActive !== false, // treat missing as active (safety)
    phone: auth?.phone ?? null,
    name: auth?.name ?? null,
  };

  if (isRedisAvailable()) {
    await getRedisClient().set(cacheKey, JSON.stringify(ctx), "EX", ACTIVE_CACHE_TTL);
  }

  return ctx;
}

export function authMiddleware(req, res, next) {
  // Read from httpOnly cookie first (preferred), fall back to Authorization header
  const cookieToken = req.cookies?.access_token;
  const header = req.headers.authorization;
  const queryToken = req.query?.token || req.query?.apiKey;
  const customApiKey = req.headers["x-mcp-key"] || req.headers["x-api-key"];
  const secretKey = process.env.MCP_SECRET_KEY || process.env.JWT_SECRET;

  const raw = cookieToken
    || (header?.startsWith("Bearer ") ? header.split(" ")[1] : header)
    || queryToken
    || customApiKey;

  if (!raw) return res.status(401).json({ error: "No token provided" });

  // System API Key / MCP Secret Key bypass for AI Actions & ChatGPT (Admin System Key)
  if (secretKey && (raw === secretKey || customApiKey === secretKey)) {
    req.user = { id: "mcp_admin", role: "admin", phone: "system_ai", name: "AI Assistant" };
    return next();
  }

  // Personal Student API Key lookup (sk_user_...) for non-admin students
  if (typeof raw === "string" && raw.startsWith("sk_user_")) {
    return Auth.findOne({ apiKey: raw, isActive: true })
      .select("role phone name")
      .lean()
      .then((authDoc) => {
        if (!authDoc) {
          return res.status(401).json({ error: "Invalid or disabled personal API key" });
        }
        req.user = { id: authDoc._id, role: authDoc.role || "user", phone: authDoc.phone, name: authDoc.name };
        return next();
      })
      .catch((err) => res.status(500).json({ error: err.message }));
  }

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

  // decoded carries { id, role, type }. phone/name are added from the DB below.
  req.user = decoded;

  // Resolve account context (isActive + phone/name) and block disabled accounts.
  resolveAccount(decoded.id)
    .then((ctx) => {
      if (!ctx.isActive) {
        return res.status(403).json({ error: "Account disabled", code: "ACCOUNT_DISABLED" });
      }
      req.user.phone = ctx.phone;
      req.user.name = ctx.name;
      next();
    })
    .catch((err) => {
      // If the DB lookup fails, allow the request through (fail open) to avoid
      // locking out users on a transient DB error. req.user keeps id + role from
      // the token; phone/name are unavailable for this one request.
      console.error("[Auth] account resolve failed:", err.message);
      next();
    });
}

/**
 * Optional Auth Middleware:
 * Verifies JWT or API Key if present, but falls back to guest user (role: "guest")
 * if no token is provided or if token verification fails.
 * Prevents 401/403 errors on public read-only endpoints like leaderboard & today question.
 */
export function optionalAuthMiddleware(req, res, next) {
  const cookieToken = req.cookies?.access_token;
  const header = req.headers.authorization;
  const queryToken = req.query?.token || req.query?.apiKey;
  const customApiKey = req.headers["x-mcp-key"] || req.headers["x-api-key"];
  const secretKey = process.env.MCP_SECRET_KEY || process.env.JWT_SECRET;

  const raw = cookieToken
    || (header?.startsWith("Bearer ") ? header.split(" ")[1] : header)
    || queryToken
    || customApiKey;

  if (!raw) {
    req.user = { id: "guest", role: "guest", name: "Guest User" };
    return next();
  }

  if (secretKey && (raw === secretKey || customApiKey === secretKey)) {
    req.user = { id: "mcp_admin", role: "admin", phone: "system_ai", name: "AI Assistant" };
    return next();
  }

  try {
    const decoded = jwt.verify(raw, getJwtSecret());
    req.user = decoded;
    return next();
  } catch (err) {
    req.user = { id: "guest", role: "guest", name: "Guest User" };
    return next();
  }
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
