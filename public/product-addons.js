(function() {
  'use strict';
  
  console.log('[Product Add-ons] Script loading...');
  
  // Configuration
  const APP_HOST = window.location.protocol + '//' + 'shopify-product-addons-app-production.up.railway.app';
  const DEBUG = true;
  
  function log(...args) {
    if (DEBUG) console.log('[Product Add-ons]', ...args);
  }

  // Main initialization
  function init() {
    log('Initializing...');
    
    // Check if we're on a product page
    if (!isProductPage()) {
      log('Not a product page, skipping');
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
           document.querySelector('form[action*="/cart/add"]') ||
           document.querySelector('.product-form') ||
           document.body.classList.contains('template-product');
  }

  function getProductId() {
    let productId = null;
    
    // Method 1: Look for product-info element (most reliable for many themes)
    const productInfo = document.getElementsByTagName('product-info');
    if (productInfo.length > 0 && productInfo[0].dataset.productId) {
      productId = productInfo[0].dataset.productId;
      log('Found product ID from product-info tag:', productId);
      return productId;
    }
    
    // Method 2: Look for product JSON in script tags (also very reliable)
    const scripts = document.querySelectorAll('script[type="application/json"]');
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        if (data.product && data.product.id) {
          productId = data.product.id;
          log('Found product ID in JSON script:', productId);
          return productId;
        }
      } catch (e) {
        // Continue searching
      }
    }
    
    // Method 3: Look for global product object
    if (!productId && typeof window.product !== 'undefined') {
      productId = window.product.id;
      log('Found product ID in window.product:', productId);
      return productId;
    }
    
    // Method 4: Look for Shopify analytics
    if (!productId && typeof window.ShopifyAnalytics !== 'undefined') {
      try {
        productId = window.ShopifyAnalytics.meta.product.id;
        log('Found product ID in ShopifyAnalytics:', productId);
        return productId;
      } catch (e) {
        log('ShopifyAnalytics not available');
      }
    }
    
    // Method 5: Look for other product data attributes (broader search)
    if (!productId) {
      const selectors = [
        'product-info[data-product-id]',
        '[data-product-id]',
        '[data-product]',
        '.product[data-id]',
        '.product-single[data-product-id]',
        '.product-details[data-product-id]'
      ];
      
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
          const id = element.getAttribute('data-product-id') || 
                   element.getAttribute('data-product') || 
                   element.getAttribute('data-id');
          if (id) {
            productId = id;
            log('Found product ID in data attribute:', productId, 'from selector:', selector);
            return productId;
          }
        }
      }
    }
    
    // Method 6: Look in form inputs - but be careful, this might be variant ID
    if (!productId) {
      const formInput = document.querySelector('form[action*="/cart/add"] input[name="id"]');
      if (formInput && formInput.value) {
        // This is likely a variant ID, let's see if we can find the product ID elsewhere
        const possibleVariantId = formInput.value;
        log('Found possible variant ID in form:', possibleVariantId);
        
        // Try to find the actual product ID by looking for select options
        const variantSelect = document.querySelector('select[name="id"]');
        if (variantSelect) {
          // Look for data attributes that might have the product ID
          productId = variantSelect.getAttribute('data-product-id');
          if (productId) {
            log('Found product ID from variant select:', productId);
            return productId;
          }
        }
        
        // If we still don't have a product ID, we'll have to use the variant ID as fallback
        if (!productId) {
          productId = possibleVariantId;
          log('Using variant ID as fallback:', productId);
          return productId;
        }
      }
    }
    
    // Method 7: Try to extract from URL and look up
    if (!productId) {
      const urlMatch = window.location.pathname.match(/\/products\/([^\/\?]+)/);
      if (urlMatch) {
        const handle = urlMatch[1];
        log('Found product handle from URL:', handle);
        // We'll need to convert this handle to product ID server-side
        productId = handle;
        return productId;
      }
    }
    
    log('Final product ID determination:', productId);
    return productId;
  }

  async function loadAddons(productId) {
    try {
      log('Loading add-ons for product:', productId);
      
      // Get shop domain - handle custom domains properly
      let shop = window.location.hostname;
      
      log('Original hostname:', shop);
      
      // For custom domains, we need to find the actual myshopify.com domain
      // This is tricky - let's try multiple approaches
      
      // Method 1: Check if there's a Shopify global with the shop domain
      if (typeof window.Shopify !== 'undefined' && window.Shopify.shop) {
        shop = window.Shopify.shop;
        log('Found shop from window.Shopify:', shop);
      }
      // Method 2: Check ShopifyAnalytics
      else if (typeof window.ShopifyAnalytics !== 'undefined' && window.ShopifyAnalytics.meta.page.customerId) {
        // Try to extract shop from analytics
        if (window.ShopifyAnalytics.meta.page.customerId) {
          // This is a fallback - we'll need the actual shop domain
          log('Found analytics but need to determine shop domain');
        }
      }
      // Method 3: Check for shop parameter in current URL
      else {
        const urlParams = new URLSearchParams(window.location.search);
        const shopParam = urlParams.get('shop');
        if (shopParam) {
          shop = shopParam;
          log('Found shop from URL parameter:', shop);
        }
        // Method 4: Try to get from script src
        else {
          const scriptSrc = document.currentScript?.src || document.querySelector('script[src*="product-addons.js"]')?.src;
          if (scriptSrc) {
            const scriptUrl = new URL(scriptSrc);
            const scriptShop = scriptUrl.searchParams.get('shop');
            if (scriptShop) {
              shop = scriptShop;
              log('Found shop from script src:', shop);
            }
          }
        }
      }
      
      // Ensure it's a proper myshopify.com domain
      if (!shop.includes('.myshopify.com')) {
        // For custom domains, we need to convert to the actual shop domain
        // This is the tricky part - we might need to call an API to resolve this
        log('Custom domain detected, trying to resolve to myshopify.com domain');
        
        // Try to get it from the script tag that loaded this script
        const currentScript = document.querySelector('script[src*="product-addons.js"]');
        if (currentScript && currentScript.src) {
          const scriptUrl = new URL(currentScript.src);
          const shopFromScript = scriptUrl.searchParams.get('shop');
          if (shopFromScript && shopFromScript.includes('.myshopify.com')) {
            shop = shopFromScript;
            log('Resolved shop from script URL:', shop);
          }
        }
        
        // If still no luck, we'll need to make an API call to resolve the domain
        if (!shop.includes('.myshopify.com')) {
          log('Attempting to resolve custom domain via API');
          try {
            const resolveResponse = await fetch(`${APP_HOST}/api/resolve-shop?domain=${window.location.hostname}`, {
              headers: {
                'Content-Type': 'application/json',
                'X-Shop-Domain': window.location.hostname
              }
            });
            
            if (resolveResponse.ok) {
              const resolveData = await resolveResponse.json();
              if (resolveData.shop) {
                shop = resolveData.shop;
                log('Resolved shop via API:', shop);
              }
            }
          } catch (error) {
            log('Could not resolve shop via API:', error);
          }
        }
        
        // Final fallback - try common patterns
        if (!shop.includes('.myshopify.com')) {
          log('Using fallback shop resolution');
          if (shop.includes('paceworx')) {
            shop = 'megrq8-sg.myshopify.com'; // Hardcoded for your specific case
            log('Applied hardcoded shop mapping:', shop);
          } else {
            shop = shop.replace(/\.(store|com|net|org)$/, '.myshopify.com');
            log('Applied generic shop conversion:', shop);
          }
        }
      }
      
      const url = `${APP_HOST}/api/addons/${productId}?shop=${shop}`;
      
      log('Final API URL:', url);
      log('Using shop domain:', shop);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Shop-Domain': window.location.hostname,
          'X-Original-Shop': shop
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const addons = await response.json();
      log('Loaded add-ons:', addons);
      
      if (addons && addons.length > 0) {
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

    // Add styling
    const style = document.createElement('style');
    style.textContent = `
      .product-addons {
        margin: 20px 0;
        padding: 20px;
        border: 2px solid #007ace;
        border-radius: 8px;
        background: #f8fdff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .addon-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
        padding-bottom: 12px;
        border-bottom: 1px solid #007ace;
      }
      .addon-header h3 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        color: #007ace;
      }
      .addon-total {
        font-weight: bold;
        font-size: 16px;
        color: #007ace;
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
        border-color: #007ace;
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
        color: #007ace;
        font-size: 14px;
      }
      .addon-checkbox, .addon-dropdown {
        margin: 0;
        transform: scale(1.1);
      }
      .addon-dropdown {
        min-width: 180px;
        padding: 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
        background: white;
        font-size: 14px;
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
    // Try different insertion points
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
        log('Inserted container at:', selector);
        break;
      }
    }

    if (!inserted) {
      document.body.appendChild(container);
      log('Inserted container as fallback');
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
    
    // Store addon selection
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
    
    // Update the main product price display
    updateMainPrice(total);
    
    // Try to update cart drawer if visible
    updateCartDrawer(total);
  }

  function updateMainPrice(addonTotal) {
    // Look for price elements and try to update them
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
          // Store original price on first run
          const priceText = element.textContent.replace(/[£$€,\s]/g, '');
          const price = parseFloat(priceText);
          if (!isNaN(price) && price > 0) {
            element.setAttribute('data-original-price', price.toString());
          }
        }
        
        const originalPrice = parseFloat(element.getAttribute('data-original-price'));
        if (!isNaN(originalPrice) && originalPrice > 0) {
          const newTotal = originalPrice + addonTotal;
          // Preserve the original format
          const originalText = element.textContent;
          const currencySymbol = originalText.match(/[£$€]/)?.[0] || '£';
          element.textContent = `${currencySymbol}${newTotal.toFixed(2)}`;
          log('Updated price display:', originalPrice, '+', addonTotal, '=', newTotal);
        }
      });
    });
  }

  function updateCartDrawer(addonTotal) {
    // If cart drawer is open, try to update it
    const cartDrawer = document.querySelector('.cart-drawer, .drawer--cart, #cart-drawer');
    if (cartDrawer && cartDrawer.style.display !== 'none') {
      log('Cart drawer detected, attempting to refresh...');
      
      // Try to trigger cart refresh if there's a refresh function
      if (typeof window.refreshCart === 'function') {
        window.refreshCart();
      } else if (typeof window.updateCart === 'function') {
        window.updateCart();
      }
    }
  }

  function updateCartProperties() {
    // Add hidden inputs to cart form
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

  // Initialize when ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Also try after a delay for dynamic content
  setTimeout(init, 1000);
  
  log('Script loaded successfully');

})();