// Product Add-ons - Main entry point with Hidden Product Support
(async function() {
  'use strict';
  
  console.log('[Product Add-ons] Script loading...');
  
  // Prevent double initialization
  if (window.ProductAddonsInitialized) {
    console.log('[Product Add-ons] Already initialized, skipping');
    return;
  }
  
  window.ProductAddonsInitialized = true;
  
  // Determine the script host
  const currentScript = document.currentScript || 
    Array.from(document.scripts).find(s => s.src.includes('product-addons.js'));
  
  const scriptUrl = new URL(currentScript.src);
  const HOST = `${scriptUrl.protocol}//${scriptUrl.host}`;
  
  console.log('[Product Add-ons] Host detected:', HOST);
  
  // Dynamically load modules
  try {
    console.log('[Product Add-ons] Loading modules...');
    
    const [
      { Logger },
      { PageDetector }, 
      { ProductPageHandler },
      { CartPageHandler },
      { CheckoutPageHandler },
      { AddonConfig }
    ] = await Promise.all([
      import(`${HOST}/modules/logger.js`),
      import(`${HOST}/modules/page-detector.js`),
      import(`${HOST}/modules/product-page.js`),
      import(`${HOST}/modules/cart-page.js`),
      import(`${HOST}/modules/checkout-page.js`),
      import(`${HOST}/modules/addon-config.js`)
    ]);
    
    const logger = new Logger('[Product Add-ons]', AddonConfig.DEBUG.ENABLED);
    logger.log('Modules loaded successfully');
    logger.log('Configuration loaded:', {
      hiddenProductId: AddonConfig.HIDDEN_PRODUCT.PRODUCT_ID,
      apiHost: AddonConfig.API.HOST,
      storageKey: AddonConfig.STORAGE.SESSION_KEY
    });
    
    function init() {
      logger.log('Initializing...');
      
      const pageDetector = new PageDetector();
      
      // Route to appropriate handler based on page type
      if (pageDetector.isProductPage()) {
        logger.log('Product page detected');
        const productHandler = new ProductPageHandler(logger);
        productHandler.init();
        
      } else if (pageDetector.isCartPage()) {
        logger.log('Cart page detected');
        const cartHandler = new CartPageHandler(logger);
        cartHandler.init();
        
      } else if (pageDetector.isCheckoutPage()) {
        logger.log('Checkout page detected');
        const checkoutHandler = new CheckoutPageHandler(logger);
        checkoutHandler.init();
        
      } else {
        logger.log('Not a relevant page, skipping');
      }
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
    
  } catch (error) {
    console.error('[Product Add-ons] Failed to load modules:', error);
    
    // Fallback - if modules fail to load, we could inline a basic version
    console.log('[Product Add-ons] Falling back to basic functionality');
    
    // Basic fallback functionality here if needed
    console.log('[Product Add-ons] Module loading failed - please check server configuration');
  }

})();