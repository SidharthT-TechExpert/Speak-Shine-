import express from 'express';
import QRCode from 'qrcode';
import { getRedisClient, isRedisAvailable } from '../../redis.js';

const router = express.Router();

// Store the latest QR code data (fallback if Redis unavailable)
let latestQR = null;
let qrTimestamp = null;

// Function to be called from index.js to update QR code
export async function updateQR(qrData) {
  latestQR = qrData;
  qrTimestamp = new Date();
  
  // Store in Redis if available
  if (isRedisAvailable()) {
    try {
      const redis = getRedisClient();
      await redis.set('whatsapp:qr:data', qrData);
      await redis.set('whatsapp:qr:timestamp', qrTimestamp.toISOString());
      await redis.expire('whatsapp:qr:data', 120); // Expire after 2 minutes
      await redis.expire('whatsapp:qr:timestamp', 120);
    } catch (error) {
      console.error('Failed to store QR in Redis:', error);
    }
  }
  
  console.log('📱 QR code updated, accessible at /api/qr');
}

// GET /api/qr - Display QR code as image
router.get('/', async (req, res) => {
  try {
    let qrData = latestQR;
    let timestamp = qrTimestamp;

    // Try to get from Redis first
    if (isRedisAvailable()) {
      try {
        const redis = getRedisClient();
        const redisQR = await redis.get('whatsapp:qr:data');
        const redisTimestamp = await redis.get('whatsapp:qr:timestamp');
        
        if (redisQR) {
          qrData = redisQR;
          timestamp = redisTimestamp ? new Date(redisTimestamp) : new Date();
        }
      } catch (error) {
        console.error('Failed to get QR from Redis:', error);
      }
    }

    if (!qrData) {
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>WhatsApp Bot QR Code</title>
          <meta http-equiv="refresh" content="5">
          <style>
            body { font-family: Arial; text-align: center; padding: 50px; background: #0f172a; color: white; }
            .container { max-width: 600px; margin: 0 auto; }
            h1 { color: #10b981; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>⏳ Waiting for QR Code...</h1>
            <p>The bot is starting up. This page will refresh automatically.</p>
            <p><small>Last checked: ${new Date().toLocaleTimeString()}</small></p>
          </div>
        </body>
        </html>
      `);
    }

    // Generate QR code image
    const qrImage = await QRCode.toDataURL(qrData);
    const age = Math.floor((Date.now() - timestamp) / 1000);

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>WhatsApp Bot QR Code</title>
        <meta http-equiv="refresh" content="30">
        <style>
          body { 
            font-family: Arial; 
            text-align: center; 
            padding: 50px; 
            background: #0f172a; 
            color: white; 
          }
          .container { 
            max-width: 600px; 
            margin: 0 auto; 
            background: #1e293b; 
            padding: 30px; 
            border-radius: 10px; 
          }
          h1 { color: #10b981; margin-bottom: 10px; }
          .qr-code { 
            background: white; 
            padding: 20px; 
            border-radius: 10px; 
            display: inline-block; 
            margin: 20px 0; 
          }
          .qr-code img { 
            width: 300px; 
            height: 300px; 
          }
          .instructions { 
            text-align: left; 
            background: #334155; 
            padding: 20px; 
            border-radius: 5px; 
            margin-top: 20px; 
          }
          .instructions ol { 
            margin: 10px 0; 
            padding-left: 20px; 
          }
          .warning { 
            color: #fbbf24; 
            margin-top: 20px; 
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>📱 Scan to Connect WhatsApp Bot</h1>
          <p>Generated ${age} seconds ago</p>
          
          <div class="qr-code">
            <img src="${qrImage}" alt="QR Code" />
          </div>

          <div class="instructions">
            <h3>How to scan:</h3>
            <ol>
              <li>Open WhatsApp on your phone</li>
              <li>Go to <strong>Settings</strong> → <strong>Linked Devices</strong></li>
              <li>Tap <strong>Link a Device</strong></li>
              <li>Scan this QR code</li>
            </ol>
          </div>

          <p class="warning">⚠️ QR codes expire after 60 seconds. Page auto-refreshes every 30 seconds.</p>
          <p><small>Last updated: ${timestamp.toLocaleTimeString()}</small></p>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Error</title>
        <style>
          body { font-family: Arial; text-align: center; padding: 50px; background: #0f172a; color: white; }
        </style>
      </head>
      <body>
        <h1>❌ Error</h1>
        <p>${error.message}</p>
      </body>
      </html>
    `);
  }
});

export default router;
