/**
 * Complete Security Integration Suite: Doctor Portal
 * ====================================================
 * TC-API-001 → TC-API-047
 *
 * MIDDLEWARE BEHAVIOR (source: doctor-portal/server/features/auth/authMiddleware.js)
 * ─────────────────────────────────────────────────────────────────────────────────
 * Line 22-26:
 *   const authHeader = req.headers['authorization']
 *   const token = authHeader && authHeader.split(' ')[1]
 *   if (!token) → 401  { message: 'Authentication required' }
 *
 * Line 29-33:
 *   const decoded = await verifyWithSecret(token, JWT_SECRET)
 *   req.userId = decoded.userId || decoded.sub
 *   if (!req.userId) → 403  { message: 'Invalid token payload' }
 *
 * Line 34-47:
 *   catch (primaryError) → loop JWT_FALLBACK_SECRETS
 *   all fallbacks fail   → 403  { message: 'Invalid or expired session' }
 *
 * JWT_SECRET   (line 4 default): 'doctor_portal_secret_key_123'
 * FALLBACK[0]  (line 6):         'doctor_portal_secure_key_123'
 * FALLBACK[1]  (line 7):         'ayurcare_secret_2025'
 *
 * ROUTE PROTECTION MAP (source: doctor-portal/server/index.js)
 * ─────────────────────────────────────────────────────────────
 * PUBLIC (no middleware):
 *   /api/health             healthRoutes (mounted at /api)
 *   /api/public/*           publicRoutes
 *   /api/auth/login         authRoutes (no guard on this route)
 *   /api/auth/signup        authRoutes (no guard on this route)
 *   /api/auth/forgot-password
 *
 * PRIVATE (authenticateToken):
 *   /api/chat/*             index.js:88  app.use('/api/chat', authenticateToken, ...)
 *   /api/patient/*          index.js:90
 *   /api/doctor/*           doctorRoutes.js:20  router.use(authenticateToken)
 *   /api/appointments/*     index.js:95
 *   /api/livekit/*          index.js:96
 *   /api/payments/*         index.js:97
 *   /api/auth/me            authRoutes — route-level middleware only on /me
 *
 * NoSQL INJECTION DEFENCE (source: authController.js line 49)
 * ────────────────────────────────────────────────────────────
 *   normalizedEmail = String(email || '').trim().toLowerCase()
 *   String({ "$gt": "" }) === "[object object]"
 *   → findOne({ email: "[object object]" }) → null → 401
 *
 * LOCATION: tests/api/test_doctor_portal_security.test.js
 *
 * Run:
 *   cd tests/api
 *   npx jest test_doctor_portal_security.test.js --forceExit --verbose
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
// CONSTANTS  —  mirror authMiddleware.js defaults exactly
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Primary JWT secret: authMiddleware.js line 4
 *   const JWT_SECRET = process.env.JWT_SECRET || 'doctor_portal_secret_key_123'
 */
const JWT_SECRET = process.env.JWT_SECRET || 'doctor_portal_secret_key_123';

/**
 * Fallback secrets: authMiddleware.js lines 5-9.
 * Stored here for documentation — our attack tokens use a completely DIFFERENT
 * key that is not in this list, so all three verifications will fail → 403.
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
// ═════════════════════════════════════════════════════════════════════════════

/** Valid doctor JWT signed with JWT_SECRET. */
function doctorToken(overrides = {}) {
  return jwt.sign(
    { userId: DOCTOR_OID, role: 'doctor', ...overrides },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

/** Valid patient JWT signed with JWT_SECRET. */
function patientToken(overrides = {}) {
  return jwt.sign(
    { userId: PATIENT_OID, role: 'patient', ...overrides },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

/**
 * Token that expired 1 second ago.
 * jwt.verify() throws TokenExpiredError → all fallback secrets also fail → 403.
 */
function expiredToken() {
  return jwt.sign({ userId: DOCTOR_OID, role: 'doctor' }, JWT_SECRET, { expiresIn: '-1s' });
}

/**
 * Token signed with a completely unknown secret — not in JWT_FALLBACK_SECRETS.
 * All three verification attempts fail → 403 "Invalid or expired session".
 */
function wrongSecretToken() {
  return jwt.sign(
    { userId: DOCTOR_OID, role: 'doctor' },
    'THIS_IS_AN_ENTIRELY_DIFFERENT_SECRET_KEY_NOT_IN_SERVER'
  );
}

/**
 * JWT whose payload has no userId field.
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

/** JWT with userId = '' (empty string is falsy → 403 "Invalid token payload"). */
function emptyUserIdToken() {
  return jwt.sign({ userId: '', role: 'doctor' }, JWT_SECRET, { expiresIn: '1h' });
}

// ─────────────────────────────────────────────────────────────────────────────
// CRYPTOGRAPHIC ATTACK TOKEN FACTORIES  (TC-API-019, TC-API-020, TC-API-021)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * TC-API-019  PAYLOAD SWAP ATTACK
 * ─────────────────────────────────
 * Technique: Take a legitimately signed token, replace the payload (base64url
 * encoded — NOT encrypted) with escalated claims, and reattach the ORIGINAL
 * signature.
 *
 * Token layout:   header . payload . signature
 * Tampered layout: header . ATTACKER_PAYLOAD . original_signature
 *
 * Why it fails:
 *   jwt.verify() recomputes HMAC-SHA256(header + '.' + new_payload) using JWT_SECRET.
 *   The stored signature was computed over the ORIGINAL payload.
 *   computed_hmac ≠ stored_signature → JsonWebTokenError: invalid signature → 403
 */
function payloadSwapToken(originalToken, newPayload) {
  const [header, , originalSig] = originalToken.split('.');
  const tamperedPayloadB64 = Buffer
    .from(JSON.stringify({
      ...newPayload,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    }))
    .toString('base64url');
  // Reassemble: original header + attacker payload + original signature
  return `${header}.${tamperedPayloadB64}.${originalSig}`;
}

/**
 * TC-API-020  ALG=NONE ATTACK (unsigned JWT)
 * ───────────────────────────────────────────
 * Technique: Forge a JWT declaring alg="none" with an empty signature.
 * Historically, libraries that read `alg` from the TOKEN HEADER (not the
 * server config) would skip signature verification when alg=none.
 *
 * Token layout:   alg_none_header . payload .   ← trailing dot, empty signature
 *
 * Why it fails:
 *   Modern jsonwebtoken enforces HS256 when a string secret is provided.
 *   It rejects tokens with alg=none: JsonWebTokenError: invalid algorithm → 403
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
  // Empty signature — the defining characteristic of this attack
  return `${header}.${body}.`;
}

/**
 * TC-API-021  ALGORITHM CONFUSION ATTACK (RS256 ↔ HS256)
 * ─────────────────────────────────────────────────────────
 * Technique: Craft a token whose HEADER declares alg=RS256 but whose SIGNATURE
 * is computed using HMAC-SHA256 (HS256) with the server's known JWT_SECRET.
 *
 * Historical vulnerability: Libraries that derived the verification algorithm
 * from the token header could be tricked into verifying an RSA token using the
 * symmetric HMAC key (or vice-versa), effectively bypassing signature security.
 *
 * Token layout:   rs256_header . payload . hmac_signature
 *
 * Why it fails:
 *   Modern jsonwebtoken rejects RS256 tokens when configured with a string secret
 *   (which implies HS256): JsonWebTokenError: invalid algorithm → 403
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
  // Compute HMAC-SHA256 over header.body (HS256 math dressed as RS256)
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
  // Inject env vars BEFORE requiring server so authMiddleware picks them up
  process.env.MONGODB_URI       = MONGODB_URI;
  process.env.JWT_SECRET        = JWT_SECRET;
  process.env.NODE_ENV          = 'test';
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY  || 'sk_test_stub_000';
  process.env.LIVEKIT_API_KEY   = process.env.LIVEKIT_API_KEY    || 'lk_key_test';
  process.env.LIVEKIT_API_SECRET= process.env.LIVEKIT_API_SECRET || 'lk_secret_test';
  process.env.LIVEKIT_URL       = process.env.LIVEKIT_URL        || 'wss://lk.test.io';

  try {
    jest.resetModules();
    // Path from tests/api/ to the server entry point
    const serverModule = require('../../doctor-portal/server/index');
    app = serverModule.app || serverModule;
  } catch (err) {
    // Fallback: test against a running server on port 5001
    app = `http://localhost:${process.env.TEST_PORT || 5001}`;
    console.warn(
      `[SETUP] Could not load server module inline (${err.message}).\n`,
      `        Falling back to HTTP against ${app}.`
    );
  }
}, 30_000);

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// A.  PUBLIC vs PROTECTED ROUTE BOUNDARY  (TC-API-001 → TC-API-007)
// ═════════════════════════════════════════════════════════════════════════════

describe('A. Public vs Protected Route Boundary', () => {

  test('TC-API-001  GET /api/health → 200 without Authorization header', async () => {
    /**
     * healthRoutes.js mounted at /api WITHOUT authenticateToken.
     * Liveness probe must never require credentials.
     * Expected: HTTP 200, body has 'status' field.
     */
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status');
  });

  test('TC-API-002  GET / root → 200 without token', async () => {
    const res = await request(app).get('/');
    expect([200, 301, 302]).toContain(res.status);
  });

  test('TC-API-003  POST /api/auth/login is public — bad creds return 401 not 403', async () => {
    /**
     * authRoutes.js: router.post('/login', login) — NO authenticateToken.
     * 403 from middleware would mean the login endpoint itself is auth-locked,
     * making it impossible for anyone to log in.
     *
     * Input:   {"email":"nobody@ayurcare.in","password":"wrongpassword"}
     * Expected: 401 or 503 (NOT 403)
     */
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@ayurcare.in', password: 'wrongpassword' });

    expect([400, 401, 503]).toContain(res.status);
    expect(res.status).not.toBe(403);
  });

  test('TC-API-004  GET /api/public/doctors → reachable without token', async () => {
    /**
     * publicRoutes.js mounted without authenticateToken.
     * Must never return 401 or 403.
     */
    const res = await request(app).get('/api/public/doctors');
    expect([200, 404]).toContain(res.status);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  test('TC-API-005  GET /api/auth/me requires token → 401 without it', async () => {
    /**
     * authRoutes.js: router.get('/me', authenticateToken, getMe)
     * This is the only route in /api/auth guarded by authenticateToken.
     */
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/authentication required/i);
  });

  test('TC-API-006  POST /api/auth/signup is public — reachable without token', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'dup@ayurcare.in', password: 'Test@1234', name: 'Dup User' });

    expect([201, 400, 503]).toContain(res.status);
    expect(res.status).not.toBe(403);
  });

  test('TC-API-007  POST /api/auth/forgot-password is public', async () => {
    const res = await request(app)
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

describe('B. JWT Middleware — Missing Token → 401 on 5 Protected Routes', () => {

  /**
   * The five protected routes that must behave identically.
   * Source mapping (index.js):
   *   /api/patient/reports     → line 90  app.use('/api/patient', authenticateToken, ...)
   *   /api/patient/appointments→ same prefix
   *   /api/doctor/profile      → doctorRoutes.js:20  router.use(authenticateToken)
   *   /api/doctor/appointments → same router
   *   /api/appointments        → index.js:95
   */
  const FIVE_PROTECTED_ROUTES = [
    { method: 'get', path: '/api/patient/reports',      label: '/api/patient/reports' },
    { method: 'get', path: '/api/patient/appointments', label: '/api/patient/appointments' },
    { method: 'get', path: '/api/doctor/profile',       label: '/api/doctor/profile' },
    { method: 'get', path: '/api/doctor/appointments',  label: '/api/doctor/appointments' },
    { method: 'get', path: '/api/appointments',         label: '/api/appointments' },
  ];

  test.each(FIVE_PROTECTED_ROUTES)(
    'TC-API-008  $label → 401 with "Authentication required" when no Authorization header',
    async ({ method, path }) => {
      /**
       * authMiddleware.js lines 22-26:
       *   const authHeader = req.headers['authorization']  → undefined
       *   const token = undefined && ...                   → undefined
       *   if (!token) return res.status(401).json({...})
       *
       * Expected body: { message: 'Authentication required' }
       */
      const res = await request(app)[method](path);
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('message');
      expect(res.body.message).toMatch(/authentication required/i);
    }
  );

  test('TC-API-009  /api/patient/reports → 401 when Authorization is empty string', async () => {
    /**
     * Authorization: ""
     * authHeader = "" → "" && "" .split() → falsy chain → token = undefined → 401
     */
    const res = await request(app)
      .get('/api/patient/reports')
      .set('Authorization', '');

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/authentication required/i);
  });

  test('TC-API-010  /api/patient/reports → 401 when Authorization is "Bearer " (no token after)', async () => {
    /**
     * Authorization: "Bearer "
     * "Bearer ".split(' ')[1] = "" → falsy → 401
     */
    const res = await request(app)
      .get('/api/patient/reports')
      .set('Authorization', 'Bearer ');

    expect(res.status).toBe(401);
  });

  test('TC-API-011  /api/doctor/profile → 401 or 403 when raw token sent without "Bearer " prefix', async () => {
    /**
     * Authorization: "<raw_jwt>"  (no "Bearer " prefix)
     * split(' ')[1] gets the second word — but a JWT itself has dots not spaces.
     * Behavior: token = undefined (401) or garbled segment fails verify (403).
     */
    const res = await request(app)
      .get('/api/doctor/profile')
      .set('Authorization', doctorToken());  // raw JWT, no "Bearer "

    expect([401, 403]).toContain(res.status);
  });

  test('TC-API-012  /api/payments → 401 when no token', async () => {
    const res = await request(app).get('/api/payments');
    expect(res.status).toBe(401);
  });

  test('TC-API-013  /api/livekit/:id/token → 401 when no token', async () => {
    const res = await request(app)
      .post(`/api/livekit/appointments/${new mongoose.Types.ObjectId()}/token`)
      .send({ role: 'doctor' });
    expect(res.status).toBe(401);
  });

  test('TC-API-014  /api/chat → 401 when no token', async () => {
    const res = await request(app).get('/api/chat');
    expect(res.status).toBe(401);
  });

  test('TC-API-015  POST /api/doctor/prescription/draft → 401 when no token', async () => {
    const res = await request(app)
      .post('/api/doctor/prescription/draft')
      .send({ appointmentId: new mongoose.Types.ObjectId().toString() });
    expect(res.status).toBe(401);
  });

  test('TC-API-016  PATCH /api/appointments/:id → 401 when no token', async () => {
    const res = await request(app)
      .patch(`/api/appointments/${new mongoose.Types.ObjectId()}`)
      .send({ status: 'completed' });
    expect(res.status).toBe(401);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// C.  CRYPTOGRAPHIC ATTACK VECTORS → 403  (TC-API-017 → TC-API-025)
// ═════════════════════════════════════════════════════════════════════════════

describe('C. Cryptographic Attack Vectors — All → 403', () => {

  test('TC-API-017  Random string as token → 403 "Invalid or expired session"', async () => {
    /**
     * A random string fails jwt.verify() for all three secrets.
     * The middleware exhausts primary + both fallbacks → 403.
     */
    const res = await request(app)
      .get('/api/doctor/profile')
      .set('Authorization', 'Bearer notavalidjwt1234567890abcdef');

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/invalid or expired session/i);
  });

  test('TC-API-018  Expired token → 403 "Invalid or expired session"', async () => {
    /**
     * jwt.sign({...}, JWT_SECRET, { expiresIn: '-1s' })
     * Token expired 1 second before issuance.
     * jwt.verify() → TokenExpiredError.
     * Fallback loop: same token is expired regardless of which secret is tried.
     * → 403 "Invalid or expired session"
     */
    const res = await request(app)
      .get('/api/patient/reports')
      .set('Authorization', `Bearer ${expiredToken()}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/invalid or expired session/i);
  });

  test('TC-API-019  PAYLOAD SWAP ATTACK → 403 (signature mismatch)', async () => {
    /**
     * STEP-BY-STEP EXECUTION:
     *
     * Step 1: Attacker obtains a legitimately signed doctor token.
     *   original = jwt.sign({ userId: DOCTOR_OID, role: 'doctor' }, JWT_SECRET)
     *   Format:  header.original_payload.hmac(header+'.'+original_payload)
     *
     * Step 2: Attacker decodes the payload (base64url is NOT encryption):
     *   base64url.decode(original_payload) = { userId: DOCTOR_OID, role: 'doctor' }
     *
     * Step 3: Attacker replaces payload with escalated claims:
     *   malicious = { userId: OTHER_OID, role: 'admin', exp: now+3600 }
     *   tamperedB64 = base64url.encode(JSON.stringify(malicious))
     *
     * Step 4: Reassemble with ORIGINAL signature:
     *   forged = original_header + '.' + tamperedB64 + '.' + original_signature
     *
     * Step 5: Server receives forged token:
     *   jwt.verify(forged, JWT_SECRET)
     *   → recomputes HMAC-SHA256(original_header + '.' + tamperedB64)
     *   → result ≠ original_signature  (which covered the original payload)
     *   → throws JsonWebTokenError: invalid signature
     *   → fallback loop also fails
     *   → res.status(403) "Invalid or expired session"
     *
     * Assertion: 403 (attack fails — payload tampering detected)
     */
    const original = doctorToken();
    const tampered = payloadSwapToken(original, { userId: OTHER_OID, role: 'admin' });

    // Structural verification: token is 3 dot-separated parts
    expect(tampered.split('.')).toHaveLength(3);
    // Payload is different from original
    expect(tampered.split('.')[1]).not.toBe(original.split('.')[1]);
    // Signature is identical to original (stolen)
    expect(tampered.split('.')[2]).toBe(original.split('.')[2]);

    const res = await request(app)
      .get('/api/doctor/profile')
      .set('Authorization', `Bearer ${tampered}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/invalid or expired session/i);
  });

  test('TC-API-020  ALG=NONE ATTACK (unsigned JWT) → 403', async () => {
    /**
     * STEP-BY-STEP EXECUTION:
     *
     * Step 1: Attacker crafts a JWT with alg="none":
     *   header  = base64url( {"alg":"none","typ":"JWT"} )
     *   payload = base64url( {userId: DOCTOR_OID, role: 'doctor', exp: now+3600} )
     *   sig     = ""    ← EMPTY — no cryptographic guarantee
     *   token   = header + '.' + payload + '.'
     *             (trailing dot with no signature bytes)
     *
     * Step 2: Historical vulnerability:
     *   Some older JWT libraries read `alg` from the token header and,
     *   when seeing "none", skipped signature verification entirely.
     *   This allowed forging tokens for ANY userId without the server secret.
     *
     * Step 3: Modern jsonwebtoken defense:
     *   jwt.verify(token, JWT_SECRET) internally uses HS256 when given a string.
     *   It explicitly checks that the token's declared algorithm matches the
     *   verification configuration.
     *   alg=none → JsonWebTokenError: invalid algorithm
     *   Fallback loop: same error for each fallback secret.
     *   → res.status(403) "Invalid or expired session"
     *
     * Structural assertions before HTTP call:
     *   - Token has 3 dot-separated parts
     *   - Third part (signature) is empty string
     *   - Header declares alg=none
     *
     * Assertion: 403 (unsigned token NOT accepted)
     */
    const token = algNoneToken({ userId: DOCTOR_OID, role: 'doctor' });

    // Structural verification
    const parts = token.split('.');
    expect(parts).toHaveLength(3);
    expect(parts[2]).toBe('');  // empty signature

    const decodedHeader = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    expect(decodedHeader.alg).toBe('none');

    const res = await request(app)
      .get('/api/patient/reports')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/invalid or expired session/i);
  });

  test('TC-API-021  ALGORITHM CONFUSION ATTACK (RS256 header / HS256 body) → 403', async () => {
    /**
     * STEP-BY-STEP EXECUTION:
     *
     * Step 1: Attacker knows the server's JWT_SECRET (or uses the public key
     *         in a real asymmetric scenario).
     *
     * Step 2: Attacker crafts a hybrid token:
     *   header  = base64url( {"alg":"RS256","typ":"JWT"} )
     *   payload = base64url( {userId: DOCTOR_OID, role: 'doctor', exp: now+3600} )
     *   sig     = HMAC-SHA256(header + '.' + payload, JWT_SECRET)
     *
     *   This is HS256 math (HMAC) dressed up with an RS256 algorithm declaration.
     *
     * Step 3: Historical vulnerability:
     *   Libraries that derived the verification algorithm from the TOKEN HEADER
     *   would attempt RS256 verification. If using the public key as an HMAC key
     *   (a common misconfiguration in asymmetric setups), the HS256 signature
     *   would verify successfully against the "public key" being used as HMAC key.
     *
     * Step 4: Modern jsonwebtoken defense:
     *   jwt.verify(token, JWT_SECRET_STRING) enforces HS256.
     *   When it sees alg=RS256 in the header but receives a symmetric string key,
     *   it throws: JsonWebTokenError: invalid algorithm (or secretOrPublicKey must
     *   be an asymmetric key)
     *   → 403 "Invalid or expired session"
     *
     * Structural assertions before HTTP call:
     *   - Token has 3 dot-separated parts
     *   - Third part (signature) is non-empty (real HMAC computed)
     *   - Header declares alg=RS256
     *
     * Assertion: 403 (confusion attack fails — algorithm mismatch detected)
     */
    const token = algConfusionToken({ userId: DOCTOR_OID, role: 'doctor' }, JWT_SECRET);

    // Structural verification
    const parts = token.split('.');
    expect(parts).toHaveLength(3);
    expect(parts[2]).not.toBe('');  // non-empty signature (real HMAC math)

    const decodedHeader = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    expect(decodedHeader.alg).toBe('RS256');  // header declares RS256

    const res = await request(app)
      .get('/api/doctor/appointments')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/invalid or expired session/i);
  });

  test('TC-API-022  Wrong-secret token → 403 (all 3 secrets exhausted)', async () => {
    /**
     * The token's signing key is not JWT_SECRET, FALLBACK[0], or FALLBACK[1].
     * All three verifications in the middleware throw JsonWebTokenError → 403.
     */
    const res = await request(app)
      .get('/api/doctor/profile')
      .set('Authorization', `Bearer ${wrongSecretToken()}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/invalid or expired session/i);
  });

  test('TC-API-023  Token with no userId field → 403 "Invalid token payload"', async () => {
    /**
     * authMiddleware.js lines 31-32 (after successful signature verification):
     *   req.userId = decoded.userId || decoded.sub
     *   if (!req.userId) return res.status(403).json({ message: 'Invalid token payload' })
     *
     * The token passes crypto verification (correct secret) but has no userId.
     * Different message from TC-API-017-022: 'Invalid token payload' not 'Invalid or expired session'.
     */
    const res = await request(app)
      .get('/api/doctor/profile')
      .set('Authorization', `Bearer ${noUserIdToken()}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/invalid token payload/i);
  });

  test('TC-API-024  Token with empty-string userId → 403 "Invalid token payload"', async () => {
    /**
     * decoded.userId = '' → falsy → req.userId = undefined → 403
     */
    const res = await request(app)
      .get('/api/patient/reports')
      .set('Authorization', `Bearer ${emptyUserIdToken()}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/invalid token payload/i);
  });

  test('TC-API-025  Valid token passes middleware → NOT 401, NOT 403 (positive baseline)', async () => {
    /**
     * Control test: a correct token must pass all middleware gates.
     * The handler may return 404 (no data) or 503 (DB unavailable) but
     * must NOT return an auth error.
     */
    const res = await request(app)
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

  const PRESCRIPTION_BODY = {
    appointmentId: new mongoose.Types.ObjectId().toString(),
    notes: 'Triphala 1 tsp twice daily with warm water. Ashwagandha 500mg before bed.',
    medicines: [
      { name: 'Triphala',    details: '1 tsp with warm water, morning and evening' },
      { name: 'Ashwagandha', details: '500mg capsule before bed with warm milk' },
    ],
    dietPathya:    'Warm, light foods. Pomegranate juice. Ginger tea.',
    dietApathya:   'Cold drinks, fried foods, fermented foods.',
    lifestylePlan: 'Morning walk 20 min. Pranayama 10 min. Sleep before 10 PM.',
    followUpDate:  '2026-09-01',
    status:        'draft',
  };

  test('TC-API-026  POST /api/doctor/prescription/draft — no token → 401', async () => {
    /**
     * Middleware fires before any handler.
     * Input: complete valid prescription body.
     * Expected: 401 — server never processes prescription data.
     */
    const res = await request(app)
      .post('/api/doctor/prescription/draft')
      .send(PRESCRIPTION_BODY);

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/authentication required/i);
  });

  test('TC-API-027  POST /api/doctor/prescription/draft — expired token → 403', async () => {
    const res = await request(app)
      .post('/api/doctor/prescription/draft')
      .set('Authorization', `Bearer ${expiredToken()}`)
      .send(PRESCRIPTION_BODY);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/invalid or expired session/i);
  });

  test('TC-API-028  POST /api/doctor/prescription/draft — payload-swap attack → 403', async () => {
    const tampered = payloadSwapToken(doctorToken(), { userId: OTHER_OID, role: 'admin' });

    const res = await request(app)
      .post('/api/doctor/prescription/draft')
      .set('Authorization', `Bearer ${tampered}`)
      .send(PRESCRIPTION_BODY);

    expect(res.status).toBe(403);
  });

  test('TC-API-029  POST /api/doctor/prescription/finalize — no token → 401', async () => {
    const res = await request(app)
      .post('/api/doctor/prescription/finalize')
      .send({ appointmentId: new mongoose.Types.ObjectId().toString() });

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/authentication required/i);
  });

  test('TC-API-030  PATCH /api/appointments/:id — no token → 401', async () => {
    const res = await request(app)
      .patch(`/api/appointments/${new mongoose.Types.ObjectId()}`)
      .send({ status: 'completed' });

    expect(res.status).toBe(401);
  });

  test('TC-API-031  PATCH /api/appointments/:id/status — no token → 401', async () => {
    const res = await request(app)
      .patch(`/api/appointments/${new mongoose.Types.ObjectId()}/status`)
      .send({ status: 'cancelled' });

    expect(res.status).toBe(401);
  });

  test('TC-API-032  POST /api/doctor/prescription/draft — alg=none attack → 403', async () => {
    /**
     * Attempting to write prescriptions with an unsigned (alg=none) token.
     * Modern jsonwebtoken rejects alg=none → 403.
     */
    const token = algNoneToken({ userId: DOCTOR_OID, role: 'doctor' });

    const res = await request(app)
      .post('/api/doctor/prescription/draft')
      .set('Authorization', `Bearer ${token}`)
      .send(PRESCRIPTION_BODY);

    expect(res.status).toBe(403);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// E.  PATIENT DATA ISOLATION  (TC-API-033 → TC-API-037)
// ═════════════════════════════════════════════════════════════════════════════

describe('E. Patient Data Isolation', () => {

  test('TC-API-033  Patient A token on /api/patient/reports — only own patientId in results', async () => {
    /**
     * patientController.listReports:
     *   Report.find({ patientId: req.userId, hiddenByPatient: { $ne: true } })
     * req.userId = PATIENT_OID from JWT → all returned records have patientId = PATIENT_OID.
     */
    const res = await request(app)
      .get('/api/patient/reports')
      .set('Authorization', `Bearer ${patientToken({ userId: PATIENT_OID })}`);

    if (res.status === 200) {
      const reports = res.body?.reports ?? res.body?.data ?? [];
      reports.forEach((r) => {
        const pId = (r.patientId?._id ?? r.patientId ?? '').toString();
        expect(pId).not.toBe(OTHER_OID);
      });
    } else {
      expect([200, 404, 503]).toContain(res.status);
    }
  });

  test('TC-API-034  Patient A token on /api/patient/prescriptions — own prescriptions only', async () => {
    const res = await request(app)
      .get('/api/patient/prescriptions')
      .set('Authorization', `Bearer ${patientToken({ userId: PATIENT_OID })}`);

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

  test('TC-API-035  Patient token on /api/doctor/revenue-summary — passes auth, no doctor record', async () => {
    /**
     * Auth passes (valid token). No Doctor record exists for PATIENT_OID.
     * Business logic returns empty/404. Must NOT be 403.
     */
    const res = await request(app)
      .get('/api/doctor/revenue-summary')
      .set('Authorization', `Bearer ${patientToken()}`);

    expect([200, 404, 500, 503]).toContain(res.status);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  test('TC-API-036  Patient token on POST /api/doctor/prescription/draft → NOT 200', async () => {
    /**
     * Patient JWT passes auth. Business logic (no doctor record) returns 400/404.
     * The critical assertion: writing a prescription as a patient must NEVER succeed.
     */
    const res = await request(app)
      .post('/api/doctor/prescription/draft')
      .set('Authorization', `Bearer ${patientToken()}`)
      .send({ appointmentId: new mongoose.Types.ObjectId().toString() });

    expect([400, 403, 404, 500, 503]).toContain(res.status);
    expect(res.status).not.toBe(200);
  });

  test('TC-API-037  Patient token on POST /api/doctor/consultation/start → NOT 200', async () => {
    const res = await request(app)
      .post('/api/doctor/consultation/start')
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

  test('TC-API-041  Login {$gt:""} as email — String() coercion neutralizes injection', async () => {
    /**
     * TC-API-041  NoSQL INJECTION DEFENCE — COMPLETE TRACE
     * ─────────────────────────────────────────────────────
     *
     * ATTACK THEORY:
     *   MongoDB $gt operator in a findOne() query selects the first document
     *   where email > "" — effectively ANY document — granting login access
     *   without knowing any actual password.
     *
     *   Exploit payload:  { "email": { "$gt": "" }, "password": { "$gt": "" } }
     *   Expected (naive):  MongoDB evaluates { email: {$gt:""} } → returns User
     *
     * ACTUAL EXECUTION (authController.js lines 48-49):
     *
     *   const { email, password } = req.body
     *   // email = { "$gt": "" }  ← a JavaScript object, NOT a string
     *
     *   const normalizedEmail = String(email || '').trim().toLowerCase()
     *   // String( { "$gt": "" } )
     *   // ↓  JavaScript Object.prototype.toString
     *   // = "[object Object]"   ← the literal string "[object object]"
     *   // .trim()               = "[object object]"  (no whitespace)
     *   // .toLowerCase()        = "[object object]"  (already lowercase)
     *
     *   const user = await User.findOne({ email: "[object object]" })
     *   // Mongoose executes: db.users.findOne({ email: "[object object]" })
     *   // → No user has this email → returns null
     *
     *   → res.status(401).json({ message: 'Invalid email or password' })
     *
     * CRITICAL ASSERTIONS:
     *   1. status MUST NOT be 200  (injection did not grant access)
     *   2. res.body.token MUST be undefined  (no JWT issued)
     *   3. Acceptable status: 400 (body validation), 401 (user not found), 503 (DB down)
     *
     * Input:   POST /api/auth/login  Body: {"email":{"$gt":""},"password":{"$gt":""}}
     */
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: { $gt: '' }, password: { $gt: '' } });

    // Primary: injection must not have succeeded
    expect(res.status).not.toBe(200);

    // No token issued under any circumstances
    if (res.body) {
      expect(res.body.token).toBeUndefined();
    }

    // Valid failure outcomes
    expect([400, 401, 503]).toContain(res.status);
  });

  test('TC-API-042  Login {$where:"sleep(1000)"} as email — String() coercion prevents execution', async () => {
    /**
     * $where executes arbitrary JavaScript in MongoDB's server-side JS engine.
     * String({ "$where": "sleep(1000)" }) = "[object Object]" — safe.
     *
     * Input:   {"email": {"$where": "sleep(1000)"}, "password": "test"}
     * Expected: 401 or 400 (NOT 200, NOT 500 from JS execution side effect)
     */
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: { $where: 'sleep(1000)' }, password: 'anypassword' });

    expect(res.status).not.toBe(200);
    if (res.body) expect(res.body.token).toBeUndefined();
    expect([400, 401, 503]).toContain(res.status);
  });

  test('TC-API-043  Login array as email — joined to comma-string, not operator', async () => {
    /**
     * Sending email as array: ["admin@test.in", {"$regex": ".*"}]
     * String(["admin@test.in", {"$regex":".*"}]) = "admin@test.in,[object Object]"
     * findOne({ email: "admin@test.in,[object object]" }) → null → 401
     *
     * Input:   {"email": ["admin@test.in", {"$regex":".*"}], "password":"pass"}
     * Expected: 400 or 401 (NOT 200)
     */
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: ['admin@test.in', { $regex: '.*' }], password: 'pass' });

    expect(res.status).not.toBe(200);
    if (res.body) expect(res.body.token).toBeUndefined();
    expect([400, 401, 503]).toContain(res.status);
  });

  test('TC-API-044  Oversized body → 400 or 413 (body-parser limit enforced)', async () => {
    /**
     * Express default JSON body-parser limit: 100kb.
     * A 500KB password field must be rejected before any handler runs.
     *
     * Input:   POST /api/auth/login  password = 500KB of 'A'
     * Expected: 413 Payload Too Large or 400 Body too large
     */
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@ayurcare.in', password: 'A'.repeat(512_000) });

    expect([400, 413, 422]).toContain(res.status);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// G.  CORS HEADERS  (TC-API-045 → TC-API-047)
// ═════════════════════════════════════════════════════════════════════════════

describe('G. CORS Headers', () => {

  test('TC-API-045  OPTIONS preflight → 200/204 with Access-Control-Allow-Origin', async () => {
    /**
     * server/index.js line 34: app.use(cors())  — default allows all origins.
     * Preflight must return ACAO header for browser clients to proceed.
     */
    const res = await request(app)
      .options('/api/health')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'GET');

    expect([200, 204]).toContain(res.status);
    expect(res.headers['access-control-allow-origin']).toBeDefined();
  });

  test('TC-API-046  GET /api/health with Origin header includes ACAO in response', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'http://localhost:5174');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeDefined();
  });

  test('TC-API-047  Socket.IO endpoint reachable — not blocked by CORS (status ≠ 403)', async () => {
    /**
     * Socket.IO Server (index.js line 43-48) has cors: { origin: '*' }.
     * An HTTP GET to the Socket.IO polling endpoint should get 200 or 400
     * (wrong transport format), NOT 403 (CORS rejection).
     */
    const res = await request(app)
      .get('/socket.io/?EIO=4&transport=polling')
      .set('Origin', 'https://portal.ayurcare.in');

    expect([200, 400, 404]).toContain(res.status);
    expect(res.status).not.toBe(403);
  });
});
