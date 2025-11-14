# Automated Testing: Message Protocol

Tests for client-worker communication without requiring a browser.

---

## Running Tests

### All Tests

```bash
npm test
```

### Message Protocol Tests Only

```bash
npm test -- --grep "Message Protocol"
```

### Worker Mock Tests Only

```bash
npm test -- --grep "Worker Message"
```

### Watch Mode (During Development)

```bash
npx mocha test/message_protocol.test.mjs --watch
```

---

## Test Files

### `test/message_protocol.test.mjs`

**What it tests**: Message format validation (no mocking needed)

**Coverage**:
- ✅ Client → Worker message format `[cmd, data, ackid]`
- ✅ Worker → Client message formats:
  - `['ack', ackid, result]`
  - `['header_set', html]`
  - `['main_clear']`
  - `['main_add', ...parts]`
  - `['subject_update', baked_obs]`
- ✅ Baked observation format validation
- ✅ Action object format validation
- ✅ Template tag format validation
- ✅ Type discrimination (entity vs action)
- ✅ Round-trip data preservation
- ✅ Error cases

**Example**:
```javascript
it('should format commands as [cmd, data, ackid]', () => {
  const message = ['look', {do: 'look', target: 123}, 1];
  expect(message).to.have.lengthOf(3);
  expect(message[0]).to.equal('look');
});
```

### `test/worker_mock.test.mjs`

**What it tests**: Actual communication flow with mocked Worker API

**Coverage**:
- ✅ MockWorker class (simulates Worker API)
- ✅ Sending messages client → worker
- ✅ Receiving messages worker → client
- ✅ Round-trip communication
- ✅ Promise-based request/response
- ✅ Multiple concurrent requests
- ✅ Message queue handling
- ✅ Error handling

**Example**:
```javascript
it('should simulate full request-response cycle', (done) => {
  worker.addEventListener('message', (e) => {
    const [cmd, data, ackid] = e.data;
    if (cmd === 'ping') {
      worker.simulateWorkerMessage('pong');
      worker.simulateWorkerMessage(['ack', ackid, null]);
    }
  });

  worker.postMessage(['ping', {}, 1]);
  // ... assertions
});
```

---

## MockWorker Class

A simple mock that simulates the Worker API for testing:

```javascript
class MockWorker {
  postMessage(data)                    // Send to worker
  addEventListener(type, handler)      // Listen for worker events
  simulateWorkerMessage(data)         // Simulate worker sending to main

  sent_messages: []                    // Track sent messages
  onmessage: (event) => {}            // Main thread handler
}
```

**Usage**:
```javascript
const worker = new MockWorker();

// Setup handler for messages from worker
worker.onmessage = (e) => {
  console.log('Received from worker:', e.data);
};

// Setup worker's message handler
worker.addEventListener('message', (e) => {
  console.log('Worker received:', e.data);
  // Simulate worker response
  worker.simulateWorkerMessage(['ack', 1, {}]);
});

// Send message to worker
worker.postMessage(['ping', {}, 1]);
```

---

## What's Tested

### ✅ Message Formats

All message formats are validated:

**Client → Worker**:
```javascript
['command', {data}, ackid]
```

**Worker → Client**:
```javascript
'pong'                                    // Simple string
['ack', ackid, result]                    // Promise resolution
['header_set', html]                      // Update header
['main_clear']                            // Clear content
['main_add', ...parts]                    // Add content
['subject_update', baked_observation]     // Update entity
```

### ✅ Data Structures

**Baked Observation**:
```javascript
{
  id: number,               // Subject ID
  description_short: string,
  actions: Action[],
  is: 'entity'             // Type marker
}
```

**Action Object**:
```javascript
{
  do: string,              // Command name
  target: number,          // Subject ID
  actor?: number,          // Subject ID (optional)
  label: string            // Display text
}
```

**Template Tag**:
```javascript
{
  strings: ['text', 'parts'],
  values: [BakedObservation, ...]
}
```

### ✅ Communication Patterns

1. **Request-Response** (with ack):
   ```
   Client: ['cmd', data, ackid]
     → Worker processes
   Worker: ['ack', ackid, result]
     → Client promise resolves
   ```

2. **One-way Messages** (no ack):
   ```
   Worker: ['header_set', html]
     → Client updates header
   ```

3. **Multiple Responses** (one request, many messages):
   ```
   Client: ['start', {}, 1]
     → Worker: ['header_set', 'Loading']
     → Worker: ['main_clear']
     → Worker: ['main_add', ...]
     → Worker: ['ack', 1, null]
   ```

### ✅ Edge Cases

- Missing ackid (optional response)
- Malformed messages
- Type confusion (entity vs action)
- Empty data
- Multiple concurrent requests
- Promise cleanup (jobs deleted after ack)

---

## What's NOT Tested (Yet)

### ❌ Actual GUI Handler Logic

The tests validate **message formats** but not the actual GUI handlers (`gui.mjs`).

**To test later**:
- `header_set()` updates DOM
- `main_add()` creates topics
- Locus registration
- Event handlers

**Requires**: DOM mocking (jsdom) or browser testing

### ❌ Actual Worker Handler Logic

Tests don't call real worker handlers (`worker.mjs`, `narrator.mjs`).

**To test later**:
- Message enrichment (resolve subject IDs)
- Action handlers (`do_look`, etc.)
- Observation generation
- State changes

**Can test now**: Import and call handlers directly (no Worker needed)

### ❌ Integration Tests

No end-to-end tests from user action → worker → response.

**To add later**:
- Full flow: Click → Message → Handler → State change → Response → UI update
- Requires: Playwright or Puppeteer for browser automation

---

## Adding New Tests

### Test Message Format

```javascript
// In message_protocol.test.mjs
describe('New Message Type', () => {
  it('should format new_message as [new_message, data]', () => {
    const msg = ['new_message', {foo: 'bar'}];

    expect(msg[0]).to.equal('new_message');
    expect(msg[1]).to.have.property('foo');
  });
});
```

### Test Communication Flow

```javascript
// In worker_mock.test.mjs
describe('New Command', () => {
  it('should handle new_command', (done) => {
    worker.addEventListener('message', (e) => {
      const [cmd, data, ackid] = e.data;
      if (cmd === 'new_command') {
        // Simulate worker processing
        worker.simulateWorkerMessage(['ack', ackid, {result: 'done'}]);
      }
    });

    worker.postMessage(['new_command', {}, 1]);

    setImmediate(() => {
      expect(received_messages).to.have.lengthOf(1);
      done();
    });
  });
});
```

### Test Handler Directly

```javascript
// In a new test file like test/narrator.test.mjs
import { bake_obs } from '../public/worker/narrator.mjs';

describe('Narrator', () => {
  it('should bake observations', () => {
    const obs = {
      subject: {sid: 123},
      known_as: 'courtyard',
      actions: []
    };

    const baked = bake_obs(obs);

    expect(baked.id).to.equal(123);
    expect(baked.description_short).to.equal('courtyard');
    expect(baked.is).to.equal('entity');
  });
});
```

---

## Test Coverage Goals

### Phase 1: Message Protocol ✅ (Current)
- Message format validation
- Mock communication flow
- Data structure validation

### Phase 2: Handler Units (Next)
- `narrator.bake_obs()`
- `narrator.tt()` template tag
- Worker dispatch logic
- Action handlers (when implemented)

### Phase 3: Integration (Future)
- Full message flow with real handlers
- State changes → UI updates
- Error propagation
- Performance tests

### Phase 4: E2E (Later)
- Browser automation
- User interaction simulation
- Visual regression testing

---

## CI/CD Integration

These tests work in CI without a browser:

```yaml
# .github/workflows/test.yml (example)
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm install
      - run: npm test
```

All message protocol tests run in Node.js without requiring:
- Browser installation
- Display server
- Selenium/WebDriver
- Headless browser

---

## Debugging Tests

### Run Single Test

```bash
npx mocha test/message_protocol.test.mjs --grep "should format commands"
```

### Enable Logging

```javascript
// Add to test:
import { log } from '../public/lib/debug.mjs';

it('should do something', () => {
  log('Debug info:', data);
  // ... test
});
```

### Inspect Messages

```javascript
it('should send messages', (done) => {
  worker.postMessage(['test', {}, 1]);

  setImmediate(() => {
    console.log('Sent:', worker.sent_messages);
    console.log('Received:', received_messages);
    done();
  });
});
```

### Use Only/Skip

```javascript
it.only('should run only this test', () => {
  // Only this test runs
});

it.skip('should skip this test', () => {
  // This test is skipped
});
```

---

## Summary

**Current tests validate**:
- ✅ Message format specifications
- ✅ Communication protocol patterns
- ✅ Data structure requirements
- ✅ Round-trip data preservation
- ✅ Promise-based request/response
- ✅ Error handling

**No browser required** - all tests run in Node.js with mocha.

**Next steps**:
1. Add handler unit tests (can do now)
2. Add integration tests (need real handlers)
3. Add E2E tests (need browser automation)

Run `npm test` to verify everything works!
