// Configuration file for addon system
export const AddonConfig = {
  // IMPORTANT: Replace these with your actual hidden product details
  // Create a hidden product in Shopify admin with £0.01 price
  HIDDEN_PRODUCT: {
    PRODUCT_ID: '12237829308756',  // Replace with actual product ID
    VARIANT_ID: '52557455032660',  // Replace with actual variant ID
    PRICE: 0.01,                   // £0.01 per unit
    SKU: 'ADDON-PRICE-01',         // SKU for identification
    TITLE: 'Product Add-on Price Adjustment'
  },
  
  // API Configuration
  API: {
    HOST: window.location.protocol + '//' + 'shopify-product-addons-app-production.up.railway.app',
    ENDPOINTS: {
      ADDONS: '/api/addons',
      CART_UPDATE: '/cart/update.js',
      CART_ADD: '/cart/add.js',
      CART_GET: '/cart.js'
    }
  },
  
  // Storage Configuration
  STORAGE: {
    SESSION_KEY: 'productAddons',
    MAX_AGE: 24 * 60 * 60 * 1000, // 24 hours
    VERSION: '1.0'
  },
  
  // UI Configuration
  UI: {
    CONTAINER_ID: 'product-addons-container',
    STYLES_ID: 'addon-styles',
    CURRENCY_SYMBOL: '£',
    PRICE_DECIMALS: 2
  },
  
  // Debug Configuration
  DEBUG: {
    ENABLED: true,
    LOG_PREFIX: '[Product Add-ons]'
  }
};