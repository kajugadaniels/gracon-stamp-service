# API Stamp

Institutional stamping backend for the Gracon platform.

This service applies institutional stamps to documents using both institutional trust material and user signature authority. It is responsible for dual-signature stamping and for preserving the certificate fingerprints required to verify stamped documents later.

## Overview

- Runtime: NestJS + TypeScript
- Default port: `3003`
- Database: shared Neon/Postgres via Prisma
- Primary domain: institutional stamping and dual-signature proof generation

## What This Service Owns

- Stamp application workflow
- Institutional authority validation at stamp time
- Institution-key and personal-key decryption for server-side stamping
- Certificate/fingerprint capture for later verification

## Core Skills Needed

- PKI and signature verification concepts
- Cross-service trust modeling
- Safe use of encrypted institutional and personal keys
- NestJS service-layer authorization

## Techniques Used

- Shared JWT validation for user identity
- Coordinated private-key decryption with `api/institution` and `api/signature`
- Dual-signature stamping model
- Certificate fingerprint capture at stamp time

## Main Modules

```text
src/
  common/
    decorators/
    prisma/
    s3/
  modules/
    auth/
    stamping/
```

## Folder Structure

```text
api/stamp/
  prisma/
  src/
    common/
    modules/
  test/
  package.json
  nest-cli.json
```

## Local Commands

```bash
npm install
npm run start:dev
npm run build
npm run test
npm run lint
npx prisma generate
```

## Environment Notes

Key variables:

```env
APP_PORT=3003
DATABASE_URL=
JWT_SECRET=
INSTITUTION_ENCRYPTION_SECRET=
SIGNATURE_ENCRYPTION_SECRET=
AWS_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_BUCKET_NAME=
```

## Integration Boundaries

- Must stay aligned with `api/institution` key-derivation rules
- Must stay aligned with `api/signature` personal-key handling
- Should not be called directly by unrelated frontends

## Important Rules

- Never expose decrypted key material in logs or responses
- Stamp authority must be checked against current revocation state
- If derivation or certificate strategy changes, update all dependent services together

## Contribution Checklist

- Confirm cross-service crypto compatibility before merging
- Capture verification metadata at stamp time, not after the fact
- Treat stamping as a security-sensitive action, not just a UI feature

## Testing Rule

- If code is pure logic or can be mocked cleanly, add a unit test.
- If code depends on Nest bootstrapping, DB wiring, or HTTP flow, prefer e2e or integration tests.
