require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const Database = require('./database');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Initialize database
const db = new Database();

// Simplified Shopify API client
class SimpleShopifyAPI {
  constructor(shop, accessToken) {
    this.shop = shop;
    this.accessToken = accessToken;
    this.baseUrl = `https://${shop}/admin/api/2023-10`;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}/${endpoint}`;
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        'X-Shopify-Access-Token': this.accessToken,
        'Content-Type': 'application/json',
        ...options.headers
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  async getProducts(limit = 50) {
    return await this.request(`products.json?limit=${limit}`);
  }

  async getScriptTags() {
    return await this.request('script_tags.json');
  }

  async createScriptTag(scriptTag) {
    return await this.request('script_tags.json', {
      method: 'POST',
      body: { script_tag: scriptTag }
    });
  }
}

// Generate OAuth URL
function getOAuthUrl(shop, state) {
  const params = new URLSearchParams({
    client_id: process.env.SHOPIFY_API_KEY,
    scope: 'read_products,write_products,read_script_tags,write_script_tags',
    redirect_uri: `${process.env.HOST}/auth/callback`,
    state: state,
    'grant_options[]': 'per-user'
  });
  
  return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
}

// Verify OAuth callback
async function verifyOAuthCallback(code, shop, state) {
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_API_SECRET,
      code: code
    })
  });

  if (!response.ok) {
    throw new Error('Failed to get access token');
  }

  return await response.json();
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Debug endpoint to check sessions (remove in production)
app.get('/debug/sessions', async (req, res) => {
  try {
    const shop = req.query.shop;
    if (shop) {
      const session = await db.getSession(shop);
      res.json({ 
        shop, 
        hasSession: !!session, 
        sessionData: session ? { shop: session.shop, hasToken: !!session.accessToken } : null 
      });
    } else {
      res.json({ error: 'Provide ?shop=yourstore.myshopify.com' });
    }
  } catch (error) {
    res.json({ error: error.message });
  }
});

// Shopify OAuth start
app.get('/auth', async (req, res) => {
  try {
    const shop = req.query.shop;
    if (!shop || !shop.includes('.myshopify.com')) {
      return res.status(400).send('Invalid shop parameter');
    }

    const cleanShop = shop.replace(/https?:\/\//, '').replace(/\/$/, '');
    const state = Math.random().toString(36).substring(7);
    
    // Store state for verification
    req.session = { state };
    
    const oauthUrl = getOAuthUrl(cleanShop, state);
    res.redirect(oauthUrl);
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).send(`Authentication failed: ${error.message}`);
  }
});

// Shopify OAuth callback
app.get('/auth/callback', async (req, res) => {
  try {
    const { code, shop, state } = req.query;
    
    if (!code || !shop) {
      return res.status(400).send('Missing required parameters');
    }

    const cleanShop = shop.replace(/https?:\/\//, '').replace(/\/$/, '');
    
    // Get access token
    const tokenData = await verifyOAuthCallback(code, cleanShop, state);
    
    // Create session object
    const session = {
      id: `${cleanShop}_${Date.now()}`,
      shop: cleanShop,
      accessToken: tokenData.access_token,
      scope: tokenData.scope
    };
    
    // Store session
    await db.storeSession(session);
    console.log('Session stored for shop:', session.shop);
    
    // Install script tag
    await installScriptTag(session);
    
    // Redirect to app
    res.redirect(`/?shop=${cleanShop}&installed=true`);
  } catch (error) {
    console.error('Callback error:', error);
    res.status(500).send(`Authentication failed: ${error.message}`);
  }
});

// Install script tag
async function installScriptTag(session) {
  try {
    const api = new SimpleShopifyAPI(session.shop, session.accessToken);
    
    // Check if script tag already exists
    const existingScripts = await api.getScriptTags();
    const scriptExists = existingScripts.script_tags.some(
      script => script.src.includes('product-addons.js')
    );
    
    if (!scriptExists) {
      await api.createScriptTag({
        event: 'onload',
        src: `${process.env.HOST}/product-addons.js`,
        display_scope: 'all'
      });
      console.log('Script tag installed successfully');
    } else {
      console.log('Script tag already exists');
    }
  } catch (error) {
    console.error('Error installing script tag:', error);
    // Continue even if script tag installation fails
  }
}

// Middleware to get session
async function getSessionMiddleware(req, res, next) {
  try {
    const shop = req.query.shop || req.headers['x-shop-domain'];
    if (!shop) {
      return res.status(400).json({ error: 'Missing shop parameter' });
    }
    
    const session = await db.getSession(shop);
    if (!session) {
      return res.status(401).json({ error: 'Shop not authenticated' });
    }
    
    req.session = session;
    req.api = new SimpleShopifyAPI(session.shop, session.accessToken);
    next();
  } catch (error) {
    console.error('Session middleware error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// API Routes
app.get('/api/products', getSessionMiddleware, async (req, res) => {
  try {
    const products = await req.api.getProducts(50);
    res.json(products.products);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

app.get('/api/addons/:productId', async (req, res) => {
  try {
    const shop = req.query.shop || 'default';
    const addons = await db.getAddons(req.params.productId, shop);
    res.json(addons);
  } catch (error) {
    console.error('Error fetching addons:', error);
    res.status(500).json({ error: 'Failed to fetch addons' });
  }
});

app.post('/api/addons', async (req, res) => {
  try {
    const { productId, name, price, type, required, options } = req.body;
    const shop = req.query.shop || req.body.shop || 'default';
    
    const addon = await db.createAddon({
      productId,
      name,
      price: parseFloat(price),
      type,
      required: required || false,
      options: options || null,
      shop
    });
    
    res.json(addon);
  } catch (error) {
    console.error('Error creating addon:', error);
    res.status(500).json({ error: 'Failed to create addon' });
  }
});

app.put('/api/addons/:id', async (req, res) => {
  try {
    const addon = await db.updateAddon(req.params.id, req.body);
    res.json(addon);
  } catch (error) {
    console.error('Error updating addon:', error);
    res.status(500).json({ error: 'Failed to update addon' });
  }
});

app.delete('/api/addons/:id', async (req, res) => {
  try {
    await db.deleteAddon(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting addon:', error);
    res.status(500).json({ error: 'Failed to delete addon' });
  }
});

// Serve admin interface
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Serve the frontend script
app.get('/product-addons.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.sendFile(__dirname + '/public/product-addons.js');
});

// Error handling
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Product Add-ons App running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Host: ${process.env.HOST || 'localhost'}`);
});