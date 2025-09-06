// Checkout page addon price handling
import { PriceUpdater } from './price-updater.js';

export class CheckoutPageHandler {
  constructor(logger) {
    this.logger = logger;
    this.priceUpdater = new PriceUpdater(logger);
  }

  init() {
    this.logger.log('Initializing checkout page updates...');
    
    // Update checkout prices on load
    this.updateCheckoutPagePrices();
    
    // Set up mutation observer for dynamic content
    const observer = new MutationObserver(() => {
      this.updateCheckoutPagePrices();
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  updateCheckoutPagePrices() {
    const lineItems = document.querySelectorAll('[data-line-item], .line-item, .product, .order-summary__section .product');
    
    lineItems.forEach(item => {
      try {
        const properties = this.priceUpdater.extractAddonProperties(item);
        if (properties.totalAddonPrice > 0) {
          this.updateCheckoutItemPrice(item, properties);
        }
      } catch (error) {
        this.logger.error('Error updating checkout item price:', error);
      }
    });
    
    // Update order total
    this.updateOrderTotal();
  }

  updateCheckoutItemPrice(item, properties) {
    if (properties.totalAddonPrice <= 0) return;
    
    const priceSelectors = [
      '.product__price',
      '.line-item__price', 
      '.order-summary__price',
      '.money',
      '[data-price]'
    ];
    
    priceSelectors.forEach(selector => {
      const priceElements = item.querySelectorAll(selector);
      priceElements.forEach(element => {
        if (!element.classList.contains('addon-updated') && !element.hasAttribute('data-addon-original')) {
          if (this.priceUpdater.updatePriceElement(element, properties.totalAddonPrice)) {
            element.classList.add('addon-updated');
          }
        }
      });
    });
  }

  updateOrderTotal() {
    let totalAddonPrice = 0;
    
    // Sum up all addon prices
    document.querySelectorAll('.addon-updated').forEach(element => {
      const text = element.textContent || '';
      const addonMatch = text.match(/\+£([\d.]+)/);
      if (addonMatch) {
        totalAddonPrice += parseFloat(addonMatch[1]);
      }
    });
    
    if (totalAddonPrice > 0) {
      const totalSelectors = [
        '.order-summary__total',
        '.total-line__price',
        '.payment-due',
        '[data-checkout-total]'
      ];
      
      totalSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
          if (!element.classList.contains('total-updated')) {
            if (this.priceUpdater.updatePriceElement(element, totalAddonPrice)) {
              element.classList.add('total-updated');
            }
          }
        });
      });
    }
  }
}