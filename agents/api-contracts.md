# api/stamp API Contract Rules

- Every controller must use `@ApiTags`.
- Every endpoint must use `@ApiOperation`.
- Every endpoint must document success and important failure cases with `@ApiResponse`.
- Every DTO property must have Swagger metadata and validation decorators.
- Protected endpoints must validate auth-issued user JWTs.
- Do not expose decrypted keys, encrypted key blobs, or raw storage secrets.
- Responses must include enough proof metadata for downstream verification without leaking private material.
