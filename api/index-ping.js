// api/index-ping.js
// Vercel cron job — pings Google + Bing via IndexNow every 40 minutes
// IndexNow requires zero ownership verification — works immediately
// Sends email via Resend when confirmed

const https = require('https');

const SITE_URL      = 'https://mydripplan.com';
const URL_TO_INDEX  = 'https://mydripplan.com/';
const NOTIFY_EMAIL  = 'armando.martellini@gmail.com';

// IndexNow API key — this is a public identifier, not a secret
// Must match the file at /[key].txt on your site (we serve it via the API route below)
const INDEXNOW_KEY  = 'drip-calculator-indexnow-2026';

// ── PING INDEXNOW (Bing + Google via Bing relay) ──────────────
function pingIndexNow() {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      host:    'mydripplan.com',
      key:     INDEXNOW_KEY,
      keyLocation: `${SITE_URL}/api/indexnow-key`,
      urlList: [URL_TO_INDEX],
    });

    const req = https.request({
      hostname: 'api.indexnow.org',
      path:     '/indexnow',
      method:   'POST',
      headers: {
        'Content-Type':   'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── ALSO PING GOOGLE DIRECTLY (no auth needed for this endpoint) ──
function pingGoogleSitemap() {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'www.google.com',
      path:     `/ping?sitemap=${encodeURIComponent(SITE_URL + '/sitemap.xml')}`,
      method:   'GET',
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode }));
    });
    req.on('error', () => resolve({ status: 0, error: 'failed' }));
    req.end();
  });
}

// ── SEND EMAIL VIA RESEND ─────────────────────────────────────
function sendEmail(subject, html) {
  return new Promise((resolve) => {
    if (!process.env.RESEND_API_KEY) return resolve({ skipped: true });
    const body = JSON.stringify({
      from:    'DRIP Indexing Agent <onboarding@resend.dev>',
      to:      [NOTIFY_EMAIL],
      subject,
      html,
    });
    const req = https.request({
      hostname: 'api.resend.com',
      path:     '/emails',
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Authorization':  `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode }));
    });
    req.on('error', resolve);
    req.write(body);
    req.end();
  });
}

// ── MAIN ──────────────────────────────────────────────────────
module.exports = async (req, res) => {
  const timestamp = new Date().toISOString();

  try {
    // Fire both pings in parallel
    const [indexNowResult, googleResult] = await Promise.all([
      pingIndexNow(),
      pingGoogleSitemap(),
    ]);

    console.log(`[${timestamp}] IndexNow: ${indexNowResult.status} | Google sitemap: ${googleResult.status}`);

    // IndexNow returns 200 or 202 on success
    const indexNowSuccess = [200, 202].includes(indexNowResult.status);
    const googleSuccess   = googleResult.status === 200;

    // Send success email on first successful ping
    if (indexNowSuccess && process.env.RESEND_API_KEY && !process.env.EMAIL_SENT) {
      await sendEmail(
        '✅ DRIP Calculator — Indexing Pings Are Live!',
        `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
          <h2 style="color:#16a34a;">✅ Indexing Agent Is Running!</h2>
          <p>Your DRIP Calculator indexing agent successfully pinged search engines.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr>
              <td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">URL</td>
              <td style="padding:8px;border:1px solid #e5e7eb;">${URL_TO_INDEX}</td>
            </tr>
            <tr>
              <td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">IndexNow (Bing/Google)</td>
              <td style="padding:8px;border:1px solid #e5e7eb;">${indexNowSuccess ? '✅ Success' : '❌ Failed'} (${indexNowResult.status})</td>
            </tr>
            <tr>
              <td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">Google Sitemap Ping</td>
              <td style="padding:8px;border:1px solid #e5e7eb;">${googleSuccess ? '✅ Success' : '⚠️ Check'} (${googleResult.status})</td>
            </tr>
            <tr>
              <td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">Time</td>
              <td style="padding:8px;border:1px solid #e5e7eb;">${new Date(timestamp).toLocaleString()}</td>
            </tr>
          </table>
          <p>The agent will continue pinging every 40 minutes automatically.</p>
          <p style="color:#6b7280;font-size:12px;">— DRIP Indexing Agent</p>
        </div>
        `
      );
    }

    return res.status(200).json({
      timestamp,
      indexNow: { success: indexNowSuccess, status: indexNowResult.status },
      google:   { success: googleSuccess,   status: googleResult.status },
    });

  } catch (err) {
    console.error(`[${timestamp}] Error:`, err.message);
    return res.status(500).json({ error: err.message });
  }
};
