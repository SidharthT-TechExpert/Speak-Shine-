import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "speakshine_secret_2024";

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  // Also accept token from query string (needed for SSE EventSource)
  const queryToken = req.query?.token;
  const raw = header?.startsWith("Bearer ") ? header.split(" ")[1] : queryToken;

  if (!raw) {
    return res.status(401).json({ error: "No token provided" });
  }
  try {
    const decoded = jwt.verify(raw, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
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
