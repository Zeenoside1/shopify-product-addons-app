// API communication and shop resolution
export class ApiClient {
  constructor(logger) {
    this.logger = logger;
    this.APP_HOST = window.location.protocol + '//' + 'shopify-product-addons-app-production.up.railway.app';
  }

  async resolveShopDomain() {
    let shop = window.location.hostname;
    this.logger.log('Original hostname:', shop);
    
    // Method 1: Check Shopify global
    if (typeof window.Shopify !== 'undefined' && window.Shopify.shop) {
      shop = window.Shopify.shop;
      this.logger.log('Found shop from window.Shopify:', shop);
      return shop;
    }
    
    // Method 2: Check URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const shopParam = urlParams.get('shop');
    if (shopParam) {
      shop = shopParam;
      this.logger.log('Found shop from URL parameter:', shop);
      return shop;
    }
    
    // Method 3: Check script src
    const scriptSrc = document.currentScript?.src || document.querySelector('script[src*="product-addons.js"]')?.src;
    if (scriptSrc) {
      const scriptUrl = new URL(scriptSrc);
      const scriptShop = scriptUrl.searchParams.get('shop');
      if (scriptShop) {
        shop = scriptShop;
        this.logger.log('Found shop from script src:', shop);
        return shop;
      }
    }
    
    // Method 4: Handle custom domains
    if (!shop.includes('.myshopify.com')) {
      this.logger.log('Custom domain detected, trying to resolve...');
      
      // Try API resolution
      try {
        const response = await fetch(`${this.APP_HOST}/api/resolve-shop?domain=${window.location.hostname}`, {
          headers: {
            'Content-Type': 'application/json',
            'X-Shop-Domain': window.location.hostname
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.shop) {
            shop = data.shop;
            this.logger.log('Resolved shop via API:', shop);
            return shop;
          }
        }
      } catch (error) {
        this.logger.log('Could not resolve shop via API:', error);
      }
      
      // Hardcoded fallbacks
      if (shop.includes('paceworx')) {
        shop = 'megrq8-sg.myshopify.com';
        this.logger.log('Applied hardcoded shop mapping:', shop);
      } else {
        shop = shop.replace(/\.(store|com|net|org)$/, '.myshopify.com');
        this.logger.log('Applied generic shop conversion:', shop);
      }
    }
    
    return shop;
  }

  async loadAddons(productId) {
    try {
      const shop = await this.resolveShopDomain();
      const url = `${this.APP_HOST}/api/addons/${productId}?shop=${shop}`;
      
      this.logger.log('API URL:', url);
      
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
      this.logger.log('Loaded add-ons:', addons);
      
      return addons || [];
    } catch (error) {
      this.logger.error('Error loading add-ons:', error);
      return [];
    }
  }
}