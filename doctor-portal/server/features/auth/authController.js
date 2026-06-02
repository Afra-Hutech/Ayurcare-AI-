'use strict';
/**
 * Auth Controller — PostgreSQL / Sequelize
 * Migrated from: MongoDB / Mongoose authController.js
 *
 * NOSQL INJECTION DEFENCE — HOW IT CHANGES
 * ─────────────────────────────────────────
 * MongoDB (old):
 *   normalizedEmail = String(email || '').trim().toLowerCase()
 *   → Object {$gt:""} became "[object object]" (accidental string coercion)
 *   → User.findOne({ email: "[object object]" }) → null → 401
 *
 * PostgreSQL (new) — two-layer defence:
 *   Layer 1 (explicit type guard):
 *     if (typeof email !== 'string') return res.status(400)
 *     → Rejects non-string inputs BEFORE any DB call; no silent coercion.
 *     → Sends a clear 400 instead of a cryptic 401 "[object object]" path.
 *   Layer 2 (parameterised query):
 *     Sequelize.findOne({ where: { email: normalizedEmail } })
 *     → generates: SELECT * FROM users WHERE email = $1
 *     → $1 is bound as a typed parameter; the driver escapes it at the
 *       protocol level. No user-supplied string can alter the query syntax.
 *     → SQL injection is structurally impossible regardless of input content.
 *
 * DB readiness:
 *   isMongoReady() replaced by isPostgresReady() via sequelize.authenticate().
 *   Error pattern matching for Mongo errors removed; pg-specific patterns added.
 */
const crypto     = require('crypto');
const jwt        = require('jsonwebtoken');
const { Op }     = require('sequelize');
const { User }   = require('../../models');
const sequelize  = require('../../db/sequelize');
const { JWT_SECRET } = require('./authMiddleware');

function hashResetToken(raw) {
  return crypto.createHash('sha256').update(String(raw)).digest('hex');
}

// Replaces: isMongoReady() — checks PostgreSQL connectivity instead
async function isPostgresReady() {
  try {
    await sequelize.authenticate();
    return true;
  } catch {
    return false;
  }
}

// ── signup ────────────────────────────────────────────────────────────────────
const signup = async (req, res) => {
  try {
    // ── Layer 1: Type guard (prevents NoSQL/injection-shaped inputs) ──────────
    const { email, password, name } = req.body;
    if (typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ message: 'email must be a non-empty string' });
    }
    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ message: 'password must be at least 6 characters' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!(await isPostgresReady())) {
      return res.status(503).json({ message: 'Database unavailable. Please try again shortly.' });
    }

    // ── Layer 2: Parameterised query — Sequelize generates SELECT ... WHERE email = $1
    const existingUser = await User.findOne({ where: { email: normalizedEmail } });
    if (existingUser) return res.status(400).json({ message: 'User already exists' });

    const role = req.body.role === 'doctor' ? 'doctor' : 'patient';
    const user = await User.hashAndCreate({ email: normalizedEmail, password, name, role });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    return res.status(201).json({
      token,
      user: {
        id:           user.id,
        email:        user.email,
        name:         user.name,
        role:         user.role,
        isOnboarded:  false,
        isNewPatient: user.role === 'patient',
      },
    });
  } catch (err) {
    if (/unique constraint|UniqueConstraintError/i.test(String(err))) {
      return res.status(400).json({ message: 'User already exists' });
    }
    if (/SequelizeValidationError/i.test(err.name)) {
      return res.status(400).json({ message: err.errors?.[0]?.message || err.message });
    }
    console.error('[AUTH] signup error:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── login ─────────────────────────────────────────────────────────────────────
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // ── Layer 1: Type guard ───────────────────────────────────────────────────
    // This is the PRIMARY change from the MongoDB version.
    //
    // Old: String(email || '').trim().toLowerCase()
    //      → Object inputs silently became "[object object]"
    //      → Resulted in 401 "not found" without explaining the bad input
    //
    // New: Explicit type check returns 400 with a clear message.
    //      Non-string email (e.g. {$gt:""}) is rejected BEFORE the DB query.
    if (typeof email !== 'string') {
      return res.status(400).json({ message: 'email must be a string' });
    }
    if (typeof password !== 'string') {
      return res.status(400).json({ message: 'password must be a string' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      return res.status(400).json({ message: 'email is required' });
    }

    if (!(await isPostgresReady())) {
      return res.status(503).json({ message: 'Database unavailable. Please try again shortly.' });
    }

    console.log(`🔐 Login attempt for: ${normalizedEmail}`);

    // ── Layer 2: Parameterised query ──────────────────────────────────────────
    // Sequelize translates this to: SELECT * FROM users WHERE email = $1
    // $1 is bound at the driver level — injection is structurally impossible.
    // We use scope 'withPassword' to include the password_hash column
    // (excluded from defaultScope for security).
    const user = await User.scope('withPassword').findOne({
      where: { email: normalizedEmail },
    });

    if (!user) {
      console.log(`❌ Login failed: not found (${normalizedEmail})`);
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      console.log(`❌ Login failed: password mismatch (${normalizedEmail})`);
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    console.log(`✅ Login successful: ${normalizedEmail}`);

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({
      token,
      user: {
        id:           user.id,
        email:        user.email,
        name:         user.name,
        role:         user.role,
        age:          user.age,
        gender:       user.gender,
        height:       user.height,
        weight:       user.weight,
        phone:        user.phone,
        address:      user.address,
        profileImage: user.profileImage,
        isOnboarded:  user.isOnboarded,
      },
    });
  } catch (err) {
    const msg = String(err.message || err);
    if (/ECONNREFUSED|ETIMEDOUT|ConnectionError|SequelizeConnectionError/i.test(msg)) {
      return res.status(503).json({ message: 'Database unavailable. Please try again shortly.' });
    }
    console.error('[AUTH] login error:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── getMe ─────────────────────────────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const getMe = async (req, res) => {
  try {
    // Patient tokens from bot-brain use MongoDB ObjectIds, not UUIDs — return 404 gracefully
    if (!UUID_RE.test(String(req.userId || ''))) {
      return res.status(404).json({ message: 'User not found in doctor system' });
    }
    const user = await User.findByPk(req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.json(user);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── forgotPassword ────────────────────────────────────────────────────────────
const forgotPassword = async (req, res) => {
  try {
    if (typeof req.body?.email !== 'string') {
      return res.status(400).json({ message: 'email must be a string' });
    }
    const email = req.body.email.trim().toLowerCase();
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const generic = {
      message: 'If this email is registered, you can use the reset code below to set a new password.',
    };

    const user = await User.scope('withPassword').findOne({ where: { email } });
    if (!user) return res.json(generic);

    const rawToken = crypto.randomBytes(4).toString('hex').toUpperCase();

    // Sequelize parameterised UPDATE — no MongoDB $set operator needed
    await user.update({
      resetTokenHash:    hashResetToken(rawToken),
      resetTokenExpires: new Date(Date.now() + 60 * 60 * 1000),
    });

    return res.json({ ...generic, resetToken: rawToken, expiresInMinutes: 60 });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── resetPassword ─────────────────────────────────────────────────────────────
const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({
        message: 'Reset code and password (6+ characters) are required',
      });
    }

    const hashed = hashResetToken(token);

    // Replaces: { passwordResetToken: hashed, passwordResetExpires: { $gt: new Date() } }
    const user = await User.scope('withPassword').findOne({
      where: {
        resetTokenHash:    hashed,
        resetTokenExpires: { [Op.gt]: new Date() },
      },
    });

    if (!user) return res.status(400).json({ message: 'Invalid or expired reset code' });

    const newHash = await require('bcryptjs').hash(password, 12);
    await user.update({
      passwordHash:      newHash,
      resetTokenHash:    null,
      resetTokenExpires: null,
    });

    return res.json({ message: 'Password updated. You can log in now.' });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

module.exports = { signup, login, getMe, forgotPassword, resetPassword };
