require('dotenv').config();
const express = require('express');
const { shopifyApi, LATEST_API_VERSION } = require('@shopify/shopify-api');
const { restResources } = require('@shopify/shopify-api/rest/admin/2023-10');
const Database = require('./database');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Initialize Shopify API
const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes: ['read_products', 'write_products', 'read_script_tags', 'write_script_tags'],
  hostName: process.env.HOST,
  apiVersion: LATEST_API_VERSION,
  isEmbeddedApp: true,
  restResources,
});

// Initialize database
const db = new Database();

// Shopify OAuth
app.get('/auth', async (req, res) => {
  try {
    await shopify.auth.begin({
      shop: shopify.utils.sanitizeShop(req.query.shop, true),
      callbackPath: '/auth/callback',
      isOnline: false,
      rawRequest: req,
      rawResponse: res,
    });
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).send('Authentication failed');
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
    
    // Install script tag
    await installScriptTag(session);
    
    res.redirect(`/?shop=${session.shop}&host=${req.query.host}`);
  } catch (error) {
    console.error('Callback error:', error);
    res.status(500).send('Authentication callback failed');
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
    }
  } catch (error) {
    console.error('Error installing script tag:', error);
  }
}

// API Routes
app.get('/api/products', async (req, res) => {
  try {
    const session = await db.getSession(req.query.shop);
    const client = new shopify.clients.Rest({ session });
    
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
    const addons = await db.getAddons(req.params.productId);
    res.json(addons);
  } catch (error) {
    console.error('Error fetching addons:', error);
    res.status(500).json({ error: 'Failed to fetch addons' });
  }
});

app.post('/api/addons', async (req, res) => {
  try {
    const { productId, name, price, type, required } = req.body;
    const addon = await db.createAddon({
      productId,
      name,
      price: parseFloat(price),
      type,
      required: required || false
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
  res.sendFile(__dirname + '/public/product-addons.js');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Product Add-ons App running on port ${PORT}`);
});
