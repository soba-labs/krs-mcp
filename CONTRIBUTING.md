# Contributing

Thank you for helping improve krs-mcp.

## Development

Requirements: Node.js 22.12 or later and npm.

1. Fork and clone the repository.
2. Run `npm ci`.
3. Create a focused branch for your change.
4. Add or update tests for behavior changes.
5. Run `npm run typecheck`, `npm test`, `npm audit`, and `npm run check:package`.
6. Open a pull request that explains the change and its verification.

Tests must use synthetic fixtures and must not depend on live government services. Do not commit credentials, personal data, or live registry captures.

Maintainers can run `npm run check:live` to verify the current Ministry endpoints. This sends one company-name search and one current-extract request for Soba Labs. Do not add personal data or broad queries to the live check.

For security issues, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.
