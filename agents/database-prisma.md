# api/stamp Database and Prisma Rules

`api/stamp` uses a shared schema and does not own migrations.

## Rules

- Do not run migrations here.
- Shared schema changes start in `api/database`.
- Regenerate the shared Prisma client in `api/database` after shared schema changes.
- Use `select` for response queries.
- Keep institution and personal certificate relations aligned with `api/institution` and `api/signature`.
