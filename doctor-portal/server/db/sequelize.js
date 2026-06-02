'use strict';
/**
 * Sequelize singleton — PostgreSQL connection.
 *
 * Priority order for the connection URI:
 *   1. DATABASE_URL  — set automatically by Render, Supabase, Neon, Railway, Heroku
 *   2. POSTGRES_URI  — legacy env var used in local .env
 *   3. Individual PGHOST / PGPORT / PGDATABASE / PGUSER / PGPASSWORD vars
 */
const { Sequelize } = require('sequelize');

const uri = process.env.DATABASE_URL
         || process.env.POSTGRES_URI
         || `postgres://${process.env.PGUSER}:${process.env.PGPASSWORD}`
          + `@${process.env.PGHOST || 'localhost'}:${process.env.PGPORT || 5432}`
          + `/${process.env.PGDATABASE || 'ayurcare'}`;

const sequelize = new Sequelize(uri, {
  dialect: 'postgres',
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: {
    max: 10,
    min: 2,
    acquire: 30_000,
    idle: 10_000,
  },
  dialectOptions: {
    // Match the TLS setting from the old MongoDB connection
    ssl: process.env.NODE_ENV === 'production'
      ? { require: true, rejectUnauthorized: false }
      : false,
    statement_timeout: 8_000,   // replaces .maxTimeMS(8000)
  },
  define: {
    underscored: true,           // snake_case columns ↔ camelCase JS
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
});

module.exports = sequelize;
