// Cart page addon price handling - Hidden Product Approach
import { AddonStorage } from './addon-storage.js';

export class CartPageHandler {
  constructor(logger) {
    this.logger = logger;
    this.addonStorage = new AddonStorage(logger);
    
    // CRITICAL: Set your hidden product details here
    this.HIDDEN_PRODUCT_ID = '12345678901234'; // Replace with your actual hidden product ID
    this.HIDDEN_VARIANT_ID = '12345678901234'; // Replace with your actual hidden variant ID
    this.HIDDEN_PRODUCT_PRICE = 0.01; // £0.01 per unit
    
    this.processedProducts = new Set();
  }

  init() {
    this.logger.log('Initializing cart page with hidden product approach...');
    this.logger.log('Hidden product config:', {
      productId: this.HIDDEN_PRODUCT_ID,
      variantId: this.HIDDEN_VARIANT_ID,
      unitPrice: this.HIDDEN_PRODUCT_PRICE
    });
    
    // Check and sync cart with stored addon data
    setTimeout(() => {
      this.syncCartWithAddons();
    }, 500);
  }

  async syncCartWithAddons() {
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
      this.logger.log('Current cart items:', cart.items);
      
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
          this.logger.log('Hidden product quantity is already correct');
        }
      } else {
        this.logger.log('Adding hidden product with quantity:', neededQuantity);
        await this.addHiddenProduct(neededQuantity);
      }
      
    } catch (error) {
      this.logger.error('Error syncing cart with addons:', error);
    }
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
        this.logger.log('Hidden product added successfully:', result);
        
        // Refresh the page to show updated cart
        setTimeout(() => {
          window.location.reload();
        }, 500);
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
        this.logger.log('Hidden product quantity updated successfully');
        
        // Refresh the page to show updated cart
        setTimeout(() => {
          window.location.reload();
        }, 500);
      } else {
        const error = await response.text();
        this.logger.error('Failed to update hidden product:', error);
      }
      
    } catch (error) {
      this.logger.error('Error updating hidden product quantity:', error);
    }
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
      }
    } catch (error) {
      this.logger.error('Error removing hidden product:', error);
    }
  }
}