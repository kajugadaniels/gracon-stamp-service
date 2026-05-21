# api/stamp Git Rules

Codex must never run git commands automatically.

Use paths relative to `api/stamp`.

```bash
git add "src/modules/stamping/stamping.service.ts"
git commit -m "feat(stamp): enforce authority revocation at stamp time"
```

Rules:

- One file per `git add`.
- Never use `git add .` or `git add -A`.
- Never include `cd api/stamp`.
- Never run `git push`.
- Use Conventional Commits.
