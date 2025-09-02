## README.md
# Shopify Product Add-ons App

A powerful Shopify app that allows you to add price-modifying options to your products. Create checkboxes and dropdowns that automatically update product prices and pass selections to your cart.

## Features

- ✅ **Theme Independent** - Works with any Shopify theme
- ✅ **Multiple Add-on Types** - Checkboxes and dropdowns  
- ✅ **Real-time Price Updates** - Prices update automatically
- ✅ **Beautiful Admin Interface** - Easy add-on management
- ✅ **Automatic Installation** - Script tags install automatically
- ✅ **Cart Integration** - Selections saved as line item properties

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your Shopify app credentials
   ```

3. **Start Development Server**
   ```bash
   npm run dev
   ```

4. **Install on Store**
   Visit: `https://yourapp.com/auth?shop=yourstore.myshopify.com`

## Setup Guide

### 1. Create Shopify App

1. Go to your [Shopify Partner Dashboard](https://partners.shopify.com)
2. Click "Create App" → "Custom App"
3. Fill in app details and set:
   - **App URL**: `https://yourapp.com`
   - **Allowed redirection URLs**: `https://yourapp.com/auth/callback`

### 2. Get API Credentials

From your app's dashboard, copy:
- **API key** 
- **API secret key**

### 3. Deploy Your App

Deploy to your preferred platform:
- **Heroku**: `git push heroku main`
- **Railway**: Connect your GitHub repo
- **DigitalOcean**: Use App Platform
- **Self-hosted**: Run `npm start`

### 4. Update Environment Variables

Update your `.env` file:
```bash
SHOPIFY_API_KEY=your_api_key_here
SHOPIFY_API_SECRET=your_api_secret_here
HOST=https://your-deployed-app-url.com
PORT=3000
```

### 5. Install on Store

Visit: `https://your-deployed-app-url.com/auth?shop=yourstore.myshopify.com`

## How It Works

1. **Admin Configuration**: Use the admin interface to add price-modifying options to products
2. **Automatic Detection**: The app script automatically detects product pages 
3. **Dynamic Rendering**: Add-ons render beautifully below product forms
4. **Price Updates**: Prices update in real-time as customers select options
5. **Cart Integration**: Selections are passed as line item properties

## Usage

### Adding Checkbox Add-ons
1. Select a product in the admin
2. Choose "Checkbox" type
3. Set name and price modifier
4. Save - appears instantly on your product page

### Adding Dropdown Add-ons  
1. Select a product in the admin
2. Choose "Dropdown" type
3. Add multiple options with different prices
4. Save - customers see dropdown with price updates

## File Structure

```
shopify-product-addons-app/
├── package.json          # Dependencies and scripts
├── server.js             # Main app server
├── database.js           # Database operations
├── .env.example          # Environment template
├── public/
│   ├── index.html        # Admin interface
│   └── product-addons.js # Frontend script
└── docs/
    └── SETUP.md          # Detailed setup guide
```

## API Endpoints

- `GET /api/products` - Fetch store products
- `GET /api/addons/:productId` - Get product add-ons
- `POST /api/addons` - Create new add-on
- `PUT /api/addons/:id` - Update add-on
- `DELETE /api/addons/:id` - Delete add-on

## Requirements

- Node.js 14+
- Shopify Partner Account
- Basic web hosting

## Support

- Check logs for debugging
- Verify environment variables
- Ensure proper Shopify app permissions
- Test with different themes

## License

MIT License - feel free to modify and use for your projects!

---
