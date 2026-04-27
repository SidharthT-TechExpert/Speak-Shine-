# QR Code Fix Documentation

## Problem
The QR code page at `/api/qr` was showing "Waiting for QR Code..." even though the bot was generating QR codes. This happened because:

1. The bot (index.js) and API server (api/server.js) run as **separate processes**
2. They don't share memory, so the `updateQR()` function was only updating a local variable in the bot process
3. The API server couldn't access the QR code data from the bot process

## Solution
Implemented **Redis as a shared storage** mechanism to allow both processes to communicate:

### Changes Made

1. **Updated `api/routes/qr.js`**:
   - Modified `updateQR()` to store QR data in Redis
   - Modified the GET endpoint to retrieve QR data from Redis first
   - Falls back to in-memory storage if Redis is unavailable

2. **How it works**:
   ```
   Bot Process (index.js)
   ↓
   Generates QR code
   ↓
   Calls updateQR(qrData)
   ↓
   Stores in Redis with key: 'whatsapp:qr:data'
   ↓
   API Server (api/server.js)
   ↓
   User visits /api/qr
   ↓
   Reads from Redis
   ↓
   Displays QR code
   ```

3. **Redis Keys Used**:
   - `whatsapp:qr:data` - The QR code string
   - `whatsapp:qr:timestamp` - When the QR was generated
   - Both keys expire after 120 seconds (2 minutes)

## Testing
After deployment, visit: `https://your-railway-url.railway.app/api/qr`

The page should now display the QR code when the bot generates one.

## Fallback Behavior
If Redis is unavailable:
- The system falls back to in-memory storage
- QR codes will only work if both processes are on the same machine
- This is fine for local development but won't work in production with separate containers

## Environment Variables Required
```
REDIS_URL=rediss://default:password@your-redis-host:6379
```

Already configured in your `.env` file.
