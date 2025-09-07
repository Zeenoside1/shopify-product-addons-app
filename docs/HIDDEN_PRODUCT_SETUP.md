# Hidden Product Setup Guide

This guide explains how to set up the hidden product approach for handling addon pricing in your Shopify store.

## Overview

Instead of trying to parse cart text or modify prices directly, we use a £0.01 "hidden" product that gets added to the cart multiple times to achieve the correct total. For example:
- Customer selects £1.95 in addons
- System adds 195 units of the £0.01 product
- Cart total increases by £1.95

## Step 1: Create Hidden Product in Shopify

1. **Go to Shopify Admin**
   - Navigate to Products → Add product

2. **Basic Product Details**
   - **Title**: "Product Add-on Price Adjustment"
   - **Description**: "This product is used internally for pricing calculations. Do not modify."
   - **Product type**: "System"
   - **Vendor**: Your store name

3. **Pricing**
   - **Price**: £0.01
   - **Compare at price**: Leave blank
   - **Cost per item**: £0.00
   - **Profit**: £0.01

4. **Inventory**
   - **SKU**: "ADDON-PRICE-01"
   - **Barcode**: Leave blank
   - **Track quantity**: ❌ **UNCHECK THIS** (Important!)
   - **Continue selling when out of stock**: ✅ Check this
   - **This is a physical product**: ❌ Uncheck

5. **Shipping**
   - **This is a physical product**: ❌ Uncheck
   - **Weight**: 0

6. **SEO & Visibility**
   - **Search engine listing preview**: Edit
   - **Page title**: "Internal System Product"
   - **Meta description**: "Internal product for price calculations"
   - **URL handle**: "addon-price-adjustment"

7. **Product availability**
   - **Available on all sales channels**: ❌ **UNCHECK ALL CHANNELS**
   - **Available to all locations**: ✅ Check this
   - **Point of Sale**: ❌ Uncheck

8. **Product organization**
   - **Product type**: "System"
   - **Collections**: Do not add to any collections
   - **Tags**: "system, internal, hidden"

## Step 2: Get Product IDs

1. **Save the product** and note the URL
2. **Get Product ID**: 
   - Look at the URL: `/admin/products/[PRODUCT_ID]`
   - Copy this number (e.g., `8234567890123`)

3. **Get Variant ID**:
   - Click on the product
   - Go to the variant (should be only one)
   - Look at URL: `/admin/products/[PRODUCT_ID]/variants/[VARIANT_ID]`
   - Copy the variant number (e.g., `45678901234567`)

## Step 3: Update Configuration

Edit `public/modules/addon-config.js`:

```javascript
HIDDEN_PRODUCT: {
  PRODUCT_ID: '8234567890123',     // Your actual product ID
  VARIANT_ID: '45678901234567',    // Your actual variant ID
  PRICE: 0.01,
  SKU: 'ADDON-PRICE-01',
  TITLE: 'Product Add-on Price Adjustment'
}
```

## Step 4: Test the Setup

1. **Add a test addon** to a product (e.g., £5.00 addon)
2. **Visit the product page** - addon should appear
3. **Select the addon** - price should show +£5.00
4. **Add to cart** - check cart has both products:
   - Original product
   - "Product Add-on Price Adjustment" with quantity 500 (£5.00 ÷ £0.01)

## Step 5: Hide from Customer View (Optional)

Add this CSS to your theme to hide the hidden product from customers:

```css
/* Hide addon price adjustment product */
.cart-item[data-product-id="8234567890123"],
.line-item[data-product-id="8234567890123"],
.cart__item[data-variant-id="45678901234567"],
.product[data-variant-id="45678901234567"] {
  display: none !important;
}

/* Alternative: Hide by SKU if theme supports it */
.cart-item[data-sku="ADDON-PRICE-01"],
.line-item[data-sku="ADDON-PRICE-01"] {
  display: none !important;
}

/* Hide from order summary */
.order-summary .product[data-variant-id="45678901234567"] {
  display: none !important;
}
```

**Where to add this CSS:**
- Go to **Online Store → Themes → Actions → Edit code**
- Find `assets/theme.css` or `assets/application.css`
- Add the CSS at the bottom
- Save

## Step 6: Webhook Setup (Advanced)

For production use, consider setting up webhooks to clean up the hidden products:

```javascript
// Webhook endpoint in your app
app.post('/webhooks/orders/paid', (req, res) => {
  const order = req.body;
  
  // Log for analytics but don't modify the order
  const hiddenItems = order.line_items.filter(item => 
    item.sku === 'ADDON-PRICE-01'
  );
  
  if (hiddenItems.length > 0) {
    console.log('Order contained addon adjustments:', {
      orderId: order.id,
      addonValue: hiddenItems.reduce((sum, item) => 
        sum + (item.price * item.quantity), 0
      )
    });
  }
  
  res.status(200).send('OK');
});
```

## Testing Checklist

- [ ] Hidden product created with £0.01 price
- [ ] Product IDs updated in config
- [ ] Track quantity is disabled
- [ ] Product hidden from all sales channels
- [ ] Test addon selection on product page
- [ ] Test cart shows correct total
- [ ] Test checkout flow works
- [ ] CSS hiding rules applied (if desired)

## Troubleshooting

### Issue: Hidden product visible in cart
**Solution**: Add CSS hiding rules or check sales channel settings

### Issue: Quantity errors
**Solution**: Ensure "Track quantity" is disabled in product settings

### Issue: Wrong total calculation
**Solution**: Verify PRODUCT_ID and VARIANT_ID in config file

### Issue: Hidden product not adding
**Solution**: Check browser console for errors, verify API permissions

## Benefits of This Approach

✅ **Accurate pricing**: Checkout totals match frontend display  
✅ **Theme independent**: Works with any Shopify theme  
✅ **Shopify native**: Uses standard cart functionality  
✅ **Audit trail**: Clear record of addon pricing in orders  
✅ **Tax handling**: Shopify handles tax calculations correctly  
✅ **Payment processing**: No issues with payment gateways  

## Alternative Approaches Considered

1. **Price modification**: Complex, theme-dependent, doesn't work at checkout
2. **Cart properties**: Display only, doesn't affect actual pricing
3. **Variant creation**: Too complex, requires product duplication
4. **Script tags**: Limited scope, security restrictions

The hidden product approach is the most reliable and maintainable solution.