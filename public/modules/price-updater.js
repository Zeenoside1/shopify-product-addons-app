// Price calculation and update utilities
export class PriceUpdater {
  constructor(logger) {
    this.logger = logger;
  }

  updatePriceElement(element, addonPrice) {
    const originalText = element.textContent || element.innerText || '';
    
    // Skip if already updated
    if (originalText.includes('(incl.') || originalText.includes('add-ons') || element.hasAttribute('data-addon-original')) {
      return false;
    }
    
    // Store original text
    element.setAttribute('data-original-text', originalText);
    element.setAttribute('data-addon-original', 'true');
    
    // Extract current price
    const priceMatch = originalText.match(/(£|$|€)([\d,]+\.?\d*)/);
    if (priceMatch) {
      const currencySymbol = priceMatch[1];
      const currentPrice = parseFloat(priceMatch[2].replace(/,/g, ''));
      
      if (!isNaN(currentPrice)) {
        const newPrice = currentPrice + addonPrice;
        const updatedText = originalText.replace(
          priceMatch[0], 
          `${currencySymbol}${newPrice.toFixed(2)} (incl. +£${addonPrice.toFixed(2)} add-ons)`
        );
        element.textContent = updatedText;
        this.logger.log('Updated price element:', currentPrice, '+', addonPrice, '=', newPrice);
        return true;
      }
    }
    
    return false;
  }

  extractAddonProperties(item) {
    const properties = {
      addons: [],
      totalAddonPrice: 0
    };
    
    // Look for addon properties in various places
    const propertySelectors = [
      '.product-option',
      '.line-item-property',
      '.cart-attribute',
      '.product-property',
      '.custom-property',
      '.variant-option',
      'dd', // Definition lists
      'li'  // List items
    ];
    
    propertySelectors.forEach(selector => {
      const elements = item.querySelectorAll(selector);
      elements.forEach(element => {
        const text = element.textContent || element.innerText || '';
        
        // Look for various price patterns
        const pricePatterns = [
          /\+£([\d.]+)/,           // +£65.00
          /\(\+£([\d.]+)\)/,       // (+£65.00)
          /£([\d.]+) add-ons?/i,   // £65.00 add-ons
          /addon.*£([\d.]+)/i      // addon £65.00
        ];
        
        pricePatterns.forEach(pattern => {
          const priceMatch = text.match(pattern);
          if (priceMatch) {
            const price = parseFloat(priceMatch[1]);
            if (price > 0) {
              const addonName = text.replace(pattern, '').trim();
              // Only add if we haven't seen this addon already
              if (!properties.addons.some(addon => addon.name === addonName)) {
                properties.addons.push({
                  name: addonName,
                  price: price
                });
                properties.totalAddonPrice += price;
              }
            }
          }
        });
      });
    });
    
    return properties;
  }

  updateCartItemPrice(item, properties) {
    if (properties.totalAddonPrice <= 0) return;
    
    const priceSelectors = [
      '.price',
      '.cart-item__price',
      '.line-item__price',
      '.money',
      '[data-price]',
      '.total'
    ];
    
    let updated = false;
    priceSelectors.forEach(selector => {
      const priceElements = item.querySelectorAll(selector);
      priceElements.forEach(element => {
        if (!element.classList.contains('addon-updated') && !element.hasAttribute('data-addon-original')) {
          if (this.updatePriceElement(element, properties.totalAddonPrice)) {
            element.classList.add('addon-updated');
            updated = true;
          }
        }
      });
    });
    
    return updated;
  }

  updateCartTotal(totalAddonPrice) {
    if (totalAddonPrice <= 0) return;
    
    this.logger.log('Updating cart total with addon price:', totalAddonPrice);
    
    // Find total elements that haven't been updated yet
    const totalTextElements = Array.from(document.querySelectorAll('*')).filter(el => {
      const text = el.textContent.toLowerCase();
      return (text.includes('estimated total') || text.includes('subtotal')) && 
             !el.classList.contains('total-updated') &&
             !el.hasAttribute('data-addon-total-original');
    });
    
    totalTextElements.forEach(element => {
      // Look for price elements within or near this element
      const nearbyPrices = element.querySelectorAll('.money, [data-price], .price');
      nearbyPrices.forEach(priceEl => {
        if (!priceEl.classList.contains('total-updated') && !priceEl.hasAttribute('data-addon-total-original')) {
          if (this.updatePriceElement(priceEl, totalAddonPrice)) {
            priceEl.classList.add('total-updated');
            priceEl.setAttribute('data-addon-total-original', 'true');
            this.logger.log('Updated total via proximity search');
          }
        }
      });
      
      // Also check if the element itself contains a price
      if (element.textContent.match(/£[\d.]+/) && !element.hasAttribute('data-addon-total-original')) {
        if (this.updatePriceElement(element, totalAddonPrice)) {
          element.classList.add('total-updated');
          element.setAttribute('data-addon-total-original', 'true');
          this.logger.log('Updated total element directly');
        }
      }
    });
  }

  calculateTotalAddonPrice() {
    let totalAddonPrice = 0;
    const processedElements = new Set();
    
    // Calculate total addon price from all updated items - avoid double counting
    document.querySelectorAll('.addon-updated').forEach(element => {
      const elementId = element.outerHTML;
      if (!processedElements.has(elementId)) {
        processedElements.add(elementId);
        
        const text = element.textContent || '';
        const addonMatch = text.match(/\+£([\d.]+) add-ons/);
        if (addonMatch) {
          totalAddonPrice += parseFloat(addonMatch[1]);
        }
      }
    });
    
    return totalAddonPrice;
  }
}