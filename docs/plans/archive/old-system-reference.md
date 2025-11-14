# Old System Reference

Reference documentation for the "ancient" system found in `lab/ancient-worker/`. Understanding this helps explain why the current GUI works the way it does.

---

## Overview

The old system used:
- **Mutable entities** with version history
- **Global world** variable
- **Entity references** by ID with version (`{id, v}`)
- **Automatic message enrichment** at worker boundary
- **In-place mutation** for state changes

---

## Data Model

### Core Classes (`lab/ancient-worker/db.mjs`)

#### World

```javascript
class World {
  constructor(){
    this.entity_history = new Map();  // Map<id, EntityHistory>
    this.Time = undefined;             // Reserved for Time component
    this.id = World.cnt ++;
    World.store[this.id] = this;       // Global registry
  }

  static get( id ){
    return World.store[id];
  }

  get_entity_current( id ){
    const eh = this.get_history_by_id( id );
    return eh.current()  // Latest version
  }
}
```

**Global instance** (`lab/ancient-worker/world.mjs:134`):
```javascript
export const world = new DB.World;
world.Adventure = Adventure;
```

#### EntityHistory

```javascript
class EntityHistory {
  constructor( world_id, label ){
    this.id = ++ EntityHistory.cnt;   // Unique entity ID
    this.label = label;                // Debug label
    this.is_archetype = undefined;     // Archetype name if template
    this._world = world_id;            // Which world
    this.versions = [];                // Array of Entity versions
  }

  current(){
    return this.versions.slice(-1)[0];  // Latest version
  }
}
```

#### Entity

```javascript
class Entity {
  constructor(world_id, id, v){
    this.id = id;               // Entity ID (stable)
    this.v = v;                 // Version number
    this._world = world_id;     // World ID
    this.bases = [];            // Base entities (inheritance)
    this.traits = {};           // Trait instances
    this.inheritors = new Set();    // Entities using this as base
    this.referenced = {};       // Reverse references
  }

  get world(){
    return World.store[this._world];
  }

  get( trait, pred ){
    // Breadth-first search through inheritance chain
    const queue = [this];
    let t = null;

    for(let i = 0; i < queue.length; i++) {
      const e = queue[i];
      t = e.traits[trait];
      if(t) break;
      queue.push( ...(e.bases||[]) );
    }

    if(!t) return null;
    return pred ? t[pred] : t;
  }

  modify( trait, props ){
    // Mutate trait in place
    const _c = this.traits;
    if( _c[trait] ){
      return Object.assign( _c[trait], props );
    }

    const Cc = Trait_def.definition[trait];
    return this.add_trait( Cc, props );
  }
}
```

**Key differences from new system**:
- `entity._world` property (vs `state.in_mind`)
- `entity.get()` with inheritance (vs `belief.get_trait()`)
- `entity.modify()` mutates (vs immutable state branching)

#### Trait

```javascript
class Trait {
  constructor(world_id, eid){
    this._world = world_id;
    this._eid = eid;
  }

  entity( pred='value' ){
    const {id,v} = this[pred];
    return this.world.entity_history.get(id).versions[v];
  }
}
```

**Entity references in traits**:
```javascript
// Stored as:
{id: 123, v: 5}  // Specific version

// Accessed via:
trait.entity()  // Returns Entity instance
```

---

## Message Flow

### Worker Message Handler (`lab/ancient-worker/worker.mjs:40-61`)

```javascript
let world, DB;  // Module-level variables

async function init(){
  ({world} = await import("./world.mjs"));
  DB = await import("./db.mjs");
  await import("./channel.mjs");
  world.player_enter_location();
}

const dispatch = {
  ping(){ postMessage('pong'); },
  async start(){
    log('Starting');
    postMessage(['main_clear'])
    await init();
  },
}

export function handler_register( label, handler ){
  dispatch[label] = handler;
}

addEventListener('message', async e =>{
  let msg = e.data;
  if( typeof msg === 'string') msg = [msg];
  const [cmd, data={}, ackid] = msg;

  if( cmd === "start" ) return await dispatch.start(data);

  if( !dispatch[cmd] ) throw(Error(`Message ${cmd} not recognized`));

  // === ENRICHMENT ===
  if( !data.from ) data.from = world.Adventure.player;
  if( data.from ) data.world = DB.World.get(data.from._world);
  if( data.target ) data.target = data.world.get_entity_current( data.target );

  const res = await dispatch&#91;cmd&#93;(data);

  if( ackid ){
    postMessage(['ack', ackid, res ]);
  }
}, false);
```

**Enrichment logic**:
1. Default `from` to player
2. Get world from actor's `_world` property
3. Resolve target ID to current Entity instance

### Action Handlers

#### greet Handler (`lab/ancient-worker/dialog.mjs:35-61`)

```javascript
handler_register( 'greet', async context =>{
  const {from,target} = context;  // Resolved entities

  // Observe target
  let obs = observation(from,target);

  // Display action
  action: {
    const hdef = description(obs, {form:'definite'});
    const lines = [`▸ You greet ${hdef}.`];
    postMessage(['main_add', ...lines ]);
  }

  // Execute game logic - MUTATE target
  response: {
    target.modify('Attention', {focus:from});  // In-place mutation
    const html_target = ucfirst(description(obs,{form:'third-subj'}));
    const lines = [`${html_target} notices you.`];
    postMessage(['main_add', ...lines ]);
  }

  // Refresh UI with updated observation
  obs = observation(from,target);
  postMessage(['subject_update', bake_obs(obs)]);

  return "stay";  // Navigation hint
});
```

**Pattern**:
- Receive resolved entities
- Mutate entities directly
- Send `subject_update` to refresh GUI
- Return navigation hint

#### ask-about Handler (`lab/ancient-worker/dialog.mjs:63-112`)

```javascript
handler_register('ask-about', async context =>{
  const {from,target,world} = context;

  // Additional resolution using world
  const subject = world.get_entity_current( context.subject );

  // ... handler logic
});
```

**Pattern**: Use `world` from context to resolve additional entities

---

## Observation System

### observation() Function (`lab/ancient-worker/observation.mjs:76-107`)

```javascript
export function observation( agent, target, perspective ){
  const observed = { entity: target, actions: [] };

  if( !perspective ) perspective = agent;
  if( target === perspective ){
    observed.here = true;
  }

  // Apply pattern-specific observation
  const pattern = target.get('ObservationPattern','value');
  if( pattern ){
    observation_pattern&#91;pattern&#93;({agent,target,perspective,observed});
  }

  // Recursively observe entities in location
  const seeing_inloc = [];
  const inloc = target.get_referenced("InLocation");

  const world = target.world;
  for( const e of inloc ){
    if( e === world.Adventure.player ) continue;
    const obi = observation( agent, e, perspective );
    seeing_inloc.push( obi );
  }

  if( seeing_inloc.length ){
    observed.inLocation = seeing_inloc;
  }

  return observed;
}
```

**Observation structure**:
```javascript
{
  entity: Entity,                 // Entity being observed
  here: true,                     // Optional: self/location
  primary_descriptor: Entity,     // Optional: e.g., Gender
  knownAs: "Catalina",           // Optional: known name
  actions: [{...}],               // Available actions
  inLocation: [...]               // Nested observations
}
```

### observing_human Pattern (`lab/ancient-worker/observation.mjs:109-154`)

```javascript
function observing_human({agent, target, observed}){
  const gender = target.get_entity('HasGender');
  if( gender ) observed.primary_descriptor = gender;

  // Check memory for known name
  const memory = Ponder.memoryOf( agent, target );
  if( memory ){
    const name = memory.get('Name','value');
    if( name ) observed.knownAs = name;
  }

  // Add actions based on state
  if( Dialog.has_attention({agent,target}) ){
    // In dialog - can ask questions
    observed.actions.push({
      do: 'ask-about',
      target: target.id,
      subject: target.id,
      label:`ask about herself`,
    });

    // Ask about other known entities
    const about = agent.get('HasThoughts','about');
    for( const [subject,thought] of about ){
      if( subject === target ) continue;
      const desig = Ponder.designation(agent,subject);
      observed.actions.push({
        do: 'ask-about',
        target: target.id,
        subject: subject.id,
        label:`ask about ${desig}`,
      });
    }
  } else {
    // Not in dialog - can greet
    observed.actions.push({
      do:'greet',
      target: target.id,
      label:"Initiate dialog",
    });
  }
}
```

**Pattern**: Observation patterns add actions based on entity type and state

### bake_obs() Function (`lab/ancient-worker/observation.mjs:22-29`)

```javascript
export function bake_obs( obs ){
  const obj = { id: obs.entity.id };  // Entity ID
  obj.description_short = obs.knownAs || description( obs );
  obj.actions = obs.actions;
  obj.is = 'entity';
  return obj;
}
```

**Baked format**: Ready for GUI consumption

### observation_text() Function (`lab/ancient-worker/observation.mjs:158-180`)

```javascript
export function observation_text( obs ){
  const lines = [];

  if( !obs.here ){
    lines.push( tt`${obs}` );  // Template tag with baked obs
  }

  if( obs.inLocation ){
    if( obs.here ){
      lines.push( "You see here:" );
    } else {
      const edesig = description( obs.entity );
      lines.push( `In ${edesig} you see:` );
    }

    for( const subobs of obs.inLocation ){
      lines.push( ... observation_text( subobs ));
    }
  }

  return lines;
}
```

**Returns**: Array of strings and template tag results for `main_add`

---

## GUI Integration

### Player Enters Location (`lab/ancient-worker/world.mjs:261-279`)

```javascript
world.player_enter_location = ()=>{
  const loc = Adventure.player.get('InLocation').entity();

  let location_name = loc.get('Description','short');
  postMessage(['header_set', `Location: ${location_name}`]);

  const observed = observation( Adventure.player, loc, loc );
  const lines = observation_text( observed );

  postMessage(['main_add', ...lines ]);
}
```

**Pattern**:
1. Get player's location
2. Generate observation
3. Format to text
4. Send to GUI

### subject_update Usage

**When sent**:
- After mutating entity during action
- To refresh GUI's cached observation

**Handler** (`public/lib/gui.mjs:87-96`):
```javascript
subject_update([subject]){
  log('update subject', desig(subject));
  for( const slug in Topic.topics ){
    const subj = Topic.topics[slug].subject;
    if( subj.is !== 'entity' ) continue;
    if( subj.id !== subject.id ) continue;  // Match by ID
    Object.assign( subj, subject );         // Mutate cache
  }
}
```

**Purpose**: Update GUI's cached baked observation when entity changes

---

## Key Architectural Patterns

### 1. Global State

```javascript
// Module-level variables accessible everywhere
export const world = new DB.World;
world.Adventure = {
  player: Entity
};
```

**Benefits**:
- Easy access from any handler
- No need to pass context

**Drawbacks**:
- Hard to test
- Hard to have multiple worlds
- Implicit dependencies

### 2. Mutable Entities

```javascript
// Change entity in place
entity.modify('Attention', {focus: from});

// Entity is already changed
const updated = entity.get('Attention');  // New value
```

**Benefits**:
- Simple to understand
- Matches typical OOP patterns

**Drawbacks**:
- Hard to track changes
- Hard to undo
- Hard to implement time travel
- Race conditions possible

### 3. Version History

```javascript
class EntityHistory {
  versions: Entity[]  // All versions

  current(){
    return this.versions.slice(-1)[0];
  }
}
```

**Benefits**:
- Can track entity changes
- Can reference specific versions

**Drawbacks**:
- History kept but rarely used
- Memory overhead
- Complexity in managing versions

### 4. Entity References

```javascript
// Trait stores reference as:
{id: 123, v: 5}

// Resolved via:
trait.entity()  // Returns Entity at that version
```

**Benefits**:
- Can reference specific versions
- Stable IDs

**Drawbacks**:
- Must resolve every access
- Version management complexity

### 5. Automatic Enrichment

```javascript
// Before handler runs
if( !data.from ) data.from = world.Adventure.player;
if( data.target ) data.target = data.world.get_entity_current( data.target );
```

**Benefits**:
- Handlers get resolved entities
- Centralized resolution logic
- Clean handler code

**Drawbacks**:
- Implicit magic
- Harder to debug
- Assumes specific field names

---

## Comparison with New System

| Feature | Old System | New System |
|---------|------------|------------|
| **State** | Mutable entities | Immutable states |
| **Identity** | Entity ID + version | Subject (sid) |
| **Reference** | `{id, v}` | Subject ID (sid) |
| **Access** | `world.get_entity_current(id)` | `subject.get_belief_by_state(state)` |
| **Change** | `entity.modify()` | `state.branch_state()` |
| **World** | Global variable | Session instance |
| **Player** | `world.Adventure.player` | `session.player` |
| **Inheritance** | Entity bases | Belief bases + Archetypes |
| **Traits** | Trait instances | Trait data via TraitType |
| **Observation** | Observes Entity | Observes Belief |
| **Enrichment** | Automatic | Missing (to be added) |

---

## What to Keep from Old System

✅ **Good patterns to preserve**:
- Message enrichment at worker boundary
- Observation system (adapted for Beliefs)
- Template tag pattern for rich text
- Handler registration system
- Baked observation format
- Action object structure

✅ **Concepts to adapt**:
- Resolve IDs before handler execution
- Default actor to player
- Provide state/session context to handlers
- Generate observations from perspective
- Format observations for display

❌ **What NOT to copy**:
- Global mutable world
- In-place entity modification
- Version references in every field
- `subject_update` with mutation (needs new approach)

---

## Migration Lessons

### What Broke in Migration

1. **Message enrichment removed** but not replaced
   - Old: Automatic ID → Entity resolution
   - New: Handlers get raw IDs

2. **Global world removed** but not replaced
   - Old: `world` accessible everywhere
   - New: Session created then lost

3. **subject_update assumes mutation**
   - Old: Mutate entity, send update, GUI mutates cache
   - New: Immutable states incompatible with this pattern

### What Still Works

1. **GUI code unchanged** - still works!
2. **Message format compatible** - just different IDs
3. **Template tag system** - works perfectly
4. **Baked observation format** - nearly identical

### What Needs Fixing

1. ✅ Restore message enrichment (adapted for Subjects/States)
2. ✅ Store Session reference for handlers
3. ⚠️ Rethink or remove subject_update
4. ✅ Port observation system to new data model

---

## Summary

The old system's architecture was sound for a mutable entity system. The new immutable architecture needs the same patterns but adapted:

- **Keep**: Enrichment, observations, handlers, formats
- **Adapt**: IDs → sids, Entities → Beliefs, mutation → branching
- **Replace**: Global world → Session, subject_update → regenerate

Understanding the old system explains why the GUI works the way it does and what the new system needs to provide.
