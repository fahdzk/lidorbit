# LIDORBIT Licensing & Verification Server

A lightweight, zero-database, serverless Node.js backend designed to verify Stripe Checkout Sessions and activate the LIDORBIT desktop application.

It secures your Stripe API keys on the server and tracks device activations using Stripe's native checkout session metadata (allowing a configurable number of devices per purchase).

## Setup Instructions

### 1. Stripe Dashboard Setup
1. Create a product named **LIDORBIT License** priced at **$2.00** (one-time payment).
2. Create a **Payment Link** for the product.
3. Under the **Confirmation Page** section of your Payment Link settings:
   - Select **Redirect customers to your website**.
   - Input the success URL of your hosted server, including the session ID template:
     ```text
     https://your-licensing-server.vercel.app/success?session_id={CHECKOUT_SESSION_ID}
     ```
   - *Note: Replace `your-licensing-server.vercel.app` with the actual domain of your deployed server.*

### 2. Deployment
This backend is structured to be deployed anywhere with a single click.

#### Deploying to Vercel (Recommended, Free)
1. Install Vercel CLI: `npm i -g vercel`
2. Run `vercel` in this folder.
3. Configure the following environment variables when prompted or via the Vercel Dashboard:
   - `STRIPE_SECRET_KEY`: Your live Stripe secret API key (starts with `sk_live_...`). For local testing, use a test key (starts with `sk_test_...`).
   - `MAX_DEVICES`: (Optional, defaults to `3`) The maximum number of devices a user can activate per license key.
4. Set the API domain in the Electron client config.

#### Deploying to Render
1. Create a new **Web Service** on Render.
2. Link this repository folder.
3. Choose the standard Node build options:
   - Build Command: `npm install`
   - Start Command: `npm start`
4. Set the Environment Variables (`STRIPE_SECRET_KEY`, `MAX_DEVICES`).

## API Endpoints

### `GET /success`
Renders a beautiful client-facing success page. It extracts the `session_id` query parameter from the URL, displays it to the user, and provides a click-to-copy interface for activation.

### `POST /api/verify`
Receives the license verification request from the LIDORBIT desktop client.
- **Request Body:**
  ```json
  {
    "licenseKey": "cs_live_...",
    "machineId": "..."
  }
  ```
- **Returns:**
  - `200 OK` (success: true) on successful activation or if already activated on this device.
  - `400 Bad Request` or `500 Server Error` on failure (e.g. limit exceeded, unpaid session, stripe errors).
