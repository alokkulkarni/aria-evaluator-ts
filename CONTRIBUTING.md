# Contributing to ARIA Evaluator

Thanks for your interest in contributing! ARIA Evaluator is an open-source AI agent
evaluation platform, and contributions of every size are welcome — bug reports, docs,
new adapters, new judge dimensions, and fixes.

## Ways to contribute

- **Report a bug or request a feature** — open an [issue](https://github.com/alokkulkarni/aria-evaluator-ts/issues).
- **Ask a question or share a setup** — start a [discussion](https://github.com/alokkulkarni/aria-evaluator-ts/discussions).
- **Submit a change** — open a pull request (see below).

## Development setup

```bash
git clone https://github.com/alokkulkarni/aria-evaluator-ts.git
cd aria-evaluator-ts
npm install
npm run dev          # API + UI at http://localhost:3001
```

Useful commands:

```bash
npm run lint         # type-check (tsc --noEmit)
npm run build        # build API + UI
npm run db:migrate   # apply Prisma schema changes
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the directory map and how-to guides
(adding adapters, dimensions, routes, and pages).

## Pull requests

1. Fork the repo and create a branch off `main`.
2. Keep changes focused; match the surrounding code style.
3. Run `npm run lint` and make sure the build passes.
4. Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages
   (`feat:`, `fix:`, `refactor:`, `chore:`).
5. Open a PR describing what changed and why.

## Code areas

- **Adapters** (`src/adapters/`) — connect ARIA to an agent platform.
- **Judge** (`src/judge/`) — scoring across the 15 evaluation dimensions.
- **Conversation** (`src/conversation/`) — scenario runner and transcript model.
- **Website** (`website/`) — the marketing/docs site (Next.js).

## License

By contributing, you agree that your contributions will be licensed under the
[Apache License 2.0](LICENSE).
