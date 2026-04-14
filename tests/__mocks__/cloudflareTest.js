/**
 * tests/__mocks__/cloudflareTest.js
 *
 * Jest mock for `cloudflare:test`. Provides an `env` object with a D1-compatible
 * in-memory SQLite database backed by better-sqlite3, plus the same test bindings
 * that vitest-pool-workers injected via miniflare.
 *
 * Each test file gets an isolated database because Jest creates a fresh module
 * registry per file, so this module is re-evaluated per file.
 */

const Database = require('better-sqlite3');

const db = new Database(':memory:');

class D1PreparedStatement {
    constructor(sql) {
        this._sql = sql;
        this._params = [];
    }

    bind(...params) {
        this._params = params;
        return this;
    }

    async run() {
        db.prepare(this._sql).run(...this._params);
        return { success: true, meta: {} };
    }

    async first() {
        return db.prepare(this._sql).get(...this._params) ?? null;
    }

    async all() {
        const results = db.prepare(this._sql).all(...this._params);
        return { results, success: true };
    }
}

class D1Database {
    prepare(sql) {
        return new D1PreparedStatement(sql);
    }
}

module.exports = {
    env: {
        DB: new D1Database(),
        JWT_SECRET: 'test-jwt-secret-vitest',
        RESEND_API_KEY: 'test-resend-key',
        FROM_EMAIL: 'test@example.com',
        APP_URL: 'https://test.example.com',
    },
};
