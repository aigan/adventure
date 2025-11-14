# Message Enrichment Pattern

## Overview

The old system had automatic message enrichment that converted IDs to instances before handlers ran. This made handlers clean and simple. The new system needs equivalent functionality adapted for immutable architecture.

---

## The Problem

### What Currently Happens

1. **GUI sends** action with subject IDs:
   ```javascript
   Message.send('look', {
     do: 'look',
     target_blipp: 123,     // Subject ID
     subject_blopp: 456,    // Subject ID
     label: 'Look around'
   })
   ```

2. **Worker receives** raw message:
   ```javascript
   const [cmd, data, ackid] = msg;
   // cmd = 'look'
   // data = {do: 'look', target_blipp: 123, subject_blopp: 456, label: '...'}
   ```

3. **Handler receives** raw data:
   ```javascript
   export function do_look(context) {
     // context = {do: 'look', target_blipp: 123, subject_blopp: 456, ...}
     // Can't do anything with just IDs!
   }
   ```

**Result**: Handler has IDs but no way to resolve them to Beliefs.

---

## Old System Solution

### Automatic Enrichment (`lab/ancient-worker/worker.mjs:50-52`)

```javascript
addEventListener('message', async e =>{
  const [cmd, data={}, ackid] = msg;

  if( cmd === "start" ) return await dispatch.start();
  if( !dispatch[cmd] ) throw(Error(`Message ${cmd} not recognized`));

  // === ENRICHMENT ===
  if( !data.from ) data.from = world.Adventure.player;
  if( data.from ) data.world = DB.World.get(data.from._world);
  if( data.target ) data.target = data.world.get_entity_current( data.target );

  const res = await dispatch[cmd]\(data);

  if( ackid ){
    postMessage(['ack', ackid, res ]);
  }
});
```

**What it did**:
1. Default `from` to player if not specified
2. Look up world from actor's `._world` property
3. Convert target entity ID to current Entity instance

**Result**: Handler received `{from: Entity, target: Entity, world: World}`

### Handler Pattern (`lab/ancient-worker/dialog.mjs:35-36`)

```javascript
handler_register('greet', async context =>{
  const {from, target} = context;  // Destructure resolved entities

  // Use entities directly
  let obs = observation(from, target);
  target.modify('Attention', {focus: from});
  // ...
});
```

Clean and simple because enrichment already resolved everything.

---

## New System Solution

### Required Differences

| Old System | New System |
|------------|------------|
| Global `world` variable | Session instance |
| `world.Adventure.player` | `session.player` |
| `entity._world` property | `state.in_mind` |
| `world.get_entity_current(id)` | `subject.get_belief_by_state(state)` |
| Entity IDs | Subject IDs (sids) |
| Mutable entities | Immutable states |

### Proposed Implementation

#### Step 1: Store Session Globally

**File**: `public/worker/worker.mjs`

```javascript
import { Session } from "./session.mjs"
import { Subject } from "./subject.mjs"

/** @type {Session|null} */
let current_session = null;

/**
 * Get current game session
 * @returns {Session}
 * @throws {Error} If session not initialized
 */
export function get_current_session() {
  if (!current_session) throw new Error('Session not initialized');
  return current_session;
}
```

Update `dispatch.start()`:
```javascript
async start(){
  log('Starting');
  postMessage(['main_clear'])
  current_session = new Session();  // Store globally
  await current_session.start()
}
```

#### Step 2: Create Resolver Function

**File**: `public/worker/worker.mjs`

```javascript
/**
 * Resolve action subject IDs to Beliefs in current session state
 * Equivalent to old system's message enrichment
 *
 * @param {any} data - Raw action data from GUI
 * @returns {any} Enriched context with resolved Beliefs
 */
function resolve_action_context(data) {
  const session = get_current_session();
  const state = session.state;

  if (!state) throw new Error('Session state not initialized');

  const context = { ...data };

  // Resolve actor (from 'subject' field or default to player)
  // Note: Using 'subject' based on recommendation in message-formats.md
  if (data.subject) {
    const actor_subject = Subject.get_by_sid(data.subject);
    if (!actor_subject) {
      throw new Error(`Subject not found: ${data.subject}`);
    }
    context.actor = actor_subject.get_belief_by_state(state);
  } else if (session.player) {
    // Default to player if no actor specified
    context.actor = session.player;
  }

  // Resolve target
  if (data.target) {
    const target_subject = Subject.get_by_sid(data.target);
    if (!target_subject) {
      throw new Error(`Subject not found: ${data.target}`);
    }
    context.target = target_subject.get_belief_by_state(state);
  }

  // Add session context for handler use
  context.state = state;
  context.session = session;

  return context;
}
```

#### Step 3: Apply Enrichment Before Dispatch

**File**: `public/worker/worker.mjs`

```javascript
addEventListener('message', async e =>{
  let msg = e.data;
  if( typeof msg === 'string') msg = [msg];
  const [cmd, data={}, ackid] = msg;

  if( cmd === "start" ) return await dispatch.start();

  if( !dispatch[cmd] ) throw(Error(`Message ${cmd} not recognized`));

  // === NEW ENRICHMENT ===
  const context = resolve_action_context(data);

  // log('dispatch', cmd, context);
  const res = await dispatch[cmd]\(context);

  if( ackid ){
    postMessage(['ack', ackid, res ]);
  }
}, false);
```

#### Step 4: Update Handler Signature

**File**: `public/worker/narrator.mjs`

```javascript
/**
 * Handle look action
 * @param {Object} context - Enriched action context
 * @param {Belief} context.actor - Who is looking
 * @param {Belief} context.target - What they're looking at
 * @param {State} context.state - Current state
 * @param {Session} context.session - Current session
 * @param {string} [context.do] - Original action name
 * @param {string} [context.label] - Original action label
 */
export function do_look(context) {
  const { actor, target, state, session } = context;

  log('looking:', actor.get_label(), 'at', target.get_label());

  // TODO: Generate observation from current state
  // const obs = observation(actor, target, state);

  // TODO: Format for display
  // const lines = observation_text(obs);

  // TODO: Send to GUI
  // postMessage(['main_add', ...lines]);
}
```

---

## Differences from Old System

### Immutability

**Old system**: Handlers could mutate entities
```javascript
target.modify('Attention', {focus: from});
```

**New system**: Must create new state
```javascript
// Get current belief state
const current_attention = target.get_trait(state, 'attention');

// Create modified belief
const modified_target = target.set_trait('attention', {focus: actor.subject});

// Branch state with change
const new_state = state.branch_state({
  changed_beliefs: [modified_target]
});

// Update session
session.state = new_state;  // Triggers state change notification
```

### No subject_update (Initially)

**Old system**: After mutation, send update
```javascript
target.modify('Attention', {focus: from});
obs = observation(from, target);
postMessage(['subject_update', bake_obs(obs)]);
```

**New system**: Regenerate view
```javascript
// After state change
session.state = new_state;

// Regenerate observations
const obs = observation(actor, target, new_state);
const lines = observation_text(obs);

// Clear and redraw
postMessage(['main_clear']);
postMessage(['main_add', ...lines]);
```

**Later optimization**: Implement smart `subject_update` based on state diff.

---

## Error Handling

### Resolver Errors

```javascript
function resolve_action_context(data) {
  try {
    const session = get_current_session();
    const state = session.state;

    if (!state) {
      throw new Error('Session state not initialized');
    }

    // ... rest of resolver
  } catch (error) {
    console.error('Error resolving action context:', error);
    throw error;  // Let handler deal with it
  }
}
```

### Handler Errors

```javascript
addEventListener('message', async e =>{
  // ...

  try {
    const context = resolve_action_context(data);
    const res = await dispatch[cmd]\(context);

    if( ackid ){
      postMessage(['ack', ackid, res ]);
    }
  } catch (error) {
    console.error(`Error executing ${cmd}:`, error);

    // Send error message to GUI
    postMessage(['main_add', `Error: ${error.message}`]);

    // Reject promise on client side
    if (ackid) {
      postMessage(['ack', ackid, {error: error.message}]);
    }
  }
}, false);
```

---

## Alternative Approaches

### Option A: Resolver as Middleware

```javascript
/**
 * Apply resolver to all non-start commands
 */
const enrichment_middleware = async (cmd, data, next) => {
  if (cmd === 'start') {
    return next(data);
  }

  const context = resolve_action_context(data);
  return next(context);
};

addEventListener('message', async e =>{
  const [cmd, data={}, ackid] = msg;

  if( !dispatch[cmd] ) throw(Error(`Message ${cmd} not recognized`));

  const result = await enrichment_middleware(cmd, data, async (ctx) => {
    return await dispatch[cmd]\(ctx);
  });

  if( ackid ){
    postMessage(['ack', ackid, result ]);
  }
});
```

**Pro**: More flexible for adding other middleware
**Con**: More complex for simple case

### Option B: Resolver per Handler

```javascript
// Each handler resolves what it needs
export function do_look(data) {
  const session = get_current_session();
  const state = session.state;

  const target_subject = Subject.get_by_sid(data.target);
  const target = target_subject.get_belief_by_state(state);

  const actor = session.player;

  // ... rest of handler
}
```

**Pro**: Handler has full control
**Con**: Duplicated resolution logic in every handler
**Con**: More verbose

### Option C: Context Object with Lazy Resolution

```javascript
class ActionContext {
  constructor(session, data) {
    this._session = session;
    this._data = data;
    this._cache = {};
  }

  get state() {
    return this._session.state;
  }

  get actor() {
    if (!this._cache.actor) {
      if (this._data.subject) {
        const subject = Subject.get_by_sid(this._data.subject);
        this._cache.actor = subject.get_belief_by_state(this.state);
      } else {
        this._cache.actor = this._session.player;
      }
    }
    return this._cache.actor;
  }

  get target() {
    if (!this._cache.target) {
      const subject = Subject.get_by_sid(this._data.target);
      this._cache.target = subject.get_belief_by_state(this.state);
    }
    return this._cache.target;
  }
}

// Usage:
const context = new ActionContext(get_current_session(), data);
const res = await dispatch[cmd]\(context);
```

**Pro**: Lazy evaluation, only resolve what's needed
**Pro**: Clean handler interface
**Con**: More complex implementation

---

## Recommendation

**Use simple function resolver** (as shown in Step 2):
- ✅ Clear and straightforward
- ✅ Easy to debug
- ✅ Matches old system pattern
- ✅ Can optimize later if needed

**When to optimize**:
- When performance matters (many handlers)
- When adding complex middleware
- When supporting multiple action types with different needs

---

## Testing Strategy

### Unit Tests

```javascript
// Test resolver
describe('resolve_action_context', () => {
  it('resolves target subject to belief', () => {
    // Setup session, state, subject
    const context = resolve_action_context({target: 123});
    expect(context.target).toBeInstanceOf(Belief);
  });

  it('defaults actor to player', () => {
    const context = resolve_action_context({target: 123});
    expect(context.actor).toBe(session.player);
  });

  it('throws on missing subject', () => {
    expect(() => {
      resolve_action_context({target: 999});
    }).toThrow('Subject not found');
  });
});
```

### Integration Tests

```javascript
// Test full message flow
describe('action handler flow', () => {
  it('resolves and executes look action', async () => {
    // Send message
    worker.postMessage(['look', {target: 123, subject: 456}, 1]);

    // Wait for response
    const response = await waitForMessage();

    expect(response[0]).toBe('ack');
    expect(response[1]).toBe(1);
  });
});
```

---

## Migration Checklist

- [ ] Add `current_session` global to worker.mjs
- [ ] Add `get_current_session()` export
- [ ] Store session in `dispatch.start()`
- [ ] Create `resolve_action_context()` function
- [ ] Apply resolver before dispatch
- [ ] Update `do_look()` handler signature
- [ ] Test with simple action
- [ ] Add error handling
- [ ] Document enriched context format
- [ ] Update other handlers as needed

---

## Summary

**The enrichment pattern bridges the gap** between:
- GUI sending subject IDs
- Handlers needing Belief instances

By resolving IDs to Beliefs before handlers run, we:
- Keep handlers clean and focused
- Centralize resolution logic
- Match old system patterns
- Maintain immutability
