const { Freemius } = require('@freemius/sdk');

// Initialize the Freemius SDK
const freemius = new Freemius({
    productId: process.env.FREEMIUS_PRODUCT_ID,
    apiKey: process.env.FREEMIUS_API_KEY,
    secretKey: process.env.FREEMIUS_SECRET_KEY,
    publicKey: process.env.FREEMIUS_PUBLIC_KEY,
});

module.exports = { freemius };
