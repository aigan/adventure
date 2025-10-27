# Traittype Delegation Pattern

**Goal**: Move type-specific template resolution logic from Traittype infrastructure to owning classes using delegation pattern, eliminating conditionals and following established patterns (toJSON, from_json).

**Related**:
- docs/IMPLEMENTATION.md - Current architecture
- public/worker/traittype.mjs - Current implementation
- public/worker/mind.mjs - Target for Mind-specific logic

## Context

Currently, `Traittype.resolve_trait_value_from_template()` contains Mind-specific logic for detecting and resolving Mind templates (plain objects vs `{_type: 'Mind'}` format). This creates switch-like conditionals in generic infrastructure code.

**Current pattern** (anti-pattern):
```javascript
// In Traittype class
resolve_trait_value_from_template(belief, data) {
  // Mind-specific logic in generic infrastructure
  if (this.data_type === 'Mind' && /* Mind template detection */) {
    return Mind.create_from_template(...)
  }

  if (data?._type === 'Mind') {
    return Mind.create_from_template(...)
  }

  return this._resolver(belief, data)
}
```

**Desired pattern** (delegation):
```javascript
// In Traittype class - delegates to owning class
resolve_trait_value_from_template(belief, data) {
  // Check if type class has a resolver
  const type_class = this._get_type_class()
  if (type_class?.resolve_trait_value_from_template) {
    return type_class.resolve_trait_value_from_template(belief, data)
  }

  return this._compiled_resolver(belief, data)
}

// In Mind class - owns its resolution logic
static resolve_trait_value_from_template(belief, data) {
  // Mind-specific template detection and resolution
  if (is_plain_object_template(data)) {
    return Mind.create_from_template(belief.origin_state, data, belief.subject)
  }
  if (data?._type === 'Mind') {
    return Mind.create_from_template(belief.origin_state, data, belief.subject)
  }
  // Not a template - return as-is
  return data
}
```

This follows the same pattern as serialization:
- `toJSON()` lives in each class (Mind, State, Belief)
- `from_json()` lives in each class
- Resolution should also live in each class

## Architecture Overview

### Type-Specific Resolver Interface

Each class that can be a trait type can optionally implement:

```javascript
class Mind {
  /**
   * Resolve trait value from template data
   * @param {Belief} belief - Belief being constructed
   * @param {*} data - Raw template data
   * @returns {Mind|*} Resolved Mind instance or data as-is
   */
  static resolve_trait_value_from_template(belief, data) {
    // Type-specific template detection and resolution
    // Return data as-is if not a template
  }
}
```

### Traittype Delegation Logic

```javascript
class Traittype {
  constructor(label, def) {
    // ... existing code ...

    // Store reference to type class if it exists
    this._type_class = this._get_type_class()
  }

  _get_type_class() {
    // Map data_type strings to classes
    const type_map = {
      'Mind': Mind,
      'State': State,
      'Belief': Belief,
      'Subject': Subject
    }
    return type_map[this.data_type] ?? null
  }

  resolve_trait_value_from_template(belief, data) {
    // Delegate to type class if it has a resolver
    if (this._type_class?.resolve_trait_value_from_template) {
      return this._type_class.resolve_trait_value_from_template(belief, data)
    }

    // Otherwise use compiled resolver
    return this._compiled_resolver(belief, data)
  }
}
```

### Compiled Resolver Simplification

The `_compiled_resolver` becomes simpler - it only handles:
- Container logic (Array)
- Primitive type validation (string, number, boolean)
- Archetype reference resolution

It no longer needs Mind-specific conditionals.

## Implementation Phases

### Phase 1: Add Mind.resolve_trait_value_from_template()

**Files**: `public/worker/mind.mjs`, `test/mind.test.mjs`

**Signature**: `resolve_trait_value_from_template(traittype, belief, data)`

**Rationale**:
- `traittype`: Provides metadata (mind_scope, constraints) for future use
- `belief`: Source of origin_state, in_mind validation, subject identity
- `data`: Template to parse
- No explicit `state` param: Implicitly `belief.origin_state` (template parsing at creation time)

**Changes**:
- Add static method with 3-parameter signature
- Import Traittype for type annotation
- Move Mind template detection logic from traittype.mjs
- Handle plain object templates (learn specs)
- Handle `{_type: 'Mind'}` format, stripping _type before delegation
- Return data as-is if not a template

**Tests** (6 tests added):
- Mind template with plain object → creates Mind instance
- Mind template with `_type` field → creates Mind instance
- Non-template data (Mind instance) → returns as-is
- Null/undefined data → returns as-is
- Missing origin_state → throws error

### Phase 2: Update Traittype to Use Class Resolvers

**Files**: `public/worker/traittype.mjs`, `test/traittype.test.mjs`

**Implemented Design**:
- No delegation pattern - direct assignment in constructor eliminates indirection
- `resolve_trait_value_from_template` assigned as instance method during construction
- For type classes: wraps `Class.resolve_trait_value_from_template(traittype, belief, data)`
- For other types: uses compiled resolver from `_build_resolver()`

**Changes**:
- Added `static type_class_by_name` registry with core classes (Mind, State, Belief, Subject)
- Constructor looks up type class and assigns `resolve_trait_value_from_template` directly
- Documented method in class body (shows signature, notes it's constructed during init)
- Documented at assignment site (explains construction logic)
- Removed all Mind-specific logic from Traittype (Phases 3 & 4 obsolete)
- Updated tests to check public method instead of `_resolver` property

**Result**:
- No `_resolver` property needed
- No wrapper method overhead
- No runtime conditionals - resolver chosen at construction time
- Mind logic lives in Mind class only
- Generic infrastructure stays generic

### Phase 3: Rename _resolver to _compiled_resolver

**Files**: `public/worker/traittype.mjs`

**Changes**:
- Rename `_resolver` → `_compiled_resolver` throughout
- Update `_build_resolver()` to build `_compiled_resolver`
- Update `resolve_trait_value_from_template()` to call `_compiled_resolver`

**Rationale**: "compiled" indicates a function built once during initialization for repeated execution, following patterns from template engines and compilers.

**Tests**:
- No functional changes - rename only
- Verify existing tests pass

### Phase 4: Clean Up Mind-Specific Logic from Traittype

**Files**: `public/worker/traittype.mjs`

**Changes**:
- Remove Mind template detection from `resolve_trait_value_from_template()`
- Remove Mind-specific assertions
- Simplify `_resolve_item()` if any Mind logic remains

**Tests**:
- Verify no Mind-specific conditionals remain
- All existing tests pass (logic moved, not changed)

### Phase 5: Documentation

**Files**: `docs/IMPLEMENTATION.md`, inline JSDoc

**Documentation updates**:
- Document delegation pattern in IMPLEMENTATION.md
- Add JSDoc to static resolver methods
- Document when to implement type-specific resolvers
- Note that this follows toJSON/from_json pattern

**Examples**:
- When to add resolver: complex template formats, validation, nested construction
- When to skip resolver: simple types that can be validated generically

## Current Status

**COMPLETE** - 2025-10-27

- [x] Phase 1: Add Mind.resolve_trait_value_from_template() (COMPLETE)
- [x] Phase 2: Update Traittype to use class resolvers (COMPLETE)
- [x] Phase 3: Rename _resolver to _compiled_resolver (OBSOLETE - already done in Phase 2)
- [x] Phase 4: Clean up Mind-specific logic from Traittype (OBSOLETE - already done in Phase 2)
- [x] Phase 5: Extended to Archetype.resolve_trait_value_from_template() (COMPLETE)
- [x] Phase 6: Removed obsolete _resolve_item() method (COMPLETE)

## Success Criteria

1. **No type-specific conditionals in Traittype**: No `if (this.data_type === 'Mind')` checks ✅
2. **Mind owns its resolution logic**: All Mind template detection lives in Mind class ✅
3. **Follows existing patterns**: Same delegation as toJSON/from_json ✅
4. **Backward compatible**: All existing tests pass without modification ✅
5. **Clear naming**: Methods documented to indicate construction-time behavior ✅

## Backlog

- ~~**Rename Traittype.inspect()**: Method name should better reflect its purpose~~ ✅ **COMPLETE** - Renamed to `to_inspect_view()` to match pattern in Belief, Mind, State, Subject

## Design Notes

**Why delegation over inheritance?**
- Type classes (Mind, State) are already defined
- Adding static method is simpler than creating resolver subclasses
- Follows existing serialization pattern (toJSON, from_json)

**Type class lookup**:
- Simple map in Traittype._get_type_class()
- Could be moved to DB registry if needed
- Only looks up classes that might have resolvers

**Future extensions**:
- State could add resolver for State-specific templates
- Belief could add resolver for complex belief templates
- Pattern scales to any registered type
