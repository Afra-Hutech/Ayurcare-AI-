-- =============================================================================
-- AyurCare AI — PostgreSQL Relational Schema
-- Migrated from: MongoDB / Mongoose
-- Blueprint source: AyurCare-Doc.docx
-- =============================================================================
-- Design decisions:
--   UUID primary keys          → gen_random_uuid() via pgcrypto
--   TIMESTAMP WITH TIME ZONE   → all temporal fields (UTC stored, tz-aware)
--   JSONB                      → reportData, doshaProfile, medicines[], prakriti
--   Parameterized queries       → prevents SQL injection natively (no String() coercion needed)
--   UNIQUE (patient_id, session_id) on reports → enforces upsert idempotency
--   ON CONFLICT DO UPDATE      → protected created_at (not in SET clause)
--   CHECK constraints           → replace Mongoose enum validators
--   GENERATED ALWAYS AS        → derived columns where applicable
-- =============================================================================

-- Requires pgcrypto extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- TABLE: users  (authentication layer — merged from Mongoose User.js)
-- =============================================================================
CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email               VARCHAR(320)  UNIQUE NOT NULL,           -- RFC 5321 max
    password_hash       VARCHAR(255)  NOT NULL,
    name                VARCHAR(255),
    age                 SMALLINT      CHECK (age > 0 AND age < 150),
    gender              VARCHAR(20),
    height              NUMERIC(5, 2),                           -- cm
    weight              NUMERIC(5, 2),                           -- kg
    phone               VARCHAR(25),
    address             TEXT,
    profile_image       VARCHAR(1000),
    role                VARCHAR(20)   NOT NULL DEFAULT 'patient'
                            CHECK (role IN ('patient', 'doctor', 'admin')),
    is_onboarded        BOOLEAN       NOT NULL DEFAULT false,
    reset_token_hash    VARCHAR(255),
    reset_token_expires TIMESTAMP WITH TIME ZONE,
    created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Lower-case email index for case-insensitive lookup
CREATE UNIQUE INDEX users_email_lower_idx ON users (LOWER(email));
CREATE INDEX        users_role_idx         ON users (role);

-- =============================================================================
-- TABLE: doctors  (clinician profiles — from Mongoose Doctor.js)
-- =============================================================================
CREATE TABLE doctors (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID          NOT NULL UNIQUE
                         REFERENCES users (id) ON DELETE CASCADE,
    -- basicInfo
    name             VARCHAR(255)  NOT NULL,
    age              SMALLINT,
    gender           VARCHAR(20),
    phone            VARCHAR(25),
    email            VARCHAR(320),
    profile_image    VARCHAR(1000),
    -- professionalInfo
    qualification    VARCHAR(255),
    specialization   VARCHAR(255),
    experience       SMALLINT,
    treatments       TEXT[]        DEFAULT '{}',
    -- clinicInfo
    clinic_name      VARCHAR(255),
    address          TEXT,
    city             VARCHAR(100),
    state            VARCHAR(100),
    pincode          VARCHAR(20),
    -- availability
    timings          VARCHAR(255),
    fees             NUMERIC(10, 2),
    languages        TEXT[]        DEFAULT '{}',
    -- geolocation (longitude first — GeoJSON convention; mirrors Mongoose coordinates[lng,lat])
    longitude        NUMERIC(11, 7),
    latitude         NUMERIC(10, 7),
    -- operational state
    status           VARCHAR(20)   NOT NULL DEFAULT 'available'
                         CHECK (status IN ('available', 'busy', 'unavailable')),
    on_leave         BOOLEAN       NOT NULL DEFAULT false,
    created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Geospatial index (requires PostGIS; comment out if not using PostGIS)
-- CREATE INDEX doctors_location_gist_idx ON doctors
--     USING GIST (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326));

-- Plain B-tree indexes for common portal queries
CREATE INDEX doctors_city_idx          ON doctors (city);
CREATE INDEX doctors_specialization_idx ON doctors (specialization);
CREATE INDEX doctors_status_idx        ON doctors (status);

-- =============================================================================
-- TABLE: appointments  (scheduling — from Mongoose Appointment.js)
-- Declared before prescriptions because prescriptions reference it via FK.
-- =============================================================================
CREATE TABLE appointments (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id         UUID         NOT NULL REFERENCES doctors  (id) ON DELETE RESTRICT,
    patient_id        UUID         NOT NULL REFERENCES users    (id) ON DELETE CASCADE,
    scheduled_at      TIMESTAMP WITH TIME ZONE NOT NULL,
    status            VARCHAR(20)  NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','confirmed','active','completed','cancelled')),
    consultation_type VARCHAR(20)  NOT NULL DEFAULT 'video'
                          CHECK (consultation_type IN ('video','chat','in-person')),
    notes             TEXT,
    amount            NUMERIC(10, 2),
    payment_status    VARCHAR(20)  NOT NULL DEFAULT 'pending'
                          CHECK (payment_status IN ('pending','paid','refunded')),
    created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX appointments_doctor_id_idx  ON appointments (doctor_id, scheduled_at DESC);
CREATE INDEX appointments_patient_id_idx ON appointments (patient_id, scheduled_at DESC);
CREATE INDEX appointments_status_idx     ON appointments (status);

-- =============================================================================
-- TABLE: prescriptions  (care plans — from Mongoose Prescription.js)
-- =============================================================================
CREATE TABLE prescriptions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id  UUID         NOT NULL UNIQUE
                        REFERENCES appointments (id) ON DELETE CASCADE,
    doctor_id       UUID         NOT NULL REFERENCES doctors (id),
    patient_id      UUID         NOT NULL REFERENCES users   (id),
    notes           TEXT         DEFAULT '',
    -- medicines is an array of {name, details} objects stored as JSONB
    -- Schema: [{"name": "Triphala", "details": "1 tsp with warm water"}]
    medicines       JSONB        NOT NULL DEFAULT '[]'::jsonb,
    diet_pathya     TEXT         DEFAULT '',  -- encouraged foods/habits
    diet_apathya    TEXT         DEFAULT '',  -- foods/habits to avoid
    lifestyle_plan  TEXT         DEFAULT '',  -- dinacharya, exercise, sleep
    follow_up_date  DATE,
    follow_up_notes TEXT         DEFAULT '',
    status          VARCHAR(20)  NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'finalized')),
    finalized_at    TIMESTAMP WITH TIME ZONE,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX prescriptions_patient_status_idx ON prescriptions (patient_id, status, updated_at DESC);

-- Validate medicines JSONB is an array
ALTER TABLE prescriptions
    ADD CONSTRAINT prescriptions_medicines_is_array
    CHECK (jsonb_typeof(medicines) = 'array');

-- =============================================================================
-- TABLE: reports  (AI consultation output — from Mongoose Report.js)
--
-- CRITICAL DESIGN CONSTRAINTS (from AyurCare-Doc.docx):
--   1. is_verified    DEFAULT false — immutable initial state; only doctors update this
--   2. hidden_by_patient DEFAULT false — AI-created reports are doctor-visible by default
--   3. UNIQUE (patient_id, session_id) — enables atomic upsert idempotency
--      ON CONFLICT (patient_id, session_id) DO UPDATE preserves created_at
--   4. report_data JSONB — stores the full nested AI report payload including:
--      - report_data.schemaVersion
--      - report_data.reports[0].reportType
--      - report_data.reports[0].reportData.doshaProfile.percentages
--      - report_data.reports[0].reportData.threatLevel
-- =============================================================================
CREATE TABLE reports (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id         UUID         NOT NULL REFERENCES users    (id) ON DELETE CASCADE,
    session_id         UUID,                                      -- nullable; no FK (session in bot-brain)
    report_type        VARCHAR(100),
    report_title       VARCHAR(500),
    -- Full AI report payload — JSONB allows deep querying without schema changes
    -- Structure mirrors schemaVersion 'reports.v2':
    --   { "schemaVersion": "reports.v2",
    --     "patientInfo": {...},
    --     "reports": [{ "reportType": "...", "reportData": {...doshaProfile, kpis...} }] }
    report_data        JSONB,
    diagnosis          TEXT         NOT NULL,                     -- required; indexed for search
    symptoms           VARCHAR(500) DEFAULT '',
    recommendations    TEXT         DEFAULT '',
    threat_level       VARCHAR(50),                              -- 'Low'|'Moderate'|'High'
    severity           VARCHAR(50),
    date               DATE,

    -- ── IMMUTABLE INITIALIZATION STATE ─────────────────────────────────────
    -- Both fields default to FALSE at INSERT and are never set to TRUE
    -- by the AI system.  Only doctors can toggle is_verified via the
    -- doctor portal (PATCH /api/doctor/prescription/finalize equivalent).
    is_verified        BOOLEAN      NOT NULL DEFAULT false,
    hidden_by_patient  BOOLEAN      NOT NULL DEFAULT false,

    created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- ── UPSERT IDEMPOTENCY CONSTRAINT ──────────────────────────────────────
    -- Enforces that the bot-brain's upsert_patient_consultation_report()
    -- never creates duplicate records for the same consultation session.
    -- ON CONFLICT (patient_id, session_id) DO UPDATE ... (see controllers)
    CONSTRAINT reports_patient_session_unique UNIQUE (patient_id, session_id)
);

-- Indexes for doctor queue and patient portal queries
CREATE INDEX reports_patient_id_created_idx   ON reports (patient_id, created_at DESC);
CREATE INDEX reports_hidden_by_patient_idx    ON reports (hidden_by_patient) WHERE hidden_by_patient = false;
CREATE INDEX reports_threat_level_idx         ON reports (threat_level);
-- GIN index enables fast JSONB path queries (e.g., doshaProfile.dominant)
CREATE INDEX reports_report_data_gin_idx      ON reports USING GIN (report_data jsonb_path_ops);

-- Validate threat_level values
ALTER TABLE reports
    ADD CONSTRAINT reports_threat_level_check
    CHECK (threat_level IS NULL OR threat_level IN ('Low', 'Moderate', 'High'));

-- =============================================================================
-- TABLE: sessions  (chat sessions — managed by bot-brain, mirrored here for FK)
-- =============================================================================
CREATE TABLE sessions (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                     UUID         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title                       VARCHAR(255) DEFAULT 'New Consultation',
    messages                    JSONB        NOT NULL DEFAULT '[]'::jsonb,
    symptoms                    TEXT[]       DEFAULT '{}',
    answers                     JSONB        NOT NULL DEFAULT '{}'::jsonb,
    diagnosis                   TEXT,
    vault_prompt_shown          BOOLEAN      NOT NULL DEFAULT false,
    vault_user_responded        BOOLEAN      NOT NULL DEFAULT false,
    recipes_text                TEXT,
    recipes_diagnosis_sig       VARCHAR(50),
    recommendation_plan         JSONB,
    recommendation_diagnosis_sig VARCHAR(50),
    created_at                  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX sessions_user_id_updated_idx ON sessions (user_id, updated_at DESC);

-- =============================================================================
-- TRIGGERS — auto-update updated_at on any UPDATE
-- =============================================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER users_updated_at         BEFORE UPDATE ON users         FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER doctors_updated_at       BEFORE UPDATE ON doctors       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER appointments_updated_at  BEFORE UPDATE ON appointments  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER prescriptions_updated_at BEFORE UPDATE ON prescriptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER reports_updated_at       BEFORE UPDATE ON reports       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER sessions_updated_at      BEFORE UPDATE ON sessions      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- VIEWS — doctor queue (replaces Mongoose Report.find({hiddenByPatient: {$ne: true}}))
-- =============================================================================
CREATE OR REPLACE VIEW doctor_report_queue AS
SELECT
    r.id,
    r.patient_id,
    r.session_id,
    r.report_type,
    r.report_title,
    r.diagnosis,
    r.symptoms,
    r.threat_level,
    r.is_verified,
    r.created_at,
    r.updated_at,
    u.name       AS patient_name,
    u.email      AS patient_email,
    -- Extract doshaProfile.dominant from nested JSONB
    r.report_data -> 'reports' -> 0 -> 'reportData' -> 'doshaProfile' ->> 'dominant'
        AS dominant_dosha
FROM reports r
JOIN users   u ON u.id = r.patient_id
WHERE r.hidden_by_patient = false
ORDER BY r.created_at DESC;
