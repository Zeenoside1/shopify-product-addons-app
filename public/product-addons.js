(function() {
  'use strict';
  
  // Configuration
  const APP_HOST = window.location.protocol + '//' + window.location.hostname + (window.location.port ? ':' + window.location.port : '');
  const DEBUG = true;
  
  function log(...args) {
    if (DEBUG) console.log('[Product Add-ons]', ...args);
  }

  // Main initialization
  function init() {
    log('Initializing Product Add-ons...');
    
    // Check if we're on a product page
    if (!isProductPage()) {
      log('Not a product page, skipping initialization');
      return;
    }

    const productId = getProductId();
    if (!productId) {
      log('Could not determine product ID');
      return;
    }

    log('Found product ID:', productId);
    loadAddons(productId);
  }

  function isProductPage() {
    // Multiple ways to detect product page
    return window.location.pathname.includes('/products/') || 
           document.querySelector('[data-product-id]') ||
           document.querySelector('form[action*="/cart/add"]') ||
           document.querySelector('.product-form') ||
           document.body.classList.contains('template-product');
  }

  function getProductId() {
    let productId = null;
    
    // Method 1: Check for data attribute on various elements
    const selectors = [
      '[data-product-id]',
      '[data-product]',
      '.product-form [name="id"]',
      'form[action*="/cart/add"] [name="id"]',
      '.product [data-id]'
    ];
    
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        productId = element.getAttribute('data-product-id') || 
                   element.getAttribute('data-product') || 
                   element.getAttribute('data-id') ||
                   element.value;
        if (productId) break;
      }
    }
    
    // Method 2: Check global Shopify variables
    if (!productId && typeof window.ShopifyAnalytics !== 'undefined') {
      try {
        productId = window.ShopifyAnalytics.meta.product.id;
      } catch (e) {
        log('ShopifyAnalytics not available');
      }
    }
    
    // Method 3: Check for product JSON in script tags
    if (!productId) {
      const scripts = document.querySelectorAll('script[type="application/json"]');
      for (const script of scripts) {
        try {
          const data = JSON.parse(script.textContent);
          if (data.product && data.product.id) {
            productId = data.product.id;
            break;
          }
        } catch (e) {
          // Continue searching
        }
      }
    }
    
    // Method 4: Parse from URL
    if (!productId) {
      const matches = window.location.pathname.match(/\/products\/([^\/]+)/);
      if (matches) {
        log('Could not find numeric product ID, will use handle:', matches[1]);
        // We'll handle this in the API call
        return matches[1];
      }
    }
    
    return productId;
  }

  async function loadAddons(productId) {
    try {
      log('Loading add-ons for product:', productId);
      
      // Get shop domain from current URL
      const shop = window.location.hostname.replace('.myshopify.com', '') + '.myshopify.com';
      
      const response = await fetch(`${APP_HOST}/api/addons/${productId}?shop=${shop}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const addons = await response.json();
      log('Loaded add-ons:', addons);
      
      if (addons.length > 0) {
        renderAddons(addons);
        initializeCartHandling();
      } else {
        log('No add-ons found for this product');
      }
    } catch (error) {
      log('Error loading add-ons:', error);
    }
  }

  function renderAddons(addons) {
    const container = createAddonsContainer();
    if (!container) {
      log('Could not create add-ons container');
      return;
    }

    const addonList = container.querySelector('#addon-list');
    addons.forEach(addon => {
      const addonElement = createAddonElement(addon);
      addonList.appendChild(addonElement);
    });

    insertContainer(container);
    updateTotalPrice();
  }

  function createAddonsContainer() {
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

    // Add comprehensive styling
    const style = document.createElement('style');
    style.textContent = `
      .product-addons {
        margin: 20px 0;
        padding: 20px;
        border: 1px solid #e1e1e1;
        border-radius: 8px;
        background: #fafafa;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .addon-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
        padding-bottom: 12px;
        border-bottom: 1px solid #e1e1e1;
      }
      .addon-header h3 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        color: #333;
      }
      .addon-total {
        font-weight: bold;
        font-size: 16px;
        color: #2c5aa0;
      }
      .addon-item {
        margin: 12px 0;
        padding: 16px;
        background: white;
        border: 1px solid #ddd;
        border-radius: 6px;
        transition: border-color 0.2s;
      }
      .addon-item:hover {
        border-color: #2c5aa0;
      }
      .addon-option {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .addon-option label {
        font-weight: 500;
        color: #333;
        cursor: pointer;
        flex: 1;
      }
      .addon-price {
        font-weight: bold;
        color: #2c5aa0;
        font-size: 14px;
      }
      .addon-checkbox, .addon-dropdown {
        margin: 0;
        transform: scale(1.1);
      }
      .addon-dropdown {
        min-width: 150px;
        padding: 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
        background: white;
      }
      .addon-required {
        opacity: 0.7;
        background: #f0f0f0;
      }
      .addon-description {
        font-size: 13px;
        color: #666;
        margin-top: 4px;
      }
    `;
    
    if (!document.getElementById('addon-styles')) {
      style.id = 'addon-styles';
      document.head.appendChild(style);
    }

    return container;
  }

  function createAddonElement(addon) {
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

  function insertContainer(container) {
    // Try to find the best place to insert the add-ons
    const insertionPoints = [
      'form[action*="/cart/add"] .product-form__buttons',
      'form[action*="/cart/add"]',
      '.product-form__buttons',
      '.product-form',
      '.product-form-container',
      '.product__content .product__info',
      '.product-single__meta',
      '.product-details',
      '.product-options',
      '.product-variants',
      '.product-price'
    ];

    let inserted = false;
    for (const selector of insertionPoints) {
      const element = document.querySelector(selector);
      if (element) {
        // Insert before the element if it's a submit button container, otherwise after
        if (selector.includes('buttons')) {
          element.parentNode.insertBefore(container, element);
        } else {
          element.appendChild(container);
        }
        inserted = true;
        log('Inserted add-ons container at:', selector);
        break;
      }
    }

    // Fallback: try to insert near any form
    if (!inserted) {
      const form = document.querySelector('form');
      if (form) {
        form.appendChild(container);
        inserted = true;
        log('Inserted add-ons container in form');
      }
    }

    // Last resort: append to main content area
    if (!inserted) {
      const main = document.querySelector('main, .main-content, #main, .container') || document.body;
      main.appendChild(container);
      log('Inserted add-ons container as fallback');
    }
  }

  function initializeCartHandling() {
    const checkboxes = document.querySelectorAll('.addon-checkbox');
    const dropdowns = document.querySelectorAll('.addon-dropdown');

    [...checkboxes, ...dropdowns].forEach(element => {
      element.addEventListener('change', handleAddonChange);
    });
  }

  function handleAddonChange(event) {
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

    log(`Addon ${addonId} changed. Value: ${selectedValue}, Price: £${price}`);
    
    // Store addon selection in a global object
    window.productAddons = window.productAddons || {};
    window.productAddons[addonId] = {
      selected: element.type === 'checkbox' ? element.checked : element.value !== '',
      price: price,
      value: selectedValue,
      name: element.closest('.addon-item').querySelector('label').textContent.replace(':', '').trim()
    };

    updateTotalPrice();
    updateCartProperties();
  }

  function updateTotalPrice() {
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
    
    // Update the main product price if possible
    updateMainPrice(total);
  }

  function updateMainPrice(addonTotal) {
    // Look for price elements and try to update them
    const priceSelectors = [
      '.price',
      '.product-price',
      '.product__price',
      '[data-price]',
      '.money'
    ];
    
    priceSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        if (!element.getAttribute('data-original-price')) {
          // Store original price on first run
          const priceText = element.textContent.replace(/[£$€,]/g, '');
          const price = parseFloat(priceText);
          if (!isNaN(price)) {
            element.setAttribute('data-original-price', price.toString());
          }
        }
        
        const originalPrice = parseFloat(element.getAttribute('data-original-price'));
        if (!isNaN(originalPrice) && addonTotal > 0) {
          const newTotal = originalPrice + addonTotal;
          element.textContent = element.textContent.replace(/[\d,]+\.?\d*/, newTotal.toFixed(2));
        }
      });
    });
  }

  function updateCartProperties() {
    // Add hidden inputs to the cart form to pass addon selections
    const form = document.querySelector('form[action*="/cart/add"]');
    if (!form || !window.productAddons) return;

    // Remove existing addon properties
    form.querySelectorAll('input[name^="properties["]').forEach(input => {
      if (input.name.includes('Addon') || input.name.includes('_Addon')) {
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

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Also try to initialize after a short delay in case DOM changes
  setTimeout(init, 1000);

})();
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
        </div>
        <span class="addon-price">+£${addon.price.toFixed(2)}</span>
      `;
    } else if (addon.type === 'dropdown') {
      const options = addon.options || [];
      const optionElements = options.map(option => 
        `<option value="${option.value}" data-price="${option.price || 0}">${option.label} (+£${(option.price || 0).toFixed(2)})</option>`
      ).join('');

      item.innerHTML = `
        <div class="addon-option">
          <select id="addon-${addon.id}" 
                  class="addon-dropdown" 
                  data-addon-id="${addon.id}" 
                  data-base-price="${addon.price}">
            <option value="" data-price="0">None</option>
            ${optionElements}
          </select>
          <label for="addon-${addon.id}">${addon.name}</label>
        </div>
        <span class="addon-price">+£${addon.price.toFixed(2)}</span>
      `;
    }

    return item;
  }

  function insertContainer(container) {
    // Try to find the best place to insert the add-ons
    const insertionPoints = [
      'form[action*="/cart/add"]',
      '.product-form',
      '.product-options',
      '.product-variants',
      '.product-price'
    ];

    let inserted = false;
    for (const selector of insertionPoints) {
      const element = document.querySelector(selector);
      if (element) {
        element.parentNode.insertBefore(container, element.nextSibling);
        inserted = true;
        break;
      }
    }

    // Fallback: append to body
    if (!inserted) {
      document.body.appendChild(container);
    }
  }

  function initializeCartHandling() {
    const checkboxes = document.querySelectorAll('.addon-checkbox');
    const dropdowns = document.querySelectorAll('.addon-dropdown');

    [...checkboxes, ...dropdowns].forEach(element => {
      element.addEventListener('change', handleAddonChange);
    });
  }

  function handleAddonChange(event) {
    const element = event.target;
    const addonId = element.getAttribute('data-addon-id');
    let price = 0;

    if (element.type === 'checkbox') {
      price = element.checked ? parseFloat(element.getAttribute('data-price')) : 0;
    } else if (element.type === 'select-one') {
      const selectedOption = element.options[element.selectedIndex];
      price = selectedOption ? parseFloat(selectedOption.getAttribute('data-price')) : 0;
    }

    log(`Addon ${addonId} changed. New price: £${price}`);
    
    // Store addon selection in a global object
    window.productAddons = window.productAddons || {};
    window.productAddons[addonId] = {
      selected: element.type === 'checkbox' ? element.checked : element.value !== '',
      price: price,
      value: element.type === 'checkbox' ? element.checked : element.value
    };

    updateTotalPrice();
    updateCartProperties();
  }

  function updateTotalPrice() {
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
    
    // Update the main product price if possible
    updateMainPrice(total);
  }

  function updateMainPrice(addonTotal) {
    const priceElements = document.querySelectorAll('.price, .product-price, [class*="price"]');
    
    priceElements.forEach(element => {
      if (element.getAttribute('data-original-price')) {
        const originalPrice = parseFloat(element.getAttribute('data-original-price'));
        const newTotal = originalPrice + addonTotal;
        element.textContent = `£${newTotal.toFixed(2)}`;
      }
    });
  }

  function updateCartProperties() {
    // Add hidden inputs to the cart form to pass addon selections
    const form = document.querySelector('form[action*="/cart/add"]');
    if (!form || !window.productAddons) return;

    // Remove existing addon properties
    form.querySelectorAll('input[name^="properties[Addon"]').forEach(input => {
      input.remove();
    });

    // Add new addon properties
    Object.entries(window.productAddons).forEach(([addonId, addon]) => {
      if (addon.selected) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = `properties[Addon ${addonId}]`;
        input.value = `Selected (£${addon.price.toFixed(2)})`;
        form.appendChild(input);
      }
    });

    // Add total addon price
    const totalInput = document.createElement('input');
    totalInput.type = 'hidden';
    totalInput.name = 'properties[_Addon Total]';
    totalInput.value = Object.values(window.productAddons)
      .filter(addon => addon.selected)
      .reduce((sum, addon) => sum + addon.price, 0)
      .toFixed(2);
    form.appendChild(totalInput);
  }

  // Store original prices for price updates
  function storeOriginalPrices() {
    const priceElements = document.querySelectorAll('.price, .product-price, [class*="price"]');
    priceElements.forEach(element => {
      if (!element.getAttribute('data-original-price')) {
        const priceText = element.textContent.replace(/[£$€,]/g, '');
        const price = parseFloat(priceText);
        if (!isNaN(price)) {
          element.setAttribute('data-original-price', price.toString());
        }
      }
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      storeOriginalPrices();
      init();
    });
  } else {
    storeOriginalPrices();
    init();
  }

})();