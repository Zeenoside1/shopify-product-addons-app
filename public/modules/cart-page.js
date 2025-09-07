// Cart page addon price handling - ID-based approach
import { AddonStorage } from './addon-storage.js';

export class CartPageHandler {
  constructor(logger) {
    this.logger = logger;
    this.addonStorage = new AddonStorage(logger);
    this.processedLineItems = new Set();
  }

  init() {
    this.logger.log('Initializing cart page updates with ID-based matching...');
    
    // Check what's stored
    this.debugStorageContents();
    
    // Update cart prices
    setTimeout(() => {
      this.updateCartPrices();
    }, 500);
  }

  debugStorageContents() {
    try {
      const stored = sessionStorage.getItem('productAddons');
      this.logger.log('Session storage check:');
      
      if (stored) {
        const parsed = JSON.parse(stored);
        this.logger.log('Stored addon data:', parsed);
        
        Object.entries(parsed).forEach(([key, data]) => {
          this.logger.log(`Key: ${key}, Product: ${data.productId}, Variant: ${data.variantId}, Total: £${data.totalPrice}`);
        });
      } else {
        this.logger.log('No addon data in session storage');
      }
    } catch (error) {
      this.logger.error('Error checking storage:', error);
    }
  }

  updateCartPrices() {
    this.logger.log('Starting cart price updates...');
    
    // Find all cart line items
    const lineItems = document.querySelectorAll('[data-id], .cart-item, .line-item');
    this.logger.log('Found line items:', lineItems.length);
    
    let totalAddonPrice = 0;
    
    lineItems.forEach((item, index) => {
      const lineId = this.extractLineItemId(item);
      this.logger.log(`Line item ${index + 1} ID:`, lineId);
      
      if (lineId && !this.processedLineItems.has(lineId)) {
        const addonData = this.addonStorage.getCartAddonsByLineId(lineId);
        
        if (addonData && addonData.totalPrice > 0) {
          this.logger.log(`Found addon data for line ${lineId}:`, addonData);
          
          // Update line item price
          this.updateLineItemPrice(item, addonData.totalPrice);
          
          // Track processed items
          this.processedLineItems.add(lineId);
          totalAddonPrice += addonData.totalPrice;
        }
      }
    });
    
    // Update cart total
    if (totalAddonPrice > 0) {
      this.updateCartTotal(totalAddonPrice);
    }
    
    this.logger.log('Cart price updates complete. Total addon price:', totalAddonPrice);
  }

  extractLineItemId(item) {
    // Try multiple methods to extract line item/variant ID
    
    // Method 1: data-id attribute
    const dataId = item.getAttribute('data-id');
    if (dataId) {
      this.logger.log('Found line ID from data-id:', dataId);
      return dataId;
    }
    
    // Method 2: ID attribute pattern
    const itemId = item.getAttribute('id');
    if (itemId) {
      const idMatch = itemId.match(/CartItem-(\d+)/);
      if (idMatch) {
        this.logger.log('Found line ID from id pattern:', idMatch[1]);
        return idMatch[1];
      }
    }
    
    // Method 3: Look for hidden inputs with variant/line ID
    const hiddenInputs = item.querySelectorAll('input[name*="id"], input[data-variant-id]');
    for (const input of hiddenInputs) {
      if (input.value && input.value.match(/^\d+$/)) {
        this.logger.log('Found line ID from hidden input:', input.value);
        return input.value;
      }
    }
    
    // Method 4: Look for data attributes
    const variantId = item.getAttribute('data-variant-id') || 
                     item.getAttribute('data-product-variant-id') ||
                     item.getAttribute('data-line-item-key');
    if (variantId) {
      this.logger.log('Found line ID from data attribute:', variantId);
      return variantId;
    }
    
    this.logger.log('Could not extract line item ID from:', item);
    return null;
  }

  updateLineItemPrice(item, addonPrice) {
    this.logger.log('Updating line item price by £', addonPrice);
    
    // Find price elements in this line item
    const priceElements = item.querySelectorAll('.price, .money, [data-price]');
    
    priceElements.forEach((element, index) => {
      if (element.classList.contains('addon-updated')) {
        this.logger.log(`Price element ${index + 1} already updated, skipping`);
        return;
      }
      
      const originalText = element.textContent.trim();
      const priceMatch = originalText.match(/(£|$|€)([\d,]+\.?\d*)/);
      
      if (priceMatch) {
        const currencySymbol = priceMatch[1];
        const currentPrice = parseFloat(priceMatch[2].replace(/,/g, ''));
        
        if (!isNaN(currentPrice)) {
          const newPrice = currentPrice + addonPrice;
          element.textContent = `${currencySymbol}${newPrice.toFixed(2)}`;
          element.classList.add('addon-updated');
          
          this.logger.log(`Updated price element ${index + 1}:`, `${currentPrice} + ${addonPrice} = ${newPrice}`);
        }
      }
    });
  }

  updateCartTotal(totalAddonPrice) {
    this.logger.log('Updating cart total by £', totalAddonPrice);
    
    // Find cart total elements using the specific selector from earlier
    const totalSelectors = [
      'div.totals p.totals__total-value',
      '.totals__total-value',
      '.cart-total',
      '.total-price'
    ];
    
    totalSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        if (element.classList.contains('total-updated')) return;
        
        const originalText = element.textContent.trim();
        const priceMatch = originalText.match(/(£|$|€)([\d,]+\.?\d*)/);
        
        if (priceMatch) {
          const currencySymbol = priceMatch[1];
          const currentPrice = parseFloat(priceMatch[2].replace(/,/g, ''));
          
          if (!isNaN(currentPrice)) {
            const newPrice = currentPrice + totalAddonPrice;
            element.textContent = `${currencySymbol}${newPrice.toFixed(2)} GBP`;
            element.classList.add('total-updated');
            
            this.logger.log(`Updated total via ${selector}:`, `${currentPrice} + ${totalAddonPrice} = ${newPrice}`);
          }
        }
      });
    });
  }
}