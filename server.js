require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const Database = require('./database-debug');

const app = express();

// CORS middleware - allow requests from Shopify stores
app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  // Allow requests from any .myshopify.com domain or custom domains
  if (origin && (origin.includes('.myshopify.com') || origin.includes('.store'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Shop-Domain, X-Original-Shop');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

app.use(express.json());
app.use(express.static('public'));

// Initialize database
const db = new Database();

// Simplified Shopify API client
class SimpleShopifyAPI {
  constructor(shop, accessToken) {
    this.shop = shop;
    this.accessToken = accessToken;
    this.baseUrl = `https://${shop}/admin/api/2024-01`;
    console.log('🔧 SimpleShopifyAPI initialized for shop:', shop);
    console.log('🔧 Base URL:', this.baseUrl);
    console.log('🔧 Token length:', accessToken ? accessToken.length : 'No token');
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}/${endpoint}`;
    console.log('📡 Making request to:', url);
    console.log('📡 Method:', options.method || 'GET');
    
    const headers = {
      'X-Shopify-Access-Token': this.accessToken,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers
    };
    
    console.log('📡 Headers:', Object.keys(headers));
    
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    console.log('📡 Response status:', response.status);
    console.log('📡 Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const responseText = await response.text();
      console.error('📡 Error response body:', responseText);
      throw new Error(`Shopify API error: ${response.status} ${response.statusText} - ${responseText}`);
    }

    const data = await response.json();
    console.log('📡 Success response keys:', Object.keys(data));
    return data;
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
    state: state
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

// Shopify OAuth start
app.get('/auth', async (req, res) => {
  try {
    const shop = req.query.shop;
    if (!shop) {
      return res.status(400).send('Missing shop parameter');
    }

    // Clean and validate shop domain
    let cleanShop = shop.replace(/https?:\/\//, '').replace(/\/$/, '');
    if (!cleanShop.includes('.myshopify.com')) {
      cleanShop = cleanShop + '.myshopify.com';
    }

    console.log('Starting OAuth for shop:', cleanShop);

    // Generate state for CSRF protection
    const state = Math.random().toString(36).substring(7);
    
    // Build OAuth URL
    const oauthUrl = getOAuthUrl(cleanShop, state);
    console.log('Redirecting to OAuth URL:', oauthUrl);
    
    res.redirect(oauthUrl);
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).send(`Authentication failed: ${error.message}`);
  }
});

// Shopify OAuth callback
app.get('/auth/callback', async (req, res) => {
  try {
    const { code, shop, state, error } = req.query;
    
    console.log('OAuth callback received:', { code: !!code, shop, state, error });
    
    if (error) {
      console.error('OAuth error:', error);
      return res.status(400).send(`OAuth error: ${error}`);
    }
    
    if (!code || !shop) {
      console.error('Missing required parameters:', { code: !!code, shop });
      return res.status(400).send('Missing required OAuth parameters');
    }

    const cleanShop = shop.replace(/https?:\/\//, '').replace(/\/$/, '');
    console.log('Processing OAuth for shop:', cleanShop);
    
    // Get access token
    const tokenData = await verifyOAuthCallback(code, cleanShop, state);
    console.log('Token received:', { hasToken: !!tokenData.access_token, scope: tokenData.scope });
    
    // Create and store session
    const session = {
      id: `${cleanShop}_${Date.now()}`,
      shop: cleanShop,
      accessToken: tokenData.access_token,
      scope: tokenData.scope,
      created_at: new Date().toISOString()
    };
    
    await db.storeSession(session);
    console.log('Session stored successfully for:', cleanShop);
    
    // Install script tag
    await installScriptTag(session);
    
    // Redirect to embedded app in Shopify admin
    const redirectUrl = `https://${cleanShop}/admin/apps/${process.env.SHOPIFY_API_KEY}`;
    console.log('Redirecting to embedded app:', redirectUrl);
    res.redirect(redirectUrl);
    
  } catch (error) {
    console.error('Callback error:', error);
    res.status(500).send(`Authentication failed: ${error.message}`);
  }
});

// Install script tag for frontend functionality
async function installScriptTag(session) {
  try {
    console.log('Installing script tag for:', session.shop);
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

// Middleware to get session for API routes
async function getSessionMiddleware(req, res, next) {
  try {
    const shop = req.query.shop || req.headers['x-shop-domain'];
    if (!shop) {
      return res.status(400).json({ error: 'Missing shop parameter' });
    }
    
    console.log('🔍 Looking for session for shop:', shop);
    const session = await db.getSession(shop);
    
    if (!session) {
      console.error('❌ No session found for shop:', shop);
      return res.status(401).json({ 
        error: 'Shop not authenticated', 
        redirect: `/auth?shop=${shop}`,
        message: 'Please reinstall the app'
      });
    }
    
    // Check if session has required fields
    if (!session.accessToken) {
      console.error('❌ Session missing access token for shop:', shop);
      return res.status(401).json({ 
        error: 'Invalid session - missing access token',
        redirect: `/auth?shop=${shop}`,
        message: 'Please reinstall the app'
      });
    }
    
    console.log('✅ Valid session found for shop:', shop);
    req.session = session;
    next();
  } catch (error) {
    console.error('Session middleware error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Debug endpoint to check sessions
app.get('/debug/sessions', async (req, res) => {
  try {
    const shop = req.query.shop;
    if (shop) {
      const session = await db.getSession(shop);
      res.json({ 
        shop, 
        hasSession: !!session, 
        sessionData: session ? { 
          shop: session.shop, 
          hasToken: !!session.accessToken, 
          scope: session.scope,
          tokenLength: session.accessToken ? session.accessToken.length : 0,
          created: session.created_at,
          expires: session.expires
        } : null 
      });
    } else {
      res.json({ error: 'Provide ?shop=yourstore.myshopify.com' });
    }
  } catch (error) {
    res.json({ error: error.message });
  }
});

// Test endpoint to verify API connection
app.get('/debug/test-api', async (req, res) => {
  try {
    const shop = req.query.shop;
    if (!shop) {
      return res.json({ error: 'Provide ?shop=yourstore.myshopify.com' });
    }
    
    const session = await db.getSession(shop);
    if (!session) {
      return res.json({ error: 'No session found', shop });
    }
    
    console.log('🧪 Testing API connection for shop:', shop);
    console.log('🧪 Session scopes:', session.scope);
    
    const api = new SimpleShopifyAPI(session.shop, session.accessToken);
    
    // Test with different endpoints to see which scopes work
    const tests = {};
    
    try {
      console.log('🧪 Testing shop.json...');
      const shopResult = await api.request('shop.json');
      tests.shop = { success: true, name: shopResult.shop.name };
    } catch (error) {
      tests.shop = { success: false, error: error.message };
    }
    
    try {
      console.log('🧪 Testing products.json...');
      const productsResult = await api.request('products.json?limit=1');
      tests.products = { success: true, count: productsResult.products.length };
    } catch (error) {
      tests.products = { success: false, error: error.message };
    }
    
    try {
      console.log('🧪 Testing script_tags.json...');
      const scriptTagsResult = await api.request('script_tags.json');
      tests.scriptTags = { success: true, count: scriptTagsResult.script_tags.length };
    } catch (error) {
      tests.scriptTags = { success: false, error: error.message };
    }
    
    res.json({ 
      shop: session.shop,
      scopes: session.scope,
      tokenLength: session.accessToken.length,
      tests
    });
  } catch (error) {
    console.error('🧪 API test failed:', error);
    res.json({ 
      success: false, 
      error: error.message,
      shop: req.query.shop
    });
  }
});

// Endpoint to resolve custom domain to myshopify.com domain
app.get('/api/resolve-shop', async (req, res) => {
  try {
    const customDomain = req.query.domain;
    const shopHeader = req.headers['x-shop-domain'];
    
    console.log('🔍 Resolving custom domain:', customDomain);
    console.log('🔍 Shop header:', shopHeader);
    
    // Domain mappings
    const domainMappings = {
      'paceworx.store': 'megrq8-sg.myshopify.com',
      // Add more mappings as needed
    };
    
    const resolvedShop = domainMappings[customDomain];
    
    if (resolvedShop) {
      console.log('✅ Resolved domain:', customDomain, '→', resolvedShop);
      res.json({ shop: resolvedShop, domain: customDomain });
    } else {
      console.log('❌ Could not resolve domain:', customDomain);
      res.status(404).json({ error: 'Domain not found', domain: customDomain });
    }
  } catch (error) {
    console.error('Error resolving domain:', error);
    res.status(500).json({ error: 'Failed to resolve domain' });
  }
});

// API Routes
app.get('/api/products', getSessionMiddleware, async (req, res) => {
  try {
    console.log('🛍️ Fetching products for shop:', req.session.shop);
    console.log('🔑 Using access token:', req.session.accessToken ? 'Present' : 'Missing');
    
    const api = new SimpleShopifyAPI(req.session.shop, req.session.accessToken);
    const products = await api.getProducts(50);
    
    console.log('✅ Successfully fetched', products.products.length, 'products');
    res.json(products.products);
  } catch (error) {
    console.error('❌ Error fetching products:', error);
    
    // If it's a 401, the session is likely expired
    if (error.message.includes('401')) {
      console.log('🔄 Session appears expired, clearing from database');
      return res.status(401).json({ 
        error: 'Authentication expired',
        redirect: `/auth?shop=${req.session.shop}`,
        message: 'Please reinstall the app - your session has expired'
      });
    }
    
    res.status(500).json({ error: 'Failed to fetch products', details: error.message });
  }
});

app.get('/api/addons/:productId', async (req, res) => {
  try {
    let productId = req.params.productId;
    let shop = req.query.shop || 'default';
    
    console.log('Getting addons for productId:', productId, 'shop:', shop);
    
    // Handle custom domain resolution
    const customDomain = req.headers['x-shop-domain'];
    if (customDomain && !shop.includes('.myshopify.com')) {
      console.log('Custom domain detected:', customDomain, 'provided shop:', shop);
      
      // Try to map custom domain to actual shop
      const domainMappings = {
        'paceworx.store': 'megrq8-sg.myshopify.com',
      };
      
      const resolvedShop = domainMappings[customDomain];
      if (resolvedShop) {
        console.log('Resolved custom domain to:', resolvedShop);
        shop = resolvedShop;
      }
    }
    
    // If productId looks like a handle (string), try to convert it to ID
    if (isNaN(productId)) {
      console.log('Product ID appears to be a handle, attempting lookup...');
      try {
        const session = await db.getSession(shop);
        if (session) {
          const api = new SimpleShopifyAPI(session.shop, session.accessToken);
          const products = await api.getProducts(250);
          const product = products.products.find(p => p.handle === productId);
          if (product) {
            productId = product.id;
            console.log('Converted handle to product ID:', productId);
          }
        }
      } catch (error) {
        console.error('Error converting handle to product ID:', error);
      }
    }
    
    const addons = await db.getAddons(productId, shop);
    console.log('Found', addons.length, 'addons for product', productId, 'shop', shop);
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
    
    console.log('🔧 Creating addon with data:');
    console.log('  productId:', productId);
    console.log('  name:', name);
    console.log('  price:', price);
    console.log('  type:', type);
    console.log('  required:', required);
    console.log('  options:', options);
    console.log('  shop:', shop);
    
    // Validate required fields
    if (!productId) {
      console.error('❌ Missing productId');
      return res.status(400).json({ error: 'Product ID is required' });
    }
    if (!name) {
      console.error('❌ Missing name');
      return res.status(400).json({ error: 'Add-on name is required' });
    }
    if (price === undefined || price === null) {
      console.error('❌ Missing price');
      return res.status(400).json({ error: 'Price is required' });
    }
    if (!type) {
      console.error('❌ Missing type');
      return res.status(400).json({ error: 'Add-on type is required' });
    }
    
    const addon = await db.createAddon({
      productId,
      name,
      price: parseFloat(price),
      type,
      required: required || false,
      options: options || null,
      shop
    });
    
    console.log('✅ Addon created successfully:', addon);
    res.json(addon);
  } catch (error) {
    console.error('❌ Error creating addon:', error);
    res.status(500).json({ error: 'Failed to create addon', details: error.message });
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

// Serve admin interface with App Bridge support
app.get('/', (req, res) => {
  const shop = req.query.shop;
  const host = req.query.host;
  
  // Read the HTML file and inject the API key
  const fs = require('fs');
  const path = require('path');
  
  try {
    let html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
    
    // Replace API key placeholder
    html = html.replace('YOUR_API_KEY', process.env.SHOPIFY_API_KEY || '');
    
    // Add App Bridge embedding headers
    res.setHeader('Content-Security-Policy', `frame-ancestors https://${shop} https://admin.shopify.com;`);
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    
    res.send(html);
  } catch (error) {
    console.error('Error serving admin interface:', error);
    res.status(500).send('Error loading admin interface');
  }
});

// Serve the frontend script
app.get('/product-addons.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.sendFile(__dirname + '/public/product-addons.js');
});

// Error handling middleware
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