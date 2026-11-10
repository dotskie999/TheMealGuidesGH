# Admin account setup

Do not deploy the account login until these steps have been completed in the same Supabase project used by the app.

1. Open Supabase Dashboard > SQL Editor.
2. Run `ADMIN_ACCOUNTS_MIGRATION.sql`. It is safe to run again on an existing installation to add restaurant assignments.
3. Open the app's `/admin` page locally.
4. Choose **Emergency PIN access** and use the existing `ADMIN_PIN`.
5. Create the restaurant from **Restaurants** if it does not exist yet.
6. Open **Team accounts**, create the first **Super Admin**, and choose its restaurant assignment.
7. Sign out, then sign in with the new username and temporary password. The app requires a new private password before opening the dashboard.
8. Create Admin and Inventory staff from that restaurant account. They automatically inherit the same restaurant assignment. Emergency access can also create replacement staff for any restaurant.

If the main account migration was already installed, run `ADMIN_PASSWORD_CHANGE_MIGRATION.sql` once to add the new password-change flag.

## Restaurant isolation

- Every normal account belongs to exactly one restaurant.
- Emergency access creates restaurants and explicitly assigns every account to one using the restaurant dropdown.
- Staff created by a restaurant Super Admin automatically belong to the same restaurant.
- Normal accounts cannot view, edit, delete, or update orders for another restaurant, even by calling the API directly.
- Emergency PIN access is the only global session and can view and manage every restaurant.

## Permissions within the assigned restaurant

- **Inventory:** create and edit restaurants, categories, menu items, add-on groups, and options. No orders, guest records, deletion, or account management.
- **Admin:** Inventory permissions plus orders, guest information, reports, and order status updates. Cannot delete records or manage accounts.
- **Super Admin:** all dashboard capabilities, deletion, and staff account management.
- **Emergency PIN:** global recovery session with access to every restaurant. All actions are identified as emergency actions in the audit log.

## Production recommendations

- Create a unique username for every staff member; do not share passwords.
- Staff usernames are backed by hidden Supabase Auth identifiers and do not require a working email address.
- A Super Admin can issue a temporary password from **Team accounts** if a staff member forgets it. The staff member must replace it at their next sign-in.
- Every signed-in staff account can use **Change password** in the dashboard. Emergency PIN sessions cannot change an account password.
- Rotate `ADMIN_PIN` after emergency use.
- Keep `SUPABASE_SECRET_KEY`, `ADMIN_PIN`, and `ADMIN_SESSION_SECRET` server-only.
