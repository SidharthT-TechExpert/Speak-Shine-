# Security Audit Report - Speak & Shine

**Date:** April 30, 2026  
**Status:** Comprehensive Review

## ✅ Security Strengths

### 1. **Authentication & Authorization**
- ✅ **Strong password hashing**: Argon2 (industry best practice)
- ✅ **Backward compatibility**: Supports bcrypt with auto-migration
- ✅ **JWT tokens**: Properly signed with secret
- ✅ **Token expiration**: 7 days (reasonable)
- ✅ **Role-based access control**: Admin, trainer, user roles enforced
- ✅ **Auth middleware**: Validates tokens on protected routes

### 2. **Rate Limiting**
- ✅ **API rate limiting**: 200 requests/minute per IP
- ✅ **Login rate limiting**: 5 attempts per 15 minutes
- ✅ **OTP rate limiting**: 3 attempts per 15 minutes
- ✅ **Trust proxy enabled**: Correctly identifies real client IPs

### 3. **Security Headers**
- ✅ **Helmet.js**: Security headers configured
- ✅ **CORS**: Restricted to allowed origins in production
- ✅ **Credentials**: Properly handled with CORS

### 4. **Input Validation**
- ✅ **File upload limits**: 110MB max (prevents DoS)
- ✅ **MongoDB queries**: Using Mongoose (prevents NoSQL injection)
- ✅ **No dangerous operators**: No `$where`, `eval()`, or `new Function()`

### 5. **Secrets Management**
- ✅ **.env not committed**: Properly gitignored
- ✅ **JWT_SECRET validation**: App refuses to start without it
- ✅ **Environment variables**: Used for all sensitive data

---

## ⚠️ Security Vulnerabilities & Recommendations

### 🔴 **CRITICAL**

#### 1. **JWT Token in Query String (SSE)**
**Location:** `api/middleware/auth.js:13`
```javascript
const queryToken = req.query?.token;
```

**Risk:** Tokens in URLs are logged by proxies, browsers, and servers.

**Fix:**
```javascript
// For SSE, use a short-lived token or session-based auth
// Remove query token support or limit to SSE endpoints only
export function authMiddlewareSSE(req, res, next) {
  // Only for SSE endpoints
  const queryToken = req.query?.token;
  // ... validate and use short-lived token
}
```

#### 2. **No HTTPS Enforcement**
**Risk:** Credentials and tokens can be intercepted over HTTP.

**Fix:** Add to `api/server.js`:
```javascript
// Force HTTPS in production
if (isProd) {
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      return res.redirect(`https://${req.header('host')}${req.url}`);
    }
    next();
  });
}
```

---

### 🟡 **HIGH**

#### 3. **No Account Lockout After Failed Logins**
**Risk:** Brute force attacks can continue indefinitely.

**Current:** Rate limiting only (5 attempts per 15 min per IP)

**Fix:** Add account-level lockout:
```javascript
// In authSchema.js
failedLoginAttempts: { type: Number, default: 0 },
lockUntil: { type: Date, default: null },

// In auth.js login
if (auth.lockUntil && auth.lockUntil > Date.now()) {
  return res.status(423).json({ 
    error: "Account locked. Try again later." 
  });
}

if (!valid) {
  auth.failedLoginAttempts += 1;
  if (auth.failedLoginAttempts >= 5) {
    auth.lockUntil = Date.now() + 30 * 60 * 1000; // 30 min
  }
  await auth.save();
  return res.status(401).json({ error: "Invalid credentials" });
}

// Reset on successful login
auth.failedLoginAttempts = 0;
auth.lockUntil = null;
```

#### 4. **No CSRF Protection**
**Risk:** Cross-site request forgery attacks.

**Fix:** Add CSRF tokens for state-changing operations:
```bash
npm install csurf
```

```javascript
import csrf from 'csurf';
const csrfProtection = csrf({ cookie: true });

// Apply to state-changing routes
app.use('/api/video/upload', csrfProtection);
app.use('/api/auth/register', csrfProtection);
```

#### 5. **File Upload Path Traversal Risk**
**Location:** `api/routes/videoAnalysis.js`

**Risk:** Malicious filenames could write outside intended directory.

**Fix:**
```javascript
import path from 'path';

// Sanitize filename
function sanitizeFilename(filename) {
  return path.basename(filename).replace(/[^a-zA-Z0-9.-]/g, '_');
}

// In upload handler
const safeFilename = sanitizeFilename(req.body.filename);
```

---

### 🟢 **MEDIUM**

#### 6. **JWT Token Expiration Too Long**
**Current:** 7 days

**Recommendation:** 
- Access tokens: 15 minutes
- Refresh tokens: 7 days
- Implement refresh token rotation

#### 7. **No Content Security Policy (CSP)**
**Risk:** XSS attacks can execute malicious scripts.

**Fix:**
```javascript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // Remove unsafe-inline gradually
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", process.env.R2_PUBLIC_URL],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
```

#### 8. **No Input Sanitization for User-Generated Content**
**Risk:** Stored XSS attacks.

**Fix:**
```bash
npm install dompurify isomorphic-dompurify
```

```javascript
import DOMPurify from 'isomorphic-dompurify';

// Sanitize before saving to database
const sanitizedMessage = DOMPurify.sanitize(req.body.message);
```

#### 9. **No Security Logging/Monitoring**
**Risk:** Cannot detect or respond to attacks.

**Fix:** Add security event logging:
```javascript
// Log security events
function logSecurityEvent(event, details) {
  console.warn(`[SECURITY] ${event}:`, JSON.stringify(details));
  // Send to monitoring service (e.g., Sentry, LogRocket)
}

// Use in auth routes
logSecurityEvent('FAILED_LOGIN', { phone, ip: req.ip });
logSecurityEvent('ACCOUNT_LOCKED', { phone, ip: req.ip });
```

#### 10. **Weak OTP Implementation**
**Current:** 6-digit numeric OTP

**Recommendations:**
- Use cryptographically secure random (already using `randomInt`)
- Add OTP expiration (currently missing)
- Limit OTP attempts per session

**Fix:**
```javascript
// In authSchema.js
otpExpiry: { type: Date, default: null },
otpAttempts: { type: Number, default: 0 },

// In OTP verification
if (!auth.otpExpiry || auth.otpExpiry < Date.now()) {
  return res.status(400).json({ error: "OTP expired" });
}

if (auth.otpAttempts >= 3) {
  return res.status(429).json({ error: "Too many attempts" });
}
```

---

### 🔵 **LOW**

#### 11. **No Subresource Integrity (SRI)**
**Risk:** CDN compromise could inject malicious code.

**Fix:** Add SRI hashes to external scripts in `frontend/index.html`.

#### 12. **No HTTP Strict Transport Security (HSTS)**
**Fix:**
```javascript
app.use(helmet.hsts({
  maxAge: 31536000, // 1 year
  includeSubDomains: true,
  preload: true
}));
```

#### 13. **Verbose Error Messages**
**Risk:** Information disclosure.

**Fix:**
```javascript
// In production, hide stack traces
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ 
    error: isProd ? "Internal server error" : err.message 
  });
});
```

---

## 📋 Priority Action Items

### Immediate (This Week)
1. ✅ Enable HTTPS enforcement
2. ✅ Add account lockout after failed logins
3. ✅ Sanitize file upload filenames
4. ✅ Add OTP expiration

### Short Term (This Month)
5. ⏳ Implement CSRF protection
6. ⏳ Add Content Security Policy
7. ⏳ Implement refresh token rotation
8. ⏳ Add security event logging

### Long Term (Next Quarter)
9. ⏳ Security audit by third party
10. ⏳ Penetration testing
11. ⏳ Bug bounty program

---

## 🛡️ Security Best Practices Checklist

- [x] Passwords hashed with Argon2
- [x] JWT tokens with expiration
- [x] Rate limiting on sensitive endpoints
- [x] CORS configured for production
- [x] Environment variables for secrets
- [x] Input validation on file uploads
- [x] Trust proxy for Railway
- [ ] HTTPS enforcement
- [ ] Account lockout mechanism
- [ ] CSRF protection
- [ ] Content Security Policy
- [ ] Security event logging
- [ ] OTP expiration
- [ ] Refresh token rotation

---

## 📞 Security Contact

For security issues, please contact: [Your Security Email]

**Do not** open public GitHub issues for security vulnerabilities.
