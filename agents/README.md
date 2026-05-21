# api/stamp Agent Guide

This directory contains project-local execution rules for AI agents working in `api/stamp`.

## Reading Order

1. Read `../../AGENTS.md`.
2. Read `../README.md`.
3. Read this file.
4. Read the topic file that matches the task.
5. Inspect the source code before editing.

## Topic Files

- [folder-structure.md](./folder-structure.md) — where stamping modules, DTOs, helpers, and tests belong.
- [file-structure.md](./file-structure.md) — naming, comments, TypeScript style, and exported API rules.
- [security.md](./security.md) — dual-signature stamping, key material, authority, and S3 rules.
- [api-contracts.md](./api-contracts.md) — controller, DTO, Swagger, validation, and response rules.
- [database-prisma.md](./database-prisma.md) — shared-schema and Prisma generation rules.
- [stamping.md](./stamping.md) — stamp application, authority validation, proof, and verification metadata rules.
- [testing.md](./testing.md) — test expectations and validation commands.
- [git.md](./git.md) — copy-paste commit command format for this project.
- [documentation.md](./documentation.md) — README, `.env.example`, Swagger, and root-guide update rules.

## Scope

These rules apply only inside `api/stamp`. Crypto contract changes must be coordinated with `api/institution` and `api/signature`.

## Conflict Rule

If a local rule conflicts with `../../AGENTS.md`, the root guide wins.
