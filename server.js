// Add this to your server.js file

// Cart modification endpoint to update line item prices with addons
app.post('/api/cart/update-pricing', async (req, res) => {
  try {
    const { shop, cartToken, lineItems } = req.body;
    
    if (!shop || !cartToken || !lineItems) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    console.log('Updating cart pricing for shop:', shop);
    
    // Get shop session for API access
    const session = await db.getSession(shop);
    if (!session) {
      return res.status(401).json({ error: 'Shop not authenticated' });
    }
    
    const api = new SimpleShopifyAPI(session.shop, session.accessToken);
    
    // Process each line item with addon pricing
    const updates = {};
    
    for (const lineItem of lineItems) {
      const { variantId, addonPrice } = lineItem;
      
      if (variantId && addonPrice > 0) {
        // Get the current variant price
        const variant = await api.request(`products/variants/${variantId}.json`);
        const basePrice = parseFloat(variant.variant.price);
        const newPrice = basePrice + addonPrice;
        
        // Update the variant price temporarily for this cart
        updates[variantId] = {
          price: newPrice.toFixed(2),
          originalPrice: basePrice.toFixed(2)
        };
        
        console.log(`Updated variant ${variantId}: ${basePrice} + ${addonPrice} = ${newPrice}`);
      }
    }
    
    res.json({ success: true, updates });
    
  } catch (error) {
    console.error('Error updating cart pricing:', error);
    res.status(500).json({ error: 'Failed to update cart pricing' });
  }
});

// Webhook to handle cart creation/updates
app.post('/webhooks/cart/update', async (req, res) => {
  try {
    const cart = req.body;
    console.log('Cart webhook received:', cart.id);
    
    // Process line items for addon pricing
    for (const lineItem of cart.line_items) {
      if (lineItem.properties && lineItem.properties['_Add-ons Total']) {
        const addonTotal = parseFloat(lineItem.properties['_Add-ons Total'].replace('£', ''));
        
        if (addonTotal > 0) {
          // Update the line item price
          const newPrice = lineItem.price + (addonTotal * 100); // Shopify uses cents
          
          console.log(`Line item ${lineItem.id}: adding ${addonTotal} to price`);
          
          // This would require updating the cart via Shopify API
          // Implementation depends on your specific needs
        }
      }
    }
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Error');
  }
});