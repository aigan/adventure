# Code Style Guide

Use this document as a checklist after implementation to ensure code quality.

## Quick Reference - Common Mistakes to Avoid

**JSDoc**: ✓ Import types at top • ✗ Inline imports (`import('./foo.mjs').Bar`)
**Assertions**: ✓ Check type (`instanceof State`) • ✗ Check null (`!== null`)
**Scalability**: ✗ Iterate over DB registries • ✓ Indexed lookups only
**Missing lookup?**: ✗ Work around by iterating • ✓ Ask about design changes
**Beliefs**: ✗ Access without state context • ✓ Always use state.get_belief_by_*()

## Philosophy

Write short, readable code using modern JavaScript features. Prefer clarity over cleverness.

**Scalability constraint**: This codebase is a proof-of-concept for a future distributed/sharded system. All data access patterns must work when beliefs are distributed across multiple database shards. This means:
- ✓ Use indexed lookups only (by id, sid, label)
- ✗ Never iterate over all beliefs/states/minds
- ✓ Always use specific context (state, mind) for lookups
- ✓ When you realize a lookup is missing, ask about adjusting the design
- ✗ Don't introduce workarounds that iterate to find things

## Technical Constraints

- ✓ Modern ES2024+ features, no compilation/build step required
- ✓ JSDoc types for parameter checking (no TypeScript)
- ✓ Explicit module specifiers (`.mjs`/`.js` extensions required)
- ✓ No bare imports like `from "module"` - use full paths

## Naming Conventions

- ✓ `snake_case` for methods and variables
- ✓ `PascalCase` for classes, types, and typedefs
- ✓ `_prefix` for internal/private properties
- ✓ Descriptive names - no abbreviations unless obvious
- ✓ Boolean variables start with `is_`, `has_`, `can_`, etc.
- ✓ **Class vs instance naming**: Type/class names are capitalized (e.g., `Session`), instance variables are lowercase (e.g., `session`)

## Formatting

- ✓ 2-space indentation (enforced by ESLint)
- ✓ No semicolons (enforced by ESLint)
- ✓ `const` by default, `let` only when reassignment needed (enforced by ESLint)
- ✓ No unused variables (ESLint warning)
- ✓ Consistent quote style (prefer single quotes)

## Code Structure

### Functions

- ✓ Keep functions short (prefer < 30 lines)
- ✓ Single responsibility - one function does one thing
- ✓ Pure functions when possible (no side effects)
- ✓ Early returns to reduce nesting

### Modern JavaScript Usage

- ✓ Use modern features when they improve clarity
  - Destructuring for multiple returns/parameters
  - Spread operator for copying/merging
  - Optional chaining `?.` for safe property access
  - Nullish coalescing `??` for default values
- ✓ **Generators** for inheritance chains and controlled iteration (e.g., walking `base` links)
- ✗ Avoid `forEach`, `for...of`, or iteration over DB registries
- ✓ Use indexed lookups: `DB.belief_by_id.get(id)`, `state.get_belief_by_subject(subject)`
- ✓ When you need to "find" something, use a registry lookup with a key, not iteration

### Comments & Documentation

- ✓ JSDoc comments for **types only** - no redundant descriptions
- ✓ Minimize inline comments - prefer self-documenting code
- ✓ Only comment when "why" isn't obvious from code
- ✓ Document complex algorithms or non-obvious design decisions
- ✓ **Fewer lines = more code visible on screen**
- ✓ **Never inline imports in type declarations** - always import types at the top of the file

Example of good JSDoc:
```javascript
import { Mind } from './mind.mjs'
import { Belief } from './belief.mjs'

/**
 * @param {Mind} mind
 * @param {string} label
 * @returns {Belief|undefined}
 */
function find_belief(mind, label) {
  // Implementation speaks for itself
}
```

Example of bad JSDoc (inlined imports):
```javascript
/**
 * @param {import('./mind.mjs').Mind} mind  // ✗ Don't inline imports
 * @param {string} label
 * @returns {import('./belief.mjs').Belief|undefined}  // ✗ Don't inline imports
 */
function find_belief(mind, label) {
  // ...
}
```

Example of bad comment:
```javascript
// Loop through beliefs
for (const belief of beliefs) {  // Don't comment obvious things
  // ...
}
```

## Immutability Patterns

- ✓ Never mutate objects - create new versions
- ✓ Use `base` property for prototype chains
- ✓ `state.branch_state()` for state changes, not direct mutation
- ✓ Spread operator for shallow copies: `{...obj, prop: newValue}`

## Error Handling

- ✓ Throw descriptive errors with context
- ✓ Use `assert()` from `lib/debug.mjs` for preconditions
- ✓ Validate inputs early (fail fast)
- ✓ Document error conditions in JSDoc

### Assertion Patterns

Always assert the **expected type or class**, not just truthiness or null-checks:

✓ **Good** - Assert expected type:
```javascript
assert(state instanceof State, 'Expected State instance', {state})
assert(belief.in_mind instanceof Mind, 'Belief must belong to a mind', {belief})
assert(typeof label === 'string', 'Label must be a string', {label})
```

✗ **Bad** - Only check for null:
```javascript
assert(state !== null, 'State required', {state})  // ✗ Could be wrong type
assert(state, 'State required', {state})           // ✗ Could be wrong type
```

**Rationale**: Type-specific assertions catch more bugs and provide better error messages. They verify not just presence but correctness.

**TypeScript compatibility**: After asserting, add type cast for TypeScript when needed:
```javascript
assert(belief.origin_state instanceof State, 'belief must have origin_state', belief)
const state = /** @type {State} */ (belief.origin_state)
```

## Testing Requirements

- ✓ Every new feature has tests
- ✓ Test edge cases and error conditions
- ✓ Use `test/helpers.mjs` utilities for consistency
- ✓ Test names describe behavior: `"should create belief with multiple bases"`
- ✓ Keep tests focused - one concept per test

## Performance Considerations

- ✓ Use generators for large collections (avoid building big arrays)
- ✓ Prefer `for` loops over array methods when performance matters
- ✓ Avoid premature optimization - profile first
- ✓ Document performance trade-offs when they exist

## Code Review Checklist

After implementing a feature, verify:

1. **Correctness**
   - [ ] Tests pass: `npm test`
   - [ ] Linting passes: `npx eslint .`
   - [ ] Manual testing in browser (if UI changes)

2. **Readability**
   - [ ] Variable names are clear and descriptive
   - [ ] Functions are short and focused
   - [ ] No unnecessary comments
   - [ ] Code is self-documenting

3. **Architecture**
   - [ ] Follows immutability patterns
   - [ ] Uses appropriate data structures (Mind/Belief/State)
   - [ ] No unintended side effects
   - [ ] Consistent with existing patterns

4. **Documentation**
   - [ ] JSDoc types for public functions
   - [ ] Complex logic has explanatory comments
   - [ ] Updated relevant .md files if architecture changed

5. **Testing**
   - [ ] New functionality has test coverage
   - [ ] Edge cases are tested
   - [ ] Tests use helpers from `test/helpers.mjs`

## Anti-Patterns to Avoid

- ✗ Deep nesting (> 3 levels) - extract functions instead
- ✗ Long parameter lists (> 4 params) - use object parameter
- ✗ Magic numbers - use named constants
- ✗ Mutating objects - always create new versions
- ✗ Clever one-liners that sacrifice clarity
- ✗ Premature abstraction - wait for patterns to emerge
- ✗ Comments explaining what code does (code should be obvious)
- ✗ **Inlined imports in type declarations** - import types at top of file instead
- ✗ **Iterating over DB registries** - use indexed lookups instead
- ✗ **Workarounds for missing lookups** - ask about design changes instead
- ✗ **Accessing beliefs without state context** - means the design needs clarification
- ✗ **Circular dependency hacks** (`Object.setPrototypeOf`, setup callbacks) - see [CIRCULAR_DEPENDENCIES.md](CIRCULAR_DEPENDENCIES.md)

## ESLint Configuration

See `eslint.config.mjs`:
- ES2024 with module syntax
- Worker globals enabled
- `prefer-const` enforced
- `semi` disabled (no semicolons)
- `no-unused-vars` as warning

Run: `npx eslint .` or `npx eslint <file>`

## References

- [IMPLEMENTATION.md](IMPLEMENTATION.md) - System design and patterns
- [CIRCULAR_DEPENDENCIES.md](CIRCULAR_DEPENDENCIES.md) - Module dependency patterns
- [test/CLAUDE.md](../test/CLAUDE.md) - Testing conventions
- ESLint config: `eslint.config.mjs`
