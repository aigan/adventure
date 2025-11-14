# GUI Requirements

What the GUI (client) needs from worker messages to function correctly.

---

## Topic System Overview

The GUI organizes everything as **topics** that can be clicked/selected:

```javascript
Topic = {
  main: Menu,              // Root menu (main content area)
  topics: {},              // All topics by slug
  selected: Topic|null     // Currently selected topic
}
```

### Topic Types

**1. Menu**:
```javascript
{
  is_menu: true,
  topics: [],
  next_id: number,
  slug: string,
  parent?: Topic,
  dialog?: HTMLDialogElement
}
```

**2. Entity Topic** (clickable entity in text):
```javascript
{
  id: number,
  parent: Menu,
  subject: BakedObservation,  // Has is: 'entity'
  slug: string,
  element?: HTMLElement
}
```

**3. Action Topic** (action in dropdown menu):
```javascript
{
  id: number,
  parent: Menu,
  subject: ActionObject,      // Has do: '...'
  slug: string,
  element?: HTMLElement
}
```

---

## Required Message Formats

### 1. Baked Observation (Entity)

**Purpose**: Represents a clickable entity in the narrative text

**Current format** (`narrator.mjs:78-85`):
```javascript
{
  id: number,                    // Subject ID
  description_short: string,     // Display text
  actions: Action[],             // Available actions
  is: 'entity'                   // Type discriminator
}
```

**Where used**:
- Embedded in template tag results sent via `main_add`
- GUI creates topic with this as `.subject`
- Click on entity → show dropdown of `.actions`

**Required fields**:
- ✅ `id` - Used to match topics in `subject_update` (line 92)
- ✅ `description_short` - Used by `desig()` to display entity name (line 417)
- ✅ `actions` - Used to build action menu (line 290)
- ✅ `is: 'entity'` - Used to filter in `subject_update` (line 91)

### 2. Action Object

**Purpose**: Represents a clickable action in a dropdown menu

**Current format** (in `session.mjs:106-113`):
```javascript
{
  do: string,           // Command name
  label: string,        // Display text
  target_blipp: number, // Metadata for worker
  subject_blopp: number // Metadata for worker
  // ... any other fields
}
```

**Where used**:
- Stored in `BakedObservation.actions[]`
- GUI creates topic with action as `.subject`
- Click on action → send to worker via `Message.send(action.do, action)`

**Required fields**:
- ✅ `do` - Used to determine command name (line 237)
- ✅ `label` - Used by `desig()` to display action text (line 419)
- ❓ Everything else - Round-trips back to worker unchanged

**Note**: Action objects must NOT have `is: 'entity'` or they'll be confused with baked observations.

### 3. Template Tag Result

**Purpose**: Rich text with embedded clickable entities

**Format** (`narrator.mjs:64-71`):
```javascript
{
  strings: TemplateStringsArray,  // Text parts
  values: BakedObservation[]      // Embedded entities
}
```

**Example**:
```javascript
{
  strings: ['You are in ', '.'],
  values: [{
    id: 123,
    description_short: 'courtyard',
    actions: [...],
    is: 'entity'
  }]
}
```

**Processing** (`gui.mjs:62-75`):
1. GUI iterates `strings` and `values` in lockstep
2. Text parts → append as HTML
3. Entity values → create topic, render as `<b class=topic>...</b>`
4. User can click on entity to see actions

**Required**:
- ✅ `strings` - Text parts
- ✅ `values` - Array of baked observations
- Each value must be a valid baked observation

---

## Message Types

### main_add

**Format**:
```javascript
['main_add', ...parts]
```

Where `parts` is array of:
- **Strings**: Plain text
- **Template tag results**: `{strings, values}`

**Example**:
```javascript
['main_add',
  'You see here:',
  {
    strings: ['a ', ' on the ', '.'],
    values: [desk_obs, table_obs]
  }
]
```

**Processing** (`gui.mjs:49-82`):
1. Create `<p>` element
2. For each part:
   - String → append
   - Template tag → expand with clickable entities
3. Join with `\n`, replace newlines with `<br>`
4. Append to main content area

**Required**: At least one part (can be empty array but then nothing happens)

### header_set

**Format**:
```javascript
['header_set', html_string]
```

**Example**:
```javascript
['header_set', 'Location: Courtyard']
```

**Processing** (`gui.mjs:38-41`):
```javascript
header_set( html ){
  el_header.innerHTML = html;
}
```

**Required**: HTML string (can be empty)

### main_clear

**Format**:
```javascript
['main_clear']
```

**Processing** (`gui.mjs:42-45`):
```javascript
main_clear(){
  el_main.innerHTML = "";
}
```

**Required**: No parameters

### subject_update

**Format**:
```javascript
['subject_update', baked_observation]
```

**Example**:
```javascript
['subject_update', {
  id: 123,
  description_short: 'Catalina',
  actions: [...updated actions...],
  is: 'entity'
}]
```

**Processing** (`gui.mjs:87-96`):
```javascript
subject_update([subject]){
  for( const slug in Topic.topics ){
    const subj = Topic.topics[slug].subject;
    if( subj.is !== 'entity' ) continue;        // Filter to entities
    if( subj.id !== subject.id ) continue;      // Match by ID
    Object.assign( subj, subject );             // Mutate cache
  }
}
```

**Purpose**: Update cached baked observation when entity state changes

**Required fields**:
- ✅ `id` - To find matching topics
- ✅ `is: 'entity'` - To filter to entities only
- Any other fields to update (typically `description_short` and `actions`)

**Note**: This assumes mutation - may need rethinking for immutable architecture

---

## Helper Functions

### desig()

**Location**: `gui.mjs:415-420`

```javascript
export function desig( entity ){
  if( entity.description_short ) return entity.description_short;
  if( entity.Labeled ) return entity.Labeled.value;
  if( entity.label ) return entity.label;
  return entity.id;
}
```

**Purpose**: Get display text for any subject (entity or action)

**Fallback chain**:
1. `entity.description_short` (baked observations)
2. `entity.Labeled.value` (old system legacy?)
3. `entity.label` (actions)
4. `entity.id` (last resort)

**What GUI looks for**:
- Baked observations: `description_short`
- Actions: `label`

---

## Summary: Minimum Required Fields

### Baked Observation
```javascript
{
  id: number,               // REQUIRED: For matching in subject_update
  description_short: string, // REQUIRED: For display via desig()
  actions: Action[],        // REQUIRED: For building action menus
  is: 'entity'              // REQUIRED: For filtering in subject_update
}
```

### Action Object
```javascript
{
  do: string,      // REQUIRED: Command name to execute
  label: string,   // REQUIRED: Display text via desig()
  // ... everything else optional, sent back to worker
}
```

### Template Tag Result
```javascript
{
  strings: TemplateStringsArray,   // REQUIRED: Text parts
  values: BakedObservation[]       // REQUIRED: Embedded entities
}
```

---

## Optional/Future Fields

### Baked Observation Extensions

```javascript
{
  // Current required fields
  id: number,
  description_short: string,
  actions: Action[],
  is: 'entity',

  // Possible additions:
  description_long?: string,        // For detailed view
  location?: number,                // Where entity is
  state?: 'visible'|'known'|'remembered',  // Observation type
  traits?: string[],                // Visible traits
  primary_descriptor?: BakedObservation,  // e.g., Gender
  inLocation?: BakedObservation[],  // Nested observations (old system)

  // Old system legacy:
  Labeled?: {value: string},        // Checked by desig() but not used
}
```

### Action Extensions

```javascript
{
  // Current required fields
  do: string,
  label: string,

  // Round-trip metadata (any names work):
  target?: number,        // Subject ID
  actor?: number,         // Subject ID
  about?: number,         // Subject ID
  context?: number,       // Context subject ID

  // Possible future additions:
  enabled?: boolean,      // Can action be selected?
  cost?: number,          // Time/energy cost
  requirements?: string[], // Required conditions
  icon?: string,          // Icon for display
}
```

---

## Design Principles

1. **Type Discrimination**: `is: 'entity'` distinguishes observations from actions
2. **Display Text**: Both entities and actions need human-readable text
   - Entities: `description_short`
   - Actions: `label`
3. **Identity**: Entities need stable IDs for matching in updates
4. **Extensibility**: GUI doesn't care about extra fields - they round-trip to worker
5. **Simple Structure**: Flat objects, no deep nesting (except template tag `values`)

---

## Questions for Future

1. **subject_update**: Keep with immutable states? Or remove?
2. **Nested observations**: Do we want `inLocation: [...]` like old system?
3. **Description variants**: Need both `description_short` and `description_long`?
4. **Action state**: Should actions indicate if they're currently available/enabled?
5. **Type safety**: Add more type discriminators beyond `is: 'entity'`?

---

## Validation Checklist

When creating messages, ensure:

**Baked observations have**:
- [ ] `id` (number)
- [ ] `description_short` (non-empty string)
- [ ] `actions` (array, can be empty)
- [ ] `is: 'entity'` (exact string)

**Actions have**:
- [ ] `do` (non-empty string)
- [ ] `label` (non-empty string)
- [ ] No `is: 'entity'` field

**Template tag results have**:
- [ ] `strings` (TemplateStringsArray or array of strings)
- [ ] `values` (array of valid baked observations)
- [ ] `strings.length === values.length + 1`

**Messages follow format**:
- [ ] `['main_add', ...parts]`
- [ ] `['header_set', string]`
- [ ] `['main_clear']`
- [ ] `['subject_update', baked_observation]`
