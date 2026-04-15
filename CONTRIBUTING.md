# Contributing to slack-mcp-oauth-proxy

Thank you for your interest in contributing.

## Getting Started

1. Clone the repository: `git clone https://github.com/adaofeliz/slack-mcp-oauth-proxy.git`
2. Install dependencies: `npm install`
3. Set up environment: `cp .env.example .env` and fill in your Slack credentials.
4. Start development server: `npm run dev`

## Development

- `npm run dev`: Starts the server with hot reload.
- `npm test`: Runs the Vitest test suite.
- `npm run lint`: Checks for linting issues.
- `npm run typecheck`: Runs TypeScript type checking.

## Coding Conventions

- Use strict TypeScript.
- Avoid using `as any`.
- Follow Prettier formatting (run `npm run format` if available).
- Do not include `console.log` in production code. Use a proper logger if needed.

## Commit Messages

We follow the conventional commits format:
- `feat`: A new feature
- `fix`: A bug fix
- `chore`: Maintenance tasks
- `docs`: Documentation changes
- `test`: Adding or updating tests
- `ci`: CI/CD configuration changes

## Pull Requests

- Ensure all tests pass before submitting.
- Update documentation if you change functionality.
- Avoid breaking changes without prior discussion in an issue.
- All contributors must adhere to our [Code of Conduct](CODE_OF_CONDUCT.md).
