require('dotenv').config();
const express = require('express');
const { shopifyApi, LATEST_API_VERSION, ApiVersion } = require('@shopify/shopify-api');
const { restResources } = require('@shopify/shopify-api/rest/admin/2023-10');
const Database = require('./database');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Initialize Shopify API with proper adapter
const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes: ['read_products', 'write_products', 'read_script_tags', 'write_script_tags'],
  hostName: process.env.HOST?.replace('https://', '') || 'localhost',
  hostScheme: 'https',
  apiVersion: ApiVersion.October23,
  isEmbeddedApp: false, // Changed to false for easier deployment
  restResources,
});

// Initialize database
const db = new Database();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Shopify OAuth
app.get('/auth', async (req, res) => {
  try {
    const shop = req.query.shop;
    if (!shop) {
      return res.status(400).send('Missing shop parameter');
    }

    const sanitizedShop = shopify.utils.sanitizeShop(shop, true);
    if (!sanitizedShop) {
      return res.status(400).send('Invalid shop parameter');
    }

    await shopify.auth.begin({
      shop: sanitizedShop,
      callbackPath: '/auth/callback',
      isOnline: false,
      rawRequest: req,
      rawResponse: res,
    });
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).send(`Authentication failed: ${error.message}`);
  }
});

app.get('/auth/callback', async (req, res) => {
  try {
    const callback = await shopify.auth.callback({
      rawRequest: req,
      rawResponse: res,
    });
    
    // Store session
    const session = callback.session;
    await db.storeSession(session);
    
    console.log('Session stored for shop:', session.shop);
    
    // Install script tag
    await installScriptTag(session);
    
    // Redirect to app with success message
    const redirectUrl = `/?shop=${session.shop}&installed=true`;
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('Callback error:', error);
    res.status(500).send(`Authentication callback failed: ${error.message}`);
  }
});

// Install script tag for frontend functionality
async function installScriptTag(session) {
  try {
    const client = new shopify.clients.Rest({ session });
    
    // Check if script tag already exists
    const existingScripts = await client.get({
      path: 'script_tags',
    });
    
    const scriptExists = existingScripts.body.script_tags.some(
      script => script.src.includes('product-addons.js')
    );
    
    if (!scriptExists) {
      await client.post({
        path: 'script_tags',
        data: {
          script_tag: {
            event: 'onload',
            src: `${process.env.HOST}/product-addons.js`,
            display_scope: 'all'
          }
        }
      });
      console.log('Script tag installed successfully');
    } else {
      console.log('Script tag already exists');
    }
  } catch (error) {
    console.error('Error installing script tag:', error);
    // Don't throw - continue even if script tag installation fails
  }
}

// Middleware to get session for API routes
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
    next();
  } catch (error) {
    console.error('Session middleware error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// API Routes
app.get('/api/products', getSessionMiddleware, async (req, res) => {
  try {
    const client = new shopify.clients.Rest({ session: req.session });
    
    const products = await client.get({
      path: 'products',
      query: { limit: 50 }
    });
    
    res.json(products.body.products);
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