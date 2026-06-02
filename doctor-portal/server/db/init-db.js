'use strict';
/**
 * init-db.js — one-time schema bootstrap for ayurcare_db
 *
 * Run from doctor-portal/server/:
 *   node db/init-db.js
 *
 * Safe to re-run: uses CREATE TABLE IF NOT EXISTS (via Sequelize sync)
 * and CREATE OR REPLACE for the view and trigger function.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const sequelize = require('./sequelize');

// Load all Sequelize models so they register themselves on the sequelize instance
require('../models/User');
require('../models/Doctor');
require('../models/Report');
require('../models/Prescription');

async function init() {
  console.log('\n🔌 Connecting to PostgreSQL...');
  console.log('   URI:', process.env.POSTGRES_URI || `postgres://${process.env.PGUSER}@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}`);

  await sequelize.authenticate();
  console.log('✅ Connection verified.\n');

  // ── Step 1: pgcrypto extension (needed for gen_random_uuid()) ───────────────
  console.log('📦 Enabling pgcrypto extension...');
  await sequelize.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');
  console.log('   done.\n');

  // ── Step 2: Sync the 4 Sequelize models (creates tables if they don\'t exist) ─
  // force: false  → never drops existing tables
  // alter: false  → never modifies existing columns
  console.log('🏗️  Creating model-backed tables (users, doctors, reports, prescriptions)...');
  await sequelize.sync({ force: false, alter: false });
  console.log('   done.\n');

  // ── Step 3: sessions table (no Sequelize model — managed by bot-brain) ───────
  console.log('🏗️  Creating sessions table...');
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id                      UUID         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      title                        VARCHAR(255) DEFAULT 'New Consultation',
      messages                     JSONB        NOT NULL DEFAULT '[]'::jsonb,
      symptoms                     TEXT[]       DEFAULT '{}',
      answers                      JSONB        NOT NULL DEFAULT '{}'::jsonb,
      diagnosis                    TEXT,
      vault_prompt_shown           BOOLEAN      NOT NULL DEFAULT false,
      vault_user_responded         BOOLEAN      NOT NULL DEFAULT false,
      recipes_text                 TEXT,
      recipes_diagnosis_sig        VARCHAR(50),
      recommendation_plan          JSONB,
      recommendation_diagnosis_sig VARCHAR(50),
      created_at                   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at                   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS sessions_user_id_updated_idx
      ON sessions (user_id, updated_at DESC);
  `);
  console.log('   done.\n');

  // ── Step 4: updated_at trigger function + per-table triggers ─────────────────
  console.log('⚡ Installing updated_at triggers...');
  await sequelize.query(`
    CREATE OR REPLACE FUNCTION set_updated_at()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$;
  `);

  const triggerTables = ['users', 'doctors', 'appointments', 'prescriptions', 'reports', 'sessions'];
  for (const tbl of triggerTables) {
    // DROP first so CREATE doesn't fail on re-run
    await sequelize.query(`DROP TRIGGER IF EXISTS ${tbl}_updated_at ON ${tbl};`);
    await sequelize.query(`
      CREATE TRIGGER ${tbl}_updated_at
        BEFORE UPDATE ON ${tbl}
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    `);
  }
  console.log('   done.\n');

  // ── Step 5: doctor_report_queue view ─────────────────────────────────────────
  console.log('👁️  Creating doctor_report_queue view...');
  await sequelize.query(`
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
      u.name  AS patient_name,
      u.email AS patient_email,
      r.report_data -> 'reports' -> 0 -> 'reportData' -> 'doshaProfile' ->> 'dominant'
        AS dominant_dosha
    FROM reports r
    JOIN users   u ON u.id = r.patient_id
    WHERE r.hidden_by_patient = false
    ORDER BY r.created_at DESC;
  `);
  console.log('   done.\n');

  console.log('🎉 ayurcare_db is fully initialised. All tables, triggers, and views are ready.\n');
}

init()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ Initialisation failed:', err.message);
    if (err.original) console.error('   PG detail:', err.original.detail || err.original.message);
    process.exit(1);
  });
