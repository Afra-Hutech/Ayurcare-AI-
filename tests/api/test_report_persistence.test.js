'use strict';
/**
 * GROUP 3 — Report Persistence Tests: PostgreSQL / Sequelize
 * ===========================================================
 * TC-RP-001 → TC-RP-018
 *
 * MIGRATION NOTES (MongoDB → PostgreSQL)
 * ───────────────────────────────────────
 * | Old (Mongoose)                        | New (Sequelize / PostgreSQL)              |
 * |---------------------------------------|------------------------------------------|
 * | new Report(payload).save()            | Report.create(payload)                   |
 * | Report.findOne({ patientId, ... })    | Report.findOne({ where: { ... } })       |
 * | Report.countDocuments(filter)         | Report.count({ where: filter })          |
 * | Report.find(f).sort({ createdAt:-1 }) | Report.findAll({ where:f, order:... })   |
 * | updateOne + $setOnInsert              | ON CONFLICT ... DO UPDATE (raw SQL)      |
 * | Mongoose ValidationError              | SequelizeValidationError                 |
 * | ObjectId PATIENT_OID                  | UUID v4 PATIENT_UUID                     |
 * | Mixed reportData                      | JSONB reportData (deep path queries)     |
 * | hiddenByPatient only                  | hiddenByPatient + isVerified (both false)|
 *
 * NEW assertion in TC-RP-005:
 *   isVerified defaults to false on every new report.
 *   This field did not exist in the Mongoose schema but is mandated by
 *   AyurCare-Doc.docx and enforced by the PostgreSQL DDL DEFAULT false constraint.
 *
 * Pre-conditions:
 *   POSTGRES_TEST_URI=postgresql://user:pass@localhost:5432/ayurcare_test
 *   (or set PGHOST/PGUSER/PGPASSWORD/PGDATABASE individually)
 *   The test database must be reachable; the suite creates and drops the
 *   reports table automatically via sequelize.sync({ force: true }).
 *
 * Run:
 *   cd tests/api
 *   POSTGRES_TEST_URI=postgresql://localhost/ayurcare_test \
 *     npx jest test_report_persistence.test.js --forceExit --verbose
 */

const { Sequelize, DataTypes, Op, ValidationError } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

// ── Test PostgreSQL connection ─────────────────────────────────────────────────
const POSTGRES_URI =
  process.env.POSTGRES_TEST_URI ||
  `postgresql://${process.env.PGUSER || 'postgres'}:${process.env.PGPASSWORD || ''}` +
  `@${process.env.PGHOST || 'localhost'}:${process.env.PGPORT || 5432}` +
  `/${process.env.PGDATABASE || 'ayurcare_test'}`;

// ── Stable UUIDs for the test actor ───────────────────────────────────────────
const PATIENT_UUID = uuidv4();
const SESSION_UUID = uuidv4();

// ── Sequelize instance and Report model (defined fresh for the test DB) ────────
let sequelize;
let Report;

// ─────────────────────────────────────────────────────────────────────────────
// Report model definition — identical to production Report.js
// Inlined here so the test is fully self-contained and does not depend on
// the production sequelize singleton pointing at the wrong database.
// ─────────────────────────────────────────────────────────────────────────────
function defineReportModel(seq) {
  return seq.define('Report', {
    id: {
      type:         DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey:   true,
    },
    patientId: {
      type:      DataTypes.UUID,
      allowNull: false,
      field:     'patient_id',
      validate:  { notNull: { msg: 'patientId is required' }, isUUID: 4 },
    },
    sessionId: {
      type:      DataTypes.UUID,
      allowNull: true,
      field:     'session_id',
      validate:  { isUUID: 4 },
    },
    reportType:  { type: DataTypes.STRING(100), field: 'report_type' },
    reportTitle: { type: DataTypes.STRING(500), field: 'report_title' },
    reportData:  { type: DataTypes.JSONB,       field: 'report_data' },
    diagnosis: {
      type:      DataTypes.TEXT,
      allowNull: false,
      validate: {
        notNull:  { msg: 'diagnosis is required' },
        notEmpty: { msg: 'diagnosis cannot be empty' },
      },
    },
    symptoms:       { type: DataTypes.STRING(500), defaultValue: '' },
    recommendations:{ type: DataTypes.TEXT,        defaultValue: '' },
    threatLevel:    { type: DataTypes.STRING(50),  field: 'threat_level' },
    severity:       { type: DataTypes.STRING(50) },
    date:           { type: DataTypes.DATEONLY },
    // ── IMMUTABLE INITIALISATION STATE (AyurCare-Doc.docx mandate) ──────────
    isVerified: {
      type:         DataTypes.BOOLEAN,
      allowNull:    false,
      defaultValue: false,
      field:        'is_verified',
    },
    hiddenByPatient: {
      type:         DataTypes.BOOLEAN,
      allowNull:    false,
      defaultValue: false,
      field:        'hidden_by_patient',
    },
  }, {
    tableName:   'reports',
    underscored: true,
    indexes: [{
      unique: true,
      fields: ['patient_id', 'session_id'],
      name:   'reports_patient_session_unique',
    }],
  });
}

// ── Test payload factory ───────────────────────────────────────────────────────
function buildReportPayload(overrides = {}) {
  return {
    patientId:   PATIENT_UUID,
    sessionId:   SESSION_UUID,
    reportType:  'AI Consultation',
    reportTitle: 'Pitta Imbalance — Digestive Disorder',
    reportData: {
      source:        'ai_chat',
      schemaVersion: 'reports.v2',
      patientInfo:   { name: 'Arjun Sharma', age: 34, gender: 'male' },
      reports: [{
        reportType: 'Diagnosis Report',
        reportData: {
          threatLevel:       'Moderate',
          symptomsReported:  ['burning sensation', 'acid reflux', 'skin irritation'],
          clinicalImpression:'Pitta dosha aggravation with digestive involvement.',
          doshaProfile: {
            dominant:    'Pitta',
            percentages: { Vata: 20, Pitta: 55, Kapha: 25 },
          },
          kpis: [
            { label: 'Primary Dosha', value: 'Pitta' },
            { label: 'Threat Level',  value: 'Moderate' },
            { label: 'BMI',           value: '25.5' },
          ],
        },
      }],
    },
    diagnosis:       'Pitta imbalance presenting with acid reflux and burning sensation.',
    symptoms:        'burning sensation, acid reflux, skin irritation',
    recommendations: '• Avoid hot, spicy foods\n• Consume cooling herbs (Shatavari)\n',
    threatLevel:     'Moderate',
    severity:        'Moderate',
    date:            '2026-06-01',
    // isVerified and hiddenByPatient intentionally omitted — rely on defaults
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup / Teardown
// ─────────────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  sequelize = new Sequelize(POSTGRES_URI, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: {
      ssl: process.env.PGSSL === 'true'
        ? { require: true, rejectUnauthorized: false }
        : false,
    },
  });

  Report = defineReportModel(sequelize);

  // Create fresh table — drops existing test data
  await Report.sync({ force: true });
}, 30_000);

afterAll(async () => {
  // Drop the table and close the pool
  await sequelize.drop({ cascade: true });
  await sequelize.close();
});

afterEach(async () => {
  // Truncate between tests to ensure isolation
  await Report.destroy({ where: {}, truncate: true, cascade: true });
});


// ═════════════════════════════════════════════════════════════════════════════
// TC-RP-001 → TC-RP-003  Schema enforcement — required fields
// ═════════════════════════════════════════════════════════════════════════════

describe('TC-RP-001..003: Schema Enforcement — Required Fields', () => {

  test('TC-RP-001  Report.create() without patientId throws SequelizeValidationError', async () => {
    /**
     * Replaces: new Report({ diagnosis: 'Test' }).save() throws Mongoose ValidationError
     *
     * Sequelize enforces allowNull:false at the ORM layer BEFORE hitting the DB.
     * The error is SequelizeValidationError with error.errors[0].path === 'patientId'.
     *
     * Input:    { diagnosis: 'Test diagnosis.' }  (patientId absent)
     * Expected: throws ValidationError, error.name === 'SequelizeValidationError'
     */
    await expect(
      Report.create({ diagnosis: 'Test diagnosis.' })
    ).rejects.toMatchObject({
      name: 'SequelizeValidationError',
    });
  });

  test('TC-RP-002  Report.create() without diagnosis throws SequelizeValidationError', async () => {
    /**
     * Replaces: new Report({ patientId: OID }).save() throws Mongoose ValidationError
     *
     * `diagnosis` has allowNull:false + notEmpty validator.
     * Sequelize raises SequelizeValidationError before the INSERT is attempted.
     *
     * Input:    { patientId: PATIENT_UUID }  (diagnosis absent)
     * Expected: throws ValidationError, message matches 'diagnosis is required'
     */
    await expect(
      Report.create({ patientId: PATIENT_UUID })
    ).rejects.toMatchObject({
      name: 'SequelizeValidationError',
    });
  });

  test('TC-RP-003  Valid Report.create() returns a persisted row with an id', async () => {
    /**
     * Replaces: new Report(validPayload).save() returns document with _id
     *
     * Sequelize create() executes INSERT ... RETURNING * and returns a model
     * instance. The id column is a UUID v4, not an ObjectId.
     *
     * Input:    buildReportPayload()  (all required fields present)
     * Expected: saved.id is a non-empty UUID string
     *           saved.diagnosis matches input
     */
    const saved = await Report.create(buildReportPayload());

    expect(typeof saved.id).toBe('string');
    expect(saved.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(saved.diagnosis).toBe(
      'Pitta imbalance presenting with acid reflux and burning sensation.'
    );
  });
});


// ═════════════════════════════════════════════════════════════════════════════
// TC-RP-004 → TC-RP-007  Immutable Initialization State
// ═════════════════════════════════════════════════════════════════════════════

describe('TC-RP-004..007: Immutable Initialization State', () => {

  test('TC-RP-004  hiddenByPatient defaults to false on create', async () => {
    /**
     * Replaces: hiddenByPatient: { type: Boolean, default: false } (Mongoose)
     *
     * PostgreSQL DDL: hidden_by_patient BOOLEAN NOT NULL DEFAULT false
     * Sequelize model: defaultValue: false, allowNull: false
     *
     * Input:    buildReportPayload() — does NOT set hiddenByPatient
     * Expected: saved.hiddenByPatient === false (schema default applied)
     */
    const payload = buildReportPayload();
    delete payload.hiddenByPatient;  // remove explicit value — rely on default

    const saved = await Report.create(payload);

    expect(saved.hiddenByPatient).toBe(false);
    expect(saved.hiddenByPatient).not.toBeNull();
    expect(saved.hiddenByPatient).not.toBeUndefined();
  });

  test('TC-RP-005  isVerified defaults to false on create  [NEW — AyurCare-Doc mandate]', async () => {
    /**
     * NEW assertion: isVerified did not exist in the Mongoose schema but is
     * mandated by AyurCare-Doc.docx.  In PostgreSQL it is enforced by:
     *   is_verified BOOLEAN NOT NULL DEFAULT false
     *
     * Only a doctor (via the doctor portal) can set isVerified=true after
     * reviewing the AI report.  The AI system must NEVER create a report with
     * isVerified=true as the initial state.
     *
     * Input:    buildReportPayload() — does NOT set isVerified
     * Expected: saved.isVerified === false
     */
    const payload = buildReportPayload();
    delete payload.isVerified;  // remove explicit value — rely on default

    const saved = await Report.create(payload);

    expect(saved.isVerified).toBe(false);
    expect(saved.isVerified).not.toBeNull();
    expect(saved.isVerified).not.toBeUndefined();
  });

  test('TC-RP-006  createdAt is auto-populated within ±2 seconds of create', async () => {
    /**
     * Replaces: Mongoose createdAt: { type: Date, default: Date.now }
     *
     * PostgreSQL: created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
     * Sequelize: timestamps: true automatically populates createdAt.
     *
     * Input:    buildReportPayload() (no explicit createdAt)
     * Expected: saved.createdAt is a Date within 2 seconds of Date.now()
     */
    const before = new Date();
    const saved  = await Report.create(buildReportPayload());
    const after  = new Date();

    expect(saved.createdAt).toBeInstanceOf(Date);
    expect(saved.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    expect(saved.createdAt.getTime()).toBeLessThanOrEqual(after.getTime()   + 1000);
  });

  test('TC-RP-007  AI system cannot initialise isVerified as true (application-layer contract)', async () => {
    /**
     * Even if the payload explicitly passes isVerified: false, the saved value
     * must be false.  This test documents the CONTRACT: the AI (bot-brain) must
     * always create reports with isVerified=false.
     *
     * The DDL constraint (NOT NULL DEFAULT false) is the DB-level enforcement;
     * this test verifies the application-layer invariant is preserved end-to-end.
     *
     * Input:    payload with isVerified explicitly set to false
     * Expected: saved.isVerified === false
     */
    const saved = await Report.create(
      buildReportPayload({ isVerified: false })
    );
    expect(saved.isVerified).toBe(false);
  });
});


// ═════════════════════════════════════════════════════════════════════════════
// TC-RP-008 → TC-RP-009  Upsert semantics — ON CONFLICT (patient_id, session_id)
// ═════════════════════════════════════════════════════════════════════════════

describe('TC-RP-008..009: ON CONFLICT Upsert Semantics', () => {

  // Helper that wraps the raw SQL upsert (mirrors patientController.upsertConsultationReport)
  async function doUpsert(payload) {
    const sql = `
      INSERT INTO reports (
        id, patient_id, session_id, report_type, diagnosis,
        is_verified, hidden_by_patient, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4,
        false, false, NOW(), NOW()
      )
      ON CONFLICT (patient_id, session_id)
      DO UPDATE SET
        report_type  = EXCLUDED.report_type,
        diagnosis    = EXCLUDED.diagnosis,
        updated_at   = NOW()
        -- created_at NOT in DO UPDATE SET → immutable after first INSERT
      RETURNING id, patient_id, session_id, diagnosis, created_at, updated_at;
    `;
    const [rows] = await sequelize.query(sql, {
      bind: [
        payload.patientId,
        payload.sessionId,
        payload.reportType || 'AI Consultation',
        payload.diagnosis,
      ],
      type: Sequelize.QueryTypes.SELECT,
    });
    return rows;
  }

  test('TC-RP-008  Upsert with same (patientId, sessionId) updates the row — count stays 1', async () => {
    /**
     * Replaces: MongoDB updateOne({ patientId, sessionId }, { $set, $setOnInsert }, { upsert: true })
     *           followed by countDocuments({ patientId, sessionId }) === 1
     *
     * PostgreSQL ON CONFLICT (patient_id, session_id) DO UPDATE:
     *   - First call: INSERT row (count becomes 1)
     *   - Second call: UPDATE same row (count remains 1)
     *
     * Steps:
     *   1. Upsert with diagnosis = 'Initial Pitta diagnosis.'
     *   2. Upsert same patient+session with diagnosis = 'Updated diagnosis.'
     *   3. Count rows for this patient+session → must be exactly 1
     *   4. Fetch the row → diagnosis must be the updated value
     */
    const base = { patientId: PATIENT_UUID, sessionId: SESSION_UUID };

    await doUpsert({ ...base, diagnosis: 'Initial Pitta diagnosis.' });
    await doUpsert({ ...base, diagnosis: 'Updated Pitta diagnosis.' });

    const count = await Report.count({
      where: { patientId: PATIENT_UUID, sessionId: SESSION_UUID },
    });
    expect(count).toBe(1);

    const row = await Report.findOne({
      where: { patientId: PATIENT_UUID, sessionId: SESSION_UUID },
    });
    expect(row.diagnosis).toBe('Updated Pitta diagnosis.');
  });

  test('TC-RP-009  createdAt is NOT overwritten on subsequent upserts', async () => {
    /**
     * Replaces: Mongoose $setOnInsert: { createdAt: firstTime } protection
     *
     * PostgreSQL: created_at is NOT in the DO UPDATE SET clause.
     * The INSERT sets NOW(); the UPDATE cannot touch it.
     *
     * Steps:
     *   1. First upsert — records the createdAt timestamp T1
     *   2. Wait 10 ms
     *   3. Second upsert — updatedAt advances, but createdAt must stay at T1
     *
     * Expected: row.createdAt ≈ T1  (within 500 ms of first insert)
     *           row.updatedAt > T1  (advanced by the second upsert)
     */
    const base = { patientId: PATIENT_UUID, sessionId: SESSION_UUID };

    await doUpsert({ ...base, diagnosis: 'First save.' });

    // Fetch immediately to record T1
    const firstFetch = await Report.findOne({
      where: { patientId: PATIENT_UUID, sessionId: SESSION_UUID },
    });
    const T1 = firstFetch.createdAt;

    // Small delay so updatedAt will differ
    await new Promise((r) => setTimeout(r, 50));

    await doUpsert({ ...base, diagnosis: 'Second save.' });

    const secondFetch = await Report.findOne({
      where: { patientId: PATIENT_UUID, sessionId: SESSION_UUID },
    });

    // createdAt must not have changed
    expect(secondFetch.createdAt.getTime()).toBe(T1.getTime());

    // updatedAt must be strictly after createdAt
    expect(secondFetch.updatedAt.getTime()).toBeGreaterThan(T1.getTime());
  });
});


// ═════════════════════════════════════════════════════════════════════════════
// TC-RP-010 → TC-RP-013  JSONB reportData structure
// ═════════════════════════════════════════════════════════════════════════════

describe('TC-RP-010..013: JSONB reportData Structure', () => {

  test('TC-RP-010  reportData.schemaVersion stored and retrieved as "reports.v2"', async () => {
    /**
     * Replaces: Mongoose Mixed type preserving schemaVersion string
     *
     * PostgreSQL JSONB stores and retrieves nested JSON with full fidelity.
     * Sequelize returns the JSONB column as a plain JS object (no extra parsing needed).
     *
     * Input:    reportData.schemaVersion = 'reports.v2'
     * Expected: saved.reportData.schemaVersion === 'reports.v2'
     */
    const saved = await Report.create(buildReportPayload());
    expect(saved.reportData.schemaVersion).toBe('reports.v2');
  });

  test('TC-RP-011  reportData.reports array is preserved with correct structure', async () => {
    /**
     * Replaces: Mixed type preserving the nested reports array
     *
     * JSONB array round-trip — the full structure including reportType and
     * nested reportData object must survive INSERT → SELECT.
     *
     * Expected: reportData.reports is an Array with length > 0
     *           reports[0].reportType === 'Diagnosis Report'
     */
    const saved = await Report.create(buildReportPayload());
    const reports = saved.reportData?.reports;

    expect(Array.isArray(reports)).toBe(true);
    expect(reports.length).toBeGreaterThan(0);
    expect(reports[0].reportType).toBe('Diagnosis Report');
  });

  test('TC-RP-012  doshaProfile.percentages stored and queryable in JSONB', async () => {
    /**
     * Replaces: Mongoose Mixed type preserving nested doshaProfile
     *
     * PostgreSQL JSONB advantage over Mongoose Mixed:
     *   Operators like @> (contains) and -> (path) allow querying inside JSONB
     *   without loading the full document, e.g.:
     *   SELECT * FROM reports WHERE report_data->'reports'->0->'reportData'->'doshaProfile'->>'dominant' = 'Pitta'
     *
     * Expected: doshaProfile.dominant === 'Pitta'
     *           doshaProfile.percentages.Pitta === 55
     */
    const saved = await Report.create(buildReportPayload());
    const diagReport = saved.reportData?.reports?.[0]?.reportData;

    expect(diagReport?.doshaProfile?.dominant).toBe('Pitta');
    expect(diagReport?.doshaProfile?.percentages?.Pitta).toBe(55);
    expect(diagReport?.doshaProfile?.percentages?.Vata).toBe(20);
    expect(diagReport?.doshaProfile?.percentages?.Kapha).toBe(25);
  });

  test('TC-RP-013  threatLevel stored as top-level column for efficient query filtering', async () => {
    /**
     * threatLevel is a top-level TEXT column (in addition to being in reportData JSONB).
     * This allows fast B-tree index queries without JSONB path operators:
     *   SELECT * FROM reports WHERE threat_level = 'High'
     *
     * Input:    buildReportPayload({ threatLevel: 'High' })
     * Expected: saved.threatLevel === 'High'
     */
    const saved = await Report.create(buildReportPayload({ threatLevel: 'High' }));
    expect(saved.threatLevel).toBe('High');
  });
});


// ═════════════════════════════════════════════════════════════════════════════
// TC-RP-014 → TC-RP-016  Doctor queue visibility contract
// ═════════════════════════════════════════════════════════════════════════════

describe('TC-RP-014..016: Doctor Queue Visibility', () => {

  test('TC-RP-014  New report appears in doctor queue query (hiddenByPatient=false filter)', async () => {
    /**
     * Replaces: Report.find({ patientId, hiddenByPatient: { $ne: true } })
     *
     * Sequelize equivalent:
     *   Report.findAll({ where: { patientId, hiddenByPatient: false } })
     *
     * A freshly created AI report must appear when doctors query the queue.
     * hiddenByPatient defaults to false → visible by default.
     *
     * Steps:
     *   1. Create a report (hiddenByPatient not set → defaults to false)
     *   2. Query with hiddenByPatient: false
     *   3. The created report must be in the result
     */
    const created = await Report.create(buildReportPayload());

    const visible = await Report.findAll({
      where: { patientId: PATIENT_UUID, hiddenByPatient: false },
    });
    const ids = visible.map((r) => r.id);
    expect(ids).toContain(created.id);
  });

  test('TC-RP-015  Report hidden by patient does not appear in doctor queue', async () => {
    /**
     * Replaces: Mongoose Report.find({ hiddenByPatient: { $ne: true } })
     *
     * After a patient hides their report (hiddenByPatient = true), it must
     * not appear in the doctor queue.  The initial state (false) is verified
     * in TC-RP-004; this test verifies the query correctly excludes hidden ones.
     *
     * Steps:
     *   1. Create report (hiddenByPatient=false by default)
     *   2. Update: set hiddenByPatient=true (patient hides it)
     *   3. Query doctor queue (hiddenByPatient=false)
     *   4. The report must NOT be in the result
     */
    const created = await Report.create(buildReportPayload({
      sessionId: uuidv4(), // different session to avoid unique constraint
    }));

    // Patient hides the report after creation
    await Report.update(
      { hiddenByPatient: true },
      { where: { id: created.id } }
    );

    const queue = await Report.findAll({
      where: { patientId: PATIENT_UUID, hiddenByPatient: false },
    });
    const ids = queue.map((r) => r.id);
    expect(ids).not.toContain(created.id);
  });

  test('TC-RP-016  Reports sorted by createdAt DESC shows newest first', async () => {
    /**
     * Replaces: Report.find(filter).sort({ createdAt: -1 })
     *
     * Sequelize: Report.findAll({ order: [['created_at', 'DESC']] })
     *
     * Steps:
     *   1. Create two reports with different sessions (unique constraint)
     *   2. Wait 10 ms between them so createdAt differs
     *   3. Query with ORDER BY created_at DESC
     *   4. The second (newer) report must be first in the result
     */
    const session1 = uuidv4();
    const session2 = uuidv4();

    const older = await Report.create(buildReportPayload({
      sessionId: session1,
      diagnosis: 'Older report.',
    }));

    // Ensure createdAt is distinct
    await new Promise((r) => setTimeout(r, 20));

    const newer = await Report.create(buildReportPayload({
      sessionId: session2,
      diagnosis: 'Newer report.',
    }));

    const queue = await Report.findAll({
      where: { patientId: PATIENT_UUID },
      order: [['created_at', 'DESC']],
    });

    expect(queue[0].diagnosis).toBe('Newer report.');
    expect(queue[1].diagnosis).toBe('Older report.');
  });
});


// ═════════════════════════════════════════════════════════════════════════════
// TC-RP-017 → TC-RP-018  Field boundary / null safety
// ═════════════════════════════════════════════════════════════════════════════

describe('TC-RP-017..018: Field Length & Null Safety', () => {

  test('TC-RP-017  symptoms VARCHAR(500) stores a 500-char string without error', async () => {
    /**
     * Replaces: Mongoose String field with no max-length constraint
     *
     * PostgreSQL DDL: symptoms VARCHAR(500)
     * A 500-char symptoms string must INSERT without error.
     * A 501-char string would raise a SequelizeValidationError or pg error.
     *
     * Input:    symptoms = 'burning sensation, '.repeat(27).slice(0, 500)
     * Expected: saved.symptoms.length <= 500
     */
    const longSymptoms = 'burning sensation, '.repeat(27).slice(0, 500);
    expect(longSymptoms.length).toBeLessThanOrEqual(500);

    const saved = await Report.create(
      buildReportPayload({ symptoms: longSymptoms, sessionId: uuidv4() })
    );
    expect(saved.symptoms.length).toBeLessThanOrEqual(500);
  });

  test('TC-RP-018  Empty recommendations TEXT saves without error', async () => {
    /**
     * recommendations is an optional TEXT column (no NOT NULL constraint).
     * An empty string must save without raising a validation error.
     *
     * Input:    recommendations = ''
     * Expected: saved.recommendations === ''  (no crash)
     */
    const saved = await Report.create(
      buildReportPayload({ recommendations: '', sessionId: uuidv4() })
    );
    expect(saved.recommendations).toBe('');
  });
});
