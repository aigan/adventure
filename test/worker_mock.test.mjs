/**
 * Tests for worker message handling with mocked Worker API
 * Tests actual communication flow without requiring a browser
 */

import { expect } from 'chai';
import * as DB from '../public/worker/db.mjs';

/**
 * Mock Worker for testing
 * Simulates the Worker API without needing a browser
 */
class MockWorker {
  constructor() {
    this.listeners = new Map();
    this.sent_messages = [];
  }

  postMessage(data) {
    this.sent_messages.push(data);
    // Simulate async message delivery to worker
    setImmediate(() => {
      const event = {data};
      const handler = this.listeners.get('message');
      if (handler) handler(event);
    });
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  // Simulate worker sending message back to main thread
  simulateWorkerMessage(data) {
    const event = {data};
    if (this.onmessage) {
      this.onmessage(event);
    }
  }
}

describe('Worker Message Handling', () => {
  let worker;
  let received_messages;

  beforeEach(() => {
    DB.reset_registries();
    worker = new MockWorker();
    received_messages = [];

    // Mock main thread message handler
    worker.onmessage = (e) => {
      received_messages.push(e.data);
    };
  });

  describe('Client → Worker Messages', () => {
    it('should send command with data and ackid', (done) => {
      const cmd = 'ping';
      const data = {};
      const ackid = 1;

      worker.postMessage([cmd, data, ackid]);

      setImmediate(() => {
        expect(worker.sent_messages).to.have.lengthOf(1);
        const [sent_cmd, sent_data, sent_ackid] = worker.sent_messages[0];

        expect(sent_cmd).to.equal(cmd);
        expect(sent_data).to.deep.equal(data);
        expect(sent_ackid).to.equal(ackid);
        done();
      });
    });

    it('should handle string commands (legacy format)', (done) => {
      worker.postMessage('ping');

      setImmediate(() => {
        expect(worker.sent_messages[0]).to.equal('ping');
        done();
      });
    });

    it('should handle action commands', (done) => {
      const action = {
        do: 'look',
        target: 123,
        actor: 456,
        label: 'Look around'
      };

      worker.postMessage(['look', action, 1]);

      setImmediate(() => {
        const [cmd, data, ackid] = worker.sent_messages[0];
        expect(cmd).to.equal('look');
        expect(data.do).to.equal('look');
        expect(data.target).to.equal(123);
        expect(ackid).to.equal(1);
        done();
      });
    });
  });

  describe('Worker → Client Messages', () => {
    it('should receive ack messages', () => {
      worker.simulateWorkerMessage(['ack', 1, {success: true}]);

      expect(received_messages).to.have.lengthOf(1);
      const [type, ackid, result] = received_messages[0];

      expect(type).to.equal('ack');
      expect(ackid).to.equal(1);
      expect(result).to.have.property('success');
    });

    it('should receive header_set messages', () => {
      worker.simulateWorkerMessage(['header_set', 'Test Header']);

      expect(received_messages).to.have.lengthOf(1);
      const [type, html] = received_messages[0];

      expect(type).to.equal('header_set');
      expect(html).to.equal('Test Header');
    });

    it('should receive main_clear messages', () => {
      worker.simulateWorkerMessage(['main_clear']);

      expect(received_messages).to.have.lengthOf(1);
      expect(received_messages[0][0]).to.equal('main_clear');
    });

    it('should receive main_add messages', () => {
      const parts = [
        'You see:',
        {strings: ['a ', '.'], values: [{id: 1, description_short: 'table', actions: [], is: 'subject'}]}
      ];

      worker.simulateWorkerMessage(['main_add', ...parts]);

      expect(received_messages).to.have.lengthOf(1);
      const [type, ...received_parts] = received_messages[0];

      expect(type).to.equal('main_add');
      expect(received_parts).to.have.lengthOf(2);
    });

    it('should receive topic_update messages', () => {
      const baked_obs = {
        id: 123,
        description_short: 'updated name',
        actions: [],
        is: 'subject'
      };

      worker.simulateWorkerMessage(['topic_update', baked_obs]);

      expect(received_messages).to.have.lengthOf(1);
      const [type, data] = received_messages[0];

      expect(type).to.equal('topic_update');
      expect(data.id).to.equal(123);
      expect(data.description_short).to.equal('updated name');
    });
  });

  describe('Round-trip Communication', () => {
    it('should simulate full request-response cycle', (done) => {
      // Setup worker to respond to ping
      worker.addEventListener('message', (e) => {
        const [cmd, data, ackid] = e.data;
        if (cmd === 'ping') {
          // Worker sends ack with 'pong' as result
          worker.simulateWorkerMessage(['ack', ackid, 'pong']);
        }
      });

      // Client sends ping
      worker.postMessage(['ping', {}, 1]);

      setImmediate(() => {
        // Should receive ack with 'pong' result
        expect(received_messages).to.have.lengthOf(1);
        expect(received_messages[0][0]).to.equal('ack');
        expect(received_messages[0][1]).to.equal(1); // ackid
        expect(received_messages[0][2]).to.equal('pong'); // result
        done();
      });
    });

    it('should simulate action execution flow', (done) => {
      // Setup worker to handle look command
      worker.addEventListener('message', (e) => {
        const [cmd, data, ackid] = e.data;
        if (cmd === 'look') {
          // Worker processes action
          expect(data.do).to.equal('look');
          expect(data.target).to.equal(123);

          // Worker sends result
          worker.simulateWorkerMessage(['main_add', 'You look around.']);
          worker.simulateWorkerMessage(['ack', ackid, null]);
        }
      });

      // Client sends action
      const action = {
        do: 'look',
        target: 123,
        label: 'Look around'
      };
      worker.postMessage(['look', action, 1]);

      setImmediate(() => {
        // Should receive main_add and ack
        expect(received_messages).to.have.lengthOf(2);
        expect(received_messages[0][0]).to.equal('main_add');
        expect(received_messages[1][0]).to.equal('ack');
        done();
      });
    });
  });

  describe('Message Queue', () => {
    it('should handle multiple messages in sequence', (done) => {
      worker.simulateWorkerMessage(['header_set', 'Loading']);
      worker.simulateWorkerMessage(['main_clear']);
      worker.simulateWorkerMessage(['header_set', 'Ready']);
      worker.simulateWorkerMessage(['main_add', 'Welcome!']);

      setImmediate(() => {
        expect(received_messages).to.have.lengthOf(4);
        expect(received_messages[0][0]).to.equal('header_set');
        expect(received_messages[0][1]).to.equal('Loading');
        expect(received_messages[1][0]).to.equal('main_clear');
        expect(received_messages[2][0]).to.equal('header_set');
        expect(received_messages[2][1]).to.equal('Ready');
        expect(received_messages[3][0]).to.equal('main_add');
        done();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed messages', () => {
      // Missing array format
      expect(() => {
        worker.simulateWorkerMessage(null);
      }).to.not.throw();

      // Wrong array length
      expect(() => {
        worker.simulateWorkerMessage([]);
      }).to.not.throw();

      // Messages should be queued even if malformed
      expect(received_messages).to.have.lengthOf(2);
    });

    it('should handle missing ackid', (done) => {
      worker.postMessage(['ping', {}]); // No ackid

      setImmediate(() => {
        const [cmd, data, ackid] = worker.sent_messages[0];
        expect(cmd).to.equal('ping');
        expect(ackid).to.be.undefined;
        done();
      });
    });
  });
});

describe('Promise-based Message Protocol', () => {
  let worker;
  let jobs;
  let next_ackid;

  beforeEach(() => {
    worker = new MockWorker();
    jobs = {};
    next_ackid = 1;
  });

  // Simulate the Message.send() pattern
  function send(cmd, data) {
    const ackid = next_ackid++;
    return new Promise((resolve, reject) => {
      jobs[ackid] = {resolve, reject};
      worker.postMessage([cmd, data, ackid]);
    });
  }

  // Simulate ack handler
  function handleAck(ackid, result) {
    if (jobs[ackid]) {
      jobs[ackid].resolve(result);
      delete jobs[ackid];
    }
  }

  it('should resolve promise on ack', (done) => {
    // Setup worker to respond
    worker.addEventListener('message', (e) => {
      const [cmd, data, ackid] = e.data;
      worker.simulateWorkerMessage(['ack', ackid, {success: true}]);
    });

    // Setup ack handler
    worker.onmessage = (e) => {
      const [type, ackid, result] = e.data;
      if (type === 'ack') {
        handleAck(ackid, result);
      }
    };

    // Send command and wait for promise
    const promise = send('test', {});

    promise.then((result) => {
      expect(result).to.have.property('success');
      expect(result.success).to.be.true;
      expect(jobs).to.be.empty; // Job should be removed
      done();
    }).catch(done);
  });

  it('should handle multiple concurrent requests', (done) => {
    // Setup worker to respond to each request
    worker.addEventListener('message', (e) => {
      const [cmd, data, ackid] = e.data;
      // Respond with ackid in result so we can verify
      worker.simulateWorkerMessage(['ack', ackid, {ackid}]);
    });

    // Setup ack handler
    worker.onmessage = (e) => {
      const [type, ackid, result] = e.data;
      if (type === 'ack') {
        handleAck(ackid, result);
      }
    };

    // Send multiple requests
    const promises = [
      send('cmd1', {}),
      send('cmd2', {}),
      send('cmd3', {})
    ];

    Promise.all(promises).then((results) => {
      expect(results).to.have.lengthOf(3);
      expect(results[0].ackid).to.equal(1);
      expect(results[1].ackid).to.equal(2);
      expect(results[2].ackid).to.equal(3);
      expect(jobs).to.be.empty;
      done();
    }).catch(done);
  });

  it('should resolve ping with pong result', (done) => {
    // Setup worker to respond to ping with 'pong' as result
    worker.addEventListener('message', (e) => {
      const [cmd, data, ackid] = e.data;
      if (cmd === 'ping') {
        worker.simulateWorkerMessage(['ack', ackid, 'pong']);
      }
    });

    // Setup ack handler
    worker.onmessage = (e) => {
      const [type, ackid, result] = e.data;
      if (type === 'ack') {
        handleAck(ackid, result);
      }
    };

    // Send ping and wait for promise
    const promise = send('ping', {});

    promise.then((result) => {
      expect(result).to.equal('pong');
      expect(jobs).to.be.empty;
      done();
    }).catch(done);
  });
});
