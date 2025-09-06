// Page type detection utility
export class PageDetector {
  
  isProductPage() {
    return window.location.pathname.includes('/products/') || 
           document.querySelector('[data-product-id]') ||
           document.querySelector('form[action*="/cart/add"]') ||
           document.querySelector('.product-form') ||
           document.body.classList.contains('template-product');
  }

  isCartPage() {
    return window.location.pathname.includes('/cart') ||
           document.body.classList.contains('template-cart') ||
           document.querySelector('.cart-page') ||
           document.querySelector('#cart-page') ||
           document.querySelector('[data-cart-items]');
  }

  isCheckoutPage() {
    return window.location.pathname.includes('/checkout') ||
           window.location.hostname.includes('checkout') ||
           document.body.classList.contains('template-checkout') ||
           document.querySelector('.checkout') ||
           document.querySelector('#checkout');
  }
}