// Cart page addon price handling - Fixed version without auto-refresh
import { AddonStorage } from './addon-storage.js';
import { AddonConfig } from './addon-config.js';

export class CartPageHandler {
  constructor(logger) {
    this.logger = logger;
    this.addonStorage = new AddonStorage(logger);
    
    // Use config values
    this.HIDDEN_PRODUCT_ID = AddonConfig.HIDDEN_PRODUCT.PRODUCT_ID;
    this.HIDDEN_VARIANT_ID = AddonConfig.HIDDEN_PRODUCT.VARIANT_ID;
    this.HIDDEN_PRODUCT_PRICE = AddonConfig.HIDDEN_PRODUCT.PRICE;
    
    this.processedProducts = new Set();
    this.isProcessing = false; // Prevent multiple simultaneous operations
    this.hasProcessed = false; // Track if we've already processed this page load
  }

  init() {
    this.logger.log('Initializing cart page with hidden product approach...');
    this.logger.log('Hidden product config:', {
      productId: this.HIDDEN_PRODUCT_ID,
      variantId: this.HIDDEN_VARIANT_ID,
      unitPrice: this.HIDDEN_PRODUCT_PRICE
    });
    
    // Check if we already processed (to prevent refresh loops)
    const urlParams = new URLSearchParams(window.location.search);
    const processed = sessionStorage.getItem('cart_addon_processed');
    
    if (processed && (Date.now() - parseInt(processed)) < 5000) {
      this.logger.log('Recently processed, skipping to prevent refresh loop');
      this.hasProcessed = true;
      return;
    }
    
    // Clear old processed flag
    sessionStorage.removeItem('cart_addon_processed');
    
    // Check and sync cart with stored addon data
    setTimeout(() => {
      this.syncCartWithAddons();
    }, 500);
  }

  async syncCartWithAddons() {
    if (this.isProcessing || this.hasProcessed) {
      this.logger.log('Already processing or processed, skipping');
      return;
    }
    
    this.isProcessing = true;
    
    try {
      this.logger.log('Syncing cart with stored addon data...');
      
      // Get current cart state
      const cart = await this.getCurrentCart();
      if (!cart) {
        this.logger.log('Could not fetch current cart');
        return;
      }
      
      // Get stored addon data
      const addonData = this.addonStorage.getStorage();
      if (!addonData || Object.keys(addonData).length === 0) {
        this.logger.log('No addon data found in storage');
        return;
      }
      
      this.logger.log('Stored addon data:', addonData);
      this.logger.log('Current cart items:', cart.items.length);
      
      // Calculate total addon price needed
      let totalAddonPrice = 0;
      const matchedProducts = new Set();
      
      // Match cart items with stored addon data
      cart.items.forEach(item => {
        const productMatch = this.findAddonDataForCartItem(item, addonData);
        if (productMatch) {
          totalAddonPrice += productMatch.totalPrice;
          matchedProducts.add(productMatch.productId);
          this.logger.log(`Matched product ${productMatch.productId} with £${productMatch.totalPrice} addons`);
        }
      });
      
      if (totalAddonPrice === 0) {
        this.logger.log('No addon pricing needed');
        return;
      }
      
      this.logger.log('Total addon price needed: £', totalAddonPrice);
      
      // Check if hidden product already exists in cart
      const existingHiddenItem = cart.items.find(item => 
        item.product_id.toString() === this.HIDDEN_PRODUCT_ID ||
        item.variant_id.toString() === this.HIDDEN_VARIANT_ID
      );
      
      const neededQuantity = Math.round(totalAddonPrice / this.HIDDEN_PRODUCT_PRICE);
      
      if (existingHiddenItem) {
        this.logger.log('Hidden product exists with quantity:', existingHiddenItem.quantity);
        this.logger.log('Needed quantity:', neededQuantity);
        
        if (existingHiddenItem.quantity !== neededQuantity) {
          await this.updateHiddenProductQuantity(existingHiddenItem.key, neededQuantity);
        } else {
          this.logger.log('✅ Hidden product quantity is already correct');
          this.markAsProcessed();
        }
      } else {
        this.logger.log('Adding hidden product with quantity:', neededQuantity);
        await this.addHiddenProduct(neededQuantity);
      }
      
    } catch (error) {
      this.logger.error('Error syncing cart with addons:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  markAsProcessed() {
    this.hasProcessed = true;
    sessionStorage.setItem('cart_addon_processed', Date.now().toString());
    this.logger.log('Marked cart as processed');
  }

  async getCurrentCart() {
    try {
      const response = await fetch('/cart.js');
      if (!response.ok) {
        throw new Error(`Cart fetch failed: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      this.logger.error('Error fetching cart:', error);
      return null;
    }
  }

  findAddonDataForCartItem(cartItem, addonData) {
    const productId = cartItem.product_id.toString();
    const variantId = cartItem.variant_id.toString();
    
    // Skip our hidden product
    if (productId === this.HIDDEN_PRODUCT_ID || variantId === this.HIDDEN_VARIANT_ID) {
      return null;
    }
    
    // Try to match by variant ID first
    for (const [key, data] of Object.entries(addonData)) {
      if (data.variantId && data.variantId.toString() === variantId) {
        this.logger.log('Matched cart item by variant ID:', variantId);
        return data;
      }
    }
    
    // Try to match by product ID
    for (const [key, data] of Object.entries(addonData)) {
      if (data.productId && data.productId.toString() === productId) {
        this.logger.log('Matched cart item by product ID:', productId);
        return data;
      }
    }
    
    return null;
  }

  async addHiddenProduct(quantity) {
    try {
      this.logger.log('Adding hidden product with quantity:', quantity);
      
      const formData = new FormData();
      formData.append('id', this.HIDDEN_VARIANT_ID);
      formData.append('quantity', quantity);
      formData.append('properties[_addon_adjustment]', 'true');
      formData.append('properties[_note]', `Price adjustment for add-ons (${quantity} x £${this.HIDDEN_PRODUCT_PRICE})`);
      
      const response = await fetch('/cart/add.js', {
        method: 'POST',
        body: formData
      });
      
      if (response.ok) {
        const result = await response.json();
        this.logger.log('✅ Hidden product added successfully:', result);
        this.markAsProcessed();
        
        // Instead of refreshing, trigger cart update events
        this.triggerCartUpdate();
        
      } else {
        const error = await response.text();
        this.logger.error('Failed to add hidden product:', error);
      }
      
    } catch (error) {
      this.logger.error('Error adding hidden product:', error);
    }
  }

  async updateHiddenProductQuantity(lineKey, newQuantity) {
    try {
      this.logger.log('Updating hidden product quantity to:', newQuantity);
      
      const updates = {};
      updates[lineKey] = newQuantity;
      
      const response = await fetch('/cart/update.js', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ updates })
      });
      
      if (response.ok) {
        const result = await response.json();
        this.logger.log('✅ Hidden product quantity updated successfully');
        this.markAsProcessed();
        
        // Instead of refreshing, trigger cart update events
        this.triggerCartUpdate();
        
      } else {
        const error = await response.text();
        this.logger.error('Failed to update hidden product:', error);
      }
      
    } catch (error) {
      this.logger.error('Error updating hidden product quantity:', error);
    }
  }

  triggerCartUpdate() {
    // Try to trigger theme's cart update mechanisms instead of refreshing
    this.logger.log('Triggering cart update events...');
    
    // Common theme cart update methods
    const updateMethods = [
      () => window.cartUpdated && window.cartUpdated(),
      () => window.updateCart && window.updateCart(),
      () => window.refreshCart && window.refreshCart(),
      () => window.theme && window.theme.cartUpdate && window.theme.cartUpdate(),
      () => document.dispatchEvent(new CustomEvent('cart:updated')),
      () => document.dispatchEvent(new CustomEvent('cart:build')),
      () => window.Shopify && window.Shopify.onCartUpdate && window.Shopify.onCartUpdate(),
    ];
    
    let methodWorked = false;
    updateMethods.forEach((method, index) => {
      try {
        method();
        this.logger.log(`Cart update method ${index + 1} executed`);
        methodWorked = true;
      } catch (error) {
        // Method doesn't exist or failed, that's ok
      }
    });
    
    if (!methodWorked) {
      this.logger.log('No theme cart update methods found, showing success message');
      this.showUpdateNotification();
    }
  }

  showUpdateNotification() {
    // Show a subtle notification instead of refreshing
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #2e7d32;
      color: white;
      padding: 12px 20px;
      border-radius: 6px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      animation: slideIn 0.3s ease-out;
    `;
    
    notification.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span>✅</span>
        <span>Add-on pricing updated</span>
        <button onclick="window.location.reload()" style="margin-left: 10px; background: rgba(255,255,255,0.2); border: none; color: white; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px;">
          Refresh to see changes
        </button>
      </div>
    `;
    
    // Add animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      notification.remove();
      style.remove();
    }, 5000);
  }

  async removeHiddenProduct() {
    try {
      const cart = await this.getCurrentCart();
      if (!cart) return;
      
      const hiddenItem = cart.items.find(item => 
        item.product_id.toString() === this.HIDDEN_PRODUCT_ID ||
        item.variant_id.toString() === this.HIDDEN_VARIANT_ID
      );
      
      if (hiddenItem) {
        this.logger.log('Removing hidden product from cart');
        
        const updates = {};
        updates[hiddenItem.key] = 0;
        
        await fetch('/cart/update.js', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ updates })
        });
        
        this.logger.log('Hidden product removed from cart');
        this.triggerCartUpdate();
      }
    } catch (error) {
      this.logger.error('Error removing hidden product:', error);
    }
  }
}