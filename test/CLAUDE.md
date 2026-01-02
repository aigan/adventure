# Test Suite

715 tests using Mocha. Run with `npm test`.

## Running Tests

```bash
npm test                                  # Full suite
NODE_ENV=test mocha test/belief.test.mjs  # Single file
mocha --grep "caching"                    # Pattern match
```

## Test Files

### Core Classes
- `belief.test.mjs` - Belief construction, traits, versioning, caching, shared beliefs
- `state.test.mjs` - Immutability, branching, belief queries
- `mind.test.mjs` - Mind creation, nesting, state management, serialization
- `subject.test.mjs` - Subject identity, version resolution
- `archetype.test.mjs` - Composition, inheritance, trait resolution
- `traittype.test.mjs` - Type resolution, arrays, enums, exposure

### Trait System
- `trait_inheritance.test.mjs` - Value inheritance through bases
- `composable_traits.test.mjs` - Array composition basics
- `composable_complex.test.mjs` - Multi-level composition scenarios
- `composable_mind.test.mjs` - Mind trait composition (Convergence), P1.x/P2.x inheritance patterns
- `get_traits_composable.test.mjs` - `get_traits()` with composition

### Reverse Lookups
- `reverse_trait.test.mjs` - `rev_trait()` lookups, temporal versioning
- `reverse_trait_convergence.test.mjs` - `rev_trait()` with Convergence
- `rev_base.test.mjs` - Skip list traversal

### Integration
- `integration.test.mjs` - Full system scenarios
- `learn_about.test.mjs` - Cross-mind learning
- `declarative_mind_state.test.mjs` - Template resolution
- `locking.test.mjs` - State/belief locking, cascades
- `temporal_reasoning.test.mjs` - Time-based queries
- `logos.test.mjs` - Root mind behavior
- `load.test.mjs` - Serialization round-trips
- `promotion.test.mjs` - Promotions: Eidos constraint, probability, temporal, inheritance, recall certainty, inspection

### UI/Communication
- `channel.test.mjs` - BroadcastChannel, inspection
- `inspect.test.mjs` - Inspection views
- `session.test.mjs` - Session lifecycle
- `sysdesig.test.mjs` - System designation formatting
- `subject_inspect.test.mjs` - Subject inspection views

### Message Protocol
- `message_protocol.test.mjs` - Message format validation
- `worker_mock.test.mjs` - MockWorker API simulation
- `worker_dispatch.test.mjs` - Real dispatch logic
- `registry.test.mjs` - Global registries, ID sequences

### Quality Checks (z_* run last)
- `z_eslint.test.mjs` - Linting
- `z_typecheck.test.mjs` - TypeScript checking
- `z_style.test.mjs` - STYLE.md compliance
- `z_markdown_links.test.mjs` - Link validation
- `z_file_permissions.test.mjs` - Group permissions

## Test Utilities (`helpers.mjs`)

```javascript
import { setupStandardArchetypes, createMindWithBeliefs } from './helpers.mjs'

beforeEach(() => setupStandardArchetypes())

// Quick fixture creation
const state = createMindWithBeliefs('world', {
  player: { bases: ['Person'], traits: { name: 'Alice' } }
})
```

## Conventions

- Use `setupStandardArchetypes()` or `setupMinimalArchetypes()` in `beforeEach`
- Test names: `it('description of behavior', ...)`
- Always `state.lock()` before assertions on locked state
- Spread generators: `[...belief.rev_trait(...)]`

## References

- [IMPLEMENTATION.md](../docs/IMPLEMENTATION.md) - Architecture
- [STYLE.md](../docs/STYLE.md) - Code style
- [public/worker/CLAUDE.md](../public/worker/CLAUDE.md) - Worker modules
