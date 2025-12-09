# Worker Implementation

Core game logic in Web Worker thread.

## Modules

### Data
- `belief.mjs` - Traits, bases, caching, `rev_trait()` generator
- `subject.mjs` - Identity references (sid)
- `archetype.mjs` - Type templates, trait slots
- `traittype.mjs` - Composition, derivation

### State
- `state.mjs` - Base: snapshots, `_insert`/`_remove`, locking
- `perception.mjs` - Observation: `perceive()`, `identify()`, `learn_from()` (mixin to State)
- `temporal.mjs` - For Materia minds
- `timeless.mjs` - For Logos, Eidos
- `convergence.mjs` - Multi-parent composition

### Mind
- `mind.mjs` - Abstract base
- `materia.mjs` - Worlds, NPCs, players
- `logos.mjs` - Root singleton
- `eidos.mjs` - Prototypes singleton

### Infrastructure
- `cosmos.mjs` - Re-exports, singletons
- `db.mjs` - Global indexes
- `serialize.mjs` - JSON round-trips
- `id_sequence.mjs` - ID generation
- `reset.mjs` - Test reset hooks (see [CIRCULAR_DEPENDENCIES.md](../../docs/CIRCULAR_DEPENDENCIES.md))

### Worker/UI
- `worker.mjs` - Message dispatch
- `channel.mjs` - Inspection UI
- `session.mjs` - Player session
- `narrator.mjs` - Presentation (stub)
- `world.mjs` - Initial setup
- `debug.mjs` - Logging

## Patterns

- **Traits**: own → derived → bases (breadth-first)
- **Caching**: Locked only. `_cached_all` skips base-walking. Parent caches reused.
- **rev_trait()**: Generator - spread it: `[...belief.rev_trait(...)]`
- **Locking**: Use `state.lock()` cascade. `belief.lock(state)` asserts membership.
- **Composition**: `composable: true` merges arrays. Mind traits → Convergence.
- **Indexing**: By id/sid/label only. Never iterate collections.

## References

- [SPECIFICATION.md](../../docs/SPECIFICATION.md)
- [IMPLEMENTATION.md](../../docs/IMPLEMENTATION.md)
- [STYLE.md](../../docs/STYLE.md)
