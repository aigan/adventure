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
 * @property {string} [mind] - Mind scope for Subject resolution
 * @property {boolean} [composable] - Whether to compose values from multiple bases
 * @property {string[]} [values] - Allowed values for enum validation
 * @property {string} [exposure] - Observation modality required to perceive this trait
 */
```

### Future Integration Hook

**File**: `public/worker/state.mjs`

Added TODO in `recognize()`:
```javascript
// TODO: Sort by confidence (for now just return first 3)
// TODO: Limit to explicit knowledge beliefs (not observation events, etc.)
// TODO: Filter by acquaintance threshold - beliefs with low acquaintance
//       may not trigger recognition during perception events
return beliefs_about_subject.slice(0, 3)
```

## Vocabulary

### Trait Exposure (Sensory Modalities)
- **'visual'** - color, surface appearance, shape, size
- **'tactile'** - texture, temperature, weight, density (requires touch)
- **'spatial'** - location, proximity (spatial awareness)
- **'internal'** - thoughts, feelings, memories, @about (not observable)
- **'olfactory'** - smell, scent (future)
- **'auditory'** - sound, noise (future)

### Entity @form (Physical Nature)
- **'solid'** - Common tangible visible objects (hammer, person, wall)
- **'liquid'** - Water, oil (visible, flows, not solid)
- **'vapor'** - Fog, smoke, steam (visible but intangible)
- **'olfactory'** - Smell, odor (perceived via smell only, no visual/solid form)
- **'auditory'** - Ambient sound (perceived via hearing only)
- **'intangible'** - Thoughts, distant entities, abstract concepts

## Design Principles

### Optimize for the Common Case
- Most entities inherit exposure rules automatically via archetypes
- Zero overhead for typical objects
- Define once at archetype/traittype level, inherit everywhere
- Example: All descendants of `ObjectPhysical` get `@form: 'solid'` for free

### Support Edge Cases
- Override `@form` on specific entities (e.g., fog: `@form: 'vapor'`)
- Enum validation prevents typos while staying flexible
- Can migrate enums to Archetype + Class pattern when forms need behavior

### Inheritance Example

```javascript
// Define once on archetype
ObjectPhysical: {
  traits: {
    '@form': 'solid',  // Enum-validated
    color: null,
    location: null
  }
}

// All descendants inherit automatically
PortableObject extends ObjectPhysical  // ✓ @form: 'solid'
Location extends ObjectPhysical        // ✓ @form: 'solid'
Actor extends ObjectPhysical           // ✓ @form: 'solid'

// Thousands of entities inherit for free
hammer: {bases: ['PortableObject']}    // ✓ @form: 'solid'
workshop: {bases: ['Location']}        // ✓ @form: 'solid'

// Override when needed
fog: {
  bases: ['Thing'],
  traits: {
    '@form': 'vapor',  // Validated against enum values
    density: 'thick'
  }
}
```

## Future Integration

Once exposure metadata exists, these integrations become possible:

### LOOK Command (Alpha 1 Stage 1)
```javascript
// Get all visible traits from entities in current location
const visible_traits = entity.get_traits_with_exposure('visual')
```

### Perception Events
```javascript
// Create observation with only accessible traits
const observation = observe(entity, {
  modalities: ['visual', 'spatial']
})
```

### learn_about() Integration
```javascript
// Filter trait_names by what the observation modality exposes
const observable_traits = trait_names.filter(t =>
  traittype[t].exposure in observation.modalities
)
state.learn_about(belief, observable_traits, source_state)
```

### Acquaintance/Recognition
```javascript
// recognize() uses acquaintance threshold to determine recognition
const candidates = recognize(perceived_entity)
  .filter(b => b.traits.get('acquaintance') > threshold)
```

## Migration Path: Enum to Archetype + Class

When @form values need behavior (e.g., `form.can_contain_objects()`), migrate from enum to Archetype pattern:

```javascript
// Current: Enum (lightweight, validation only)
'@form': {
  type: 'string',
  values: ['solid', 'liquid', 'vapor']
}

// Future: Archetype + Class (when behavior needed)
Form: {archetype with properties}
solid: {bases: ['Form'], traits: {visual_accessible: true, tactile_accessible: true}}
liquid: {bases: ['Form'], traits: {visual_accessible: true, tactile_accessible: false}}

class Form {
  get_accessible_modalities() { ... }
  can_contain_objects() { ... }
}
```

## Notes

**Why this matters:**
- Foundation for observation mechanics (LOOK command, perception events)
- Enables realistic perception (can't see internal states, can't feel color from distance)
- Supports detective gameplay (what clues are observable?)
- Extensible for future needs (stealth, detection difficulty, etc.)

**Design trade-offs:**
- Kept exposure optional for gradual adoption
- Empty/null exposure means "no restrictions" for now
- Can add more exposure modalities as needed (olfactory, auditory already defined)
- Enum approach is simple now, can migrate to Archetype+Class later if forms need behavior

**Related systems:**
- `@acquaintance` trait (future) - determines recognition probability
- `spatial_prominence` (future) - how noticeable entity is in scene
- Observation events (future) - track act of perceiving separately from resulting belief
