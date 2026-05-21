# api/stamp Folder Structure Rules

## Source Layout

```text
src/
  common/           auth, Prisma, S3, config, filters, security
  modules/stamping/ stamp application workflow
prisma/             shared-schema mirror for Prisma client generation
agents/             AI execution rules
```

## Placement Rules

- Put stamping workflow in `src/modules/stamping/`.
- Put request and response contracts in `src/modules/stamping/dto/`.
- Put stamping-specific crypto/proof helpers in `src/modules/stamping/helpers/`.
- Put shared S3 and Prisma infrastructure under `src/common/`.
- Do not implement institution-key generation here.
- Do not implement personal-signature certificate issuance here.
