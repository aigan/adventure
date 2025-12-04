# CLAUDE.md

Guidance for Claude Code when working with this codebase.

## Quick Navigation

- **[CURRENT.md](CURRENT.md)** - Active work and implementation plans
- **[docs/SPECIFICATION.md](docs/SPECIFICATION.md)** - Language-agnostic data model (what we're building)
- **[docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md)** - Current codebase architecture (how it's built)
- **[docs/STYLE.md](docs/STYLE.md)** - Code quality checklist (use after implementation)
- **[docs/ALPHA-1.md](docs/ALPHA-1.md)** - Alpha 1 detailed stages
- **[public/worker/CLAUDE.md](public/worker/CLAUDE.md)** - Worker implementation (primary work area)
- **[test/CLAUDE.md](test/CLAUDE.md)** - Test structure and utilities

## Project Summary

Systemic story game where narrative emerges from simulated agents and constraint-based generation. Think NetHack narrative depth meets detective investigation.

**Core principle**: No objective truth - only possibility spaces that collapse based on player observation.

**Current stage**: Pre-alpha (Alpha 1 Stage 1 complete)

**Primary work area**: `public/worker/` - See [CLAUDE.md](public/worker/CLAUDE.md) for details

## Development Commands

```bash
npm test                 # Run tests + linting (see test/CLAUDE.md)
```

## File Creation Rules

**IMPORTANT**: Always create files, never use bash heredocs or pipes:
- ✅ Use `Write` tool to create files in `tmp/` directory
- ✅ Example: `Write` to `tmp/debug_test.mjs`, then `node tmp/debug_test.mjs`
- ❌ NEVER use `cat > /tmp/file.mjs <<'EOF'` or similar bash heredocs
- ❌ NEVER use system `/tmp` - files there are invisible in the project
- ❌ NEVER use `cat <<< 'content'` or pipe commands to create content

**File Permissions**:
- **CRITICAL**: All files must be fully accessible by the group
- User and group must have the same access permissions (read, write, execute)
- After creating files with `Write` tool, ensure group permissions match user permissions
- This enables collaboration when multiple users work on the codebase
- Example: If user has `rw-`, group must also have `rw-` (not `r--`)

**Directories for temporary work**:
- `tmp/` - Your temporary scripts and debugging files (gitignored)
- `tools/` - Permanent utility scripts
- `lab/` - User's experimental files (don't modify)

## Critical Patterns

**Immutability**: Never mutate - create new versions via `state.branch(ground_state, vt)` with `base` inheritance

**Archetype composition**: Multiple inheritance via `bases: ['Actor', 'Mental']`

**Testing**: Every feature needs tests using `test/helpers.mjs` utilities

See [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md) for detailed patterns and [public/worker/CLAUDE.md](public/worker/CLAUDE.md) for modules.

## Code Style

- `snake_case` for methods/variables, `_prefix` for internal
- 2-space indentation, no semicolons
- JSDoc types only, minimal comments
- ES2024+ features, explicit `.mjs` imports

**Post-implementation**: Review against [docs/STYLE.md](docs/STYLE.md) checklist, update [CHANGELOG.md](CHANGELOG.md) with date

## Version Control

Project under Git, but Claude Code has no direct access. Ask user about Git history, branches, or conflicts when relevant.

## References

- [docs/SPECIFICATION.md](docs/SPECIFICATION.md) - Data model specification (what we're building)
- [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md) - Current architecture (how it's built)
- [public/worker/CLAUDE.md](public/worker/CLAUDE.md) - Worker modules (Mind, Belief, State, etc.)
- [test/CLAUDE.md](test/CLAUDE.md) - Test patterns
- [docs/STYLE.md](docs/STYLE.md) - Quality checklist
- [README.md](README.md) - Project roadmap (all Alphas)
- [docs/ALPHA-1.md](docs/ALPHA-1.md) - Alpha 1 detailed stages
