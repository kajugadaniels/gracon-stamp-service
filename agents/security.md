# api/stamp Security Rules

`api/stamp` uses institutional and personal trust material together.

## Key Rules

- Never expose decrypted institutional or personal private keys.
- Never log private keys, derivation secrets, certificate private material, or raw signing payload secrets.
- `INSTITUTION_ENCRYPTION_SECRET` and `SIGNATURE_ENCRYPTION_SECRET` must stay server-only.
- Do not add new private-key encryption secrets to this service.
- Long term, replace local use of `INSTITUTION_ENCRYPTION_SECRET` and
  `SIGNATURE_ENCRYPTION_SECRET` with internal signing APIs or KMS-backed
  signing owned by `api/institution` and `api/signature`.

## Authority Rules

- Stamp authority must be checked at stamp time.
- Revoked authority must block stamping.
- Membership alone is not enough unless the service explicitly defines that rule.

## Proof Rules

- Capture certificate fingerprints and verification metadata at stamp time.
- Do not create stamps that cannot be verified later.

## Environment Rules

- Use only runtime `DATABASE_URL` credentials here; `DATABASE_MIGRATION_URL` belongs only in `api/database`.
