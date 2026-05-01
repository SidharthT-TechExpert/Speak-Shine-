import jwt from "jsonwebtoken";

// Lazy getter for JWT_SECRET - allows dotenv to load first
function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not set");
  }
  return secret;
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  // Also accept token from query string (needed for SSE EventSource)
  const queryToken = req.query?.token;
  const raw = header?.startsWith("Bearer ") ? header.split(" ")[1] : queryToken;

  if (!raw) {
    return res.status(401).json({ error: "No token provided" });
  }
  try {
    const decoded = jwt.verify(raw, getJwtSecret());
    
    // Ensure it's an access token (not refresh token)
    if (decoded.type && decoded.type !== 'access') {
      return res.status(401).json({ error: "Invalid token type" });
    }
    
    req.user = decoded;
    next();
  } catch (err) {
    // Check if token expired
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: "Token expired", code: "TOKEN_EXPIRED" });
    }
    return res.status(401).json({ error: "Invalid or expired token" });
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
