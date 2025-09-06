// Cart page addon price handling
import { PriceUpdater } from './price-updater.js';

export class CartPageHandler {
  constructor(logger) {
    this.logger = logger;
    this.priceUpdater = new PriceUpdater(logger);
    this.updateInProgress = false;
  }

  init() {
    this.logger.log('Initializing cart page updates...');
    
    // Initial update with delay
    setTimeout(() => {
      this.updateCartPagePrices();
    }, 1500);
    
    // Watch for cart updates
    this.watchForCartUpdates();
    
    // Set up mutation observer with throttling
    this.setupMutationObserver();
  }

  setupMutationObserver() {
    let mutationTimeout;
    const observer = new MutationObserver(() => {
      clearTimeout(mutationTimeout);
      mutationTimeout = setTimeout(() => {
        if (!this.updateInProgress) {
          this.updateCartPagePrices();
        }
      }, 500);
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  updateCartPagePrices() {
    if (this.updateInProgress) {
      this.logger.log('Cart update already in progress, skipping');
      return;
    }
    
    this.updateInProgress = true;
    this.logger.log('Updating cart page prices...');
    
    try {
      const cartItems = document.querySelectorAll('[data-cart-item], .cart-item, .cart__item, .line-item');
      
      cartItems.forEach(item => {
        try {
          const properties = this.priceUpdater.extractAddonProperties(item);
          if (properties.totalAddonPrice > 0) {
            this.priceUpdater.updateCartItemPrice(item, properties);
          }
        } catch (error) {
          this.logger.error('Error updating cart item price:', error);
        }
      });
      
      // Update cart total
      const totalAddonPrice = this.priceUpdater.calculateTotalAddonPrice();
      this.priceUpdater.updateCartTotal(totalAddonPrice);
      
    } finally {
      this.updateInProgress = false;
    }
  }

  watchForCartUpdates() {
    // Intercept fetch requests for cart updates with throttling
    const originalFetch = window.fetch;
    let fetchTimeout;
    
    window.fetch = async (...args) => {
      const response = await originalFetch.apply(this, args);
      
      const url = args[0];
      if (typeof url === 'string' && (url.includes('/cart') || url.includes('cart.js'))) {
        clearTimeout(fetchTimeout);
        fetchTimeout = setTimeout(() => {
          if (!this.updateInProgress) {
            // Clear processed elements on cart changes
            this.processedElements.clear();
            this.updateCartPagePrices();
          }
        }, 1500);
      }
      
      return response;
    };
  }
}