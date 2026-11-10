# The Meal Guides Ghana

Ghana-only, mobile-first multi-restaurant ordering for Greater Accra. Customers can discover nearby kitchens, customize menu items, confirm an exact map pin, place an order, and save a receipt. Staff manage restaurants, menus, add-ons, guests, orders, and accounts from a protected dashboard.

## Features

- Greater Accra restaurant discovery and categorized menus
- Ghana cedi pricing and `+233` contact-number validation
- GPS-assisted map-pin confirmation with Geoapify or OpenStreetMap fallback
- Customer-arranged rider or store-pickup fulfillment
- Configurable single- and multiple-choice add-ons
- Consent-based guest profiles for returning visitors
- Server-validated menu prices, add-ons, quantities, and totals
- Downloadable PNG order receipts
- Role-based administration with activity logging
- Restaurant hours, order pausing, menu sorting, and CSV reports

The application accepts only the `gh-greater-accra` market and uses Ghana-specific location, currency, contact-number, fulfillment, and administration behavior.

## Technology

- Next.js 14 and React 18
- Supabase/Postgres and Supabase Auth
- Tailwind/PostCSS plus application CSS
- Leaflet, Geoapify, and OpenStreetMap/Nominatim
- Lucide icons

## Requirements

- Node.js 20 or newer
- npm
- A Supabase project
- A Geoapify API key is recommended for address autocomplete and reverse geocoding

## Local setup

1. Install dependencies:

   ```bash
   npm ci
   ```

2. Create the database using [SUPABASE_MIGRATION_GUIDE.md](./SUPABASE_MIGRATION_GUIDE.md), then run the applicable migration files. Run [GREATER_ACCRA_MARKET_MIGRATION.sql](./GREATER_ACCRA_MARKET_MIGRATION.sql) to enforce Ghana defaults and consolidate legacy Accra/Tema market codes. Run [GUEST_RESTAURANT_VISITS_MIGRATION.sql](./GUEST_RESTAURANT_VISITS_MIGRATION.sql) to enable restaurant-specific guest visit history.

3. Copy `.env.example` to `.env.local` and replace every placeholder:

   ```env
   SUPABASE_URL="https://your-project.supabase.co"
   SUPABASE_SECRET_KEY="your-server-secret-key"
   ADMIN_PIN="your-private-emergency-pin"
   ADMIN_SESSION_SECRET="a-long-random-production-secret"
   GEOAPIFY_API_KEY="your-geoapify-key"
   ```

4. Start the development server:

   ```bash
   npm run dev
   ```

5. Open <http://localhost:3000>. The dashboard is available at `/admin`.

## Validation

Run the same checks used by GitHub Actions:

```bash
npm run check
```

## Deployment

See [DEPLOYMENT_SETUP.md](./DEPLOYMENT_SETUP.md). Configure the five environment variables from `.env.example` in encrypted hosting settings. Keep the Supabase secret key server-only, use a unique session secret and emergency PIN, and retain OpenStreetMap attribution.

## Social

[The Meal Guides on Facebook](https://www.facebook.com/themealguides)
