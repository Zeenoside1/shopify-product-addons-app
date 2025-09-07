// Cart page addon price handling - With line item price updates and hidden product hiding
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
    this.isProcessing = false;
    this.hasProcessed = false;
    this.productAddonMap = new Map(); // Track which products have which addons
  }

  init() {
    this.logger.log('Initializing cart page with line item price updates...');
    
    // First, hide the hidden product immediately if it exists
    this.hideHiddenProductRows();
    
    // Check if we already processed (to prevent refresh loops)
    const processed = sessionStorage.getItem('cart_addon_processed');
    if (processed && (Date.now() - parseInt(processed)) < 5000) {
      this.logger.log('Recently processed, skipping sync but updating displays');
      this.hasProcessed = true;
      // Still update the display prices
      setTimeout(() => this.updateLineItemPrices(), 500);
      return;
    }
    
    // Clear old processed flag
    sessionStorage.removeItem('cart_addon_processed');
    
    // Check and sync cart with stored addon data
    setTimeout(() => {
      this.syncCartWithAddons();
    }, 500);
  }

  hideHiddenProductRows() {
    // Hide hidden product rows immediately
    const cartRows = document.querySelectorAll('tr.cart-item, .cart-item, .line-item');
    
    cartRows.forEach(row => {
      // Check if this row contains our hidden product
      const isHiddenProduct = this.isHiddenProductRow(row);
      
      if (isHiddenProduct) {
        this.logger.log('Hiding hidden product row');
        row.style.display = 'none';
        row.classList.add('hidden-addon-product');
        
        // Also hide any related elements
        const nextRow = row.nextElementSibling;
        if (nextRow && nextRow.classList.contains('cart-item-details')) {
          nextRow.style.display = 'none';
        }
      }
    });
  }

  isHiddenProductRow(row) {
    // Multiple ways to detect if this is our hidden product
    const checks = [
      // Check data attributes
      () => row.getAttribute('data-product-id') === this.HIDDEN_PRODUCT_ID,
      () => row.getAttribute('data-variant-id') === this.HIDDEN_VARIANT_ID,
      
      // Check for SKU in the row
      () => row.textContent.includes('ADDON-PRICE-01'),
      () => row.textContent.includes('Product Add-on Price Adjustment'),
      
      // Check for addon adjustment property
      () => row.textContent.includes('_addon_adjustment'),
      () => row.textContent.includes('Price adjustment for add-ons'),
      
      // Check for the exact price (£0.01)
      () => {
        const priceElements = row.querySelectorAll('.money, .price, [data-price]');
        return Array.from(priceElements).some(el => 
          el.textContent.includes('0.01') || el.textContent.includes('£0.01')
        );
      },
      
      // Check for high quantity with low unit price (likely our hidden product)
      () => {
        const qtyElement = row.querySelector('input[name*="quantity"], .quantity, [data-quantity]');
        const priceElement = row.querySelector('.money, .price');
        
        if (qtyElement && priceElement) {
          const qty = parseInt(qtyElement.value || qtyElement.textContent);
          const priceText = priceElement.textContent;
          
          // If quantity > 50 and unit price is £0.01, probably our hidden product
          return qty > 50 && priceText.includes('0.01');
        }
        return false;
      }
    ];
    
    return checks.some(check => {
      try {
        return check();
      } catch (error) {
        return false;
      }
    });
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
      
      // Calculate total addon price needed and build product map
      let totalAddonPrice = 0;
      this.productAddonMap.clear();
      
      // Match cart items with stored addon data
      cart.items.forEach(item => {
        const productMatch = this.findAddonDataForCartItem(item, addonData);
        if (productMatch) {
          totalAddonPrice += productMatch.totalPrice;
          this.productAddonMap.set(item.variant_id.toString(), {
            addonPrice: productMatch.totalPrice,
            addons: productMatch.addons,
            lineKey: item.key
          });
          this.logger.log(`Product ${productMatch.productId} has £${productMatch.totalPrice} addons`);
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
        if (existingHiddenItem.quantity !== neededQuantity) {
          await this.updateHiddenProductQuantity(existingHiddenItem.key, neededQuantity);
        } else {
          this.logger.log('✅ Hidden product quantity is already correct');
          this.markAsProcessed();
          this.updateLineItemPrices();
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

  updateLineItemPrices() {
    this.logger.log('Updating line item prices on display...');
    
    // Update each product line item with its addon pricing
    this.productAddonMap.forEach((addonInfo, variantId) => {
      this.updateProductLineItem(variantId, addonInfo);
    });
    
    // Update cart totals
    this.updateCartTotals();
    
    // Ensure hidden product rows stay hidden
    this.hideHiddenProductRows();
  }

  updateProductLineItem(variantId, addonInfo) {
    this.logger.log(`🎯 Looking for cart row matching variant ${variantId} with £${addonInfo.addonPrice} addons`);
    
    // Find the cart row for this variant
    const cartRows = document.querySelectorAll('tr.cart-item, .cart-item, .line-item');
    this.logger.log('Found', cartRows.length, 'potential cart rows');
    
    let foundMatch = false;
    
    cartRows.forEach((row, index) => {
      this.logger.log(`Checking row ${index + 1}:`, row.tagName, row.className);
      
      // Skip if this is the hidden product row
      if (this.isHiddenProductRow(row)) {
        this.logger.log(`  Skipping row ${index + 1} - it's the hidden product`);
        return;
      }
      
      if (this.isRowForVariant(row, variantId)) {
        this.logger.log(`✅ Found matching row ${index + 1} for variant ${variantId}`);
        foundMatch = true;
        
        // Debug: Log all text content in the row to help identify price elements
        this.debugRowContents(row);
        
        // Update unit price
        this.updateRowUnitPrice(row, addonInfo.addonPrice);
        
        // Update line total
        this.updateRowLineTotal(row, addonInfo.addonPrice);
        
        // Add addon details to the product description
        this.addAddonDetailsToRow(row, addonInfo.addons);
      } else {
        this.logger.log(`❌ Row ${index + 1} doesn't match variant ${variantId}`);
      }
    });
    
    if (!foundMatch) {
      this.logger.log('⚠️ No matching row found for variant', variantId);
      this.logger.log('Trying fallback approach - updating first non-hidden product row...');
      
      // Fallback: if we can't match by variant, update the first non-hidden row
      cartRows.forEach((row, index) => {
        if (!this.isHiddenProductRow(row) && !foundMatch) {
          this.logger.log(`🔄 Using fallback - updating row ${index + 1}`);
          foundMatch = true;
          
          this.debugRowContents(row);
          this.updateRowUnitPrice(row, addonInfo.addonPrice);
          this.updateRowLineTotal(row, addonInfo.addonPrice);
          this.addAddonDetailsToRow(row, addonInfo.addons);
        }
      });
    }
  }

  debugRowContents(row) {
    this.logger.log('🔍 Debugging row contents:');
    
    // Find all elements that contain £0.00
    const allElements = row.querySelectorAll('*');
    allElements.forEach((element, index) => {
      const text = element.textContent.trim();
      if (text === '£0.00' || text.includes('0.00')) {
        this.logger.log(`  Element ${index}: "${text}" | Tag: ${element.tagName} | Classes: ${element.className} | ID: ${element.id}`);
        this.logger.log(`    Parent: ${element.parentElement.tagName}.${element.parentElement.className}`);
      }
    });
    
    // Also check text nodes directly
    const walker = document.createTreeWalker(
      row,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    let textNode;
    while (textNode = walker.nextNode()) {
      if (textNode.textContent.trim().includes('0.00')) {
        this.logger.log(`  Text node: "${textNode.textContent.trim()}" | Parent: ${textNode.parentElement.tagName}.${textNode.parentElement.className}`);
      }
    }
  }

  isRowForVariant(row, variantId) {
    // Check various ways to identify the row
    const checks = [
      () => row.getAttribute('data-variant-id') === variantId,
      () => row.querySelector(`[data-variant-id="${variantId}"]`),
      () => row.querySelector(`input[name*="updates[${variantId}]"]`),
      () => row.querySelector(`input[value="${variantId}"]`),
    ];
    
    return checks.some(check => {
      try {
        return check();
      } catch (error) {
        return false;
      }
    });
  }

  updateRowUnitPrice(row, addonPrice) {
    // Find price elements in the row
    const priceSelectors = [
      '.price:not(.total-price)',
      '.money:not(.total)',
      '.unit-price',
      '.product-price',
      '[data-unit-price]',
      'td:nth-child(3)', // Often the price column
    ];
    
    priceSelectors.forEach(selector => {
      const priceElements = row.querySelectorAll(selector);
      
      priceElements.forEach(element => {
        if (!element.classList.contains('addon-updated') && !this.isHiddenProductElement(element)) {
          const originalPrice = this.extractPrice(element.textContent);
          
          if (originalPrice > 0) {
            const newPrice = originalPrice + addonPrice;
            element.textContent = `£${newPrice.toFixed(2)}`;
            element.classList.add('addon-updated');
            element.setAttribute('data-original-price', originalPrice.toString());
            
            this.logger.log(`Updated unit price: £${originalPrice} + £${addonPrice} = £${newPrice}`);
          }
        }
      });
    });
  }

  updateRowLineTotal(row, addonPrice) {
    // Find line total elements
    const totalSelectors = [
      '.line-total',
      '.total-price',
      '.subtotal',
      '[data-line-total]',
      'td:last-child .money', // Often the last column
      'td:last-child .price',
    ];
    
    // Get quantity for this line
    const qtyElement = row.querySelector('input[name*="quantity"], .quantity, [data-quantity]');
    const quantity = qtyElement ? parseInt(qtyElement.value || qtyElement.textContent) || 1 : 1;
    
    totalSelectors.forEach(selector => {
      const totalElements = row.querySelectorAll(selector);
      
      totalElements.forEach(element => {
        if (!element.classList.contains('addon-total-updated') && !this.isHiddenProductElement(element)) {
          const originalTotal = this.extractPrice(element.textContent);
          
          if (originalTotal > 0) {
            const newTotal = originalTotal + (addonPrice * quantity);
            element.textContent = `£${newTotal.toFixed(2)}`;
            element.classList.add('addon-total-updated');
            element.setAttribute('data-original-total', originalTotal.toString());
            
            this.logger.log(`Updated line total: £${originalTotal} + £${addonPrice * quantity} = £${newTotal}`);
          }
        }
      });
    });
  }

  addAddonDetailsToRow(row, addons) {
    if (!addons || addons.length === 0) return;
    
    // Find the product title/description area
    const titleElement = row.querySelector('.product-title, .item-title, .cart-item-title, h3, h4, .product-name');
    
    if (titleElement && !titleElement.querySelector('.addon-details')) {
      const addonDetails = document.createElement('div');
      addonDetails.className = 'addon-details';
      addonDetails.style.cssText = `
        font-size: 12px;
        color: #666;
        margin-top: 4px;
        font-style: italic;
      `;
      
      const addonText = addons.map(addon => `${addon.name}: ${addon.value}`).join(', ');
      addonDetails.textContent = `Add-ons: ${addonText}`;
      
      titleElement.appendChild(addonDetails);
      this.logger.log('Added addon details to product title');
    }
  }

  updateCartTotals() {
    // Find and update cart subtotal/total elements
    const totalSelectors = [
      '.cart-subtotal .money',
      '.cart-total .money',
      '.subtotal-price',
      '[data-cart-subtotal]',
      '[data-cart-total]',
    ];
    
    // Calculate total addon price across all products
    let totalAddonPrice = 0;
    this.productAddonMap.forEach(addonInfo => {
      totalAddonPrice += addonInfo.addonPrice;
    });
    
    if (totalAddonPrice === 0) return;
    
    totalSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      
      elements.forEach(element => {
        if (!element.classList.contains('cart-total-updated')) {
          const originalTotal = this.extractPrice(element.textContent);
          
          if (originalTotal > 0) {
            // For cart totals, we don't add addon price since it's already included via hidden product
            // We just mark it as updated to prevent further processing
            element.classList.add('cart-total-updated');
            this.logger.log('Cart total already includes addon pricing via hidden product');
          }
        }
      });
    });
  }

  isHiddenProductElement(element) {
    // Check if this element belongs to the hidden product
    const row = element.closest('tr.cart-item, .cart-item, .line-item');
    return row && this.isHiddenProductRow(row);
  }

  extractPrice(text) {
    const priceMatch = text.match(/£?([\d,]+\.?\d*)/);
    return priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : 0;
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
      formData.append('properties[_note]', `Price adjustment for add-ons`);
      
      const response = await fetch('/cart/add.js', {
        method: 'POST',
        body: formData
      });
      
      if (response.ok) {
        const result = await response.json();
        this.logger.log('✅ Hidden product added successfully');
        this.markAsProcessed();
        
        // Update the display prices
        this.updateLineItemPrices();
        
        // Show subtle notification
        this.showUpdateNotification();
        
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
        this.logger.log('✅ Hidden product quantity updated successfully');
        this.markAsProcessed();
        
        // Update the display prices
        this.updateLineItemPrices();
        
        // Show subtle notification
        this.showUpdateNotification();
        
      } else {
        const error = await response.text();
        this.logger.error('Failed to update hidden product:', error);
      }
      
    } catch (error) {
      this.logger.error('Error updating hidden product quantity:', error);
    }
  }

  showUpdateNotification() {
    // Show a very subtle notification
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #2e7d32;
      color: white;
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 13px;
      z-index: 10000;
      opacity: 0;
      transition: opacity 0.3s ease;
    `;
    
    notification.textContent = '✓ Add-on pricing applied';
    document.body.appendChild(notification);
    
    // Fade in
    setTimeout(() => notification.style.opacity = '1', 100);
    
    // Fade out and remove
    setTimeout(() => {
      notification.style.opacity = '0';
      setTimeout(() => notification.remove(), 300);
    }, 2000);
  }
}