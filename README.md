# Dtravel booking contract V4

This repository contains the core smart contracts for Dtravel Booking Service, using **Nite Tokens**.

## Prerequisites

Node >= 10.x && yarn > 1.x

```
$ node --version
v20.5.0

$ yarn --version
1.22.22
```

Install dependencies

```
$ yarn
```

Install the [ESLint VS Code extension](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) and the [Prettier VS Code](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) extension to have code auto-fix on save.

## Unit test

1. Compile contract

```
$ yarn compile
```

2. Run tests

```
$ yarn test
```

## Test coverage

1. Run script

```
yarn test:coverage
```

## Linter and prettiers

1. Run linter to analyze convention and security for smart contracts

```
$ yarn lint:sol
```

2. Format smart contracts

```
$ yarn format:sol
```

3. Run eslint for typescript files

```
$ yarn lint:ts
```

4. Format typescript files

```
$ yarn format:ts
```

- **_Note_**: _Updated husky pre-commit hook_
