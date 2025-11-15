# Exposure Metadata for Observation System

**Status**: ✅ **COMPLETED** (2025-11-09)

**Goal**: Add enum datatype and exposure metadata to support observation mechanics - what can be seen, touched, or otherwise perceived about entities.

**Related**:
- docs/notes/observations.md - Design notes on trait exposure system
- docs/notes/observation_recognition_spec.md - Full observation and recognition system spec
- docs/ALPHA-1.md Stage 1 - LOOK command implementation (needs exposure data)

## Summary of Implementation

Successfully implemented exposure metadata infrastructure with enum validation support. This provides the foundation for the observation system and future LOOK command.

### What Was Built

**Part 1: Enum Datatype Support**
- Added `values` field to Traittype for enum validation
- Enum validation in trait resolution with clear error messages
- Works with any string-based trait type

**Part 2: Exposure Metadata**
- Added `@form` meta-trait with enum values: `'solid'`, `'liquid'`, `'vapor'`, `'olfactory'`, `'auditory'`, `'intangible'`
- Added `exposure` field to Traittype for sensory modalities: `'visual'`, `'tactile'`, `'spatial'`, `'internal'`
- Applied exposure to core traittypes: `@about`, `location`, `color`, `mind`
- Added `@form: 'solid'` to `ObjectPhysical` archetype (auto-inherits to all physical entities)

### Test Coverage

- **297 tests passing** (11 new tests added)
- Enum validation: accepts valid values, rejects invalid values, clear error messages
- Exposure storage: correct defaults, inheritance through archetypes, override capability
- All existing tests still pass, TypeScript and ESLint clean

## Implementation Details

### Enum Support

**File**: `public/worker/traittype.mjs`

Added `values` field and validation:
```javascript
constructor(label, def) {
  this.label = label
  if (typeof def === 'string') {
    this.values = null
    this.exposure = null
    // ...
  } else {
    this.values = def.values ?? null
    this.exposure = def.exposure ?? null
    // ...
  }
}
```

Validation in resolver:
```javascript
// Enum validation if values are specified
if (allowed_values && !allowed_values.includes(data)) {
  throw new Error(`Invalid value '${data}' for trait '${this.label}'. Must be one of: ${allowed_values.join(', ')}`)
}
```

### Exposure Metadata

**File**: `public/worker/world.mjs`

Traittypes with exposure:
```javascript
const traittypes = {
  '@about': {
    type: 'Subject',
    mind: 'parent',
    exposure: 'internal'  // Not directly observable
  },
  '@form': {
    type: 'string',
    values: ['solid', 'liquid', 'vapor', 'olfactory', 'auditory', 'intangible']
  },
  location: {
    type: 'Location',
    exposure: 'spatial'  // Observable through spatial awareness
  },
  color: {
    type: 'string',
    exposure: 'visual'  // Observable by looking
  },
  mind: {
    type: 'Mind',
    composable: true,
    exposure: 'internal'  // Not physically observable
  },
};
```

Archetypes with @form:
```javascript
const archetypes = {
  ObjectPhysical: {
    bases: ['Thing'],
    traits: {
      '@form': 'solid',  // Common case: tangible visible objects
      location: null,
      color: null,
    },
  },
  Mental: {
    bases: ['Thing'],
    traits: {
      mind: null,
      // No @form - intangible mental states
    },
  },
};
```

### Type Definitions

**File**: `public/worker/db.mjs`

```javascript
/**
 * @typedef {object} TraitTypeSchema
 * @property {string} type - Base type
 * @property {ArrayConstructor} [container] - Container constructor
 * @property {number} [min] - Minimum array length
 * @property {number} [max] - Maximum array length
 * @property {boolean} [composable] - Enable multi-base composition
 * @property {string[]} [values] - Enum values for validation
 * @property {string} [exposure] - Sensory modality: 'visual', 'tactile', 'spatial', 'internal'
 * @property {'parent'|'own'} [mind] - Mind scope for Subject references
 */
```

## Usage Examples

### Defining Traittypes with Exposure

```javascript
DB.register_traittype('@form', {
  type: 'string',
  values: ['solid', 'liquid', 'vapor', 'olfactory', 'auditory', 'intangible']
});

DB.register_traittype('color', {
  type: 'string',
  exposure: 'visual'
});

DB.register_traittype('texture', {
  type: 'string',
  exposure: 'tactile'
});
```

### Creating Entities with Form

```javascript
// Inherits @form: 'solid' from ObjectPhysical
const rock = Belief.from_template(state, {
  bases: ['PortableObject'],
  traits: {
    '@label': 'rock',
    color: 'gray',
  }
});

// Override form for special entities
const ghost = Belief.from_template(state, {
  bases: ['Actor'],
  traits: {
    '@label': 'ghost',
    '@form': 'intangible',  // Can't be touched
  }
});
```

### Querying Exposure

```javascript
const color_tt = DB.get_traittype('color');
console.log(color_tt.exposure);  // 'visual'

const form_tt = DB.get_traittype('@form');
console.log(form_tt.values);  // ['solid', 'liquid', 'vapor', ...]
```

## Next Steps

This infrastructure is ready for the observation system to use:

1. **LOOK command** can filter traits by `exposure: 'visual'`
2. **TOUCH command** can filter traits by `exposure: 'tactile'`
3. **Spatial awareness** can use `exposure: 'spatial'`
4. **Internal state** (`exposure: 'internal'`) hidden from external observation

See `docs/notes/observation_recognition_spec.md` for full observation system design.

## Tests Added

**File**: `test/traittype.test.mjs`

New test suite covering:
- Enum validation accepts valid values
- Enum validation rejects invalid values with clear error messages
- Enum error message lists allowed values
- `values` property stored on traittype
- `values` defaults to null when not specified
- `exposure` property stored on traittype
- `exposure` defaults to null when not specified
- `@form` trait inherits through archetype bases
- `@form` validates against enum values
- `@form` can override inherited value
- `@form` appears in `get_traits()` iteration
- Archetype default values appear in iteration

All tests passing, no regressions.

## Documentation

Added to CHANGELOG.md (2025-11-09):
- Traittypes support `exposure` field for sensory modalities
- Traittypes support `values` field for enum validation
- Added `@form` meta-trait with enum values
- `ObjectPhysical` archetype includes `@form: 'solid'`
- Foundation for LOOK command and observation mechanics
