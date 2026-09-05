# Contributing to ForgeMind

Thank you for your interest in contributing to **ForgeMind**! We welcome contributions from developers of all skill levels.

---

## 📜 Code of Conduct

All contributors are expected to uphold our [Code of Conduct](./CODE_OF_CONDUCT.md). Please read it to understand our community standards.

---

## 🛠️ How to Contribute

### 1. Reporting Bugs

- Search existing issues to ensure the bug hasn't been reported.
- Open a new issue with a clear title, reproduction steps, expected behavior, and system environment details.

### 2. Suggesting Features

- Open a feature request issue explaining the proposal, use case, and potential value to users.

### 3. Submitting Pull Requests (PRs)

1. **Fork & Clone**: Fork the repository and clone your fork locally.
2. **Branching**: Create a feature branch off `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Coding Standards**:
   - Follow project formatting and linting guidelines (`.prettierrc`, `eslint.config.mjs`).
   - Write clear, self-documenting code with inline comments where appropriate.
4. **Commit Messages**: Follow [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat: add symbol graph visualization component`
   - `fix: resolve AST parsing timeout on large files`
   - `docs: update deployment architecture specs`
   - `chore: update repository dependencies`
5. **Testing**: Ensure all automated linting, type-checks, and test suites pass.
6. **Submit PR**: Open a Pull Request targeting `main` with a thorough description of your changes.

---

## 🔍 Pull Request Checklist

Before marking your PR as ready for review:

- [ ] Code adheres to `.editorconfig`, `.prettierrc`, and `eslint.config.mjs` standards.
- [ ] Documentation has been updated to reflect architectural or behavioral changes.
- [ ] Commit history is clean and uses Conventional Commits format.
- [ ] All CI pipeline checks pass.
