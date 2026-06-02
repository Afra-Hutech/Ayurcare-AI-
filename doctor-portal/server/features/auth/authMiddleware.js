const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'doctor_portal_secret_key_123';
const JWT_FALLBACK_SECRETS = [
  'doctor_portal_secret_key_123',
  'doctor_portal_secure_key_123',
  'ayurcare_secret_2025',
].filter((secret) => secret && secret !== JWT_SECRET);

const verifyWithSecret = (token, secret) => new Promise((resolve, reject) => {
  jwt.verify(token, secret, (err, decoded) => {
    if (err) {
      reject(err);
      return;
    }
    resolve(decoded);
  });
});

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    console.log('❌ No token provided for:', req.method, req.url);
    return res.status(401).json({ message: 'Authentication required' });
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const tryDecode = async (secret) => {
    const decoded = await verifyWithSecret(token, secret);
    const userId = decoded.userId || decoded.sub;
    if (!userId) throw new Error('no userId in payload');
    if (!UUID_RE.test(String(userId))) throw new Error('non-uuid userId (old session)');
    return userId;
  };

  try {
    req.userId = await tryDecode(JWT_SECRET);
    return next();
  } catch (primaryError) {
    for (const fallbackSecret of JWT_FALLBACK_SECRETS) {
      try {
        req.userId = await tryDecode(fallbackSecret);
        return next();
      } catch { /* try next */ }
    }
    // Token is invalid or contains a MongoDB ObjectId from the old system
    return res.status(403).json({ message: 'Session expired. Please log in again.' });
  }
};

module.exports = {
  authenticateToken,
  JWT_SECRET,
};
