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

  try {
    const decoded = await verifyWithSecret(token, JWT_SECRET);
    req.userId = decoded.userId || decoded.sub;
    if (!req.userId) return res.status(403).json({ message: 'Invalid token payload' });
    return next();
  } catch (primaryError) {
    for (const fallbackSecret of JWT_FALLBACK_SECRETS) {
      try {
        const decoded = await verifyWithSecret(token, fallbackSecret);
        req.userId = decoded.userId || decoded.sub;
        if (!req.userId) return res.status(403).json({ message: 'Invalid token payload' });
        return next();
      } catch (_fallbackError) {
        // continue trying fallback secrets
      }
    }

    console.log('❌ Token verification failed for:', req.method, req.url, '| Error:', primaryError.message);
    return res.status(403).json({ message: 'Invalid or expired session' });
  }
};

module.exports = {
  authenticateToken,
  JWT_SECRET,
};
