// Cart synchronization to ensure checkout prices match frontend display
export class CartSync {
  constructor(logger) {
    this.logger = logger;
  }

  // Update existing cart items with addon pricing
  async updateExistingCartItems() {
    try {
      this.logger.log('Syncing existing cart items with addon prices...');
      
      // Get current cart
      const cartResponse = await fetch('/cart.js');
      const cart = await cartResponse.json();
      
      this.logger.log('Current cart:', cart);
      
      // Get stored addon data
      const addonStorage = sessionStorage.getItem('productAddons');
      if (!addonStorage) {
        this.logger.log('No addon data to sync');
        return;
      }
      
      const addons = JSON.parse(addonStorage);
      const updates = {};
      
      // Process each cart item
      cart.items.forEach(item => {
        this.logger.log('Processing cart item:', item);
        
        // Try to match with stored addon data
        const addonData = this.findAddonDataForItem(item, addons);
        
        if (addonData && addonData.totalPrice > 0) {
          // Calculate new price (in cents for Shopify)
          const newPrice = item.price + (addonData.totalPrice * 100);
          updates[item.key] = {
            quantity: item.quantity,
            price: newPrice
          };
          
          this.logger.log(`Will update item ${item.key}: ${item.price/100} + ${addonData.totalPrice} = ${newPrice/100}`);
        }
      });
      
      // Apply updates if any
      if (Object.keys(updates).length > 0) {
        await this.applyCartUpdates(updates);
      }
      
    } catch (error) {
      this.logger.error('Error syncing cart items:', error);
    }
  }
  
  findAddonDataForItem(cartItem, addons) {
    // Try to match cart item with addon data
    const variantId = cartItem.variant_id.toString();
    const productId = cartItem.product_id.toString();
    
    // Try exact variant match first
    for (const [key, data] of Object.entries(addons)) {
      if (data.variantId && data.variantId.toString() === variantId) {
        this.logger.log('Matched cart item by variant ID:', variantId);
        return data;
      }
    }
    
    // Try product match
    for (const [key, data] of Object.entries(addons)) {
      if (data.productId && data.productId.toString() === productId) {
        this.logger.log('Matched cart item by product ID:', productId);
        return data;
      }
    }
    
    return null;
  }
  
  async applyCartUpdates(updates) {
    try {
      this.logger.log('Applying cart updates:', updates);
      
      // Use Shopify's cart update API
      const response = await fetch('/cart/update.js', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ updates })
      });
      
      if (response.ok) {
        const updatedCart = await response.json();
        this.logger.log('Cart updated successfully:', updatedCart);
        
        // Refresh the page to show updated prices
        setTimeout(() => {
          window.location.reload();
        }, 500);
      } else {
        this.logger.error('Failed to update cart:', response.status);
      }
      
    } catch (error) {
      this.logger.error('Error applying cart updates:', error);
    }
  }
  
  // Alternative: Add addon price as separate line items
  async addAddonsAsLineItems() {
    try {
      const addonStorage = sessionStorage.getItem('productAddons');
      if (!addonStorage) return;
      
      const addons = JSON.parse(addonStorage);
      
      // Create virtual addon products
      for (const [key, data] of Object.entries(addons)) {
        if (data.addons && data.addons.length > 0) {
          for (const addon of data.addons) {
            // Add each addon as a separate cart line item
            // This requires having addon products in Shopify
            await this.addAddonProduct(addon);
          }
        }
      }
    } catch (error) {
      this.logger.error('Error adding addon line items:', error);
    }
  }
  
  async addAddonProduct(addon) {
    // This would require pre-created addon products in Shopify
    // with SKUs matching the addon names
    const formData = new FormData();
    formData.append('id', `addon-${addon.name.toLowerCase().replace(/\s+/g, '-')}`);
    formData.append('quantity', 1);
    formData.append('properties[Main Product]', 'Add-on for previous item');
    
    try {
      const response = await fetch('/cart/add.js', {
        method: 'POST',
        body: formData
      });
      
      if (response.ok) {
        this.logger.log('Added addon product:', addon.name);
      }
    } catch (error) {
      this.logger.error('Failed to add addon product:', error);
    }
  }
}