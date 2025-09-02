## docs/SETUP.md
# Detailed Setup Guide

## Prerequisites

- Node.js 14 or higher
- Shopify Partner Account
- Web hosting service (Heroku, Railway, etc.)

## Step 1: Shopify App Creation

### 1.1 Create Partner Account
1. Visit [partners.shopify.com](https://partners.shopify.com)
2. Sign up or log in
3. Navigate to "Apps" section

### 1.2 Create New App
1. Click "Create App" 
2. Choose "Custom App"
3. Fill in details:
   - **App name**: Product Add-ons Manager
   - **App URL**: Will be your deployed URL
   - **Allowed redirection URLs**: `https://yourapp.com/auth/callback`

### 1.3 Configure Permissions
In your app settings, ensure these scopes are enabled:
- `read_products`
- `write_products` 
- `read_script_tags`
- `write_script_tags`

## Step 2: Local Development

### 2.1 Clone/Download Code
Extract the provided files to a directory

### 2.2 Install Dependencies
```bash
npm install
```

### 2.3 Environment Setup
```bash
cp .env.example .env
```

Edit `.env`:
```bash
SHOPIFY_API_KEY=your_api_key_from_partner_dashboard
SHOPIFY_API_SECRET=your_api_secret_from_partner_dashboard  
HOST=https://your-app-domain.com
PORT=3000
```

### 2.4 Test Locally
```bash
npm run dev
```

For local testing, use ngrok:
```bash
ngrok http 3000
```
Use the ngrok URL in your app settings.

## Step 3: Production Deployment

### Option A: Heroku
```bash
# Install Heroku CLI
heroku create your-app-name
heroku config:set SHOPIFY_API_KEY=your_key
heroku config:set SHOPIFY_API_SECRET=your_secret
heroku config:set HOST=https://your-app-name.herokuapp.com
git push heroku main
```

### Option B: Railway
1. Connect GitHub repo to Railway
2. Add environment variables in dashboard
3. Deploy automatically

### Option C: DigitalOcean App Platform
1. Create new app from GitHub
2. Configure environment variables
3. Deploy

## Step 4: App Installation

### 4.1 Update App URLs
In your Shopify Partner dashboard:
- **App URL**: `https://your-deployed-app.com`
- **Allowed redirection URLs**: `https://your-deployed-app.com/auth/callback`

### 4.2 Install on Development Store
Visit: `https://your-deployed-app.com/auth?shop=your-dev-store.myshopify.com`

### 4.3 Verify Installation
1. Check that script tag is installed
2. Visit a product page
3. Open browser console - should see "Product Add-ons" logs

## Step 5: Testing

### 5.1 Create Test Add-on
1. Open app admin interface
2. Select a product
3. Add a checkbox add-on with £10 price
4. Visit product page - should see add-on

### 5.2 Test Functionality
1. Check/uncheck add-on
2. Verify price updates
3. Add to cart
4. Check cart properties contain add-on info

## Troubleshooting

### Script Not Loading
- Check browser console for errors
- Verify HOST environment variable
- Check script tag installation in Shopify admin

### Database Errors
- Ensure write permissions for app.db
- Check SQLite installation

### OAuth Issues
- Verify API credentials
- Check redirect URLs match exactly
- Ensure app is not in development mode if testing on live store

### Add-ons Not Showing
- Check product ID detection in console
- Verify API endpoints responding
- Check database for stored add-ons

## Going Live

### 1. App Review
Submit app for Shopify review if distributing publicly

### 2. Production Database
Consider upgrading to PostgreSQL for production:
- Update database.js
- Add DATABASE_URL environment variable

### 3. Error Monitoring
Add error tracking:
- Sentry
- Bugsnag
- Custom logging

### 4. Performance
- Add caching
- Optimize database queries
- Use CDN for static assets

## Security Considerations

- Validate all inputs
- Sanitize database queries
- Use HTTPS only
- Implement rate limiting
- Store sensitive data securely

## Need Help?

- Check Shopify Partner documentation
- Review error logs
- Test in browser console
- Verify environment variables