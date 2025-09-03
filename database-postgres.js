const { Pool } = require('pg');

class Database {
  constructor() {
    // Use Railway's PostgreSQL or SQLite fallback
    if (process.env.DATABASE_URL || process.env.PGHOST) {
      console.log('Using PostgreSQL database');
      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
      });
      this.type = 'postgres';
    } else {
      console.log('Using SQLite database');
      const sqlite3 = require('sqlite3').verbose();
      this.db = new sqlite3.Database('./app.db');
      this.type = 'sqlite';
    }
    
    this.init();
  }

  async init() {
    if (this.type === 'postgres') {
      await this.initPostgres();
    } else {
      this.initSQLite();
    }
  }

  async initPostgres() {
    try {
      // Create sessions table
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          shop TEXT NOT NULL,
          access_token TEXT NOT NULL,
          scope TEXT,
          expires BIGINT,
          is_online BOOLEAN,
          state TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create addons table
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS addons (
          id SERIAL PRIMARY KEY,
          product_id TEXT NOT NULL,
          shop TEXT NOT NULL,
          name TEXT NOT NULL,
          price DECIMAL(10,2) NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('checkbox', 'dropdown')),
          required BOOLEAN DEFAULT FALSE,
          options JSONB,
          active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      console.log('PostgreSQL tables initialized');
    } catch (error) {
      console.error('PostgreSQL initialization error:', error);
    }
  }

  initSQLite() {
    // Create sessions table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        shop TEXT NOT NULL,
        accessToken TEXT NOT NULL,
        scope TEXT,
        expires INTEGER,
        isOnline BOOLEAN,
        state TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create addons table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS addons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        productId TEXT NOT NULL,
        shop TEXT NOT NULL,
        name TEXT NOT NULL,
        price REAL NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('checkbox', 'dropdown')),
        required BOOLEAN DEFAULT FALSE,
        options TEXT,
        active BOOLEAN DEFAULT TRUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('SQLite tables initialized');
  }

  // Session management
  async storeSession(session) {
    if (this.type === 'postgres') {
      const query = `
        INSERT INTO sessions (id, shop, access_token, scope, expires, is_online, state) 
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE SET
        shop = EXCLUDED.shop,
        access_token = EXCLUDED.access_token,
        scope = EXCLUDED.scope,
        expires = EXCLUDED.expires,
        is_online = EXCLUDED.is_online,
        state = EXCLUDED.state
      `;
      
      await this.pool.query(query, [
        session.id,
        session.shop,
        session.accessToken,
        session.scope,
        session.expires,
        session.isOnline,
        session.state || null
      ]);
      
      console.log('Session stored in PostgreSQL for:', session.shop);
      return session;
    } else {
      return new Promise((resolve, reject) => {
        const stmt = this.db.prepare(`
          INSERT OR REPLACE INTO sessions 
          (id, shop, accessToken, scope, expires, isOnline, state) 
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        
        stmt.run([
          session.id,
          session.shop,
          session.accessToken,
          session.scope,
          session.expires,
          session.isOnline,
          session.state || null
        ], function(err) {
          if (err) reject(err);
          else {
            console.log('Session stored in SQLite for:', session.shop);
            resolve(session);
          }
        });
        
        stmt.finalize();
      });
    }
  }

  async getSession(shop) {
    if (this.type === 'postgres') {
      const query = 'SELECT * FROM sessions WHERE shop = $1 ORDER BY created_at DESC LIMIT 1';
      const result = await this.pool.query(query, [shop]);
      
      if (result.rows.length > 0) {
        const row = result.rows[0];
        return {
          id: row.id,
          shop: row.shop,
          accessToken: row.access_token,
          scope: row.scope,
          expires: row.expires,
          isOnline: row.is_online,
          state: row.state
        };
      }
      return null;
    } else {
      return new Promise((resolve, reject) => {
        this.db.get(
          'SELECT * FROM sessions WHERE shop = ? ORDER BY created_at DESC LIMIT 1',
          [shop],
          (err, row) => {
            if (err) reject(err);
            else if (row) {
              resolve({
                id: row.id,
                shop: row.shop,
                accessToken: row.accessToken,
                scope: row.scope,
                expires: row.expires,
                isOnline: row.isOnline,
                state: row.state
              });
            } else {
              resolve(null);
            }
          }
        );
      });
    }
  }

  // Addon management
  async createAddon(addonData) {
    if (this.type === 'postgres') {
      const query = `
        INSERT INTO addons (product_id, shop, name, price, type, required, options) 
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;
      
      const result = await this.pool.query(query, [
        addonData.productId,
        addonData.shop || 'default',
        addonData.name,
        addonData.price,
        addonData.type,
        addonData.required || false,
        addonData.options ? JSON.stringify(addonData.options) : null
      ]);
      
      console.log('Addon created in PostgreSQL:', result.rows[0].id);
      return result.rows[0];
    } else {
      return new Promise((resolve, reject) => {
        const stmt = this.db.prepare(`
          INSERT INTO addons (productId, shop, name, price, type, required, options) 
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        
        stmt.run([
          addonData.productId,
          addonData.shop || 'default',
          addonData.name,
          addonData.price,
          addonData.type,
          addonData.required || false,
          addonData.options ? JSON.stringify(addonData.options) : null
        ], function(err) {
          if (err) reject(err);
          else {
            console.log('Addon created in SQLite:', this.lastID);
            resolve({ id: this.lastID, ...addonData });
          }
        });
        
        stmt.finalize();
      });
    }
  }

  async getAddons(productId, shop = 'default') {
    if (this.type === 'postgres') {
      const query = 'SELECT * FROM addons WHERE product_id = $1 AND shop = $2 AND active = TRUE';
      const result = await this.pool.query(query, [productId, shop]);
      
      return result.rows.map(row => ({
        id: row.id,
        productId: row.product_id,
        shop: row.shop,
        name: row.name,
        price: parseFloat(row.price),
        type: row.type,
        required: row.required,
        options: row.options ? JSON.parse(row.options) : null,
        active: row.active,
        created_at: row.created_at,
        updated_at: row.updated_at
      }));
    } else {
      return new Promise((resolve, reject) => {
        this.db.all(
          'SELECT * FROM addons WHERE productId = ? AND shop = ? AND active = TRUE',
          [productId, shop],
          (err, rows) => {
            if (err) reject(err);
            else {
              const addons = rows.map(row => ({
                ...row,
                options: row.options ? JSON.parse(row.options) : null
              }));
              resolve(addons);
            }
          }
        );
      });
    }
  }

  async updateAddon(id, updateData) {
    if (this.type === 'postgres') {
      const fields = [];
      const values = [];
      let paramCount = 1;
      
      Object.keys(updateData).forEach(key => {
        if (key === 'options') {
          fields.push(`options = $${paramCount}`);
          values.push(JSON.stringify(updateData[key]));
        } else {
          fields.push(`${key} = $${paramCount}`);
          values.push(updateData[key]);
        }
        paramCount++;
      });
      
      fields.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id);
      
      const query = `UPDATE addons SET ${fields.join(', ')} WHERE id = $${paramCount}`;
      await this.pool.query(query, values);
      
      console.log('Addon updated in PostgreSQL:', id);
      return { id, ...updateData };
    } else {
      return new Promise((resolve, reject) => {
        const fields = [];
        const values = [];
        
        Object.keys(updateData).forEach(key => {
          if (key === 'options') {
            fields.push(`${key} = ?`);
            values.push(JSON.stringify(updateData[key]));
          } else {
            fields.push(`${key} = ?`);
            values.push(updateData[key]);
          }
        });
        
        fields.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);
        
        const stmt = this.db.prepare(`UPDATE addons SET ${fields.join(', ')} WHERE id = ?`);
        
        stmt.run(values, function(err) {
          if (err) reject(err);
          else {
            console.log('Addon updated in SQLite:', id);
            resolve({ id, changes: this.changes });
          }
        });
        
        stmt.finalize();
      });
    }
  }

  async deleteAddon(id) {
    if (this.type === 'postgres') {
      await this.pool.query('UPDATE addons SET active = FALSE WHERE id = $1', [id]);
      console.log('Addon deleted in PostgreSQL:', id);
      return { id, changes: 1 };
    } else {
      return new Promise((resolve, reject) => {
        const stmt = this.db.prepare('UPDATE addons SET active = FALSE WHERE id = ?');
        
        stmt.run([id], function(err) {
          if (err) reject(err);
          else {
            console.log('Addon deleted in SQLite:', id);
            resolve({ id, changes: this.changes });
          }
        });
        
        stmt.finalize();
      });
    }
  }
}

module.exports = Database;