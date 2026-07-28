<div align="center">

# Gracon Stamp Service

### Authority-gated institutional stamping with dual cryptographic signatures and public verification

[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Prisma-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![OpenAPI](https://img.shields.io/badge/API-OpenAPI_3-85EA2D?logo=swagger&logoColor=black)](#api-documentation)
[![License](https://img.shields.io/badge/license-UNLICENSED-lightgrey)](#license)

**Gracon Stamp Service** is the institutional trust backend for the Gracon identity and digital-document platform. It validates a user’s current institutional authority, signs an exact document hash with both the institution’s private key and the individual user’s private key, preserves the authority and certificate references used for the action, and exposes public dual-signature verification.

[Overview](#overview) ·
[Architecture](#architecture) ·
[Authority](#authority-chain) ·
[Stamping](#stamping-workflow) ·
[Verification](#public-verification) ·
[API](#api-reference) ·
[Setup](#local-development) ·
[Security](#security-model)

</div>

---

> [!IMPORTANT]
> The service signs a **caller-supplied SHA-256 hash**. It does not fetch, canonicalize, store, or independently hash the source document. The caller must ensure the supplied hash represents the exact document bytes being stamped.

> [!CAUTION]
> The current verification endpoint uses the user’s and institution’s latest unrevoked certificates, rather than the certificate IDs preserved on the original stamp record. Historical stamps can therefore become unverifiable after certificate rotation or revocation.

> [!CAUTION]
> Private keys are decrypted into application memory and used by Node.js. The current software-key design is appropriate only for controlled environments. A production-grade institutional trust service should move key operations into an HSM, KMS, or remote signing boundary.

---

## Table of contents

- [Overview](#overview)
- [Service responsibilities](#service-responsibilities)
- [Key capabilities](#key-capabilities)
- [Architecture](#architecture)
- [Trust boundaries](#trust-boundaries)
- [Technology stack](#technology-stack)
- [Project structure](#project-structure)
- [Authentication boundary](#authentication-boundary)
- [Authority chain](#authority-chain)
- [Cryptographic profile](#cryptographic-profile)
- [Stamping workflow](#stamping-workflow)
- [Stamp record](#stamp-record)
- [Public verification](#public-verification)
- [History and ownership](#history-and-ownership)
- [Data model](#data-model)
- [API reference](#api-reference)
- [Request examples](#request-examples)
- [Configuration](#configuration)
- [Database ownership](#database-ownership)
- [Local development](#local-development)
- [API documentation](#api-documentation)
- [Testing and quality](#testing-and-quality)
- [Deployment](#deployment)
- [Operations](#operations)
- [Security model](#security-model)
- [Known implementation notes](#known-implementation-notes)
- [Production-hardening roadmap](#production-hardening-roadmap)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

An institutional stamp in Gracon is not merely a visual seal. It is a persisted trust record containing two independent cryptographic signatures over the same document hash:

1. an **institution signature**, produced with the institution’s active private key;
2. a **personal signature**, produced with the authorized member’s active private key.

Before either signature is created, the service validates that:

- the caller is a verified Gracon user with a full session;
- the institution exists and is active;
- the caller is an active member of that institution;
- the membership currently carries stamp authority;
- that authority is linked to an active authority resolution;
- the authority resolution has not expired;
- the institution has an unrevoked, unexpired certificate;
- the user has an unrevoked, unexpired personal certificate;
- both institution and personal encrypted private keys are available.

The successful record preserves the institutional membership, authority resolution, role title, certificates, signatures, document hash, document name, and server timestamp.

### Trust interpretation

The dual signature is intended to answer two separate questions:

| Signature | Intended statement |
|---|---|
| Institution signature | “This institution’s cryptographic authority endorsed this document hash.” |
| User signature | “This identified individual performed the institutional stamping action.” |

Both signatures must validate for the public verification result to be `valid: true`.

A valid cryptographic result alone does not determine legal enforceability. Legal effect depends on the applicable law, certificate policy, identity assurance, key custody, institutional governance, document canonicalization, and evidentiary procedures.

---

## Service responsibilities

The service owns:

- full-session user authentication for stamp operations;
- verified-user enforcement;
- institutional membership and authority checks;
- authority-resolution validation;
- active institution-certificate lookup;
- active personal-certificate lookup;
- institution private-key decryption compatibility;
- personal private-key decryption compatibility;
- dual signing of one document hash;
- immutable-style institutional stamp creation;
- user-specific stamp history;
- owner-only stamp-detail retrieval;
- public verification of both supplied signature values;
- public verification-attempt logging;
- strict request validation;
- CORS allowlisting;
- route and global request throttling.

The service does **not** own:

- user registration or JWT issuance;
- identity verification;
- institution creation or membership administration;
- authority-resolution creation or revocation;
- institution key generation;
- institution certificate issuance;
- personal key generation;
- personal certificate issuance;
- the canonical Prisma schema or migrations;
- document storage or canonicalization;
- PDF rendering;
- visual institution-stamp image management through an active route;
- a certificate authority, CRL, or OCSP responder;
- the user interface.

Those responsibilities belong to the User Auth, Verification, Institution, Signature, Database, Documentify, and frontend components.

---

## Key capabilities

### Identity and access

- Shared JWT validation using the User Auth Service secret
- Full-session token requirement
- Active-account requirement
- Completed identity-verification requirement
- Global authentication guard with explicit public-route bypass
- Strict per-operation institutional authorization

### Institutional authority

- Active institution validation
- Exact user/institution membership lookup
- Active membership requirement
- Explicit `stampAuthority` requirement
- Required authority-resolution link
- Active resolution requirement
- Resolution-expiry enforcement
- Role-title snapshot at stamping time

### Dual signing

- Exact 64-character hexadecimal SHA-256 input
- Institution private-key decryption
- User private-key decryption
- Two independent Base64 signatures
- Two certificate references
- Membership and resolution references
- Server-side stamping timestamp
- User-facing stamp history

### Public verification

- Anonymous verification endpoint
- Institution and user signatures checked independently
- Partial-result visibility
- Certificate subject names on full success
- Public verification-attempt audit rows
- IP address capture for verification attempts

### Runtime hardening

- Helmet security headers
- Strict DTO validation and unknown-field rejection
- Explicit CORS origin allowlist
- Named general, authentication, and strict throttle profiles
- Production-disabled Swagger UI
- Shared database-boundary validation in CI
- High-severity dependency audits

---

## Architecture

```mermaid
flowchart LR
    UserApp["Gracon User / Documents Application"]
    Edge["Reverse Proxy / API Gateway"]
    Stamp["Gracon Stamp Service<br/>NestJS · :3003"]
    DatabasePkg["@gracon/database<br/>Generated Prisma Client"]
    DB[("PostgreSQL / Neon")]
    Auth["Gracon User Auth Service"]
    Institution["Gracon Institution Service"]
    Signature["Gracon Signature Service"]
    Public["Third-Party Verifier"]

    UserApp -->|"Full-session JWT<br/>document hash + institution"| Edge
    Edge --> Stamp

    Stamp --> DatabasePkg
    DatabasePkg --> DB

    Auth -->|"Users and JWT lifecycle"| DB
    Institution -->|"Institutions, members,<br/>resolutions, keys, certificates"| DB
    Signature -->|"Personal keys and certificates"| DB

    Public -->|"Hash + two signatures + IDs"| Edge
    Stamp -->|"Independent verification result"| Public

    style Stamp stroke-width:3px
```

### Service interaction model

The Stamp Service does not call the Institution or Signature Service over HTTP for normal stamping. It reads the required records directly through the shared database client and must remain cryptographically compatible with the encryption and key-generation contracts implemented by those services.

```mermaid
flowchart TB
    Authority["Institution authority state<br/>institution · member · resolution"]
    InstitutionTrust["Institution trust material<br/>key pair · certificate"]
    PersonalTrust["Personal trust material<br/>key pair · certificate"]
    Hash["Caller-supplied SHA-256 hash"]
    Stamp["Dual-signature orchestration"]
    Record["InstitutionStamp record"]

    Authority --> Stamp
    InstitutionTrust --> Stamp
    PersonalTrust --> Stamp
    Hash --> Stamp
    Stamp --> Record
```

---

## Trust boundaries

| Boundary | Enforcement |
|---|---|
| Anonymous vs. protected route | Global `VerifiedUserGuard`; only explicitly public routes bypass it |
| Limited vs. full user session | JWT strategy requires `tokenType === "full"` |
| Active vs. deactivated account | User record loaded from PostgreSQL |
| Unverified vs. identity-verified user | `user.isIdVerified === true` |
| User vs. institution | Exact compound membership lookup by `userId` and `institutionId` |
| Member vs. stamping authority | `membership.stampAuthority === true` |
| Informal permission vs. formal authority | Membership must reference an active authority resolution |
| Institution identity vs. signing key | Institution certificate and encrypted key material |
| Personal identity vs. signing key | Personal certificate and encrypted key material |
| Document bytes vs. hash | Caller owns canonicalization; Stamp Service signs the supplied digest |
| Raw private key vs. stored database value | AES-encrypted private-key PEM at rest |
| Internal stamp record vs. public verification | Public verifier supplies proof fields; protected history requires stamp ownership |
| Consumer service vs. schema owner | `@gracon/database` package; migrations remain in Database Service |

---

## Technology stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 22 |
| Framework | NestJS 11 |
| Language | TypeScript 5.7 |
| Database | PostgreSQL / Neon |
| ORM | Prisma through `@gracon/database` |
| Cryptography | Node.js `crypto` |
| Authentication | Passport JWT |
| Validation | `class-validator` + `class-transformer` |
| Rate limiting | `@nestjs/throttler` |
| Security headers | Helmet |
| API documentation | OpenAPI / Swagger |
| Tests | Jest + Supertest |
| CI | GitHub Actions |

The package currently also includes AWS SDK, Multer, and `node-forge`, and the repository contains an S3 helper. Those components are not connected to the active stamping workflow.

---

## Project structure

```text
gracon-stamp-service/
├── .github/
│   └── workflows/
│       └── api-security.yml
├── agents/                         # Repository-specific implementation rules
├── docs/
│   └── database-setup.md
├── src/
│   ├── common/
│   │   ├── config/                 # Typed environment validation
│   │   ├── decorators/             # CurrentUser and Public decorators
│   │   ├── filters/                # Global HTTP and throttle errors
│   │   ├── prisma/                 # Shared Prisma wrapper
│   │   ├── s3/                     # Present but not imported by active modules
│   │   └── security/               # Strict CORS configuration
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── guards/             # Global verified-user guard
│   │   │   ├── interfaces/         # JWT/request-user contracts
│   │   │   └── strategies/         # Shared user-JWT validation
│   │   └── stamping/
│   │       ├── dto/                # Stamp and verification contracts
│   │       ├── helpers/            # Institution/user key derivation and decryption
│   │       ├── stamping.controller.ts
│   │       ├── stamping.module.ts
│   │       └── stamping.service.ts
│   ├── app.module.ts
│   └── main.ts
├── test/
│   ├── app.e2e-spec.ts
│   └── jest-e2e.json
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

---

## Authentication boundary

All routes are authenticated by default. The public verification route is explicitly marked public.

A protected request must satisfy:

1. bearer-token syntax;
2. valid JWT signature using `JWT_SECRET`;
3. unexpired JWT;
4. `tokenType === "full"`;
5. existing user record;
6. active account;
7. completed identity verification.

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Guard as VerifiedUserGuard
    participant JWT as UserJwtStrategy
    participant DB as PostgreSQL
    participant Handler

    Client->>Guard: Authorization: Bearer <token>
    Guard->>JWT: Validate signature and expiry
    JWT->>JWT: Require tokenType = full
    JWT->>DB: Load user
    DB-->>JWT: Account state
    JWT->>JWT: Require active + ID verified
    JWT-->>Guard: Trusted RequestUser
    Guard->>Handler: Continue
```

### Expected JWT claims

```json
{
  "sub": "user-uuid",
  "email": "person@example.com",
  "tokenType": "full",
  "iat": 1720000000,
  "exp": 1720000900
}
```

The service does not issue or refresh JWTs.

---

## Authority chain

An institutional stamp is accepted only after the current authority chain passes service-level validation.

```mermaid
flowchart TD
    User["Verified user"] --> Institution{"Institution active?"}
    Institution -- No --> Deny["Reject"]
    Institution -- Yes --> Membership{"Active membership?"}
    Membership -- No --> Deny
    Membership -- Yes --> Permission{"stampAuthority = true?"}
    Permission -- No --> Deny
    Permission -- Yes --> Linked{"Resolution linked?"}
    Linked -- No --> Deny
    Linked -- Yes --> Active{"Resolution active?"}
    Active -- No --> Deny
    Active -- Yes --> Expired{"validUntil passed?"}
    Expired -- Yes --> Deny
    Expired -- No --> Continue["Continue to certificates and keys"]
```

### Institution

The institution must exist and have:

```text
isActive = true
```

### Membership

The service uses the compound membership identity:

```text
userId + institutionId
```

The membership must be active.

### Stamp authority

The membership must contain:

```text
stampAuthority = true
```

### Authority resolution

The membership must reference an `AuthorityResolution`.

The resolution must:

- exist;
- be active;
- have no past `validUntil`.

The successful stamp record stores:

- `memberId`;
- `resolutionId`;
- `roleTitle`.

This creates a snapshot of who acted, under which membership, in which role, and under which formal authority record.

> [!WARNING]
> The current implementation does not check `resolution.validFrom`, does not confirm that the loaded resolution belongs to the requested institution, and does not interpret the resolution’s free-text `scope`. See [Known implementation notes](#known-implementation-notes).

---

## Cryptographic profile

### Key derivation

Institution private-key decryption uses:

```text
institutionDerivedKey =
  HMAC-SHA256(INSTITUTION_ENCRYPTION_SECRET, institutionId)
```

Personal private-key decryption uses:

```text
userDerivedKey =
  HMAC-SHA256(SIGNATURE_ENCRYPTION_SECRET, userId)
```

The secrets must match the contracts used by the Institution and Signature Services.

### Encrypted-key format

Both helpers expect:

```text
ivHex:ciphertextHex
```

and decrypt with:

```text
AES-256-CBC
```

### Signature operation

The caller submits a SHA-256 digest encoded as exactly 64 hexadecimal characters.

Both signatures currently use:

```text
crypto.sign("SHA256", Buffer.from(documentHash, "hex"), privateKey)
```

Verification uses the matching `crypto.verify("SHA256", ...)` operation.

For an RSA key, the effective service-defined profile signs a SHA-256 digest of the already supplied digest bytes:

```text
signatureInput = SHA-256(documentHashBytes)
```

This is internally consistent with the verifier, but it should be formally versioned and documented for interoperability.

### Signature output

Each signature is Base64 encoded:

```json
{
  "institutionSignatureBytes": "<base64>",
  "userSignatureBytes": "<base64>"
}
```

### Algorithm compatibility

The shared database schema permits:

```text
RSA_2048
ED25519
```

The Stamp Service does not inspect the key algorithm and always passes `"SHA256"` to Node’s signing and verification APIs. This is an RSA-oriented workflow; Ed25519 requires a different invocation.

Use RSA-backed institution and personal trust material until a complete Ed25519 path is implemented and tested.

### Current key-custody limitation

The decrypted PEM is held in a JavaScript string during the operation. Setting the local reference to `null` does not guarantee memory zeroization.

The shared data model includes future `keyHandle` fields, but the Stamp Service currently requires `privateKeyEncrypted` and cannot use an HSM-backed handle.

---

## Stamping workflow

```mermaid
sequenceDiagram
    autonumber
    participant User
    participant API as Stamp Service
    participant DB as PostgreSQL
    participant Crypto

    User->>API: POST /stamp/stamping<br/>institutionId + documentHash + documentName
    API->>DB: Validate active institution
    API->>DB: Validate active membership
    API->>DB: Validate stamp authority + resolution
    API->>DB: Load institution certificate
    API->>DB: Load personal certificate
    API->>DB: Load active institution key
    API->>Crypto: Decrypt and sign hash
    API->>DB: Load active personal key
    API->>Crypto: Decrypt and sign same hash
    API->>DB: Create InstitutionStamp
    DB-->>API: Immutable-style proof record
    API-->>User: Stamp ID + both signatures + references
```

### Input

```json
{
  "institutionId": "00000000-0000-4000-8000-000000000000",
  "documentHash": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "documentName": "Board Resolution 2026-Q3.pdf"
}
```

Validation:

| Field | Rules |
|---|---|
| `institutionId` | UUID |
| `documentHash` | Exactly 64 hexadecimal characters |
| `documentName` | String, maximum 255 characters |

### Certificate checks

The service requires:

- one unrevoked institution certificate;
- one unrevoked personal certificate;
- `notAfter` later than the current time.

### Key checks

The service requires:

- one active institution key pair with encrypted private-key material;
- one active personal key pair with encrypted private-key material.

### Output

A successful request returns fields equivalent to:

```json
{
  "stampId": "00000000-0000-4000-8000-000000000000",
  "institutionSignatureBytes": "<base64>",
  "userSignatureBytes": "<base64>",
  "institutionCertificateId": "00000000-0000-4000-8000-000000000000",
  "personalCertificateId": "00000000-0000-4000-8000-000000000000",
  "roleTitle": "Finance Director",
  "authorityResolutionId": "00000000-0000-4000-8000-000000000000",
  "documentHash": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "documentName": "Board Resolution 2026-Q3.pdf",
  "stampedAt": "2026-07-28T00:00:00.000Z"
}
```

### Failure categories

| Status | Typical cause |
|---|---|
| `400` | Missing/expired certificate or missing encrypted key material |
| `401` | Missing, invalid, or expired user JWT |
| `403` | Limited token, unverified user, inactive membership, no stamp authority, invalid resolution |
| `404` | Institution is missing/inactive or stamp record does not exist |
| `429` | Strict stamping throttle exceeded |

The stamp operation is throttled to:

```text
10 requests per 10 minutes
```

per active throttler storage key.

---

## Stamp record

The persisted `InstitutionStamp` is designed as an immutable audit proof.

It stores:

| Field | Meaning |
|---|---|
| `institutionId` | Institution represented by the stamp |
| `userId` | Individual who performed the action |
| `memberId` | Membership used for authority |
| `resolutionId` | Formal authority record |
| `institutionCertificateId` | Institution certificate selected at stamp time |
| `personalCertificateId` | Personal certificate selected at stamp time |
| `documentName` | Caller-supplied human-readable name |
| `documentHash` | Caller-supplied SHA-256 digest |
| `institutionSignatureBytes` | Institution signature in Base64 |
| `userSignatureBytes` | Personal signature in Base64 |
| `roleTitle` | Membership role snapshot |
| `metadata` | Optional shared-model extension field |
| `stampedAt` | Server-side timestamp |

The active API exposes no update or delete route for stamp records.

### What the record proves

The record preserves what Gracon used at the moment the operation was stored.

It does not independently prove:

- that the supplied `documentName` matches the hashed document;
- that the caller computed the hash correctly;
- that the resolution’s free-text scope covered the document;
- that certificate chains are publicly trusted;
- that private keys were held in hardware;
- that the institution’s governance process is legally sufficient.

Those assurances require additional policy and technical controls.

---

## Public verification

```mermaid
sequenceDiagram
    autonumber
    participant Verifier
    participant API as Stamp Service
    participant DB as PostgreSQL
    participant Crypto

    Verifier->>API: POST /stamp/stamping/verify
    API->>DB: Load latest unrevoked institution certificate
    API->>Crypto: Verify institution signature
    API->>DB: Load latest unrevoked personal certificate
    API->>Crypto: Verify personal signature
    API->>DB: Store InstitutionStampVerification
    API-->>Verifier: Independent results + overall validity
```

### Input

```json
{
  "documentHash": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "institutionSignatureBytes": "<base64>",
  "userSignatureBytes": "<base64>",
  "institutionId": "00000000-0000-4000-8000-000000000000",
  "userId": "00000000-0000-4000-8000-000000000000"
}
```

### Result logic

```text
valid =
  institutionSignatureValid
  AND userSignatureValid
```

Example success:

```json
{
  "valid": true,
  "institutionSignatureValid": true,
  "userSignatureValid": true,
  "institution": {
    "name": "Example Institution Ltd",
    "certificateId": "00000000-0000-4000-8000-000000000000",
    "notAfter": "2028-07-28T00:00:00.000Z"
  },
  "signer": {
    "name": "Example Signer",
    "certificateId": "00000000-0000-4000-8000-000000000000",
    "notAfter": "2028-07-28T00:00:00.000Z"
  }
}
```

Example failure:

```json
{
  "valid": false,
  "institutionSignatureValid": true,
  "userSignatureValid": false,
  "reason": "User signature is invalid — document may have been tampered with."
}
```

### Verification log

Each request attempts to create an `InstitutionStampVerification` record containing:

- institution certificate identifier or `"unknown"`;
- personal certificate identifier or `"unknown"`;
- document hash;
- independent signature results;
- combined result;
- failure reason;
- caller IP address;
- server timestamp.

The verification model stores certificate identifiers as strings rather than enforced certificate relations, so `"unknown"` is accepted by the current schema.

### Important limitation

The endpoint does **not** accept `stampId` and does not load the immutable stamp record. It cannot confirm that:

- the two supplied signatures came from a stored Gracon stamp;
- the certificate IDs match those captured on that stamp;
- the user had authority when the stamp was created;
- the supplied role/resolution correspond to the proof;
- current certificate changes should or should not affect historical validity.

A durable verifier should be stamp-centric:

```text
verify(stampId, documentHash)
```

and use the certificate IDs and signature bytes stored on that record.

---

## History and ownership

### Paginated history

```text
GET /api/v1/stamp/stamping/history
```

Returns only stamps whose `userId` matches the authenticated user.

Summary fields:

- stamp ID;
- document name;
- document hash;
- institution ID;
- role title;
- stamped timestamp.

### Full detail

```text
GET /api/v1/stamp/stamping/history/{stampId}
```

Returns the full database record, including both signature values and authority/certificate reference IDs, only when the authenticated user owns the stamp.

### Current limitations

- No institution-admin history endpoint
- No lookup by document hash
- No lookup by institution
- No verification-history endpoint
- No role-based compliance/auditor view
- No pagination DTO, minimum, or maximum limit
- No export/reporting endpoint

---

## Data model

```mermaid
erDiagram
    User ||--o{ InstitutionMember : belongs_to
    User ||--o{ PersonalKeyPair : owns
    User ||--o{ PersonalCertificate : owns
    User ||--o{ InstitutionStamp : performs

    Institution ||--o{ InstitutionMember : contains
    Institution ||--o{ AuthorityResolution : governs
    Institution ||--o{ InstitutionKeyPair : owns
    Institution ||--o{ InstitutionCertificate : owns
    Institution ||--o{ InstitutionStamp : issues

    AuthorityResolution ||--o{ InstitutionMember : grants
    AuthorityResolution ||--o{ InstitutionStamp : authorizes

    InstitutionKeyPair ||--o| InstitutionCertificate : certified_by
    PersonalKeyPair ||--o| PersonalCertificate : certified_by

    InstitutionCertificate ||--o{ InstitutionStamp : used_by
    PersonalCertificate ||--o{ InstitutionStamp : used_by

    Institution {
        uuid id PK
        string name
        enum type
        string registrationNumber
        string country
        boolean isActive
    }

    InstitutionMember {
        uuid id PK
        uuid userId
        uuid institutionId
        string roleTitle
        boolean hasAdminRole
        boolean stampAuthority
        uuid resolutionId
        boolean isActive
    }

    AuthorityResolution {
        uuid id PK
        uuid institutionId
        string title
        string scope
        string grantedBy
        boolean isActive
        datetime validFrom
        datetime validUntil
        datetime revokedAt
        string revokedReason
    }

    InstitutionKeyPair {
        uuid id PK
        uuid institutionId
        enum algorithm
        text publicKey
        text privateKeyEncrypted
        string keyHandle
        string fingerprint
        boolean isActive
    }

    InstitutionCertificate {
        uuid id PK
        uuid institutionId
        uuid keyPairId
        string serialNumber
        string subjectCN
        datetime notBefore
        datetime notAfter
        text certificatePem
        boolean isRevoked
    }

    PersonalCertificate {
        uuid id PK
        uuid userId
        uuid keyPairId
        string serialNumber
        string subjectCN
        datetime notBefore
        datetime notAfter
        text certificatePem
        boolean isRevoked
    }

    InstitutionStamp {
        uuid id PK
        uuid institutionId
        uuid userId
        uuid memberId
        uuid resolutionId
        uuid institutionCertificateId
        uuid personalCertificateId
        string documentName
        string documentHash
        text institutionSignatureBytes
        text userSignatureBytes
        string roleTitle
        json metadata
        datetime stampedAt
    }

    InstitutionStampVerification {
        uuid id PK
        string institutionCertificateId
        string personalCertificateId
        uuid verifiedByUserId
        string documentHash
        boolean institutionSigValid
        boolean userSigValid
        boolean result
        string failReason
        string ipAddress
        datetime createdAt
    }
```

---

## API reference

The service uses the global prefix:

```text
/api/v1
```

The stamping controller prefix is:

```text
/stamp/stamping
```

### Endpoints

| Method | Path | Access | Purpose |
|---|---|---|---|
| `POST` | `/stamp/stamping` | Verified full-session user | Apply an authority-gated dual-signature stamp |
| `POST` | `/stamp/stamping/verify` | Public | Verify institution and user signatures independently |
| `GET` | `/stamp/stamping/history` | Verified full-session user | List the current user’s stamp records |
| `GET` | `/stamp/stamping/history/:stampId` | Stamp owner | Retrieve a complete stamp record |

### Apply stamp

```text
POST /api/v1/stamp/stamping
```

Request:

```json
{
  "institutionId": "00000000-0000-4000-8000-000000000000",
  "documentHash": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "documentName": "Approved Procurement Decision.pdf"
}
```

### Verify stamp

```text
POST /api/v1/stamp/stamping/verify
```

Request:

```json
{
  "documentHash": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "institutionSignatureBytes": "<base64>",
  "userSignatureBytes": "<base64>",
  "institutionId": "00000000-0000-4000-8000-000000000000",
  "userId": "00000000-0000-4000-8000-000000000000"
}
```

### History query

```text
GET /api/v1/stamp/stamping/history?page=1&limit=20
```

`page` and `limit` are currently parsed directly from query strings.

### Stamp detail

```text
GET /api/v1/stamp/stamping/history/{stampId}
```

The authenticated user must own the record.

---

## Request examples

Set the API base and access token:

```bash
export STAMP_API_URL="http://localhost:3003/api/v1"
export ACCESS_TOKEN="<full-session-gracon-access-token>"
```

### Apply an institutional stamp

```bash
curl --request POST \
  --url "$STAMP_API_URL/stamp/stamping" \
  --header "Authorization: Bearer $ACCESS_TOKEN" \
  --header "Content-Type: application/json" \
  --data '{
    "institutionId": "00000000-0000-4000-8000-000000000000",
    "documentHash": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "documentName": "Board Resolution 2026-Q3.pdf"
  }'
```

### Verify publicly

```bash
curl --request POST \
  --url "$STAMP_API_URL/stamp/stamping/verify" \
  --header "Content-Type: application/json" \
  --data '{
    "documentHash": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "institutionSignatureBytes": "<base64-institution-signature>",
    "userSignatureBytes": "<base64-personal-signature>",
    "institutionId": "00000000-0000-4000-8000-000000000000",
    "userId": "00000000-0000-4000-8000-000000000000"
  }'
```

### List stamp history

```bash
curl --request GET \
  --url "$STAMP_API_URL/stamp/stamping/history?page=1&limit=20" \
  --header "Authorization: Bearer $ACCESS_TOKEN"
```

### Retrieve a stamp record

```bash
curl --request GET \
  --url "$STAMP_API_URL/stamp/stamping/history/<stamp-id>" \
  --header "Authorization: Bearer $ACCESS_TOKEN"
```

### Hash a file locally

Linux:

```bash
sha256sum ./document.pdf
```

macOS:

```bash
shasum -a 256 ./document.pdf
```

Node.js:

```bash
node -e "
  const fs = require('fs');
  const crypto = require('crypto');
  const data = fs.readFileSync('./document.pdf');
  console.log(crypto.createHash('sha256').update(data).digest('hex'));
"
```

Always verify that the exact same bytes are used during later verification.

---

## Configuration

Copy the environment template:

```bash
cp .env.example .env
```

### Environment variables

| Variable | Required | Example/default | Description |
|---|:---:|---|---|
| `APP_PORT` | ✓ | `3003` | HTTP port; typed validation accepts `1024–65535` |
| `APP_ENV` | ✓ | `development` | `development`, `production`, or `test` |
| `DATABASE_URL` | ✓ | PostgreSQL URL | Dedicated Stamp Service runtime connection |
| `JWT_SECRET` | ✓ | — | Must match User Auth Service; minimum 32 characters |
| `INSTITUTION_ENCRYPTION_SECRET` | ✓ | — | Must match Institution Service private-key encryption |
| `SIGNATURE_ENCRYPTION_SECRET` | ✓ | — | Must match Signature Service private-key encryption |
| `FRONTEND_URL` | ✓ | `http://localhost:4000` | Primary allowed browser origin |
| `FRONTEND_URLS` | — | — | Additional comma-separated origins |

### Example `.env`

```dotenv
APP_PORT=3003
APP_ENV=development

DATABASE_URL=postgresql://gracon_stamp_app:replace-me@localhost:5432/gracon

JWT_SECRET=replace-with-the-user-auth-service-jwt-secret

INSTITUTION_ENCRYPTION_SECRET=replace-with-the-institution-service-secret
SIGNATURE_ENCRYPTION_SECRET=replace-with-the-signature-service-secret

FRONTEND_URL=http://localhost:4000
FRONTEND_URLS=http://localhost:4001,http://localhost:4002
```

### Secret relationships

| Secret | Required relationship |
|---|---|
| `JWT_SECRET` | Same value used by User Auth Service for user JWTs |
| `INSTITUTION_ENCRYPTION_SECRET` | Same value used when institution private keys were encrypted |
| `SIGNATURE_ENCRYPTION_SECRET` | Same value used when personal private keys were encrypted |
| Database password | Unique least-privilege runtime credential |

Do not use one generic secret for all three purposes.

### S3 variables

The repository contains an S3 helper that expects:

- `AWS_REGION`;
- `AWS_ACCESS_KEY_ID`;
- `AWS_SECRET_ACCESS_KEY`;
- `AWS_S3_BUCKET_NAME`.

However:

- `S3Module` is not imported by `AppModule` or `StampingModule`;
- no active stamping route uses the S3 service;
- the variables are not present in `.env.example`;
- the variables are not part of typed environment validation.

Current production stamping requires no S3 configuration unless that dormant helper is deliberately integrated.

---

## Database ownership

The service consumes:

```json
"@gracon/database": "file:../database"
```

The separate Gracon Database Service owns:

- the canonical Prisma schema;
- migrations;
- generated client code;
- seeds;
- runtime roles and grants;
- service-boundary validation.

Recommended workspace:

```text
gracon/
├── database/
└── stamp/
```

Use the runtime role:

```text
gracon_stamp_app
```

The role should connect to the same PostgreSQL/Neon database as the other Gracon APIs but must not own the schema or execute migrations.

### Required data domains

The runtime reads or writes the following domains:

- users;
- institutions;
- institution members;
- authority resolutions;
- institution key pairs;
- institution certificates;
- personal key pairs;
- personal certificates;
- institutional stamps;
- institutional stamp verifications.

Review least-privilege grants against the exact Prisma operations.

### Neon

Use the pooled runtime hostname where applicable:

```dotenv
DATABASE_URL=postgresql://gracon_stamp_app:password@ep-example-pooler.region.aws.neon.tech/neondb?sslmode=require
```

Apply migrations from Database Service only.

---

## Local development

### Prerequisites

- Node.js 22
- npm
- PostgreSQL or Neon
- Gracon Database Service as a sibling checkout
- A compatible User Auth Service JWT secret
- Compatible Institution Service key encryption
- Compatible Signature Service key encryption
- Test data with:
  - an active verified user;
  - an active institution;
  - active institution membership;
  - stamp authority;
  - an active authority resolution;
  - institution key and certificate;
  - personal key and certificate.

### 1. Clone the workspace

```bash
mkdir gracon
cd gracon

git clone https://github.com/kajugadaniels/gracon-database-service.git database
git clone https://github.com/kajugadaniels/gracon-stamp-service.git stamp
```

Result:

```text
gracon/
├── database/
└── stamp/
```

### 2. Prepare the database package

```bash
cd database
npm ci
npm run prisma:generate
npm run build
npm run migrate:deploy
```

Use the database repository’s own documentation for development migrations and seed data.

### 3. Install the Stamp Service

```bash
cd ../stamp
npm ci
```

### 4. Configure environment

```bash
cp .env.example .env
```

Populate every required secret and connection string.

### 5. Start development mode

```bash
npm run start:dev
```

Default locations:

```text
API:     http://localhost:3003/api/v1
Swagger: http://localhost:3003/api/docs
```

### Production build

```bash
npm run build
npm run start:prod
```

---

## API documentation

Swagger is mounted when:

```text
APP_ENV !== production
```

Development URL:

```text
/api/docs
```

The specification includes bearer authentication for protected stamping and history routes.

The verification endpoint is public.

For production contract discovery, generate and publish an OpenAPI artifact to a protected internal developer portal.

---

## Runtime protections

### Strict request validation

A global validation pipe uses:

- `whitelist: true`;
- `forbidNonWhitelisted: true`;
- `transform: true`.

Unknown request fields are rejected.

### CORS

Allowed browser origins are assembled from:

- `FRONTEND_URL`;
- optional comma-separated `FRONTEND_URLS`.

Wildcards are not used.

Non-browser requests without an `Origin` header are accepted.

Configured methods:

```text
GET, POST, PATCH, DELETE, OPTIONS
```

Allowed request headers:

```text
Content-Type, Authorization
```

### Security headers

Helmet is enabled globally.

### Rate limits

| Profile | Limit |
|---|---:|
| General | 60 requests per minute |
| Authentication | 5 requests per minute |
| Strict | 10 requests per 10 minutes |

The stamp endpoint explicitly uses the strict profile. Public verification currently uses the global general profile.

> [!NOTE]
> The default Nest throttler storage is process-local. Effective limits multiply with replica count unless a shared store or gateway-level policy is used.

---

## Testing and quality

### Commands

```bash
# Build / type-check
npm run build

# Unit/default tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:cov

# End-to-end
npm run test:e2e

# Format
npm run format

# Lint and auto-fix
npm run lint
```

### CI pipeline

The GitHub Actions workflow:

1. requires `GRACON_DATABASE_REPOSITORY`;
2. checks out Stamp Service and Database Service into sibling paths;
3. uses Node.js 22;
4. installs the database package;
5. generates the shared Prisma client;
6. builds the database package;
7. runs the `stamp` consumer-boundary check;
8. runs the shared security-hardening baseline;
9. audits database dependencies at high severity;
10. installs and builds Stamp Service;
11. runs Jest serially;
12. audits Stamp Service dependencies at high severity.

For a private database repository, configure `GRACON_DATABASE_REPOSITORY_TOKEN` with minimum read permissions.

### Current e2e scaffold

The checked-in e2e test still expects:

```text
GET / → "Hello World!"
```

The application does not define that contract and applies a global `/api/v1` prefix. Replace the starter test with real stamping and verification integration tests.

### High-value test scenarios

Prioritize:

- limited-token rejection;
- inactive or unverified-user rejection;
- inactive institution;
- inactive membership;
- missing stamp authority;
- missing resolution;
- future `validFrom`;
- expired and revoked resolution;
- resolution linked to another institution;
- personal certificate-access ban;
- certificate `notBefore`;
- multiple unrevoked certificates;
- active-key/certificate mismatch;
- RSA and Ed25519 behavior;
- concurrent authority revocation during stamping;
- idempotent retries;
- public verification after certificate rotation;
- malformed Base64 input;
- extreme and negative pagination values;
- throttling across multiple replicas;
- immutable stamp-history access.

---

## Deployment

The repository currently has no Dockerfile. Add a reviewed multi-stage image or use the hosting platform’s native Node.js build pipeline.

### Recommended topology

```mermaid
flowchart TB
    Users["Verified Gracon Users"]
    Verifiers["Public Verifiers"]
    Edge["WAF / API Gateway / TLS"]
    API1["Stamp Service A"]
    API2["Stamp Service B"]
    DB[("Managed PostgreSQL")]
    Auth["User Auth Service"]
    Institution["Institution Service"]
    Signature["Signature Service"]
    HSM["Future HSM / KMS"]

    Users --> Edge
    Verifiers --> Edge
    Edge --> API1
    Edge --> API2

    API1 --> DB
    API2 --> DB
    Auth --> DB
    Institution --> DB
    Signature --> DB

    API1 -. "Future remote signing" .-> HSM
    API2 -. "Future remote signing" .-> HSM
```

### Deployment checklist

- [ ] Use Node.js 22.
- [ ] Build the sibling database package.
- [ ] Generate the shared Prisma client.
- [ ] Apply migrations from Database Service only.
- [ ] Use the `gracon_stamp_app` runtime role.
- [ ] Match all three cross-service secrets correctly.
- [ ] Store secrets in a managed secret store.
- [ ] Restrict CORS to exact origins.
- [ ] Add gateway throttling for public verification.
- [ ] Configure trusted-proxy behavior before trusting `req.ip`.
- [ ] Add liveness and dependency-aware readiness endpoints.
- [ ] Add structured logs and correlation IDs.
- [ ] Add a distributed rate-limit store.
- [ ] Resolve certificate/key-selection and historical-verification issues.
- [ ] Complete a cryptographic design review.
- [ ] Move production signing to HSM/KMS.
- [ ] Add a reproducible container or deployment manifest.
- [ ] Define evidence retention and privacy policy.
- [ ] Test backup restoration and cross-service secret recovery.

---

## Operations

### Recommended metrics

Collect:

- requests, latency, and failures by endpoint;
- stamping success and rejection by authority check;
- active membership/stamp-authority failures;
- resolution missing, revoked, or expired failures;
- certificate missing, revoked, or expired failures;
- private-key decryption failure;
- institution-signature generation latency;
- personal-signature generation latency;
- database stamp-write failure;
- verification success and partial failure;
- verification attempts by IP;
- history query latency and requested page sizes;
- throttled requests;
- database pool use and query latency.

### Recommended alerts

Alert on:

- repeated private-key decryption failures;
- unusual stamp volume for one user or institution;
- stamps attempted under revoked authority;
- certificate/key mismatches;
- certificate expiry approaching;
- verification failure spikes;
- high-volume public enumeration;
- missing verification audit writes;
- cross-service secret changes;
- elevated `401`, `403`, `409`, `429`, or `5xx`;
- database connection exhaustion.

### Audit strategy

The stamp record captures core evidence, but production operations should add a dedicated append-only security event stream for:

- stamp request received;
- authority validation result;
- certificate IDs and key fingerprints selected;
- stamp created;
- stamp request denied;
- verification attempted;
- verification result;
- privileged history access;
- secret/key migration.

Do not place private keys, raw JWTs, or full signature values in application logs.

### Backup and recovery

A complete recovery must preserve:

- institution and personal encrypted keys;
- encryption secrets and their versions;
- institution and personal certificates;
- authority resolutions;
- institution memberships;
- institutional stamp records;
- verification records.

Losing either key-encryption secret makes the corresponding private keys unusable.

Implement:

- secret versioning;
- audited key re-encryption;
- point-in-time database recovery;
- cross-service restore tests;
- key-loss and forced-rotation procedures.

---

## Security model

### Implemented controls

- Full-session JWT enforcement
- Active and verified user checks
- Global auth-by-default guard
- Exact membership lookup
- Active membership requirement
- Explicit stamp-authority requirement
- Formal resolution requirement
- Resolution active/expiry checks
- Certificate revocation/expiry checks
- Per-institution private-key derivation
- Per-user private-key derivation
- Private key omitted from API output
- Exact hash format validation
- Independent dual signatures
- Public independent verification
- Verification-attempt persistence
- Owner-only stamp-detail retrieval
- Strict DTO validation
- Helmet
- Explicit CORS allowlist
- Named throttling profiles
- Shared-schema boundary checks

### Secret separation

| Secret | Purpose |
|---|---|
| `JWT_SECRET` | Verify full-session Gracon user JWTs |
| `INSTITUTION_ENCRYPTION_SECRET` | Decrypt institution private keys |
| `SIGNATURE_ENCRYPTION_SECRET` | Decrypt personal private keys |
| Database password | Access only permitted Stamp Service tables/operations |

These secrets must remain independent.

### Data classification

Treat as highly sensitive:

- institution and personal encrypted private keys;
- encryption master secrets;
- signature bytes;
- document hashes and names;
- certificate PEM values;
- authority-resolution records;
- membership role and authority status;
- verification IP addresses.

### Never log

- plaintext private keys;
- encrypted private-key values;
- JWTs;
- master secrets;
- full signature values;
- raw database credentials;
- certificate private material;
- complete request bodies for sensitive stamp operations.

### Caller-supplied hashes

The Stamp Service trusts the caller’s digest. Integrating services should:

1. define canonical document bytes;
2. compute SHA-256 server-side;
3. bind the hash to a durable document ID and version;
4. prevent changes after hash creation;
5. preserve the exact bytes for later verification;
6. pass an idempotency key or existing document identity.

---

## Known implementation notes

These findings distinguish the current source from a production-complete institutional PKI and evidence system.

### 1. Certificate and key pairs are selected independently

The service loads an unrevoked certificate by owner and separately loads any active key pair by owner. It does not load the key identified by `certificate.keyPairId`.

After rotation or inconsistent state, the service can sign with one key while returning a certificate for another key. The newly created stamp will then fail verification.

**Recommended fix:** select the certificate first, load exactly its `keyPairId`, and ensure that key remains active and matches the expected fingerprint.

### 2. Certificate lookup for stamping is nondeterministic

`getActiveInstitutionCert` and `getActivePersonalCert` use `findFirst` without `orderBy`.

If data contains multiple unrevoked certificates, selection is not explicit. Public verification, by contrast, orders by `createdAt DESC`, so stamping and verification can choose different certificates.

**Recommended fix:** enforce one current certificate in the database and select deterministically.

### 3. Historical verification uses current certificates

The public verifier loads the latest unrevoked institution and personal certificates instead of the IDs stored in `InstitutionStamp`.

A stamp can fail after:

- certificate rotation;
- revocation;
- replacement;
- data cleanup.

It can also be evaluated with a certificate that did not exist when the stamp was created.

**Recommended fix:** accept `stampId`, load the stored signatures and certificate IDs, verify against those certificates, and separately report current revocation status.

### 4. Verification does not prove that a stamp record exists

The endpoint accepts arbitrary hash, signature, user ID, and institution ID values. A valid cryptographic pair can pass even if no corresponding `InstitutionStamp` was created by Gracon.

**Recommended fix:** make verification record-centric and expose a constrained public proof response.

### 5. Personal certificate-access bans are not enforced

The Signature Service and shared schema support a `PersonalCertificateAccessPolicy` with `BANNED`. The Stamp Service does not query this policy before using the personal certificate and key.

A user banned from certificate use may still stamp when all other conditions remain valid.

**Recommended fix:** enforce the policy before loading personal signing material and recheck it inside the final transaction.

### 6. Resolution `validFrom` is not checked

A future-dated authority resolution can currently authorize stamping as long as it is active and not past `validUntil`.

### 7. Resolution ownership is not checked

The service loads the membership’s `resolutionId` but does not explicitly require:

```text
resolution.institutionId === requested institutionId
```

The normal Institution Service should maintain correct relationships, but the Stamp Service should enforce the boundary independently.

### 8. Resolution scope is not evaluated

`AuthorityResolution.scope` is free text. The service does not check whether a specific document type or action is covered.

This may be acceptable as an evidentiary snapshot, but it is not machine-enforced authorization.

### 9. Certificate `notBefore` is not checked

The service checks only `notAfter`. A future-valid certificate can be used prematurely.

### 10. Ed25519 is incompatible with the current signing call

The shared schema supports Ed25519, but the service always calls:

```text
crypto.sign("SHA256", ...)
```

and:

```text
crypto.verify("SHA256", ...)
```

Ed25519 requires a `null` algorithm in Node.js.

**Recommended action:** restrict complete stamping workflows to RSA until algorithm-aware signing and verification are implemented.

### 11. The RSA profile hashes an already hashed value

The API accepts a SHA-256 document digest and then the RSA signing API applies SHA-256 again.

The profile is internally consistent but non-obvious and should be standardized and versioned.

### 12. AES-CBC ciphertext has no authentication tag

The key-encryption helpers provide confidentiality but not authenticated integrity.

**Recommended fix:** migrate to AES-256-GCM or envelope encryption with a versioned ciphertext format.

### 13. HSM/key-handle records are unsupported

The shared models provide `keyHandle`, but the service rejects a key pair whose `privateKeyEncrypted` is absent. It cannot use hardware-held institution or personal keys.

### 14. JavaScript cannot reliably zeroize decrypted PEM strings

Assigning the variable to `null` releases the reference but does not guarantee memory erasure.

### 15. Authority and certificate checks are vulnerable to state races

The service performs multiple reads, two cryptographic operations, and one final create outside a transaction or explicit state-version check.

Membership, resolution, certificate, or policy state can change after validation but before persistence.

**Recommended fix:** use a transaction with final locked/revalidated reads, or a durable command/outbox workflow with state versions.

### 16. Stamping is not idempotent

Retrying the same request creates another stamp record with new signature values and timestamp.

Add an idempotency key or a uniqueness policy based on the calling document/version and institution.

### 17. `ipAddress` passed to `stamp` is unused

The controller sends `req.ip`, but the service does not store or log it for successful or denied stamping. The `InstitutionStamp` schema has no IP field.

### 18. Public signature values are only validated as strings

The verification DTO does not enforce canonical Base64 format or decoded signature length.

Node’s Base64 decoder is permissive; malformed input may be silently normalized before verification.

### 19. History pagination is unbounded and weakly validated

`page` and `limit` are converted with unary `+` and sent to Prisma without:

- integer validation;
- minimum values;
- maximum page size;
- NaN handling.

### 20. Verification audit identifiers are not foreign keys

`InstitutionStampVerification` stores certificate IDs as plain strings. This permits `"unknown"` but does not guarantee that a logged ID references a real certificate.

### 21. Verification does not check authority history

The public endpoint checks only current cryptographic signatures. It does not load the stamp’s membership, role title, or resolution.

A robust response should distinguish:

- cryptographic validity at stamp time;
- authority evidence captured at stamp time;
- current certificate status;
- current resolution status.

### 22. Current certificate revocation destroys historical “valid” results

Because verification requires an unrevoked current certificate, revoking a certificate can make old evidence fail rather than report “signature valid; certificate later revoked.”

### 23. The S3 implementation is dormant scaffolding

The repository contains an S3 service, but it is not imported into the application and no active endpoint uses it. Institutional stamp images and document assets are not handled here.

### 24. AWS SDK v2 is included despite no active S3 workflow

If storage is later activated, consider AWS SDK v3 and workload credentials.

### 25. No health or readiness endpoint

The service exposes no liveness route and no dependency checks for PostgreSQL or cryptographic configuration.

### 26. Production Swagger is disabled

Publish a protected OpenAPI artifact if internal consumers require production contract discovery.

### 27. E2E scaffolding is stale

The current e2e test targets an absent root `Hello World!` route rather than the real `/api/v1/stamp/stamping` contract.

### 28. No repository Dockerfile

Production packaging is not reproducible from the repository alone.

### 29. Process-local throttling

Rate limits multiply with replica count and can be bypassed by distributing requests across instances.

### 30. `node-forge`, Multer, and AWS packages are not part of the active flow

Unused security-sensitive dependencies increase maintenance and audit surface. Remove them or document and test their intended integration.

---

## Production-hardening roadmap

### Priority 0 — correctness

- [ ] Bind each certificate to its exact `keyPairId`.
- [ ] Enforce one deterministic current certificate.
- [ ] Make public verification stamp-centric.
- [ ] Verify against certificates captured on the stamp record.
- [ ] Enforce certificate-access bans.
- [ ] Check resolution `validFrom`.
- [ ] Check resolution institution ownership.
- [ ] Check certificate `notBefore`.
- [ ] Restrict or fully implement supported algorithms.
- [ ] Add strict Base64 validation.
- [ ] Add bounded pagination DTOs.
- [ ] Add idempotency.

### Priority 1 — evidence integrity

- [ ] Version and standardize the signing profile.
- [ ] Bind stamp requests to a document/version ID.
- [ ] Add a canonical document-hashing contract.
- [ ] Revalidate authority and trust state at persistence time.
- [ ] Add a dedicated append-only stamp security audit.
- [ ] Report historical and current trust status separately.
- [ ] Add verifier responses with resolution and role snapshots.
- [ ] Add trusted timestamping where required.

### Priority 2 — key security

- [ ] Migrate AES-CBC to authenticated encryption.
- [ ] Add ciphertext/key-version metadata.
- [ ] Move institution signing to HSM/KMS.
- [ ] Move personal signing to HSM/KMS or remote signer.
- [ ] Support `keyHandle`.
- [ ] Add key-use audit telemetry.
- [ ] Add key-compromise and forced-rotation procedures.
- [ ] Perform formal cryptographic review.

### Priority 3 — operations

- [ ] Add liveness and dependency-aware readiness endpoints.
- [ ] Add a reviewed multi-stage Dockerfile.
- [ ] Add structured JSON logging and correlation IDs.
- [ ] Add OpenTelemetry traces and metrics.
- [ ] Add shared/distributed rate limiting.
- [ ] Add disposable-database integration tests.
- [ ] Add cross-service contract tests.
- [ ] Add SAST, secret scanning, and dependency updates.
- [ ] Remove unused dependencies and dormant modules.
- [ ] Define retention, privacy, and legal-evidence policy.
- [ ] Perform threat modeling and penetration testing.

---

## Troubleshooting

### `Cannot find module '@gracon/database'`

Confirm the sibling workspace:

```text
gracon/
├── database/
└── stamp/
```

Then rebuild:

```bash
cd ../database
npm ci
npm run prisma:generate
npm run build

cd ../stamp
npm ci
```

### Startup fails with environment-validation errors

Verify all required values:

```text
APP_PORT
APP_ENV
DATABASE_URL
JWT_SECRET
INSTITUTION_ENCRYPTION_SECRET
SIGNATURE_ENCRYPTION_SECRET
FRONTEND_URL
```

Secrets must be at least 32 characters.

### Protected route returns `401`

Check:

- `Authorization: Bearer ...`;
- token expiry;
- `JWT_SECRET`;
- user existence;
- active status.

### Protected route returns identity-verification `403`

The JWT must be a full session, and the database user must have:

```text
isIdVerified = true
```

### “Institution not found or is inactive”

Confirm the institution ID and `isActive` state in the institution-management workflow.

### “You are not an active member”

Confirm the exact user/institution membership and `isActive`.

### “You do not have stamp authority”

The membership must have:

```text
stampAuthority = true
```

and a linked authority resolution.

### “Authority resolution has been revoked or expired”

Inspect:

- `isActive`;
- `validUntil`;
- membership `resolutionId`.

Also review `validFrom` manually until the service enforces it.

### “Institution has no active certificate”

Generate institution key material and issue a certificate through the Institution Service.

### “You have no active personal certificate”

Generate a personal key pair and complete certificate issuance through the Signature Service.

### Private-key decryption fails

The most common cause is a secret mismatch:

- institution encrypted keys require the same `INSTITUTION_ENCRYPTION_SECRET`;
- personal encrypted keys require the same `SIGNATURE_ENCRYPTION_SECRET`.

Also confirm the stored ciphertext follows:

```text
ivHex:ciphertextHex
```

### New stamp fails public verification

Check for a certificate/key mismatch. The current service selects certificates and active keys independently.

### Historical stamp stopped verifying

The public verifier uses current unrevoked certificates rather than the certificate IDs captured at stamp time. Certificate rotation or revocation can cause this.

### Ed25519 stamp fails

The current stamp and verifier calls are RSA-oriented. Use RSA-backed keys until an algorithm-aware implementation is added.

### History query fails or is slow

Use positive integer values and a reasonable `limit`. The current controller does not cap pagination.

### CORS rejects the frontend

Add the exact origin—including scheme and port—to `FRONTEND_URL` or `FRONTEND_URLS`.

Do not include URL paths.

### Swagger is missing in production

Swagger is intentionally mounted only outside production.

---

## Contributing

1. Create a focused branch.
2. Keep schema and migration changes in Database Service.
3. Preserve compatibility with Institution and Signature key encryption.
4. Never expose private-key material.
5. Add strict validation for every public contract.
6. Add authority, certificate, algorithm, and concurrency tests.
7. Add audit behavior for security-relevant changes.
8. Run:

```bash
npm run format
npm run lint
npm run build
npm test -- --runInBand
npm run test:e2e
npm audit --audit-level=high
```

9. Update Swagger and this README when contracts change.
10. Document cryptographic, institutional-authority, database, rollout, and rollback impact.

### Pull-request checklist

- [ ] Full-session and verified-user boundary preserved
- [ ] Institution and membership state checked
- [ ] Authority resolution checked completely
- [ ] Certificate belongs to the exact signing key
- [ ] Algorithm behavior tested
- [ ] Certificate-access policy enforced
- [ ] No private key or secret logged
- [ ] Historical verification behavior covered
- [ ] Concurrency and revocation races covered
- [ ] Shared database package used
- [ ] No service-local migration added
- [ ] Documentation updated

---

## License

`package.json` marks the project as:

```text
UNLICENSED
```

The package is also private. No open-source license grant is provided by this README. Obtain explicit authorization from the project owner before copying, redistributing, or using the software outside its intended environment.

---

<div align="center">

Built as part of the **Gracon** identity and digital-trust platform.

</div>
