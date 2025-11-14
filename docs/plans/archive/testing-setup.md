# Testing Setup: GUI + Worker

How to run and test the refactored GUI and worker locally.

---

## Quick Start

### 1. Build Dependencies

```bash
# Install if not already done
npm install

# Build vendor dependencies (runs rollup)
npm run postinstall
# Or:
gulp
```

### 2. Start Local Server

The app needs to be served via HTTP (not `file://`) because it uses ES6 modules and workers.

**Option A: Python 3 (Simplest)**
```bash
cd /home/agent/adventure
python3 -m http.server 8000 --directory public
```

Then open: http://localhost:8000

**Option B: Node http-server**
```bash
# Install if needed
npm install -g http-server

# Serve
http-server public -p 8000
```

Then open: http://localhost:8000

**Option C: VS Code Live Server**
- Install "Live Server" extension
- Right-click `public/index.html` → "Open with Live Server"

### 3. Open Browser

Navigate to: http://localhost:8000

You should see:
1. Header: "Loading world" → "Waking up"
2. Main: "You are in courtyard" (or similar)
3. Clickable entity (bold text)
4. Arrow keys navigate
5. Enter opens action menu

---

## What Gets Loaded

### File Load Order

1. **`public/index.html`**
   - Loads CSS
   - Creates `<header>` and `<main>`
   - Loads `client.mjs`

2. **`public/client.mjs`**
   ```javascript
   import "./lib/gui.mjs";        // Sets up GUI handlers
   import {Message} from "./lib/message.mjs";  // Creates worker
   Message.send('start');         // Tell worker to start
   ```

3. **`public/lib/message.mjs`**
   ```javascript
   export const worker = new Worker('worker/worker.mjs', {type:"module"});
   ```
   - Creates worker thread
   - Sets up message handlers
   - Registers GUI handlers

4. **`public/lib/gui.mjs`**
   - Exports `Locus` object (just refactored!)
   - Registers message handlers:
     - `header_set` - Update header
     - `main_clear` - Clear content
     - `main_add` - Add content
     - `subject_update` - Update topics
   - Sets up keyboard shortcuts

5. **`public/worker/worker.mjs`**
   - Worker thread entry point
   - Receives 'start' message
   - Calls `dispatch.start()`

6. **`public/worker/session.mjs`**
   - `Session.start()` runs:
     - Loads world from `world.mjs`
     - Sets up broadcast channel (for inspector)
     - Initializes narrator
     - Sends initial observation to GUI

7. **`public/worker/world.mjs`**
   - Creates world Mind
   - Creates player
   - Creates initial location
   - Returns world state

---

## Expected Behavior

### Initial Load

```
Header: "Loading world"
  ↓
Header: "Waking up"
  ↓
Main: "You are in [courtyard]."
      ↑ clickable
```

### Interaction

**Click on entity** (bold text):
- Dialog opens with action menu
- Options: "Look around", "Never mind"

**Keyboard navigation**:
- Arrow keys: Navigate between topics
- Enter: Select/execute action
- Escape: Go back/close dialog

### Console Output

Check browser console for:
```
Loading GUI
Loading Worker
Starting
```

No errors should appear (unless something broke).

---

## Debugging

### Worker Not Loading

**Symptom**: Header stays "Loading..." forever

**Check**:
1. Browser console for errors
2. Network tab - is `worker/worker.mjs` loading?
3. CORS errors? (Must use HTTP server, not `file://`)

**Fix**:
- Ensure serving via HTTP
- Check worker path is correct: `public/worker/worker.mjs` exists

### No Content Appears

**Symptom**: Header changes but no "You are in..." text

**Check**:
1. Console errors in worker or main thread
2. Is `world.mjs` loading? Any import errors?
3. Is `session.start()` completing?

**Debug**:
```javascript
// Add to client.mjs temporarily:
import {log} from "./lib/debug.mjs";
log('Client loaded');

// Add to worker.mjs:
console.log('Worker starting');
```

### Entities Not Clickable

**Symptom**: Text appears but nothing is interactive

**Check**:
1. Are topics rendered? Check DOM: `<b class="topic" id="main-1">`
2. Are loci registered? Check `Locus.loci` in console:
   ```javascript
   // In browser console:
   window.Locus.loci
   ```
3. Is CSS loaded? Bold text should be styled

**Debug**:
```javascript
// In browser console:
import('./lib/gui.mjs').then(m => console.log(m.Locus))
```

### Actions Don't Execute

**Symptom**: Menu opens but clicking action does nothing

**Check**:
1. Is worker handler registered?
2. Console errors when clicking?
3. Message being sent? Check Network tab

**Debug**:
```javascript
// Add to gui.mjs execute():
console.log('Executing action:', action, topic_data);
```

---

## Testing the Refactor

### Verify Locus/Topic Rename

**In browser console**:
```javascript
// Should work:
Locus.loci
Locus.main
Locus.selected

// Should NOT exist:
Topic  // ReferenceError

// Check a locus:
Object.values(Locus.loci)[0]
// Should have: {id, parent, topic, slug, element}
// Should NOT have: .subject
```

### Manual Test Checklist

- [ ] Page loads without errors
- [ ] Header shows "Waking up"
- [ ] Main shows narrative text
- [ ] Bold text is present (topics)
- [ ] Click bold text → menu opens
- [ ] Menu shows actions
- [ ] Click action → sends to worker
- [ ] Keyboard navigation works
- [ ] Escape closes menu
- [ ] No console errors

---

## Inspector UI (Optional)

There's also an inspector for debugging:

**Open**: http://localhost:8000/inspect.html

**Shows**:
- World mind structure
- All states and beliefs
- State transitions
- Belief data

**Use BroadcastChannel** to communicate with worker (separate from main GUI messages).

---

## Common Issues

### "Module not found"

**Cause**: Relative import paths wrong

**Check**: All imports use correct paths:
- Worker: `import {Session} from "./session.mjs"`
- Client: `import {Message} from "./lib/message.mjs"`

### "Worker failed to load"

**Cause**: Worker must be served from same origin

**Fix**: Don't use `file://` - use HTTP server

### "Not implemented consistently"

**Normal**: These are known TODOs in the code, not errors:
- `worker.mjs:53` - Error handling incomplete
- `message.mjs:67` - Error handling incomplete

### Build Failed

```bash
# Clean and rebuild
rm -rf node_modules
npm install
gulp
```

---

## Next Steps After Testing

Once basic interaction works:

1. **Add action handlers** (currently do_look is a stub)
2. **Implement observation system** (generate descriptions)
3. **Add message enrichment** (resolve subject IDs to Beliefs)
4. **Test full loop**: Click → handler → state change → UI update

---

## Files to Watch

During development, watch these files for issues:

**Core Loop**:
- `public/client.mjs` - Entry point
- `public/lib/gui.mjs` - GUI logic (just refactored)
- `public/lib/message.mjs` - Message passing
- `public/worker/worker.mjs` - Worker entry
- `public/worker/session.mjs` - Game session

**Data**:
- `public/worker/world.mjs` - Initial world
- `public/worker/narrator.mjs` - Text formatting

**Styling**:
- `public/styles.css` - Visual appearance

---

## Summary

**To test refactor**:
```bash
# From project root
python3 -m http.server 8000 --directory public

# Open http://localhost:8000
# Click bold text
# Verify menu appears
# Check console for errors
```

If it works, the Locus/Topic refactor is successful!
