# api/stamp Testing Rules

Add tests when changing:

- authority validation
- key decryption compatibility
- dual-signature proof creation
- certificate fingerprint capture
- stamp verification metadata shape

Validation commands:

```bash
npm run build
npm run test
```

Docs-only changes do not require a build.
