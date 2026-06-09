# Database Migrations

Run migrations **in numerical order** on a fresh database or when upgrading.

```bash
node migrations/001_add_status_column.js
node migrations/002_create_initial_admin.js
node migrations/003_add_company_logo.js
node migrations/004_verifactu_schema.js
node migrations/005_password_reset_tokens.js
```

| # | File | Description |
|---|---|---|
| 001 | add_status_column | Adds `status` column to invoices table |
| 002 | create_initial_admin | Creates the initial admin user |
| 003 | add_company_logo | Adds `logo` column to companies table |
| 004 | verifactu_schema | Adds Veri*Factu fields and tables |
| 005 | password_reset_tokens | Adds password reset tokens table and `is_root` to users |
