// Product ID detection utility
export class ProductDetector {
  constructor(logger) {
    this.logger = logger;
  }

  getProductId() {
    let productId = null;
    
    // Method 1: product-info element
    const productInfo = document.getElementsByTagName('product-info');
    if (productInfo.length > 0 && productInfo[0].dataset.productId) {
      productId = productInfo[0].dataset.productId;
      this.logger.log('Found product ID from product-info tag:', productId);
      return productId;
    }
    
    // Method 2: JSON scripts
    const scripts = document.querySelectorAll('script[type="application/json"]');
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        if (data.product && data.product.id) {
          productId = data.product.id;
          this.logger.log('Found product ID in JSON script:', productId);
          return productId;
        }
      } catch (e) {
        // Continue searching
      }
    }
    
    // Method 3: Global product object
    if (typeof window.product !== 'undefined' && window.product.id) {
      productId = window.product.id;
      this.logger.log('Found product ID in window.product:', productId);
      return productId;
    }
    
    // Method 4: Shopify analytics
    if (typeof window.ShopifyAnalytics !== 'undefined') {
      try {
        productId = window.ShopifyAnalytics.meta.product.id;
        this.logger.log('Found product ID in ShopifyAnalytics:', productId);
        return productId;
      } catch (e) {
        this.logger.log('ShopifyAnalytics not available');
      }
    }
    
    // Method 5: Data attributes
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
          this.logger.log('Found product ID in data attribute:', productId, 'from selector:', selector);
          return productId;
        }
      }
    }
    
    // Method 6: Form inputs (variant ID fallback)
    const formInput = document.querySelector('form[action*="/cart/add"] input[name="id"]');
    if (formInput && formInput.value) {
      const possibleVariantId = formInput.value;
      this.logger.log('Found possible variant ID in form:', possibleVariantId);
      
      // Try to find actual product ID
      const variantSelect = document.querySelector('select[name="id"]');
      if (variantSelect) {
        productId = variantSelect.getAttribute('data-product-id');
        if (productId) {
          this.logger.log('Found product ID from variant select:', productId);
          return productId;
        }
      }
      
      // Use variant ID as fallback
      productId = possibleVariantId;
      this.logger.log('Using variant ID as fallback:', productId);
      return productId;
    }
    
    // Method 7: URL extraction
    const urlMatch = window.location.pathname.match(/\/products\/([^\/\?]+)/);
    if (urlMatch) {
      const handle = urlMatch[1];
      this.logger.log('Found product handle from URL:', handle);
      productId = handle;
      return productId;
    }
    
    this.logger.log('Final product ID determination:', productId);
    return productId;
  }
}