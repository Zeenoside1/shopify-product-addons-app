// Cart page addon price handling - Fixed version with targeted price updates
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
    this.logger.log('Product addon map contains:', this.productAddonMap.size, 'entries');
    
    // Update each product line item with its addon pricing
    this.productAddonMap.forEach((addonInfo, variantId) => {
      this.logger.log('Processing variant:', variantId, 'with addon info:', addonInfo);
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
      this.logger.log('🔍 Trying smart fallback - find row with £0.00 prices...');
      
      // SMART FALLBACK: Find the row that contains £0.00 (likely the one with addons)
      cartRows.forEach((row, index) => {
        if (!this.isHiddenProductRow(row) && !foundMatch) {
          const rowText = row.textContent;
          const hasZeroPrice = rowText.includes('£0.00');
          
          this.logger.log(`Row ${index + 1} contains £0.00:`, hasZeroPrice);
          
          if (hasZeroPrice) {
            this.logger.log(`🎯 SMART MATCH! Row ${index + 1} has £0.00 prices - this is likely our addon product`);
            foundMatch = true;
            
            this.debugRowContents(row);
            this.updateRowUnitPrice(row, addonInfo.addonPrice);
            this.updateRowLineTotal(row, addonInfo.addonPrice);
            this.addAddonDetailsToRow(row, addonInfo.addons);
          }
        }
      });
      
      // If still no match, use the original fallback
      if (!foundMatch) {
        this.logger.log('🔄 Using original fallback - updating first non-hidden product row...');
        
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
    this.logger.log('Checking if row matches variant:', variantId);
    
    // Check various ways to identify the row
    const checks = [
      {
        name: 'data-variant-id attribute',
        check: () => row.getAttribute('data-variant-id') === variantId
      },
      {
        name: 'child with data-variant-id',
        check: () => row.querySelector(`[data-variant-id="${variantId}"]`)
      },
      {
        name: 'updates input name',
        check: () => row.querySelector(`input[name*="updates[${variantId}]"]`)
      },
      {
        name: 'input with variant value',
        check: () => row.querySelector(`input[value="${variantId}"]`)
      },
      {
        name: 'data-key attribute',
        check: () => row.getAttribute('data-key') === variantId
      },
      {
        name: 'data-line-item-key',
        check: () => row.getAttribute('data-line-item-key') === variantId
      }
    ];
    
    for (const checkObj of checks) {
      try {
        const result = checkObj.check();
        if (result) {
          this.logger.log(`✅ Row matches variant ${variantId} via: ${checkObj.name}`);
          return true;
        } else {
          this.logger.log(`❌ ${checkObj.name}: no match`);
        }
      } catch (error) {
        this.logger.log(`❌ ${checkObj.name}: error -`, error.message);
      }
    }
    
    // If no matches found, log the row attributes for debugging
    this.logger.log('Row attributes for debugging:', {
      'data-variant-id': row.getAttribute('data-variant-id'),
      'data-key': row.getAttribute('data-key'),
      'data-line-item-key': row.getAttribute('data-line-item-key'),
      'id': row.id,
      'class': row.className
    });
    
    // Also check if any inputs in the row contain the variant ID
    const allInputs = row.querySelectorAll('input');
    allInputs.forEach((input, index) => {
      this.logger.log(`Input ${index}:`, {
        name: input.name,
        value: input.value,
        'data-variant-id': input.getAttribute('data-variant-id')
      });
    });
    
    return false;
  }

  updateRowUnitPrice(row, addonPrice) {
    this.logger.log('🎯 TARGETING SPECIFIC PRICE ELEMENTS with addon price:', addonPrice);
    
    // Target the EXACT elements we found in debug output
    const priceSelectors = [
      'span.price.price--end',  // MAIN TARGET from debug output
      '.cart-item__price-wrapper .price.price--end',
      '.product-option', // This also contains £0.00 according to debug
    ];
    
    let updated = false;
    
    priceSelectors.forEach(selector => {
      const priceElements = row.querySelectorAll(selector);
      this.logger.log(`Checking selector "${selector}" - found ${priceElements.length} elements`);
      
      priceElements.forEach((element, elemIndex) => {
        if (!element.classList.contains('addon-updated') && !this.isHiddenProductElement(element)) {
          const elementText = element.textContent.trim();
          this.logger.log(`  Element ${elemIndex}: "${elementText}" (${element.tagName}.${element.className})`);
          
          // Check if this element contains exactly £0.00
          if (elementText === '£0.00') {
            const newPrice = addonPrice;
            element.textContent = `£${newPrice.toFixed(2)}`;
            element.classList.add('addon-updated');
            element.setAttribute('data-original-price', '0');
            
            this.logger.log(`✅ SUCCESS! Updated £0.00 to £${newPrice} using: ${selector}`);
            updated = true;
          }
          // Handle multi-line text that contains £0.00
          else if (elementText.includes('£0.00')) {
            const newPrice = addonPrice;
            const newText = elementText.replace('£0.00', `£${newPrice.toFixed(2)}`);
            element.textContent = newText;
            element.classList.add('addon-updated');
            element.setAttribute('data-original-price', '0');
            
            this.logger.log(`✅ SUCCESS! Updated text containing £0.00 using: ${selector}`);
            updated = true;
          }
        }
      });
    });
    
    // LAST RESORT: Find any element with exactly £0.00
    if (!updated) {
      this.logger.log('🔧 Last resort: finding ANY element with £0.00...');
      const allElements = Array.from(row.querySelectorAll('*')).filter(el => 
        el.textContent.trim() === '£0.00' && 
        el.children.length === 0 && // Text-only elements
        !this.isHiddenProductElement(el) &&
        !el.classList.contains('addon-updated')
      );
      
      this.logger.log(`Found ${allElements.length} elements with exactly £0.00`);
      
      if (allElements.length > 0) {
        const element = allElements[0];
        element.textContent = `£${addonPrice.toFixed(2)}`;
        element.classList.add('addon-updated');
        element.setAttribute('data-original-price', '0');
        this.logger.log(`✅ LAST RESORT SUCCESS! Updated first £0.00 element to £${addonPrice}`);
        updated = true;
      }
    }
    
    if (!updated) {
      this.logger.log('❌ FAILED to update any price elements');
    }
    
    return updated;
  }

  updateRowLineTotal(row, addonPrice) {
    this.logger.log('🎯 TARGETING SPECIFIC TOTAL ELEMENTS...');
    
    // Target the EXACT total elements from debug output
    const totalSelectors = [
      'td.cart-item__totals .price.price--end', // MAIN TARGET from debug
      '.cart-item__totals .cart-item__price-wrapper .price.price--end',
      'td.cart-item__totals',
    ];
    
    // Get quantity for this line
    const qtyElement = row.querySelector('input[name*="quantity"], .quantity, [data-quantity]');
    const quantity = qtyElement ? parseInt(qtyElement.value || qtyElement.textContent) || 1 : 1;
    
    let updated = false;
    
    totalSelectors.forEach(selector => {
      const totalElements = row.querySelectorAll(selector);
      this.logger.log(`Checking total selector "${selector}" - found ${totalElements.length} elements`);
      
      totalElements.forEach((element, elemIndex) => {
        if (!element.classList.contains('addon-total-updated') && !this.isHiddenProductElement(element)) {
          const elementText = element.textContent.trim();
          this.logger.log(`  Total element ${elemIndex}: "${elementText.substring(0, 50)}..." (${element.tagName}.${element.className})`);
          
          // Check if this element contains exactly £0.00
          if (elementText === '£0.00') {
            const newTotal = addonPrice * quantity;
            element.textContent = `£${newTotal.toFixed(2)}`;
            element.classList.add('addon-total-updated');
            element.setAttribute('data-original-total', '0');
            
            this.logger.log(`✅ SUCCESS! Updated total £0.00 to £${newTotal} using: ${selector}`);
            updated = true;
          }
          // Handle text that contains £0.00
          else if (elementText.includes('£0.00')) {
            const newTotal = addonPrice * quantity;
            // Use innerHTML to preserve structure
            element.innerHTML = element.innerHTML.replace('£0.00', `£${newTotal.toFixed(2)}`);
            element.classList.add('addon-total-updated');
            element.setAttribute('data-original-total', '0');
            
            this.logger.log(`✅ SUCCESS! Updated total text containing £0.00 using: ${selector}`);
            updated = true;
          }
        }
      });
    });
    
    if (!updated) {
      this.logger.log('❌ FAILED to update any total elements');
    }
    
    return updated;
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
    // Cart totals are already correct via hidden product - just mark as processed
    const totalSelectors = [
      '.cart-subtotal .money',
      '.cart-total .money',
      '.subtotal-price',
      '[data-cart-subtotal]',
      '[data-cart-total]',
    ];
    
    totalSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        if (!element.classList.contains('cart-total-updated')) {
          element.classList.add('cart-total-updated');
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

  showUpdateNotification(speed = 'normal') {
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
      transition: opacity 0.2s ease;
    `;
    
    notification.textContent = '✓ Add-on pricing applied';
    document.body.appendChild(notification);
    
    // Faster animations for speed = 'fast'
    const fadeInDelay = speed === 'fast' ? 50 : 100;
    const showDuration = speed === 'fast' ? 1500 : 2000;
    const fadeOutDuration = speed === 'fast' ? 200 : 300;
    
    // Fade in
    setTimeout(() => notification.style.opacity = '1', fadeInDelay);
    
    // Fade out and remove
    setTimeout(() => {
      notification.style.opacity = '0';
      setTimeout(() => notification.remove(), fadeOutDuration);
    }, showDuration);
  }
}