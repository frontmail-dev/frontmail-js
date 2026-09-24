# Contributing

Thanks for your interest in the Frontmail SDKs!

## This repository is a read-only mirror

The SDKs are developed in Frontmail's private monorepo together with the API they talk to. Every
change merged there is synced here automatically as a single `sync: frontmail@<sha>` commit, and
releases are published to npm from this repository by GitHub Actions.

Because the tree is overwritten on every sync, **pull requests cannot be merged here directly**.

## Issues are welcome

- **Bugs:** open an [issue](https://github.com/frontmail-dev/frontmail-js/issues) with the package
  name and version, runtime/framework, a minimal reproduction and the `FrontmailError` `code` (if any).
- **Feature requests and docs problems:** open an issue as well.
- **Security vulnerabilities:** please do not open a public issue – email security@frontmail.dev.
- **Account or billing questions:** support@frontmail.dev.

If you have a fix, feel free to describe it in the issue or link a branch/PR from your fork – a
maintainer will port it to the monorepo and credit you in the commit.

## Working locally

```sh
corepack enable
pnpm install
pnpm build
pnpm test
pnpm typecheck
```

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE).
