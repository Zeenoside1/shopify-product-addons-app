// Addon storage utility for session/local storage management
export class AddonStorage {
  constructor(logger) {
    this.logger = logger;
    this.storageKey = 'productAddons';
  }

  // Store addons for a specific product
  storeProductAddons(productId, addons) {
    try {
      let storage = this.getStorage();
      
      const selectedAddons = [];
      let totalPrice = 0;

      Object.values(addons).forEach(addon => {
        if (addon.selected) {
          selectedAddons.push({
            name: addon.name,
            price: addon.price,
            value: addon.value
          });
          totalPrice += addon.price;
        }
      });

      storage[productId] = {
        addons: selectedAddons,
        totalPrice: totalPrice,
        timestamp: Date.now()
      };

      sessionStorage.setItem(this.storageKey, JSON.stringify(storage));
      this.logger.log('Stored addons for product', productId, ':', selectedAddons, 'Total: £' + totalPrice);
      
      return { addons: selectedAddons, totalPrice };
    } catch (error) {
      this.logger.error('Failed to store addons:', error);
      return null;
    }
  }

  // Get addons for a specific product
  getProductAddons(productId) {
    try {
      const storage = this.getStorage();
      const productData = storage[productId];
      
      if (productData) {
        this.logger.log('Retrieved addons for product', productId, ':', productData);
        return productData;
      }
      
      this.logger.log('No addons found for product', productId);
      return null;
    } catch (error) {
      this.logger.error('Failed to retrieve addons:', error);
      return null;
    }
  }

  // Get addons for cart items by matching cart properties
  getCartAddons(cartItems) {
    try {
      const storage = this.getStorage();
      const cartAddons = [];

      cartItems.forEach(item => {
        // Try to find product ID from cart item
        const productId = this.extractProductIdFromCartItem(item);
        
        if (productId && storage[productId]) {
          const productData = storage[productId];
          cartAddons.push({
            item: item,
            productId: productId,
            addons: productData.addons,
            totalPrice: productData.totalPrice
          });
        } else {
          // Fallback: try to match by cart properties
          const matchedAddons = this.matchAddonsByCartProperties(item, storage);
          if (matchedAddons) {
            cartAddons.push({
              item: item,
              addons: matchedAddons.addons,
              totalPrice: matchedAddons.totalPrice
            });
          }
        }
      });

      this.logger.log('Found cart addons:', cartAddons);
      return cartAddons;
    } catch (error) {
      this.logger.error('Failed to get cart addons:', error);
      return [];
    }
  }

  // Extract product ID from cart item
  extractProductIdFromCartItem(item) {
    // Look for product ID in various places
    const selectors = [
      '[data-product-id]',
      '[data-product]', 
      '[href*="/products/"]',
      'a[href*="/products/"]'
    ];

    for (const selector of selectors) {
      const element = item.querySelector(selector);
      if (element) {
        const productId = element.getAttribute('data-product-id') || 
                         element.getAttribute('data-product');
        if (productId) return productId;
        
        // Extract from URL
        const href = element.getAttribute('href');
        if (href) {
          const match = href.match(/\/products\/([^\/\?]+)/);
          if (match) return match[1];
        }
      }
    }

    return null;
  }

  // Match addons by looking at cart properties
  matchAddonsByCartProperties(item, storage) {
    const itemText = item.textContent || '';
    
    // Look through all stored products for matching addon names
    for (const [productId, productData] of Object.entries(storage)) {
      if (!productData.addons) continue;
      
      let matchCount = 0;
      let totalMatched = 0;
      
      productData.addons.forEach(addon => {
        // Check if this addon name appears in the cart item text
        if (itemText.includes(addon.name) || itemText.includes(addon.value)) {
          matchCount++;
          totalMatched += addon.price;
        }
      });
      
      // If we match most/all addons, this is likely the right product
      if (matchCount > 0 && matchCount >= productData.addons.length * 0.7) {
        this.logger.log('Matched addons by properties for', productId, 'matches:', matchCount);
        return {
          addons: productData.addons,
          totalPrice: productData.totalPrice
        };
      }
    }
    
    return null;
  }

  // Get or initialize storage
  getStorage() {
    try {
      const stored = sessionStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : {};
    } catch (error) {
      this.logger.log('Could not parse addon storage, initializing new');
      return {};
    }
  }

  // Clear old addon data (optional cleanup)
  clearOldAddons(maxAge = 24 * 60 * 60 * 1000) { // 24 hours default
    try {
      const storage = this.getStorage();
      const now = Date.now();
      let cleaned = false;

      Object.keys(storage).forEach(productId => {
        if (storage[productId].timestamp && (now - storage[productId].timestamp) > maxAge) {
          delete storage[productId];
          cleaned = true;
        }
      });

      if (cleaned) {
        sessionStorage.setItem(this.storageKey, JSON.stringify(storage));
        this.logger.log('Cleaned old addon data');
      }
    } catch (error) {
      this.logger.error('Failed to clean old addons:', error);
    }
  }
}