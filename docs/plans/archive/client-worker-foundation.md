# Client-Worker Message Protocol Foundation

**Date**: 2025-11-14

**Goal**: Establish clean message protocol between client and worker with clear documentation and terminology.

---

## Phase 1: Documentation

Understanding what we have and what we need.

### Step 1: Document Message Formats ✓
**File**: [message-formats.md](message-formats.md)

- [x] Document current observation object format
- [x] Document action object format (with test field names)
- [x] Document Worker → Client messages:
  - [x] `main_add` - Add content with embedded subjects
  - [x] `main_clear` - Clear content
  - [x] `header_set` - Update header
  - [x] `topic_update` - Update existing subject
  - [x] `ack` - Acknowledge command completion
  - [x] `pong` - Worker alive response (⚠️ string format inconsistency)
- [x] Document Client → Worker messages:
  - [x] `start` - Initialize session
  - [x] `ping` - Check worker alive (⚠️ string format inconsistency)
  - [x] Action commands (with ackid)
- [x] Compare with old system
- [x] Identify decision points for later

### Step 2: Reference Old System
**File**: [old-system-reference.md](old-system-reference.md)

- [ ] Complete analysis of `lab/ancient-worker/`
- [ ] How old system handled messages
- [ ] How entities and observations worked
- [ ] Why GUI expects certain formats

### Step 3: Clarify Terminology
**File**: [terminology.md](terminology.md)

- [ ] Identify overloaded terms (Subject, Topic, Entity)
- [ ] GUI "subject" conflicted with data model "Subject"
- [ ] Decide on Locus/topic terminology

### Step 4: Document GUI Requirements
**File**: [gui-requirements.md](gui-requirements.md)

- [ ] What GUI actually needs from worker
- [ ] How `is: 'entity'` is used
- [ ] What fields are required vs optional

---

## Phase 2: Implementation

Applying the documentation insights.

### Step 5: Refactor GUI Terminology
**File**: [refactor-complete-locus-topic.md](refactor-complete-locus-topic.md)

- [ ] `Topic` → `Locus` (global object)
- [ ] `.subject` → `.topic` (data field)
- [ ] `.topics` → `.loci` (arrays)
- [ ] Update local variables throughout
- [ ] Verify with grep

### Step 6: Setup Testing
**File**: [testing-setup.md](testing-setup.md)

- [ ] Manual testing guide
- [ ] How to run local HTTP server
- [ ] Expected behavior
- [ ] Debugging tips

### Step 7: Create Automated Tests
**File**: [automated-testing.md](automated-testing.md)

- [ ] Create `test/message_protocol.test.mjs` - Message format validation
- [ ] Create `test/worker_mock.test.mjs` - Communication flow tests
- [ ] Implement MockWorker class for simulating Worker API
- [ ] Ensure tests run in Node.js (no browser needed)
- [ ] Verify all tests passing

### Step 8: Naming Consistency ✅

- [x] `subject_update()` → `topic_update()` in gui.mjs (already done)
- [x] `topic_data` → `topic` throughout (already done)
- [x] `locus_topic` → `old_topic` in update comparison (already done in gui.mjs:90)
- [x] Fix test naming consistency
  - [x] Updated test/message_protocol.test.mjs: `subject_update` → `topic_update`
  - [x] Updated test/worker_mock.test.mjs: `subject_update` → `topic_update`
  - [x] Updated parameter names: `topic_data` → `topic`
- [x] `is: 'entity'` → `is: 'subject'` (done in previous session)
- [x] `bake_obs()` → `bake_narration()` (done in previous session)
- [x] Add proper typedefs (SubjectData typedef added)

### Step 9: Review Message Format Consistency ✅

- [x] Document ping/pong format
- [x] Document start command format
- [x] Document ack format
- [x] Review all formats for consistency
- [x] Decide on standards (array vs string, when to use ack, etc.)
- [x] Update code to match decided standards
  - [x] Fixed `ping` to return `'pong'` via ack mechanism
  - [x] Removed separate `pong` message type - uses standard ack
  - [x] Updated handler types to allow return values
  - [x] Updated tests for new behavior
  - [x] All 355 tests passing
  - [x] String→array conversion kept for backwards compatibility

---

## Phase 3: Message Enrichment ⏰ NEXT (LAST PRIORITY)

**File**: [message-enrichment.md](message-enrichment.md)

**DO THIS LAST** after everything else is working.

**What it is**: Pattern for resolving subject IDs to Belief instances before handlers execute.

**Why last**:
- Need working handlers to test enrichment with
- Need finalized field names before implementing resolution
- This bridges between GUI (sends IDs) and handlers (need Beliefs)

**Migration checklist** (from plan):
- [ ] Add `current_session` global to `worker.mjs`
- [ ] Add `get_current_session()` export
- [ ] Store session in `dispatch.start()`
- [ ] Create `resolve_action_context()` function
- [ ] Apply resolver before dispatch in message handler
- [ ] Update handler signatures to accept enriched context
- [ ] Test with working handlers
- [ ] Add error handling for missing subjects
- [ ] Document enriched context format

---

## What Comes Between Phase 2 and Phase 3?

**Before implementing message enrichment, we need**:

1. **Working action handlers**
   - Implement stub handlers that can receive and process actions
   - Even if they don't do much yet, need the structure in place
   - Example: `do_look()` that receives data and sends back observations

2. **Finalized field names**
   - Replace `target_blipp` / `subject_blopp` with real names
   - Decide which fields are actually needed
   - Update action creation in `session.mjs`

3. **Handler infrastructure**
   - Dispatcher setup in `worker.mjs`
   - Handler registration pattern
   - Response format standardization

4. **Test the basic flow**
   - GUI sends action → Worker receives → Handler processes → GUI receives response
   - Without enrichment, handlers work with raw IDs (limited but functional)

**Then** we add enrichment to make handlers cleaner by giving them Beliefs instead of IDs.

---

## Current Status

Working through phases step by step.

---

## Summary

This meta-plan organizes 7 plan files created today:
1. message-formats.md - What we send/receive
2. old-system-reference.md - How old system worked
3. terminology.md - Naming clarification
4. gui-requirements.md - What GUI needs
5. refactor-complete-locus-topic.md - GUI changes made
6. testing-setup.md - Manual testing
7. automated-testing.md - Automated tests

**Message enrichment comes LAST** after handlers exist to use it.
