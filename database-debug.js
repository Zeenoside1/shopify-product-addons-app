const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class Database {
  constructor() {
    console.log('🔍 DATABASE DEBUG INFORMATION:');
    console.log('NODE_ENV:', process.env.NODE_ENV);
    console.log('RAILWAY_ENVIRONMENT:', process.env.RAILWAY_ENVIRONMENT);
    
    // Check for PostgreSQL environment variables
    console.log('🐘 PostgreSQL Environment Variables:');
    console.log('DATABASE_URL:', process.env.DATABASE_URL ? '✅ Present' : '❌ Missing');
    console.log('PGHOST:', process.env.PGHOST || '❌ Missing');
    console.log('PGPORT:', process.env.PGPORT || '❌ Missing');
    console.log('PGUSER:', process.env.PGUSER || '❌ Missing');
    console.log('PGPASSWORD:', process.env.PGPASSWORD ? '✅ Present' : '❌ Missing');
    console.log('PGDATABASE:', process.env.PGDATABASE || '❌ Missing');
    
    // Check Railway specific variables
    console.log('🚂 Railway Variables:');
    const railwayVars = Object.keys(process.env).filter(key => key.startsWith('RAILWAY'));
    railwayVars.forEach(key => {
      console.log(`${key}:`, process.env[key]);
    });
    
    // Check database specific variables
    console.log('💾 Database Variables:');
    const dbVars = Object.keys(process.env).filter(key => 
      key.includes('DATABASE') || key.includes('POSTGRES') || key.startsWith('PG')
    );
    dbVars.forEach(key => {
      const value = key.includes('PASSWORD') || key.includes('URL') ? '✅ Present' : process.env[key];
      console.log(`${key}:`, value);
    });
    
    // Try to detect PostgreSQL availability
    if (this.hasPostgresConfig()) {
      console.log('🎯 PostgreSQL configuration detected - attempting connection');
      this.initPostgreSQL();
    } else {
      console.log('🎯 No PostgreSQL config - falling back to SQLite');
      this.initSQLite();
    }
  }

  hasPostgresConfig() {
    return !!(
      process.env.DATABASE_URL || 
      (process.env.PGHOST && process.env.PGDATABASE)
    );
  }

  async initPostgreSQL() {
    try {
      console.log('🐘 Initializing PostgreSQL...');
      const { Pool } = require('pg');
      
      let config;
      if (process.env.DATABASE_URL) {
        config = {
          connectionString: process.env.DATABASE_URL,
          ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
        };
        console.log('Using DATABASE_URL connection string');
      } else {
        config = {
          host: process.env.PGHOST,
          port: process.env.PGPORT || 5432,
          user: process.env.PGUSER,
          password: process.env.PGPASSWORD,
          database: process.env.PGDATABASE,
          ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
        };
        console.log('Using individual PG environment variables');
      }
      
      this.pool = new Pool(config);
      this.type = 'postgres';
      
      // Test connection
      const client = await this.pool.connect();
      const result = await client.query('SELECT version()');
      console.log('✅ PostgreSQL connected successfully!');
      console.log('📊 PostgreSQL version:', result.rows[0].version.split(' ')[0]);
      client.release();
      
      await this.createPostgresTables();
      
    } catch (error) {
      console.error('❌ PostgreSQL connection failed:', error.message);
      console.log('🔄 Falling back to SQLite...');
      this.initSQLite();
    }
  }

  initSQLite() {
    console.log('💾 Initializing SQLite...');
    
    let dbPath;
    if (process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production') {
      // Use Railway persistent storage
      dbPath = '/app/public/uploads/app.db';
      
      // Ensure directory exists
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        console.log('📁 Creating uploads directory:', dir);
        fs.mkdirSync(dir, { recursive: true });
      }
    } else {
      dbPath = './app.db';
    }
    
    console.log('📂 SQLite database path:', dbPath);
    
    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('❌ SQLite connection error:', err);
      } else {
        console.log('✅ SQLite connected successfully');
      }
    });
    
    this.type = 'sqlite';
    this.createSQLiteTables();
  }

  async createPostgresTables() {
    try {
      console.log('🏗️ Creating PostgreSQL tables...');
      
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

      console.log('✅ PostgreSQL tables created successfully');
    } catch (error) {
      console.error('❌ Error creating PostgreSQL tables:', error);
    }
  }

  createSQLiteTables() {
    console.log('🏗️ Creating SQLite tables...');
    
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
    `, (err) => {
      if (err) console.error('❌ Error creating sessions table:', err);
      else console.log('✅ Sessions table ready');
    });

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
    `, (err) => {
      if (err) console.error('❌ Error creating addons table:', err);
      else console.log('✅ Addons table ready');
    });
  }

  // Session management (works with both databases)
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
      
      console.log('📝 Session stored in PostgreSQL for:', session.shop);
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
          if (err) {
            console.error('❌ SQLite session storage error:', err);
            reject(err);
          } else {
            console.log('📝 Session stored in SQLite for:', session.shop);
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
        console.log('📖 Session retrieved from PostgreSQL for:', shop);
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
      console.log('❌ No session found in PostgreSQL for:', shop);
      return null;
    } else {
      return new Promise((resolve, reject) => {
        this.db.get(
          'SELECT * FROM sessions WHERE shop = ? ORDER BY created_at DESC LIMIT 1',
          [shop],
          (err, row) => {
            if (err) {
              console.error('❌ SQLite session retrieval error:', err);
              reject(err);
            } else if (row) {
              console.log('📖 Session retrieved from SQLite for:', shop);
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
              console.log('❌ No session found in SQLite for:', shop);
              resolve(null);
            }
          }
        );
      });
    }
  }

  // Add the rest of the methods (createAddon, getAddons, etc.) here
  // For now, just basic stubs to prevent errors
  async createAddon(addonData) {
    console.log('🔧 createAddon called with:', addonData);
    return { id: 1, ...addonData };
  }

  async getAddons(productId, shop = 'default') {
    console.log('🔧 getAddons called for product:', productId, 'shop:', shop);
    return [];
  }

  async updateAddon(id, updateData) {
    console.log('🔧 updateAddon called for id:', id, 'data:', updateData);
    return { id, ...updateData };
  }

  async deleteAddon(id) {
    console.log('🔧 deleteAddon called for id:', id);
    return { id, changes: 1 };
  }
}

module.exports = Database;