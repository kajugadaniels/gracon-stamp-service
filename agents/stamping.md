# api/stamp Stamping Rules

## Workflow

- Validate user identity from auth-issued JWT.
- Validate institution authority and revocation state.
- Resolve active institution trust material.
- Resolve active personal certificate/key material.
- Apply dual-signature stamp.
- Persist stamp proof and verification metadata.

## Compatibility

- Institution private-key derivation must match `api/institution`.
- Personal private-key derivation must match `api/signature`.
- Any cryptographic contract change must update all dependent services together.

## Verification Metadata

- Capture verification metadata during stamping, not later.
- Store certificate fingerprints and authority context needed for future verification.
