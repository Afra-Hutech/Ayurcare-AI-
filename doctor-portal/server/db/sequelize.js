'use strict';
/**
 * Sequelize singleton — PostgreSQL connection.
 * Replaces: mongoose.connect(MONGODB_URI)
 *
 * Required env vars:
 *   POSTGRES_URI  — full connection string: postgres://user:pass@host:5432/dbname
 *   Or split: PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD
 */
const { Sequelize } = require('sequelize');

const uri = process.env.POSTGRES_URI
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
