# Ghana deployment setup

This repository deploys one Ghana storefront and administration dashboard for Greater Accra. Country-selection environment variables are not used; the application is fixed to country code `GH`, currency `GHS`, timezone `Africa/Accra`, and market code `gh-greater-accra`.

## 1. Prepare Supabase

1. Follow [SUPABASE_MIGRATION_GUIDE.md](./SUPABASE_MIGRATION_GUIDE.md) for the base schema.
2. Run [GREATER_ACCRA_MARKET_MIGRATION.sql](./GREATER_ACCRA_MARKET_MIGRATION.sql).
3. Run the remaining feature migrations that apply to an older database.
4. Run [ADMIN_ACCOUNTS_MIGRATION.sql](./ADMIN_ACCOUNTS_MIGRATION.sql) and [ADMIN_PASSWORD_CHANGE_MIGRATION.sql](./ADMIN_PASSWORD_CHANGE_MIGRATION.sql).
5. Run [GUEST_RESTAURANT_VISITS_MIGRATION.sql](./GUEST_RESTAURANT_VISITS_MIGRATION.sql) to count restaurant page visits and expose only the relevant guests to each restaurant account. This idempotent migration also installs the restaurant sort field required by the current admin editor.

The Greater Accra migration makes all new restaurant, guest, and order records Ghana-scoped. Legacy rows from another system are not exposed by this application; archive them separately if they remain in the database.

## 2. Create the first administrator

Create a user in Supabase Authentication, then insert the matching profile:

```sql
insert into public.admin_profiles (
  user_id, email, username, display_name, role, country_scope, active
)
values (
  '<auth-user-uuid>',
  '<username>@admin.themealguides.local',
  '<username>',
  '<display name>',
  'super_admin',
  'GH',
  true
);
```

## 3. Configure hosting

Set these encrypted environment variables in Vercel or another Node.js-compatible host:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-server-secret-key
ADMIN_PIN=your-private-emergency-pin
ADMIN_SESSION_SECRET=a-unique-long-random-secret
GEOAPIFY_API_KEY=your-geoapify-key
```

Do not expose the Supabase secret or Geoapify key through a `NEXT_PUBLIC_` variable.

## 4. Verify the deployment

- The storefront displays only Greater Accra restaurants.
- Prices are formatted in Ghana cedis.
- Guest and checkout contact numbers require `+233` followed by nine digits.
- Delivery requires a confirmed Greater Accra map pin.
- Customers can arrange and pay their own rider or choose store pickup.
- `/admin` accepts only active Ghana-scoped staff accounts.
- Normal admin accounts see only their assigned restaurant; emergency PIN access sees all restaurants.
- New orders appear in the dashboard and trigger enabled alerts.
