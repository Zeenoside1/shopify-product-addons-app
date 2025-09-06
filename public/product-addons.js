// Main entry point for Product Add-ons
import { Logger } from './modules/logger.js';
import { PageDetector } from './modules/page-detector.js';
import { ProductPageHandler } from './modules/product-page.js';
import { CartPageHandler } from './modules/cart-page.js';
import { CheckoutPageHandler } from './modules/checkout-page.js';

(function() {
  'use strict';
  
  const logger = new Logger('[Product Add-ons]', true);
  logger.log('Script loading...');
  
  // Prevent double initialization
  let isInitialized = false;
  
  function init() {
    if (isInitialized) {
      logger.log('Already initialized, skipping');
      return;
    }
    
    isInitialized = true;
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
  
  logger.log('Script loaded successfully');

})();