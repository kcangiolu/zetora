# Working on Zetora

Rules for anyone changing this repository, people and coding agents alike. [ARCHITECTURE.md](ARCHITECTURE.md) explains how the code is laid out; read it before a change that spans several areas.

## Documentation moves with the code

A change is not done until the docs describe it. In the same commit:

- **README.md** when a feature, a service, a Compose profile or a setup step is added, removed or changes behavior.
- **ARCHITECTURE.md** when a top-level folder, an API route group or a service is added, moved or removed.
- **.env.example** for every environment variable read or retired, with a short comment saying what it does and its default. `env/server.ts` declares the server ones.
- The **README of a subproject** (`hermes-plugin/zetora`, `hermes-relay-service`, ...) when its install or contract changes.

## Code

- Everything in the code is in English: identifiers, comments, log lines, UI strings, tool descriptions.
- No `any` and no `as unknown as`. Type the value where it comes from: a type guard, a parser, a narrower parameter type.
- Missing configuration is a visible error naming the variable to set, never a silent fallback to another provider, model or service.
- Reuse what exists before adding a helper: look in `lib/`, `hooks/` and `components/ui/` first.
- Keep diffs to what the task needs. No drive-by renames, reformatting or restyling of untouched code.
- Database changes go through `lib/db/schema.ts` and a generated migration (`pnpm exec drizzle-kit generate`). Never edit a migration that has shipped.

## Comments

- A comment says why the code is the way it is now: a constraint, a non-obvious behavior, what would break otherwise. Code that reads on its own needs none.
- No history: no "previously", "used to", "the bug where", "fixed", dates or ticket narration. History belongs in the commit message.
- No names of people, and no hostnames, IPs or paths of a particular deployment.

## Names and private data

- No real names, emails, private hostnames or IPs in code, tests, fixtures or docs. Tests use neutral names (`Ada`, `user-1`), `example.com` and the documentation ranges (`192.0.2.0/24`, private ranges such as `192.168.0.0/16` only where the test is about them).
- No secrets anywhere in the tree, even fake-looking ones that match a real key format.
- The only places that name the author are `LICENSE` and `SECURITY.md`. CI fails on others.

## Before each commit

```bash
pnpm typecheck # also fails on an unused import, variable or parameter (name a parameter you must keep _x)
pnpm lint      # no warning: CI allows none
pnpm knip
pnpm test
pnpm fix       # Prettier on the whole repository: CI fails on an unformatted file
```

Behavior a test can pin goes in `tests/` (Vitest). Changes to `hermes-relay-service` also run its own `npm test`, and changes to `hermes-plugin` pass `ruff check --select F,E9 hermes-plugin`.

## Commits

- [Conventional Commits](https://www.conventionalcommits.org/) with a scope: `fix(chat): ...`, `feat(hermes): ...`, `docs: ...`.
- The subject says what changes for the user or the code, in the present tense. The body says why, and what was checked.
- One topic per commit. Code, its tests and its docs go together.
