const sqlite3 = require('sqlite3').verbose();

class Database {
  constructor() {
    this.db = new sqlite3.Database('./app.db');
    this.init();
  }

  init() {
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
        options TEXT, -- JSON string for dropdown options
        active BOOLEAN DEFAULT TRUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  // Session management
  async storeSession(session) {
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
        else resolve(this.lastID);
      });
      
      stmt.finalize();
    });
  }

  async getSession(shop) {
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

  // Addon management
  async createAddon(addonData) {
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
        addonData.required,
        addonData.options ? JSON.stringify(addonData.options) : null
      ], function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, ...addonData });
      });
      
      stmt.finalize();
    });
  }

  async getAddons(productId, shop = 'default') {
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

  async updateAddon(id, updateData) {
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
      
      const stmt = this.db.prepare(`
        UPDATE addons SET ${fields.join(', ')} WHERE id = ?
      `);
      
      stmt.run(values, function(err) {
        if (err) reject(err);
        else resolve({ id, changes: this.changes });
      });
      
      stmt.finalize();
    });
  }

  async deleteAddon(id) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare('UPDATE addons SET active = FALSE WHERE id = ?');
      
      stmt.run([id], function(err) {
        if (err) reject(err);
        else resolve({ id, changes: this.changes });
      });
      
      stmt.finalize();
    });
  }

  async getAllAddons(shop = 'default') {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM addons WHERE shop = ? AND active = TRUE ORDER BY created_at DESC',
        [shop],
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

module.exports = Database;