const fs = require('fs');
const path = require('path');
require('dotenv').config();
const Stripe = require('stripe');

async function createProduct() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey || secretKey === 'STRIPE_SECRET_KEY_PLACEHOLDER') {
    console.error('ERROR: Please set STRIPE_SECRET_KEY in your .env file before running this script.');
    process.exit(1);
  }

  // Initialize Stripe leaving API version argument empty as per blueprint guidance
  const stripe = Stripe(secretKey);

  console.log('Creating Stripe product "Hamlet (e-book)" with managed payments/tax configuration...');

  try {
    const product = await stripe.products.create({
      name: 'LIDORBIT Lifetime License',
      description: 'Lifetime activation license for LIDORBIT sleep bypass software',
      tax_code: 'txcd_10103100',
      default_price_data: {
        unit_amount: 599,
        currency: 'usd',
      },
    }, {
      apiVersion: '2026-02-25.preview'
    });

    const productId = product.id;
    const priceId = product.default_price;

    console.log('\nProduct created successfully!');
    console.log(`Product ID: ${productId}`);
    console.log(`Price ID:   ${priceId}`);

    // Update .env file dynamically if it exists
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, 'utf8');
      
      // Update STRIPE_PRICE_ID
      if (envContent.includes('STRIPE_PRICE_ID=')) {
        envContent = envContent.replace(
          /STRIPE_PRICE_ID=[^\r\n]*/g,
          `STRIPE_PRICE_ID=${priceId}`
        );
        fs.writeFileSync(envPath, envContent, 'utf8');
        console.log(`Updated .env file with STRIPE_PRICE_ID=${priceId}`);
      }
    }

  } catch (error) {
    console.error('Error creating Stripe product:', error.message || error);
    process.exit(1);
  }
}

createProduct();
