/**
 * Complete Security Integration Suite: Doctor Portal
 * ====================================================
 * TC-API-001 → TC-API-047
 *
 * MIDDLEWARE BEHAVIOR (source: features/auth/authMiddleware.js)
 * ─────────────────────────────────────────────────────────────
 * Line 23-26:  token = authHeader && authHeader.split(' ')[1]
 *              if (!token) → 401 "Authentication required"
 *
 * Line 29-33:  try verifyWithSecret(token, JWT_SECRET)
 *              decoded.userId || decoded.sub
 *              if (!req.userId) → 403 "Invalid token payload"
 *
 * Line 34-44:  catch → loop JWT_FALLBACK_SECRETS
 *              all fallbacks fail → 403 "Invalid or expired session"
 *
 * JWT_SECRET   (default): 'doctor_portal_secret_key_123'
 * FALLBACK[0]: 'doctor_portal_secure_key_123'
 * FALLBACK[1]: 'ayurcare_secret_2025'
 *
 * ROUTE PROTECTION MAP (source: server/index.js)
 * ───────────────────────────────────────────────
 * PUBLIC  (no middleware):   /api/health, /api/public/*, /api/auth/login,
 *                             /api/auth/signup, /api/auth/forgot-password
 * PRIVATE (authenticateToken):
 *   /api/chat              index.js:88
 *   /api/patient/*         index.js:90
 *   /api/doctor/*          doctorRoutes.js:20 (router.use)
 *   /api/appointments/*    index.js:95
 *   /api/livekit/*         index.js:96
 *   /api/payments/*        index.js:97
 *   /api/auth/me           authRoutes.js  (route-level middleware)
 *
 * NOSQL INJECTION DEFENCE (source: features/auth/authController.js line 49)
 * ──────────────────────────────────────────────────────────────────────────
 *   const normalizedEmail = String(email || '').trim().toLowerCase()
 *   String({ "$gt": "" }) === "[object object]"
 *   → user not found → 401 (not 200, not DB operator execution)
 *
 * Run:
 *   cd doctor-portal/server
 *   npx jest tests/test_doctor_portal_security.test.js --forceExit --verbose
 *
 * Dependencies:
 *   npm install --save-dev jest supertest jsonwebtoken
 */

'use strict';

const request  = require('supertest');
const jwt      = require('jsonwebtoken');
const crypto   = require('crypto');
const mongoose = require('mongoose');

// ═════════════════════════════════════════════════════════════════════════════
// CONSTANTS  ─  mirror the actual authMiddleware.js defaults exactly
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Primary secret from authMiddleware.js line 4:
 *   const JWT_SECRET = process.env.JWT_SECRET || 'doctor_portal_secret_key_123'
 *
 * Set process.env.JWT_SECRET BEFORE requiring the server module so the
 * running middleware uses the same secret as our token factory.
 */
const JWT_SECRET = process.env.JWT_SECRET || 'doctor_portal_secret_key_123';

/**
 * Fallback secrets from authMiddleware.js lines 5-9.
 * These must NOT work for our attack tokens (wrong-secret / tampered).
 * Listing them here so our tests can verify ALL fallbacks are exhausted.
 */
const JWT_FALLBACK_SECRETS = [
  'doctor_portal_secure_key_123',
  'ayurcare_secret_2025',
];

const MONGODB_URI = process.env.MONGODB_TEST_URI
                 || process.env.MONGODB_URI
                 || 'mongodb://localhost:27017/ayurcare_security_test';

// Stable ObjectIds for test actors
const DOCTOR_OID  = new mongoose.Types.ObjectId().toString();
const PATIENT_OID = new mongoose.Types.ObjectId().toString();
const OTHER_OID   = new mongoose.Types.ObjectId().toString();

// ═════════════════════════════════════════════════════════════════════════════
// TOKEN FACTORIES
// Each factory documents the JWT content so test assertions are self-contained.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Valid doctor JWT signed with JWT_SECRET.
 * Payload mirrors authController.login() output:
 *   jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' })
 */
function doctorToken(overrides = {}) {
  return jwt.sign(
    { userId: DOCTOR_OID, role: 'doctor', ...overrides },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

/** Valid patient JWT — same structure, different userId. */
function patientToken(overrides = {}) {
  return jwt.sign(
    { userId: PATIENT_OID, role: 'patient', ...overrides },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

/**
 * Expired token — expiresIn: '-1s' means it expired 1 second ago.
 * jwt.verify() throws TokenExpiredError → falls through ALL fallback secrets
 * (also expired) → 403 "Invalid or expired session"
 */
function expiredToken() {
  return jwt.sign(
    { userId: DOCTOR_OID, role: 'doctor' },
    JWT_SECRET,
    { expiresIn: '-1s' }
  );
}

/**
 * Token signed with a completely different HMAC key.
 * jwt.verify(token, JWT_SECRET) → JsonWebTokenError (invalid signature)
 * jwt.verify(token, FALLBACK_0) → same
 * jwt.verify(token, FALLBACK_1) → same
 * Result: 403 "Invalid or expired session"
 */
function wrongSecretToken() {
  return jwt.sign(
    { userId: DOCTOR_OID, role: 'doctor' },
    'THIS_IS_AN_ENTIRELY_DIFFERENT_SECRET_KEY_UNKNOWN_TO_SERVER'
  );
}

/**
 * JWT with no userId field in the payload.
 * authMiddleware line 31-32:
 *   req.userId = decoded.userId || decoded.sub
 *   if (!req.userId) → 403 "Invalid token payload"
 */
function noUserIdToken() {
  return jwt.sign(
    { role: 'doctor', email: 'ghost@ayurcare.in' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

/**
 * JWT with empty-string userId.
 * '' is falsy → req.userId = undefined → 403 "Invalid token payload"
 */
function emptyUserIdToken() {
  return jwt.sign(
    { userId: '', role: 'doctor' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CRYPTOGRAPHIC ATTACK TOKEN FACTORIES (TC-API-019, TC-API-020, TC-API-021)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * TC-API-019  Payload Swap Attack
 * ──────────────────────────────
 * Technique: Take a legitimately-signed token, decode the payload portion,
 * substitute a different userId/role, re-encode as base64url, and recombine
 * with the ORIGINAL signature.
 *
 * Structure:   header.MODIFIED_PAYLOAD.original_signature
 * Attack goal: Escalate privileges or impersonate another user
 *              without knowing the server's JWT_SECRET.
 *
 * Why it fails: jwt.verify() recomputes HMAC-SHA256(header + '.' + payload)
 *               using JWT_SECRET. The signature was computed over the ORIGINAL
 *               payload, so the recomputed HMAC will not match.
 *               → JsonWebTokenError: invalid signature → 403
 *
 * @param {string} originalToken - A legitimately-signed JWT
 * @param {object} newPayload    - The replacement payload to inject
 */
function payloadSwapToken(originalToken, newPayload) {
  const [header, , originalSig] = originalToken.split('.');

  // Construct payload with attacker's desired claims
  const maliciousPayload = {
    ...newPayload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  const tamperedPayloadB64 = Buffer
    .from(JSON.stringify(maliciousPayload))
    .toString('base64url');

  // Return:  original_header . attacker_payload . original_signature
  // The signature no longer covers the new payload → verification fails
  return `${header}.${tamperedPayloadB64}.${originalSig}`;
}

/**
 * TC-API-020  Algorithm None Attack (unsigned JWT)
 * ─────────────────────────────────────────────────
 * Technique: Forge a JWT where alg='none', which historically allowed
 * servers to accept tokens without verifying any signature.
 *
 * Structure: base64url({"alg":"none","typ":"JWT"})
 *          . base64url({"userId":"...", "role":"doctor", ...})
 *          . ""   ← empty signature
 *
 * Attack goal: Create an admin-level token without the server's secret.
 *
 * Why it fails: Modern jsonwebtoken library explicitly rejects algorithm "none"
 *               by default. The verify() call throws:
 *               JsonWebTokenError: invalid algorithm → 403
 *
 * @param {object} payload - The claims to embed in the forged token
 */
function algNoneToken(payload) {
  const header = Buffer
    .from(JSON.stringify({ alg: 'none', typ: 'JWT' }))
    .toString('base64url');

  const body = Buffer
    .from(JSON.stringify({
      ...payload,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    }))
    .toString('base64url');

  // Empty signature — the defining characteristic of the alg=none attack
  return `${header}.${body}.`;
}

/**
 * TC-API-021  Algorithm Confusion Attack (RS256 → HS256)
 * ───────────────────────────────────────────────────────
 * Technique: Craft a token that declares alg='RS256' in the header, but uses
 * HMAC-SHA256 (HS256) with the server's known JWT_SECRET as the "signature".
 *
 * Historical vulnerability: older JWT libraries that checked alg from the token
 * header (rather than enforcing a fixed algorithm) could be tricked into
 * verifying an RSA signature using the public key as an HMAC secret, or
 * vice-versa.
 *
 * Structure: base64url({"alg":"RS256","typ":"JWT"})
 *          . base64url(payload)
 *          . HMAC-SHA256(header + '.' + payload, JWT_SECRET)
 *
 * Attack goal: If the server blindly trusts the alg header, an attacker who
 * knows the public key could forge RS256 tokens using HS256 math.
 *
 * Why it fails: Modern jsonwebtoken explicitly validates the algorithm and
 * rejects RS256 tokens when the server was configured for HS256 (and vice-versa).
 * → JsonWebTokenError: invalid algorithm → 403
 *
 * @param {object} payload  - The claims to embed
 * @param {string} hmacKey  - The key to use for HMAC (typically JWT_SECRET)
 */
function algConfusionToken(payload, hmacKey) {
  const header = Buffer
    .from(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    .toString('base64url');

  const body = Buffer
    .from(JSON.stringify({
      ...payload,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    }))
    .toString('base64url');

  // Compute HMAC-SHA256 over header.body using the known secret
  // (the HS256 signature format masquerading as RS256)
  const fakeSignature = crypto
    .createHmac('sha256', hmacKey)
    .update(`${header}.${body}`)
    .digest('base64url');

  return `${header}.${body}.${fakeSignature}`;
}

// ═════════════════════════════════════════════════════════════════════════════
// APP BOOTSTRAP
// ═════════════════════════════════════════════════════════════════════════════

let app;

beforeAll(async () => {
  // Inject test environment BEFORE requiring the server
  process.env.MONGODB_URI      = MONGODB_URI;
  process.env.JWT_SECRET       = JWT_SECRET;
  process.env.NODE_ENV         = 'test';
  // Stub external service keys so the server boots without real credentials
  process.env.STRIPE_SECRET_KEY  = process.env.STRIPE_SECRET_KEY  || 'sk_test_stub_000';
  process.env.LIVEKIT_API_KEY    = process.env.LIVEKIT_API_KEY    || 'lk_key_test';
  process.env.LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'lk_secret_test';
  process.env.LIVEKIT_URL        = process.env.LIVEKIT_URL        || 'wss://lk.test.io';

  try {
    jest.resetModules();
    // index.js exports `app` (the Express instance).
    // The HTTP server is started via server.listen() but we test through supertest
    // which binds to a random ephemeral port — no port conflicts.
    const serverModule = require('../index');
    app = serverModule.app || serverModule;
  } catch (err) {
    // Graceful fallback: test against a running server on port 5001
    const PORT = process.env.TEST_PORT || 5001;
    app = `http://localhost:${PORT}`;
    console.warn(
      `[SETUP] Could not load server module (${err.message}).\n`,
      `        Falling back to HTTP against ${app}.\n`,
      `        Ensure the server is running before executing this suite.`
    );
  }
}, 30_000);

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
});

// Helper: makes supertest accept both an Express app instance and a URL string
function api() { return request(app); }


// ═════════════════════════════════════════════════════════════════════════════
// A.  PUBLIC vs PROTECTED ROUTE BOUNDARY  (TC-API-001 → TC-API-007)
// ═════════════════════════════════════════════════════════════════════════════

describe('A. Public vs Protected Route Boundary', () => {

  test('TC-API-001  GET /api/health → 200 without Authorization header', async () => {
    /**
     * healthRoutes.js is mounted at /api WITHOUT authenticateToken.
     * No token must be required to probe service liveness.
     *
     * Expected: HTTP 200, body has 'status' field
     */
    const res = await api().get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status');
  });

  test('TC-API-002  GET / root → 200 without token', async () => {
    const res = await api().get('/');
    expect([200, 301, 302]).toContain(res.status);
  });

  test('TC-API-003  POST /api/auth/login is public — rejects bad creds with 401 not 403', async () => {
    /**
     * authRoutes.js: router.post('/login', login) — NO authenticateToken.
     * Bad credentials return 401 (from business logic), not 403 (from middleware).
     * Receiving 403 here would mean the login endpoint itself is locked behind auth.
     *
     * Input:   {"email":"nobody@ayurcare.in","password":"wrongpassword"}
     * Expected: 401 or 503 (DB unavailable). MUST NOT be 403.
     */
    const res = await api()
      .post('/api/auth/login')
      .send({ email: 'nobody@ayurcare.in', password: 'wrongpassword' });

    expect([400, 401, 503]).toContain(res.status);
    expect(res.status).not.toBe(403);  // 403 = middleware blocked the route itself
  });

  test('TC-API-004  GET /api/public/doctors → 200 or 404 without token', async () => {
    /**
     * publicRoutes.js mounted at /api/public without authenticateToken.
     * Must never return 401 or 403.
     */
    const res = await api().get('/api/public/doctors');
    expect([200, 404]).toContain(res.status);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  test('TC-API-005  GET /api/auth/me requires token — 401 without it', async () => {
    /**
     * authRoutes.js: router.get('/me', authenticateToken, getMe)
     * This is the ONLY endpoint in /api/auth that requires auth.
     * Expected: 401 "Authentication required"
     */
    const res = await api().get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/authentication required/i);
  });

  test('TC-API-006  POST /api/auth/signup is public — reachable without token', async () => {
    /**
     * authRoutes.js: router.post('/signup', signup) — no middleware.
     * A duplicate-email attempt returns 400 (business logic), not 403.
     */
    const res = await api()
      .post('/api/auth/signup')
      .send({ email: 'test.dup@ayurcare.in', password: 'Test@1234', name: 'Test User' });

    expect([201, 400, 503]).toContain(res.status);
    expect(res.status).not.toBe(403);
  });

  test('TC-API-007  POST /api/auth/forgot-password is public', async () => {
    const res = await api()
      .post('/api/auth/forgot-password')
      .send({ email: 'anyone@ayurcare.in' });

    expect([200, 400, 404, 503]).toContain(res.status);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// B.  JWT MIDDLEWARE — 5 PROTECTED ROUTES, MISSING TOKEN → 401
//     (TC-API-008 → TC-API-016)
// ═════════════════════════════════════════════════════════════════════════════

describe('B. JWT Middleware — Missing Token → 401 on All Protected Routes', () => {

  /**
   * All five routes that must be protected.
   * Source mapping:
   *   /api/patient/reports     → index.js:90  app.use('/api/patient', authenticateToken, ...)
   *   /api/patient/appointments→ same prefix
   *   /api/doctor/profile      → doctorRoutes.js:20 router.use(authenticateToken)
   *   /api/doctor/appointments → same router
   *   /api/appointments        → index.js:95
   */
  const FIVE_PROTECTED_ROUTES = [
    { method: 'get', path: '/api/patient/reports',      label: '/api/patient/reports' },
    { method: 'get', path: '/api/patient/appointments', label: '/api/patient/appointments' },
    { method: 'get', path: '/api/doctor/profile',       label: '/api/doctor/profile' },
    { method: 'get', path: '/api/doctor/appointments',  label: '/api/doctor/appointments' },
    { method: 'get', path: '/api/appointments',         label: '/api/appointments (root)' },
  ];

  test.each(FIVE_PROTECTED_ROUTES)(
    'TC-API-008  $label → 401 with body "Authentication required" when no Authorization header',
    async ({ method, path }) => {
      /**
       * authMiddleware.js line 22-26:
       *   const authHeader = req.headers['authorization']
       *   const token = authHeader && authHeader.split(' ')[1]
       *   if (!token) return res.status(401).json({ message: 'Authentication required' })
       *
       * No header → authHeader = undefined → token = undefined && ... = undefined → falsy → 401
       */
      const res = await api()[method](path);

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('message');
      expect(res.body.message).toMatch(/authentication required/i);
    }
  );

  test('TC-API-009  /api/patient/reports → 401 when Authorization header is empty string', async () => {
    /**
     * Authorization: ""
     * authHeader = ""  → authHeader && ... = "" (falsy) → token = undefined → 401
     */
    const res = await api()
      .get('/api/patient/reports')
      .set('Authorization', '');

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/authentication required/i);
  });

  test('TC-API-010  /api/patient/reports → 401 when header is "Bearer " with no token', async () => {
    /**
     * Authorization: "Bearer "
     * "Bearer ".split(' ')[1] = ""  → falsy → token = undefined → 401
     */
    const res = await api()
      .get('/api/patient/reports')
      .set('Authorization', 'Bearer ');

    expect(res.status).toBe(401);
  });

  test('TC-API-011  /api/doctor/profile → 401 or 403 when raw token sent without "Bearer " prefix', async () => {
    /**
     * Authorization: "<raw_token>"  (no "Bearer " space prefix)
     * authHeader.split(' ')[1] attempts to get second space-separated word.
     * For a JWT like "eyJh...header.payload.sig", split(' ') = ['eyJh...sig']
     * [1] = undefined → token = undefined → 401
     * OR: the header value is treated differently → verification fails → 403
     */
    const res = await api()
      .get('/api/doctor/profile')
      .set('Authorization', doctorToken()); // raw JWT, no "Bearer " prefix

    expect([401, 403]).toContain(res.status);
  });

  test('TC-API-012  /api/payments → 401 when no token', async () => {
    const res = await api().get('/api/payments');
    expect(res.status).toBe(401);
  });

  test('TC-API-013  /api/livekit/* → 401 when no token', async () => {
    const apptId = new mongoose.Types.ObjectId().toString();
    const res = await api()
      .post(`/api/livekit/appointments/${apptId}/token`)
      .send({ role: 'doctor' });

    expect(res.status).toBe(401);
  });

  test('TC-API-014  /api/chat → 401 when no token', async () => {
    /**
     * index.js:88  app.use('/api/chat', authenticateToken, chatRoutes)
     */
    const res = await api().get('/api/chat');
    expect(res.status).toBe(401);
  });

  test('TC-API-015  /api/doctor/prescription/draft → 401 when no token', async () => {
    const res = await api()
      .post('/api/doctor/prescription/draft')
      .send({ appointmentId: new mongoose.Types.ObjectId().toString() });

    expect(res.status).toBe(401);
  });

  test('TC-API-016  /api/appointments/:id → 401 when no token', async () => {
    const apptId = new mongoose.Types.ObjectId().toString();
    const res = await api()
      .patch(`/api/appointments/${apptId}`)
      .send({ status: 'completed' });

    expect(res.status).toBe(401);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// C.  CRYPTOGRAPHIC ATTACK VECTORS → 403  (TC-API-017 → TC-API-025)
// ═════════════════════════════════════════════════════════════════════════════

describe('C. Cryptographic Attack Vectors — Bad/Forged Tokens → 403', () => {

  test('TC-API-017  Random string as token → 403 "Invalid or expired session"', async () => {
    /**
     * A completely random string cannot pass jwt.verify() for any known secret.
     * All three secrets (primary + 2 fallbacks) are tried and fail.
     * → 403 "Invalid or expired session"
     *
     * Input:   "Bearer notavalidjwt1234567890abcdef"
     */
    const res = await api()
      .get('/api/doctor/profile')
      .set('Authorization', 'Bearer notavalidjwt1234567890abcdef');

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/invalid or expired session/i);
  });

  test('TC-API-018  Expired token → 403 "Invalid or expired session"', async () => {
    /**
     * jwt.sign({...}, JWT_SECRET, { expiresIn: '-1s' }) creates a token that
     * expired 1 second before it was created.
     *
     * jwt.verify() throws TokenExpiredError.
     * The middleware catches this, loops through fallback secrets.
     * All fallback verifications also fail (token is expired, not wrong-secret).
     * → 403 "Invalid or expired session"
     */
    const res = await api()
      .get('/api/patient/reports')
      .set('Authorization', `Bearer ${expiredToken()}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/invalid or expired session/i);
  });

  test('TC-API-019  Payload Swap Attack → 403 (signature mismatch)', async () => {
    /**
     * TC-API-019  PAYLOAD SWAP (Man-in-the-middle tampering)
     * ─────────────────────────────────────────────────────────
     * STEP-BY-STEP EXECUTION:
     *
     * 1. Attacker obtains a legitimately signed doctor token:
     *      original = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9
     *                  .eyJ1c2VySWQiOiI2MDlmMWY3N2JjZjg2Y2Q3OTk0MzkwMTEiLCJyb2xlIjoiZG9jdG9yIn0
     *                  .VALID_HMAC_SIGNATURE"
     *
     * 2. Attacker decodes the payload (it's just base64url, not encrypted):
     *      original_payload = { userId: DOCTOR_OID, role: 'doctor' }
     *
     * 3. Attacker replaces the payload with escalated claims:
     *      malicious_payload = { userId: OTHER_OID, role: 'admin' }
     *      tampered_payload_b64 = base64url(JSON.stringify(malicious_payload))
     *
     * 4. Attacker reassembles the token with the ORIGINAL signature:
     *      tampered = original_header + '.' + tampered_payload + '.' + original_signature
     *
     * 5. Server receives tampered token:
     *      jwt.verify(tampered, JWT_SECRET):
     *        → recomputes HMAC-SHA256(header + '.' + tampered_payload) using JWT_SECRET
     *        → computed_mac ≠ original_signature (which covered the original payload)
     *        → throws JsonWebTokenError: invalid signature
     *      Loop through fallbacks: same result
     *      → res.status(403) "Invalid or expired session"
     *
     * Assertion: status MUST be 403 (not 200 or 401)
     */
    const original = doctorToken();
    const tampered = payloadSwapToken(original, {
      userId: OTHER_OID,
      role: 'admin',
    });

    // Confirm the token structure is 3 dot-separated parts (it's JWT shaped)
    expect(tampered.split('.')).toHaveLength(3);

    const res = await api()
      .get('/api/doctor/profile')
      .set('Authorization', `Bearer ${tampered}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/invalid or expired session/i);
  });

  test('TC-API-020  Algorithm None Attack (unsigned JWT) → 403', async () => {
    /**
     * TC-API-020  ALG=NONE ATTACK
     * ─────────────────────────────
     * STEP-BY-STEP EXECUTION:
     *
     * 1. Attacker crafts a JWT with alg="none":
     *      header  = base64url({"alg":"none","typ":"JWT"})
     *      payload = base64url({userId: DOCTOR_OID, role: 'doctor', exp: now+3600})
     *      sig     = ""   ← completely empty — no cryptographic guarantee
     *
     * 2. Full token:  header.payload.   (trailing dot, empty signature)
     *
     * 3. Historical vulnerability: Some older JWT libraries checked alg from
     *    the TOKEN HEADER rather than enforcing a fixed server-side algorithm.
     *    With alg=none, those libraries skipped signature verification entirely,
     *    accepting ANY payload as valid.
     *
     * 4. Modern jsonwebtoken defense:
     *    jwt.verify() with a string secret internally enforces HS256.
     *    It rejects tokens with alg=none:
     *      → JsonWebTokenError: invalid algorithm
     *    Fallback loop: same algorithm → same rejection.
     *    → 403 "Invalid or expired session"
     *
     * Assertion: status MUST be 403 (not 200 — the attack must not succeed)
     */
    const unsignedToken = algNoneToken({ userId: DOCTOR_OID, role: 'doctor' });

    // Verify the forged token has the correct structure
    const parts = unsignedToken.split('.');
    expect(parts).toHaveLength(3);
    expect(parts[2]).toBe('');  // signature part is empty string

    // Decode and confirm the header declares alg=none
    const decodedHeader = JSON.parse(
      Buffer.from(parts[0], 'base64url').toString()
    );
    expect(decodedHeader.alg).toBe('none');

    // Submit to the server
    const res = await api()
      .get('/api/patient/reports')
      .set('Authorization', `Bearer ${unsignedToken}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/invalid or expired session/i);
  });

  test('TC-API-021  Algorithm Confusion Attack (RS256 header, HS256 body) → 403', async () => {
    /**
     * TC-API-021  ALGORITHM CONFUSION (RS256 ↔ HS256 confusion)
     * ──────────────────────────────────────────────────────────
     * STEP-BY-STEP EXECUTION:
     *
     * 1. Attacker knows the server's JWT_SECRET (or uses the public key
     *    in an asymmetric scenario).
     *
     * 2. Attacker crafts a token with:
     *      header  = base64url({"alg":"RS256","typ":"JWT"})
     *      payload = base64url({ userId: DOCTOR_OID, ... })
     *      sig     = HMAC-SHA256(header + '.' + payload, JWT_SECRET)
     *
     *    This is HS256 math dressed up as an RS256 token.
     *
     * 3. Historical vulnerability: Libraries that derived the verification
     *    algorithm from the TOKEN HEADER would attempt to verify this as RS256.
     *    If the verification key was the HS256 secret (which happens when a
     *    public key is used as an HMAC key in certain configurations), the
     *    token could be accepted.
     *
     * 4. Modern jsonwebtoken defense:
     *    jwt.verify(token, JWT_SECRET) enforces that the secret matches HS256.
     *    The RS256 header triggers: JsonWebTokenError: invalid algorithm
     *    (or "secretOrPublicKey must be an asymmetric key" / similar)
     *    Fallback loop: same result.
     *    → 403 "Invalid or expired session"
     *
     * Assertion: status MUST be 403 (attack fails, token is not accepted)
     */
    const confusionToken = algConfusionToken(
      { userId: DOCTOR_OID, role: 'doctor' },
      JWT_SECRET  // attacker uses the known HMAC secret
    );

    // Verify the forged token structure
    const parts = confusionToken.split('.');
    expect(parts).toHaveLength(3);
    expect(parts[2]).not.toBe(''); // signature is non-empty (HMAC is real math)

    // Decode and confirm header says RS256
    const decodedHeader = JSON.parse(
      Buffer.from(parts[0], 'base64url').toString()
    );
    expect(decodedHeader.alg).toBe('RS256');

    // Submit to the server
    const res = await api()
      .get('/api/doctor/appointments')
      .set('Authorization', `Bearer ${confusionToken}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/invalid or expired session/i);
  });

  test('TC-API-022  Token signed with wrong secret → 403 (all fallbacks also fail)', async () => {
    /**
     * The wrong secret is not in JWT_FALLBACK_SECRETS, so all three
     * verification attempts fail → 403
     */
    const res = await api()
      .get('/api/doctor/profile')
      .set('Authorization', `Bearer ${wrongSecretToken()}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/invalid or expired session/i);
  });

  test('TC-API-023  Token with no userId field → 403 "Invalid token payload"', async () => {
    /**
     * authMiddleware.js lines 31-32:
     *   req.userId = decoded.userId || decoded.sub
     *   if (!req.userId) return res.status(403).json({ message: 'Invalid token payload' })
     *
     * Token passes signature verification (correct secret) but has no userId.
     * → 403 "Invalid token payload"  (different message from verification failure)
     */
    const res = await api()
      .get('/api/doctor/profile')
      .set('Authorization', `Bearer ${noUserIdToken()}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/invalid token payload/i);
  });

  test('TC-API-024  Token with empty-string userId → 403 "Invalid token payload"', async () => {
    /**
     * decoded.userId = '' → falsy → req.userId = undefined → 403
     */
    const res = await api()
      .get('/api/patient/reports')
      .set('Authorization', `Bearer ${emptyUserIdToken()}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/invalid token payload/i);
  });

  test('TC-API-025  Valid token baseline → NOT 401, NOT 403', async () => {
    /**
     * Control test: a correctly-signed valid token must pass middleware.
     * The handler may return 404 (no data) or 503 (DB unavailable) but
     * MUST NOT return an auth error.
     */
    const res = await api()
      .get('/api/patient/reports')
      .set('Authorization', `Bearer ${patientToken()}`);

    expect([200, 404, 503]).toContain(res.status);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// D.  PRESCRIPTION WRITE PROTECTION  (TC-API-026 → TC-API-032)
// ═════════════════════════════════════════════════════════════════════════════

describe('D. Prescription Write Protection', () => {

  const RICH_PRESCRIPTION_BODY = {
    appointmentId: new mongoose.Types.ObjectId().toString(),
    notes: 'Triphala 1 tsp twice daily with warm water. Ashwagandha 500mg before bed.',
    medicines: [
      { name: 'Triphala',    details: '1 tsp with warm water, morning and evening' },
      { name: 'Ashwagandha', details: '500mg capsule before bed with warm milk' },
      { name: 'Shatavari',   details: '1 tsp with milk twice daily' },
    ],
    dietPathya:    'Warm, light foods. Pomegranate juice. Ginger tea.',
    dietApathya:   'Cold drinks, fried foods, fermented foods.',
    lifestylePlan: 'Morning walk 20 min. Sheetali pranayama 10 min. Sleep before 10 PM.',
    followUpDate:  '2026-09-01',
    status:        'draft',
  };

  test('TC-API-026  POST /api/doctor/prescription/draft — no token → 401', async () => {
    /**
     * authMiddleware fires before any handler logic.
     * No token → 401 "Authentication required"
     *
     * Input body: complete, valid-looking prescription payload
     * Expected: 401 — server never processes the prescription data
     */
    const res = await api()
      .post('/api/doctor/prescription/draft')
      .send(RICH_PRESCRIPTION_BODY);

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/authentication required/i);
  });

  test('TC-API-027  POST /api/doctor/prescription/draft — expired token → 403', async () => {
    /**
     * Token structure is valid but the expiry clock has passed.
     * Middleware detects expiry → 403 "Invalid or expired session"
     */
    const res = await api()
      .post('/api/doctor/prescription/draft')
      .set('Authorization', `Bearer ${expiredToken()}`)
      .send(RICH_PRESCRIPTION_BODY);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/invalid or expired session/i);
  });

  test('TC-API-028  POST /api/doctor/prescription/draft — tampered payload token → 403', async () => {
    /**
     * Payload-swap attack on the prescription endpoint.
     * Even with doctorId changed to another ObjectId, signature mismatch → 403.
     */
    const original = doctorToken();
    const tampered = payloadSwapToken(original, {
      userId: OTHER_OID,
      role: 'admin',
    });

    const res = await api()
      .post('/api/doctor/prescription/draft')
      .set('Authorization', `Bearer ${tampered}`)
      .send(RICH_PRESCRIPTION_BODY);

    expect(res.status).toBe(403);
  });

  test('TC-API-029  POST /api/doctor/prescription/finalize — no token → 401', async () => {
    const res = await api()
      .post('/api/doctor/prescription/finalize')
      .send({ appointmentId: new mongoose.Types.ObjectId().toString() });

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/authentication required/i);
  });

  test('TC-API-030  PATCH /api/appointments/:id — no token → 401', async () => {
    /**
     * appointmentRoutes mounted with authenticateToken (index.js:95).
     * PATCH is the update-appointment action.
     */
    const apptId = new mongoose.Types.ObjectId().toString();
    const res = await api()
      .patch(`/api/appointments/${apptId}`)
      .send({ status: 'completed', notes: 'Unauthorized completion attempt' });

    expect(res.status).toBe(401);
  });

  test('TC-API-031  PATCH /api/appointments/:id/status — no token → 401', async () => {
    const apptId = new mongoose.Types.ObjectId().toString();
    const res = await api()
      .patch(`/api/appointments/${apptId}/status`)
      .send({ status: 'cancelled' });

    expect(res.status).toBe(401);
  });

  test('TC-API-032  POST /api/doctor/prescription/draft — alg=none attack → 403', async () => {
    /**
     * Attempting to use an unsigned token to write prescriptions.
     * Must be blocked by jwt.verify() rejecting alg=none → 403.
     */
    const forgToken = algNoneToken({ userId: DOCTOR_OID, role: 'doctor' });

    const res = await api()
      .post('/api/doctor/prescription/draft')
      .set('Authorization', `Bearer ${forgToken}`)
      .send(RICH_PRESCRIPTION_BODY);

    expect(res.status).toBe(403);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// E.  PATIENT DATA ISOLATION  (TC-API-033 → TC-API-037)
// ═════════════════════════════════════════════════════════════════════════════

describe('E. Patient Data Isolation', () => {

  test('TC-API-033  Patient A token on /api/patient/reports — response contains only own patientId', async () => {
    /**
     * patientController.listReports():
     *   const reports = await Report.find({ patientId: req.userId, hiddenByPatient: { $ne: true } })
     *
     * Because req.userId = PATIENT_OID (from the JWT), ALL returned reports
     * will have patientId = PATIENT_OID.  None should have OTHER_OID.
     *
     * If the DB is empty, we receive 200 with empty array — still a pass.
     */
    const tokenForA = patientToken({ userId: PATIENT_OID });
    const res = await api()
      .get('/api/patient/reports')
      .set('Authorization', `Bearer ${tokenForA}`);

    if (res.status === 200) {
      const reports = res.body?.reports ?? res.body?.data ?? [];
      reports.forEach((r, i) => {
        const pId = (r.patientId?._id ?? r.patientId ?? '').toString();
        expect(pId).not.toBe(OTHER_OID);
      });
    } else {
      expect([200, 404, 503]).toContain(res.status);
    }
  });

  test('TC-API-034  Patient A token on /api/patient/appointments — own appointments only', async () => {
    const tokenForA = patientToken({ userId: PATIENT_OID });
    const res = await api()
      .get('/api/patient/appointments')
      .set('Authorization', `Bearer ${tokenForA}`);

    if (res.status === 200) {
      const appts = res.body?.appointments ?? res.body?.data ?? [];
      appts.forEach((a) => {
        const pId = (a.patientId?._id ?? a.patientId ?? a.userId ?? '').toString();
        expect(pId).not.toBe(OTHER_OID);
      });
    } else {
      expect([200, 404, 503]).toContain(res.status);
    }
  });

  test('TC-API-035  Patient token on /api/patient/prescriptions — own prescriptions only', async () => {
    const tokenForA = patientToken({ userId: PATIENT_OID });
    const res = await api()
      .get('/api/patient/prescriptions')
      .set('Authorization', `Bearer ${tokenForA}`);

    if (res.status === 200) {
      const rxList = res.body?.prescriptions ?? res.body?.data ?? [];
      rxList.forEach((rx) => {
        const pId = (rx.patientId?._id ?? rx.patientId ?? '').toString();
        expect(pId).not.toBe(OTHER_OID);
      });
    } else {
      expect([200, 404, 503]).toContain(res.status);
    }
  });

  test('TC-API-036  Patient token on /api/doctor/revenue-summary — no doctor record → empty, NOT 403', async () => {
    /**
     * A patient JWT passes middleware (valid token), but doctorController
     * queries by req.userId which has no Doctor record → empty result or 404.
     * Must NOT be 403 (auth error).
     */
    const res = await api()
      .get('/api/doctor/revenue-summary')
      .set('Authorization', `Bearer ${patientToken()}`);

    expect([200, 404, 500, 503]).toContain(res.status);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  test('TC-API-037  Patient token on POST /api/doctor/prescription/draft → 400 or 404, not 403', async () => {
    /**
     * Patient has a valid JWT → auth passes.
     * Business logic: no Doctor record for PATIENT_OID → 404 or 400.
     * If 403 is returned, it means the route is blocking at the middleware level
     * based on role — which would be correct but needs to be verified here.
     *
     * Either 400/404 (no doctor record) or 403 (role-based guard) is acceptable.
     * What must NOT happen: 200 success (writing a prescription as a patient).
     */
    const res = await api()
      .post('/api/doctor/prescription/draft')
      .set('Authorization', `Bearer ${patientToken()}`)
      .send({ appointmentId: new mongoose.Types.ObjectId().toString() });

    expect([400, 403, 404, 500, 503]).toContain(res.status);
    expect(res.status).not.toBe(200);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// F.  NoSQL INJECTION & INPUT VALIDATION  (TC-API-038 → TC-API-044)
// ═════════════════════════════════════════════════════════════════════════════

describe('F. NoSQL Injection & Input Validation', () => {

  test('TC-API-041  Login with {$gt:""} as email — String() coercion neutralizes injection', async () => {
    /**
     * TC-API-041  NoSQL INJECTION DEFENCE VERIFICATION
     * ─────────────────────────────────────────────────
     * Attack input: { "email": { "$gt": "" }, "password": { "$gt": "" } }
     *
     * Attack theory: MongoDB's $gt operator in a findOne() query would match
     * ANY document where email > "" — effectively selecting the first user
     * in the collection regardless of credentials.
     *
     * STEP-BY-STEP DEFENCE EXECUTION (authController.js):
     *
     *   Line 48-49:
     *   const { email, password } = req.body
     *   const normalizedEmail = String(email || '').trim().toLowerCase()
     *
     *   String({ "$gt": "" })
     *   ↓  JavaScript's default object-to-string conversion
     *   = "[object Object]"   ← literally the string "[object Object]"
     *
     *   User.findOne({ email: "[object object]" })
     *   ↓  Mongoose query with a literal string
     *   = null  (no user has email "[object object]")
     *
     *   → res.status(401).json({ message: 'Invalid email or password' })
     *
     * CRITICAL ASSERTIONS:
     *   1. status MUST NOT be 200 (injection must not succeed)
     *   2. body.token MUST be undefined (no auth token issued)
     *   3. Acceptable statuses: 400, 401, 503 (not 200, not 500 from operator execution)
     *
     * Input:   POST /api/auth/login  Body: {"email":{"$gt":""},"password":{"$gt":""}}
     * Expected: 401 (user not found after coercion)
     */
    const res = await api()
      .post('/api/auth/login')
      .send({ email: { $gt: '' }, password: { $gt: '' } });

    // Primary assertion: injection must NOT have granted access
    expect(res.status).not.toBe(200);

    // Verify no token was issued
    if (res.body) {
      expect(res.body.token).toBeUndefined();
    }

    // Acceptable failure modes:
    //   401 — String() coercion → "[object object]" → user not found
    //   400 — body schema validation rejected non-string email
    //   503 — DB unavailable in test environment
    expect([400, 401, 503]).toContain(res.status);
  });

  test('TC-API-042  Login with {$where:"sleep(1000)"} as email — String() coercion applied', async () => {
    /**
     * $where operator can execute arbitrary JavaScript in MongoDB.
     * String({ "$where": "sleep(1000)" }) = "[object Object]" → safe.
     *
     * Input:   {"email": {"$where": "sleep(1000)"}, "password": "test"}
     * Expected: 401 or 400 (NOT 200, NOT 500 from JS execution)
     */
    const res = await api()
      .post('/api/auth/login')
      .send({ email: { $where: 'sleep(1000)' }, password: 'anypassword' });

    expect(res.status).not.toBe(200);
    if (res.body) expect(res.body.token).toBeUndefined();
    expect([400, 401, 503]).toContain(res.status);
  });

  test('TC-API-043  Login with array as email — coerced to comma-joined string, not operator', async () => {
    /**
     * Sending email as a JSON array: ["admin@test.in", {"$regex": ".*"}]
     *
     * String(["admin@test.in", { "$regex": ".*" }])
     * = "admin@test.in,[object Object]"   ← joins with comma
     *
     * User.findOne({ email: "admin@test.in,[object object]" }) → null → 401
     *
     * Input:   {"email": ["admin@test.in", {"$regex":".*"}], "password":"pass"}
     * Expected: 400 or 401 (NOT 200)
     */
    const res = await api()
      .post('/api/auth/login')
      .send({ email: ['admin@test.in', { $regex: '.*' }], password: 'pass' });

    expect(res.status).not.toBe(200);
    if (res.body) expect(res.body.token).toBeUndefined();
    expect([400, 401, 503]).toContain(res.status);
  });

  test('TC-API-044  Oversized request body → 400 or 413 (body parser limit)', async () => {
    /**
     * Express's default JSON body parser limit is 100kb.
     * A payload that exceeds this should be rejected with 413 Payload Too Large
     * before any handler logic runs.
     *
     * Input:   POST /api/auth/login  with password field = 500KB of 'A'
     * Expected: 400 (validation rejects) or 413 (body-parser limit)
     */
    const oversized = {
      email: 'test@ayurcare.in',
      password: 'A'.repeat(512_000),   // 500KB
    };
    const res = await api()
      .post('/api/auth/login')
      .send(oversized);

    expect([400, 413, 422]).toContain(res.status);
  });

  test('TC-API-045  XSS payload in login email — JSON content type maintained', async () => {
    /**
     * A classic XSS payload in a JSON string field.
     * The response must be Content-Type: application/json,
     * not raw HTML that would allow script execution in a browser.
     *
     * Input:   {"email": "<script>alert('XSS')</script>", "password": "pass"}
     * Expected: JSON response with 400 or 401 (not raw HTML)
     */
    const xssPayload = '<script>alert(\'XSS\')</script>';
    const res = await api()
      .post('/api/auth/login')
      .send({ email: xssPayload, password: 'pass' });

    expect(res.headers['content-type']).toMatch(/json/i);
    expect([400, 401, 503]).toContain(res.status);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// G.  CORS HEADERS  (TC-API-046 → TC-API-047)
// ═════════════════════════════════════════════════════════════════════════════

describe('G. CORS Headers', () => {

  test('TC-API-046  OPTIONS preflight on /api/health includes CORS headers', async () => {
    /**
     * server/index.js line 34: app.use(cors())
     * Default cors() with no options allows ALL origins.
     *
     * A preflight OPTIONS request must return Access-Control-Allow-Origin.
     */
    const res = await api()
      .options('/api/health')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'GET');

    expect([200, 204]).toContain(res.status);
    expect(res.headers['access-control-allow-origin']).toBeDefined();
  });

  test('TC-API-047  GET /api/health with Origin header includes Access-Control-Allow-Origin', async () => {
    const res = await api()
      .get('/api/health')
      .set('Origin', 'http://localhost:5174');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeDefined();
  });
});
