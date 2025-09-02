(function() {
  'use strict';
  
  // Configuration
  const APP_HOST = 'YOUR_APP_HOST'; // Replace with your app's URL
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
    return window.location.pathname.includes('/products/') || 
           document.querySelector('[data-product-id]') ||
           document.querySelector('form[action*="/cart/add"]');
  }

  function getProductId() {
    // Try multiple methods to get product ID
    let productId = null;
    
    // Method 1: Check for data attribute
    const productElement = document.querySelector('[data-product-id]');
    if (productElement) {
      productId = productElement.getAttribute('data-product-id');
    }
    
    // Method 2: Check meta tags
    if (!productId) {
      const metaTag = document.querySelector('meta[property="product:price:amount"]');
      if (metaTag) {
        const productScript = document.querySelector('script:contains("product")');
        if (productScript) {
          try {
            const matches = productScript.textContent.match(/"id":(\d+)/);
            if (matches) productId = matches[1];
          } catch (e) {
            log('Error parsing product script:', e);
          }
        }
      }
    }
    
    // Method 3: Check for Shopify product object
    if (!productId && typeof ShopifyAnalytics !== 'undefined') {
      try {
        productId = ShopifyAnalytics.meta.product.id;
      } catch (e) {
        log('ShopifyAnalytics not available');
      }
    }
    
    // Method 4: Extract from URL or form action
    if (!productId) {
      const form = document.querySelector('form[action*="/cart/add"]');
      if (form) {
        const hiddenInput = form.querySelector('input[name="id"]');
        if (hiddenInput) {
          productId = hiddenInput.value;
        }
      }
    }
    
    return productId;
  }

  async function loadAddons(productId) {
    try {
      log('Loading add-ons for product:', productId);
      
      const response = await fetch(`${APP_HOST}/api/addons/${productId}`, {
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

    addons.forEach(addon => {
      const addonElement = createAddonElement(addon);
      container.appendChild(addonElement);
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
        <h3>Add-ons</h3>
        <div class="addon-total">
          Total: <span id="addon-total">£0.00</span>
        </div>
      </div>
      <div id="addon-list"></div>
    `;

    // Add basic styling
    const style = document.createElement('style');
    style.textContent = `
      .product-addons {
        margin: 20px 0;
        padding: 15px;
        border: 1px solid #e1e1e1;
        border-radius: 5px;
      }
      .addon-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;
        border-bottom: 1px solid #e1e1e1;
        padding-bottom: 10px;
      }
      .addon-header h3 {
        margin: 0;
        font-size: 1.2em;
      }
      .addon-total {
        font-weight: bold;
        font-size: 1.1em;
      }
      .addon-item {
        margin: 10px 0;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .addon-option {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .addon-price {
        font-weight: bold;
        color: #2c5aa0;
      }
      .addon-checkbox, .addon-dropdown {
        margin-right: 8px;
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