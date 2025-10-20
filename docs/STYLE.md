# Code Style Guide

Use this document as a checklist after implementation to ensure code quality.

## Philosophy

Write short, readable code using modern JavaScript features. Prefer clarity over cleverness.

## Technical Constraints

- ✓ Modern ES2024+ features, no compilation/build step required
- ✓ JSDoc types for parameter checking (no TypeScript)
- ✓ Explicit module specifiers (`.mjs`/`.js` extensions required)
- ✓ No bare imports like `from "module"` - use full paths

## Naming Conventions

- ✓ `snake_case` for methods and variables
- ✓ `_prefix` for internal/private properties
- ✓ Descriptive names - no abbreviations unless obvious
- ✓ Boolean variables start with `is_`, `has_`, `can_`, etc.

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
- ✓ **Generators** for potentially large collections (world items, beliefs, state iterations)
- ✓ Prefer `for...of` loops over `forEach` or `reduce` when clearer
- ✓ Use `Array.from()` or spread for iterator-to-array conversion

### Comments & Documentation

- ✓ JSDoc comments for **types only** - no redundant descriptions
- ✓ Minimize inline comments - prefer self-documenting code
- ✓ Only comment when "why" isn't obvious from code
- ✓ Document complex algorithms or non-obvious design decisions
- ✓ **Fewer lines = more code visible on screen**

Example of good JSDoc:
```javascript
/**
 * @param {Mind} mind
 * @param {string} label
 * @returns {Belief|undefined}
 */
function find_belief(mind, label) {
  // Implementation speaks for itself
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
- ✓ `state.tick()` for state changes, not direct mutation
- ✓ Spread operator for shallow copies: `{...obj, prop: newValue}`

## Error Handling

- ✓ Throw descriptive errors with context
- ✓ Use `assert()` from `lib/debug.mjs` for preconditions
- ✓ Validate inputs early (fail fast)
- ✓ Document error conditions in JSDoc

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

## ESLint Configuration

See `eslint.config.mjs`:
- ES2024 with module syntax
- Worker globals enabled
- `prefer-const` enforced
- `semi` disabled (no semicolons)
- `no-unused-vars` as warning

Run: `npx eslint .` or `npx eslint <file>`

## References

- [ARCHITECTURE.md](ARCHITECTURE.md) - System design and patterns
- [test/.CONTEXT.md](../test/.CONTEXT.md) - Testing conventions
- ESLint config: `eslint.config.mjs`
