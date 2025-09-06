// Product page addon handling
import { ApiClient } from './api-client.js';
import { ProductDetector } from './product-detector.js';
import { AddonStorage } from './addon-storage.js';

export class ProductPageHandler {
  constructor(logger) {
    this.logger = logger;
    this.apiClient = new ApiClient(logger);
    this.productDetector = new ProductDetector(logger);
    this.addonStorage = new AddonStorage(logger);
  }

  async init() {
    const productId = this.productDetector.getProductId();
    if (!productId) {
      this.logger.log('Could not determine product ID');
      return;
    }

    this.logger.log('Found product ID:', productId);
    const addons = await this.apiClient.loadAddons(productId);
    
    if (addons && addons.length > 0) {
      this.renderAddons(addons);
      this.initializeCartHandling();
    } else {
      this.logger.log('No add-ons found for this product');
    }
  }

  renderAddons(addons) {
    // Remove any existing containers
    const existingContainers = document.querySelectorAll('#product-addons-container');
    existingContainers.forEach(container => {
      this.logger.log('Removing existing add-ons container');
      container.remove();
    });
    
    const container = this.createAddonsContainer();
    if (!container) {
      this.logger.log('Could not create add-ons container');
      return;
    }

    const addonList = container.querySelector('#addon-list');
    addons.forEach(addon => {
      const addonElement = this.createAddonElement(addon);
      addonList.appendChild(addonElement);
    });

    this.insertContainer(container);
    this.updateTotalPrice();
  }

  createAddonsContainer() {
    const container = document.createElement('div');
    container.id = 'product-addons-container';
    container.className = 'product-addons';
    container.innerHTML = `
      <div class="addon-header">
        <h3>Customize Your Order</h3>
        <div class="addon-total">
          Additional: <span id="addon-total">£0.00</span>
        </div>
      </div>
      <div id="addon-list"></div>
    `;

    // Add styling if not already present
    if (!document.getElementById('addon-styles')) {
      const style = document.createElement('style');
      style.id = 'addon-styles';
      style.textContent = `
        .product-addons {
          margin: 20px 0;
          padding: 20px;
          border: 2px solid #007ace;
          border-radius: 8px;
          background: #f8fdff;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .product-addons .addon-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
          padding-bottom: 12px;
          border-bottom: 1px solid #007ace;
        }
        .product-addons .addon-header h3 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
          color: #007ace;
        }
        .product-addons .addon-total {
          font-weight: bold;
          font-size: 16px;
          color: #007ace;
        }
        .product-addons .addon-item {
          margin: 12px 0;
          padding: 16px;
          background: white;
          border: 1px solid #ddd;
          border-radius: 6px;
          transition: border-color 0.2s;
        }
        .product-addons .addon-item:hover {
          border-color: #007ace;
        }
        .product-addons .addon-option {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .product-addons .addon-option label {
          font-weight: 500;
          color: #333;
          cursor: pointer;
          flex: 1;
        }
        .product-addons .addon-price {
          font-weight: bold;
          color: #007ace;
          font-size: 14px;
        }
        .product-addons .addon-checkbox, 
        .product-addons .addon-dropdown {
          margin: 0;
          transform: scale(1.1);
        }
        .product-addons .addon-dropdown {
          min-width: 180px;
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          background: white;
          font-size: 14px;
        }
      `;
      
      document.head.appendChild(style);
    }

    return container;
  }

  createAddonElement(addon) {
    const item = document.createElement('div');
    item.className = 'addon-item';
    item.setAttribute('data-addon-id', addon.id);

    if (addon.type === 'checkbox') {
      item.innerHTML = `
        <div class="addon-option">
          <input type="checkbox" 
                 id="addon-${addon.id}" 
                 class="addon-checkbox" 
                 data-addon-id="${addon.id}" 
                 data-price="${addon.price}" 
                 ${addon.required ? 'checked disabled' : ''}>
          <label for="addon-${addon.id}">${addon.name}</label>
          <span class="addon-price">+£${addon.price.toFixed(2)}</span>
        </div>
      `;
    } else if (addon.type === 'dropdown') {
      const options = addon.options || [];
      const optionElements = options.map(option => 
        `<option value="${option.value}" data-price="${option.price || 0}">${option.label} (+£${(option.price || 0).toFixed(2)})</option>`
      ).join('');

      item.innerHTML = `
        <div class="addon-option">
          <label for="addon-${addon.id}">${addon.name}:</label>
          <select id="addon-${addon.id}" 
                  class="addon-dropdown" 
                  data-addon-id="${addon.id}">
            <option value="" data-price="0">None</option>
            ${optionElements}
          </select>
        </div>
      `;
    }

    return item;
  }

  insertContainer(container) {
    const insertionPoints = [
      'form[action*="/cart/add"] .product-form__buttons',
      'form[action*="/cart/add"]',
      '.product-form__buttons',
      '.product-form',
      '.product-details',
      '.product-info',
      'main .container',
      'main',
      'body'
    ];

    let inserted = false;
    for (const selector of insertionPoints) {
      const element = document.querySelector(selector);
      if (element) {
        if (selector.includes('buttons')) {
          element.parentNode.insertBefore(container, element);
        } else {
          element.appendChild(container);
        }
        inserted = true;
        this.logger.log('Inserted container at:', selector);
        break;
      }
    }

    if (!inserted) {
      document.body.appendChild(container);
      this.logger.log('Inserted container as fallback');
    }
  }

  initializeCartHandling() {
    const checkboxes = document.querySelectorAll('.addon-checkbox');
    const dropdowns = document.querySelectorAll('.addon-dropdown');

    [...checkboxes, ...dropdowns].forEach(element => {
      element.addEventListener('change', (event) => this.handleAddonChange(event));
    });
  }

  handleAddonChange(event) {
    const element = event.target;
    const addonId = element.getAttribute('data-addon-id');
    let price = 0;
    let selectedValue = '';

    if (element.type === 'checkbox') {
      price = element.checked ? parseFloat(element.getAttribute('data-price')) : 0;
      selectedValue = element.checked ? 'selected' : '';
    } else if (element.type === 'select-one') {
      const selectedOption = element.options[element.selectedIndex];
      price = selectedOption ? parseFloat(selectedOption.getAttribute('data-price')) : 0;
      selectedValue = element.value;
    }

    this.logger.log(`🔧 DEBUG: Addon ${addonId} changed. Value: ${selectedValue}, Price: £${price}`);
    
    // Store addon selection in memory
    window.productAddons = window.productAddons || {};
    window.productAddons[addonId] = {
      selected: element.type === 'checkbox' ? element.checked : element.value !== '',
      price: price,
      value: selectedValue,
      name: element.closest('.addon-item').querySelector('label').textContent.replace(':', '').trim()
    };

    this.logger.log('📦 DEBUG: Current window.productAddons:', window.productAddons);

    // Store in session storage for cart page retrieval
    const productId = this.productDetector.getProductId();
    this.logger.log('🔍 DEBUG: Product ID for storage:', productId);
    
    if (productId) {
      this.logger.log('💾 DEBUG: About to call storeProductAddons...');
      const storedData = this.addonStorage.storeProductAddons(productId, window.productAddons);
      this.logger.log('💾 DEBUG: Storage result:', storedData);
      
      // Verify it was stored
      const verification = this.addonStorage.getProductAddons(productId);
      this.logger.log('✅ DEBUG: Verification - data retrieved:', verification);
      
      // Double-check raw session storage
      const rawStorage = sessionStorage.getItem('productAddons');
      this.logger.log('🗄️ DEBUG: Raw session storage:', rawStorage);
    } else {
      this.logger.error('❌ DEBUG: No product ID found - cannot store addons');
    }

    this.updateTotalPrice();
    this.updateCartProperties();
  }

  updateTotalPrice() {
    const totalElement = document.getElementById('addon-total');
    if (!totalElement) return;

    let total = 0;
    if (window.productAddons) {
      Object.values(window.productAddons).forEach(addon => {
        if (addon.selected) {
          total += addon.price;
        }
      });
    }

    totalElement.textContent = `£${total.toFixed(2)}`;
    
    // Update the main product price display
    this.updateMainPrice(total);
    
    // Try to update cart drawer if visible
    this.updateCartDrawer(total);
  }

  updateMainPrice(addonTotal) {
    const priceSelectors = [
      '.price:not(.addon-price)',
      '.product-price',
      '.product__price', 
      '[data-price]:not(.addon-price)',
      '.money:not(.addon-price)',
      '.price-item--regular'
    ];
    
    priceSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        if (!element.getAttribute('data-original-price')) {
          const priceText = element.textContent.replace(/[£$€,\s]/g, '');
          const price = parseFloat(priceText);
          if (!isNaN(price) && price > 0) {
            element.setAttribute('data-original-price', price.toString());
          }
        }
        
        const originalPrice = parseFloat(element.getAttribute('data-original-price'));
        if (!isNaN(originalPrice) && originalPrice > 0) {
          const newTotal = originalPrice + addonTotal;
          const originalText = element.textContent;
          const currencySymbol = originalText.match(/[£$€]/)?.[0] || '£';
          element.textContent = `${currencySymbol}${newTotal.toFixed(2)}`;
          this.logger.log('Updated price display:', originalPrice, '+', addonTotal, '=', newTotal);
        }
      });
    });
  }

  updateCartDrawer(addonTotal) {
    const cartDrawer = document.querySelector('.cart-drawer, .drawer--cart, #cart-drawer');
    if (cartDrawer && cartDrawer.style.display !== 'none') {
      this.logger.log('Cart drawer detected, attempting to refresh...');
      
      if (typeof window.refreshCart === 'function') {
        window.refreshCart();
      } else if (typeof window.updateCart === 'function') {
        window.updateCart();
      }
    }
  }

  updateCartProperties() {
    const form = document.querySelector('form[action*="/cart/add"]');
    if (!form || !window.productAddons) return;

    // Remove existing addon properties
    form.querySelectorAll('input[name^="properties["]').forEach(input => {
      if (input.name.includes('Add-on') || input.name.includes('_Add-on')) {
        input.remove();
      }
    });

    // Add new addon properties
    Object.entries(window.productAddons).forEach(([addonId, addon]) => {
      if (addon.selected) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = `properties[${addon.name}]`;
        input.value = addon.value === 'selected' ? `Yes (+£${addon.price.toFixed(2)})` : `${addon.value} (+£${addon.price.toFixed(2)})`;
        form.appendChild(input);
      }
    });

    // Add total addon price
    const totalPrice = Object.values(window.productAddons)
      .filter(addon => addon.selected)
      .reduce((sum, addon) => sum + addon.price, 0);
      
    if (totalPrice > 0) {
      const totalInput = document.createElement('input');
      totalInput.type = 'hidden';
      totalInput.name = 'properties[_Add-ons Total]';
      totalInput.value = `£${totalPrice.toFixed(2)}`;
      form.appendChild(totalInput);
    }
  }
}