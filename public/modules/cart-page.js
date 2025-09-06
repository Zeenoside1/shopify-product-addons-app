// Cart page addon price handling
import { AddonStorage } from './addon-storage.js';

export class CartPageHandler {
  constructor(logger) {
    this.logger = logger;
    this.addonStorage = new AddonStorage(logger);
    this.updateInProgress = false;
    this.processedElements = new Set(); // Track processed elements
    this.isolatedStylesAdded = false;
    this.updateTimeout = null; // For debouncing
  }

  init() {
    this.logger.log('Initializing cart page updates...');
    
    // Add isolated styles first
    this.addIsolatedStyles();
    
    // Debug: Check if we have any stored addon data
    this.debugStorageContents();
    
    // Clean old addon data
    this.addonStorage.clearOldAddons();
    
    // Initial update with delay
    setTimeout(() => {
      this.debouncedUpdate();
    }, 1500);
    
    // Watch for cart updates
    this.watchForCartUpdates();
    
    // Set up mutation observer with throttling
    this.setupMutationObserver();
  }

  debugStorageContents() {
    try {
      const stored = sessionStorage.getItem('productAddons');
      this.logger.log('🔍 Session storage check:');
      this.logger.log('  Raw storage value:', stored);
      
      if (stored) {
        const parsed = JSON.parse(stored);
        this.logger.log('  Parsed storage:', parsed);
        this.logger.log('  Number of products with addons:', Object.keys(parsed).length);
      } else {
        this.logger.log('  ❌ No addon data in session storage');
        this.logger.log('  💡 This means items were added to cart before the storage system was active');
        this.logger.log('  💡 Will fallback to text parsing method');
      }
    } catch (error) {
      this.logger.error('Error checking storage:', error);
    }
  }

  addIsolatedStyles() {
    if (this.isolatedStylesAdded || document.getElementById('cart-addon-styles')) {
      return;
    }
    
    this.isolatedStylesAdded = true;
    const style = document.createElement('style');
    style.id = 'cart-addon-styles';
    style.textContent = `
      /* Isolated cart addon styles - won't leak */
      .cart-addon-info {
        font-size: 11px !important;
        color: #666 !important;
        margin: 2px 0 !important;
        padding: 0 !important;
        font-weight: normal !important;
        line-height: 1.2 !important;
        background: none !important;
        border: none !important;
        display: block !important;
      }
      
      .cart-addon-price-update {
        font-weight: bold !important;
        color: #007ace !important;
      }
      
      /* Ensure no layout disruption */
      .cart-addon-info * {
        font-size: inherit !important;
        color: inherit !important;
        margin: 0 !important;
        padding: 0 !important;
      }
    `;
    document.head.appendChild(style);
    this.logger.log('Added isolated cart styles');
  }

  debouncedUpdate() {
    clearTimeout(this.updateTimeout);
    this.updateTimeout = setTimeout(() => {
      this.updateCartPagePrices();
    }, 300); // 300ms debounce
  }

  setupMutationObserver() {
    const observer = new MutationObserver(() => {
      if (!this.updateInProgress) {
        this.debouncedUpdate(); // Use debounced version
      }
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
    this.logger.log('🛒 === CART UPDATE START ===');
    this.logger.log('Updating cart page prices using stored addon data...');
    
    try {
      const cartItems = document.querySelectorAll('[data-cart-item], .cart-item, .cart__item, .line-item');
      this.logger.log('Found', cartItems.length, 'cart items');
      
      // Get addon data from storage for all cart items
      const cartAddons = this.addonStorage.getCartAddons(Array.from(cartItems));
      this.logger.log('Retrieved cart addons from storage:', cartAddons);
      
      let totalAddonPrice = 0;
      
      cartAddons.forEach((cartAddon, index) => {
        try {
          this.logger.log(`Processing cart item ${index + 1}:`, {
            addons: cartAddon.addons,
            totalPrice: cartAddon.totalPrice
          });
          
          const itemId = this.getElementId(cartAddon.item);
          
          // Skip if already processed
          if (this.processedElements.has(itemId)) {
            this.logger.log('Item already processed, adding to total:', cartAddon.totalPrice);
            totalAddonPrice += cartAddon.totalPrice;
            return;
          }
          
          if (cartAddon.totalPrice > 0) {
            this.updateCartItemPriceWithStoredData(cartAddon.item, cartAddon.addons, cartAddon.totalPrice);
            this.processedElements.add(itemId);
            totalAddonPrice += cartAddon.totalPrice;
            this.logger.log('Updated item, running total now:', totalAddonPrice);
          }
        } catch (error) {
          this.logger.error('Error updating cart item with stored data:', error);
        }
      });
      
      this.logger.log('🔢 Final total addon price:', totalAddonPrice);
      
      // Update cart total with all addon prices
      if (totalAddonPrice > 0) {
        this.updateCartTotal(totalAddonPrice);
      } else {
        this.logger.log('⚠️  No addon prices found in stored data');
        // Fallback to text parsing if no stored data
        this.logger.log('Falling back to text parsing...');
        // this.fallbackToTextParsing(cartItems);
      }
      
    } finally {
      this.updateInProgress = false;
      this.logger.log('🛒 === CART UPDATE END ===');
    }
  }

  fallbackToTextParsing(cartItems) {
    this.logger.log('📝 Using fallback text parsing method');
    let totalAddonPrice = 0;
    
    cartItems.forEach((item, index) => {
      const itemId = this.getElementId(item);
      
      // Skip if already processed (avoid duplicate processing)
      if (this.processedElements.has(itemId)) {
        this.logger.log(`Fallback item ${index + 1} - already processed, skipping`);
        return;
      }
      
      const properties = this.extractCartAddonProperties(item);
      this.logger.log(`Fallback item ${index + 1} parsed price:`, properties.totalAddonPrice);
      
      if (properties.totalAddonPrice > 0) {
        this.updateCartItemPriceWithStoredData(item, properties.addons, properties.totalAddonPrice);
        this.processedElements.add(itemId);
        totalAddonPrice += properties.totalAddonPrice;
      }
    });
    
    this.logger.log('📝 Fallback total addon price:', totalAddonPrice);
    if (totalAddonPrice > 0) {
      this.updateCartTotal(totalAddonPrice);
    }
  }

  getElementId(element) {
    // Create a unique identifier for the element
    return element.outerHTML.substring(0, 200) + element.textContent.substring(0, 100);
  }

  extractCartAddonProperties(item) {
    const properties = {
      addons: [],
      totalAddonPrice: 0
    };
    
    this.logger.log('📝 Parsing cart item text for addons...');
    const itemText = item.textContent || item.innerText || '';
    this.logger.log('  Item text:', itemText.substring(0, 500));
    
    // Look for addon properties specifically in cart items
    const propertySelectors = [
      '.product-option',
      '.line-item-property', 
      '.cart-attribute',
      '.product-property',
      'dd', // Definition lists are common in cart
      'li'  // List items
    ];
    
    let foundAnyAddons = false;
    
    propertySelectors.forEach(selector => {
      const elements = item.querySelectorAll(selector);
      this.logger.log(`  Found ${elements.length} elements with selector: ${selector}`);
      
      elements.forEach((element, index) => {
        const text = element.textContent || element.innerText || '';
        this.logger.log(`    Element ${index + 1} text:`, text);
        
        // Look for addon price patterns - more specific to avoid false matches
        const pricePatterns = [
          /(\w[^(]*)\(\+£([\d.]+)\)/,    // Text (+£65.00)
          /([^:]+):\s*Yes\s*\(\+£([\d.]+)\)/,  // Name: Yes (+£65.00)
          /([^:]+):\s*([^(]+)\s*\(\+£([\d.]+)\)/, // Name: value (+£65.00)
        ];
        
        pricePatterns.forEach((pattern, patternIndex) => {
          const priceMatch = text.match(pattern);
          if (priceMatch) {
            const price = parseFloat(priceMatch[priceMatch.length - 1]); // Last group is always price
            const addonName = priceMatch[1].trim();
            
            this.logger.log(`    🎯 Pattern ${patternIndex + 1} match:`, {
              name: addonName,
              price: price,
              fullMatch: priceMatch[0]
            });
            
            if (price > 0 && addonName) {
              // Only add if we haven't seen this addon already
              if (!properties.addons.some(addon => addon.name === addonName)) {
                properties.addons.push({
                  name: addonName,
                  price: price
                });
                properties.totalAddonPrice += price;
                foundAnyAddons = true;
              }
            }
          }
        });
      });
    });
    
    this.logger.log('📝 Extraction results:', {
      foundAddons: properties.addons,
      totalPrice: properties.totalAddonPrice,
      foundAny: foundAnyAddons
    });
    
    return properties;
  }

  updateCartItemPriceWithStoredData(item, addons, totalAddonPrice) {
    if (totalAddonPrice <= 0) return;
    
    this.logger.log('Updating cart item with stored addon price:', totalAddonPrice, 'addons:', addons);
    
    // More specific selectors for cart prices
    const priceSelectors = [
      '.price:not(.cart-addon-updated)',
      '.cart-item__price:not(.cart-addon-updated)',
      '.line-item__price:not(.cart-addon-updated)',
      '.money:not(.cart-addon-updated)'
    ];
    
    let updated = false;
    priceSelectors.forEach(selector => {
      const priceElements = item.querySelectorAll(selector);
      priceElements.forEach(element => {
        if (!element.classList.contains('cart-addon-updated')) {
          if (this.updateCartPriceElement(element, totalAddonPrice)) {
            element.classList.add('cart-addon-updated');
            updated = true;
          }
        }
      });
    });
    
    return updated;
  }

  updateCartPriceElement(element, addonPrice) {
    const originalText = element.textContent || element.innerText || '';
    
    // Skip if already updated
    if (originalText.includes('(incl.') || originalText.includes('add-ons') || element.hasAttribute('data-cart-addon-original')) {
      return false;
    }
    
    // Store original text
    element.setAttribute('data-cart-addon-original', 'true');
    
    // Extract current price
    const priceMatch = originalText.match(/(£|$|€)([\d,]+\.?\d*)/);
    if (priceMatch) {
      const currencySymbol = priceMatch[1];
      const currentPrice = parseFloat(priceMatch[2].replace(/,/g, ''));
      
      if (!isNaN(currentPrice) && currentPrice > 0) {
        const newPrice = currentPrice + addonPrice;
        const updatedText = originalText.replace(
          priceMatch[0], 
          `${currencySymbol}${newPrice.toFixed(2)}`
        );
        
        // Add a small addon info span
        element.innerHTML = `
          <span class="cart-addon-price-update">${updatedText}</span>
          <span class="cart-addon-info">(incl. +£${addonPrice.toFixed(2)} add-ons)</span>
        `;
        
        this.logger.log('Updated cart price element:', currentPrice, '+', addonPrice, '=', newPrice);
        return true;
      }
    }
    
    return false;
  }

  updateCartTotal(totalAddonPrice) {
    if (totalAddonPrice <= 0) return;
    
    this.logger.log('💰 Updating cart total with addon price:', totalAddonPrice);
    
    // Add the specific selector for this theme first
    const totalSelectors = [
      // Theme-specific selector
      'div.totals p.totals__total-value:not(.cart-total-updated)',
      '.totals__total-value:not(.cart-total-updated)',
      
      // Common cart total selectors
      '.cart__total .money:not(.cart-total-updated)',
      '.cart-total .money:not(.cart-total-updated)',
      '.totals__total .money:not(.cart-total-updated)',
      '.estimated-total .money:not(.cart-total-updated)',
      '[data-cart-total]:not(.cart-total-updated)',
      // More general approaches
      '.cart-footer .money:not(.cart-total-updated)'
    ];
    
    let updated = false;
    
    // Debug: log all potential elements
    this.logger.log('🔍 Searching for total elements...');
    totalSelectors.forEach((selector, index) => {
      const elements = document.querySelectorAll(selector.replace(':not(.cart-total-updated)', ''));
      this.logger.log(`Selector ${index + 1} (${selector}):`, elements.length, 'elements found');
      if (elements.length > 0) {
        elements.forEach((el, i) => {
          this.logger.log(`  Element ${i + 1}:`, el.textContent.trim(), 'Already updated:', el.classList.contains('cart-total-updated'));
        });
      }
    });
    
    // First try specific selectors
    totalSelectors.forEach((selector, index) => {
      try {
        const elements = document.querySelectorAll(selector);
        this.logger.log(`Trying selector ${index + 1}: ${selector} - Found ${elements.length} elements`);
        
        elements.forEach((element, i) => {
          if (!element.classList.contains('cart-total-updated') && !element.hasAttribute('data-cart-total-original')) {
            this.logger.log(`Attempting to update element ${i + 1}:`, element.textContent.trim());
            
            if (this.updateCartTotalElement(element, totalAddonPrice)) {
              element.classList.add('cart-total-updated');
              element.setAttribute('data-cart-total-original', 'true');
              updated = true;
              this.logger.log('✅ Successfully updated cart total element via selector:', selector);
            } else {
              this.logger.log('❌ Failed to update element');
            }
          } else {
            this.logger.log(`Skipping element ${i + 1} - already updated or has original attribute`);
          }
        });
      } catch (e) {
        this.logger.error('Error with selector:', selector, e);
      }
    });
    
    // If no specific selectors worked, try a broader approach
    if (false) { //!updated) {
      this.logger.log('🔍 No specific selectors worked, trying broader approach...');
      
      // Look for text containing "Estimated total" or "Total"
      const allElements = Array.from(document.querySelectorAll('*')).filter(el => {
        const text = el.textContent.toLowerCase();
        return (text.includes('estimated total') || (text.includes('total') && text.includes('£'))) &&
               !el.classList.contains('cart-total-updated') &&
               el.children.length <= 3; // Avoid containers
      });
      
      this.logger.log('Broader search found', allElements.length, 'potential elements');
      
      allElements.forEach((element, index) => {
        this.logger.log(`Broad element ${index + 1}:`, element.textContent.trim(), 'Tag:', element.tagName);
        
        // Try the element itself first
        if (!element.classList.contains('cart-total-updated')) {
          if (this.updateCartTotalElement(element, totalAddonPrice)) {
            element.classList.add('cart-total-updated');
            element.setAttribute('data-cart-total-original', 'true');
            updated = true;
            this.logger.log('✅ Updated via broad search - element itself');
          }
        }
        
        // Then try money elements within
        const moneyElements = element.querySelectorAll('.money, [class*="price"], [class*="total"]');
        moneyElements.forEach((moneyEl, i) => {
          if (!moneyEl.classList.contains('cart-total-updated')) {
            this.logger.log(`  Trying money element ${i + 1}:`, moneyEl.textContent.trim());
            if (this.updateCartTotalElement(moneyEl, totalAddonPrice)) {
              moneyEl.classList.add('cart-total-updated');
              moneyEl.setAttribute('data-cart-total-original', 'true');
              updated = true;
              this.logger.log('✅ Updated via broad search - money element');
            }
          }
        });
      });
    }
    
    if (!updated) {
      this.logger.log('❌ Could not find any cart total element to update');
      this.logger.log('💡 Available elements that might be totals:');
      
      // Debug: show all elements that contain currency
      const currencyElements = Array.from(document.querySelectorAll('*')).filter(el => 
        el.textContent.includes('£') && 
        el.children.length <= 2 &&
        !el.classList.contains('cart-total-updated')
      );
      
      currencyElements.forEach((el, i) => {
        this.logger.log(`  Currency element ${i + 1}:`, el.textContent.trim(), 'Classes:', el.className, 'Tag:', el.tagName);
      });
    }
  }

  updateCartTotalElement(element, addonPrice) {
    const originalText = element.textContent || element.innerText || '';
    
    // Skip if already updated
    if (originalText.includes('(incl.') || originalText.includes('add-ons') || element.hasAttribute('data-cart-total-original')) {
      return false;
    }
    
    // Extract current price - handle £0.00 case
    const priceMatch = originalText.match(/(£|$|€)([\d,]+\.?\d*)/);
    if (priceMatch) {
      const currencySymbol = priceMatch[1];
      const currentPrice = parseFloat(priceMatch[2].replace(/,/g, ''));
      
      if (!isNaN(currentPrice)) {
        const newPrice = currentPrice + addonPrice;
        const updatedText = originalText.replace(
          priceMatch[0], 
          `${currencySymbol}${newPrice.toFixed(2)}`
        );
        element.textContent = updatedText;
        this.logger.log('Updated cart total:', currentPrice, '+', addonPrice, '=', newPrice);
        return true;
      }
    }
    
    return false;
  }

  watchForCartUpdates() {
    // Intercept fetch requests for cart updates with throttling
    const originalFetch = window.fetch;
    
    window.fetch = async (...args) => {
      const response = await originalFetch.apply(this, args);
      
      const url = args[0];
      if (typeof url === 'string' && (url.includes('/cart') || url.includes('cart.js'))) {
        // Clear processed elements on cart changes and use debounced update
        this.processedElements.clear();
        this.debouncedUpdate();
      }
      
      return response;
    };
  }
}