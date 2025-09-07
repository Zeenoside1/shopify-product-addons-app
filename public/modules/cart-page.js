// Cart page addon price handling - Debug Version for Variant Testing
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
  }

  init() {
    this.logger.log('Initializing cart page with hidden product approach...');
    this.logger.log('Hidden product config:', {
      productId: this.HIDDEN_PRODUCT_ID,
      variantId: this.HIDDEN_VARIANT_ID,
      unitPrice: this.HIDDEN_PRODUCT_PRICE
    });
    
    // First test if we can access the variant
    setTimeout(() => {
      this.testVariantAccess();
    }, 500);
  }

  async testVariantAccess() {
    this.logger.log('Testing variant accessibility...');
    
    try {
      // Test 1: Try to fetch product info via AJAX
      const productResponse = await fetch(`/products/${this.HIDDEN_PRODUCT_ID}.js`);
      if (productResponse.ok) {
        const productData = await productResponse.json();
        this.logger.log('✅ Product accessible via AJAX:', productData);
        
        // Check if our variant exists in the product data
        const variant = productData.variants.find(v => v.id.toString() === this.HIDDEN_VARIANT_ID);
        if (variant) {
          this.logger.log('✅ Variant found in product data:', variant);
          
          // Now try the cart sync
          this.syncCartWithAddons();
        } else {
          this.logger.error('❌ Variant not found in product data. Available variants:', 
            productData.variants.map(v => ({ id: v.id, title: v.title, available: v.available })));
        }
      } else {
        this.logger.error('❌ Product not accessible via AJAX:', productResponse.status);
        
        // Try alternative method
        this.testAlternativeVariantAccess();
      }
    } catch (error) {
      this.logger.error('❌ Error testing variant access:', error);
      this.testAlternativeVariantAccess();
    }
  }

  async testAlternativeVariantAccess() {
    this.logger.log('Testing alternative variant access methods...');
    
    // Test 2: Try adding with different format
    const testMethods = [
      {
        name: 'Using variant ID as string',
        data: { id: this.HIDDEN_VARIANT_ID, quantity: 1 }
      },
      {
        name: 'Using variant ID as number',
        data: { id: parseInt(this.HIDDEN_VARIANT_ID), quantity: 1 }
      },
      {
        name: 'Using product ID instead',
        data: { id: this.HIDDEN_PRODUCT_ID, quantity: 1 }
      }
    ];

    for (const method of testMethods) {
      try {
        this.logger.log(`Testing: ${method.name}`, method.data);
        
        const formData = new FormData();
        formData.append('id', method.data.id);
        formData.append('quantity', method.data.quantity);
        formData.append('properties[_test]', 'variant_accessibility_test');
        
        const response = await fetch('/cart/add.js', {
          method: 'POST',
          body: formData
        });
        
        if (response.ok) {
          this.logger.log(`✅ ${method.name} WORKS!`);
          const result = await response.json();
          this.logger.log('Response:', result);
          
          // Remove the test item
          setTimeout(() => this.removeTestItem(), 1000);
          
          // Use this working method for the actual sync
          this.syncCartWithAddons(method.data.id);
          return;
        } else {
          const error = await response.text();
          this.logger.log(`❌ ${method.name} failed:`, error);
        }
      } catch (error) {
        this.logger.log(`❌ ${method.name} error:`, error);
      }
    }
    
    // If all methods fail, check product setup
    this.suggestProductSetupFix();
  }

  async removeTestItem() {
    try {
      const cart = await this.getCurrentCart();
      const testItem = cart.items.find(item => 
        item.properties && item.properties['_test'] === 'variant_accessibility_test'
      );
      
      if (testItem) {
        const updates = {};
        updates[testItem.key] = 0;
        
        await fetch('/cart/update.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ updates })
        });
        
        this.logger.log('Test item removed from cart');
      }
    } catch (error) {
      this.logger.log('Could not remove test item:', error);
    }
  }

  suggestProductSetupFix() {
    this.logger.error('🚨 PRODUCT SETUP ISSUE DETECTED 🚨');
    this.logger.error('The hidden product variant is not accessible from the storefront.');
    this.logger.error('');
    this.logger.error('SOLUTION: Check these product settings in Shopify Admin:');
    this.logger.error('1. Product Status: Must be "Active"');
    this.logger.error('2. Product Availability: Must be available on "Online Store"');
    this.logger.error('3. Variant Availability: Must be available');
    this.logger.error('4. Track Quantity: Must be DISABLED');
    this.logger.error('5. Continue selling when out of stock: Must be ENABLED');
    this.logger.error('');
    this.logger.error('Current config:', {
      productId: this.HIDDEN_PRODUCT_ID,
      variantId: this.HIDDEN_VARIANT_ID
    });
  }

  async syncCartWithAddons(workingVariantId = null) {
    try {
      this.logger.log('Syncing cart with stored addon data...');
      
      // Use working variant ID if found during testing
      const variantToUse = workingVariantId || this.HIDDEN_VARIANT_ID;
      this.logger.log('Using variant ID:', variantToUse);
      
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
        item.variant_id.toString() === this.HIDDEN_VARIANT_ID ||
        item.variant_id.toString() === variantToUse
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
        await this.addHiddenProduct(neededQuantity, variantToUse);
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

  async addHiddenProduct(quantity, variantId = null) {
    try {
      const idToUse = variantId || this.HIDDEN_VARIANT_ID;
      this.logger.log('Adding hidden product with quantity:', quantity, 'using ID:', idToUse);
      
      const formData = new FormData();
      formData.append('id', idToUse);
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
        
        // If this was a retry with a different ID, suggest product setup fix
        if (!variantId) {
          this.suggestProductSetupFix();
        }
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
}