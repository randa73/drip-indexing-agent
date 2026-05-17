// api/indexnow-key.js
// Serves the IndexNow key file so Bing can verify site ownership
// Bing fetches this URL to confirm the key is legitimate

module.exports = (req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  res.status(200).send('drip-calculator-indexnow-2026');
};
