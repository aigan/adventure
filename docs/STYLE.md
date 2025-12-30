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

### @heavy Annotation

Some methods iterate over collections and are O(n) where n could be millions in a scaled system. These "heavy" methods require explicit acknowledgment via `@heavy` comments to ensure developers consider performance implications.

**Heavy methods** (require `@heavy` when called):
- `.get_beliefs()` - iterates all beliefs in a state
- `.get_beliefs_by_*()` - iterates beliefs filtering by mind/subject/archetype
- `.get_traits()` - iterates all traits on a belief
- `.get_states_by_*()` - iterates states for a ground state
- `.beliefs` - direct access to subject's belief Set

**At call sites** - add `// @heavy` comment on same or adjacent line:
```javascript
// @heavy - building inspection view for UI
for (const belief of state.get_beliefs()) {
  // ...
}
```
Including a reason is recommended to document why the iteration is acceptable in this context (e.g., bounded by UI constraints, only in debugging code, etc.).

**At method definitions** - document performance characteristics:
```javascript
/**
 * @heavy O(beliefs in state) - iterates all beliefs in state and base chain
 * @yields {Belief}
 */
*get_beliefs() {
```

**Consider before using heavy methods**:
- Can you use an indexed lookup instead? (e.g., `get_belief_by_subject()`)
- Is the collection bounded? (e.g., traits per belief is typically small)
- Is this code on a hot path or only for debugging/inspection?
- Could an index be added to avoid the iteration?

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
  - Use nested loops with generators, not `[...generator].some()`
  - Example: `for (const a of belief.get_archetypes()) { if (a === target) break }`
- ✓ **Preserve iterators** - pass them through without materializing
  - ✓ Pass iterator directly to functions that accept iterables (check types!)
  - ✓ Use `for...of` with early `break` instead of `.find()` on spread array
  - ✓ Filter inline: `for (x of iter) { if (cond) result.push(x) }`
  - ✗ `[...iterator]` then use once - just iterate directly
  - ✗ `[...iter].filter().slice(0,3)` - filter and limit inline instead
  - Exception: Multiple passes, `.sort()`, or API requires array → use `[...iter]`
- ✓ **Iterator methods** - iterators have `.map()`, `.filter()`, `.find()`, `.take()`, etc.
  - ✓ `[...iter.map(fn)]` - map lazily, materialize once (good)
  - ✗ `[...iter].map(fn)` - materialize, then map again (wasteful)
  - ✓ `iter.filter(fn).take(3)` - chain iterator methods lazily
  - ✓ `Object.fromEntries(iter.map(fn))` - no spread needed, accepts iterable
- ✗ Avoid `forEach`, `for...of`, or iteration over DB registries
- ✓ Use indexed lookups: `DB.belief_by_id.get(id)`, `state.get_belief_by_subject(subject)`
- ✓ When you need to "find" something, use a registry lookup with a key, not iteration
- ✓ When O(n) scan is unavoidable: return generator, document "all of time and space", consider indexing

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
- ✓ `state.branch()` for state changes, not direct mutation
- ✓ Spread operator for shallow copies: `{...obj, prop: newValue}`

## Error Handling

- ✓ Throw descriptive errors with context
- ✓ Use `assert()` from `lib/debug.mjs` for preconditions
- ✓ Validate inputs early (fail fast)
- ✓ Document error conditions in JSDoc
- ✓ Return `null` for "not found" cases, never `undefined`
  - `undefined` = "property doesn't exist" (implicit)
  - `null` = "value intentionally absent" (explicit)

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

### No Defensive Programming

**Don't guard against things that should never happen**. Use assertions to catch bugs, not if-statements to work around them.

✓ **Good** - Assert expectations:
```javascript
const archetype = Archetype.get_by_label(label)
assert(archetype, `Archetype '${label}' not found`, {label})
archetype.resolve_template_values()

const eidos_state = eidos().origin_state
assert(eidos_state instanceof State, 'Eidos must have origin_state')
const prototype = subject.get_shared_belief_by_state(eidos_state)
```

✗ **Bad** - Defensive checks that hide bugs:
```javascript
const archetype = Archetype.get_by_label(label)
if (archetype) {  // ✗ If it's missing, that's a bug - don't hide it
  archetype.resolve_template_values()
}

const eidos_state = eidos().origin_state
if (eidos_state) {  // ✗ Eidos always has origin_state - checking hides design errors
  const prototype = subject.get_shared_belief_by_state(eidos_state)
}
```

**Rationale**: Defensive programming makes bugs harder to find by allowing the program to continue in invalid states. If something should always exist, assert it. If it might legitimately not exist (like optional parameters), that's different - but document it clearly.

### Delegation Over Conditionals

**Delegate type-specific logic to the type that owns the metadata, not the caller.**

When a class needs to perform operations based on type information, delegate to the type class rather than using conditionals.

✓ **Good** - Delegate to owner:
```javascript
// Traittype owns data_type, so validation lives there
class Traittype {
  validate_archetype(subject, state) {
    const required = Archetype.get_by_label(this.data_type)
    if (!required) return
    // ... validation logic using this.data_type
  }
}

// Archetype just delegates
class Archetype {
  static resolve_trait_value_from_template(traittype, belief, data) {
    const { subject } = lookup_subject(data)
    traittype.validate_archetype(subject, belief.origin_state)  // Delegate
    return subject
  }
}
```

✗ **Bad** - Conditionals in wrong class:
```javascript
// Archetype doing validation that uses traittype's data
class Archetype {
  static resolve_trait_value_from_template(traittype, belief, data) {
    const { subject } = lookup_subject(data)

    // ✗ Archetype shouldn't have this logic - it belongs in Traittype
    const required = Archetype.get_by_label(traittype.data_type)
    if (required) {
      for (const a of belief.get_archetypes()) {
        if (a === required) return subject
      }
      throw Error(...)
    }

    return subject
  }
}
```

**Rationale**:
- Type-specific logic belongs with the type that owns the metadata
- Reduces conditionals and coupling
- Makes behavior easier to extend (add new validation to Traittype, not scattered across callers)
- Similar to how enum validation uses `traittype.values` in `literal_handler`

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
