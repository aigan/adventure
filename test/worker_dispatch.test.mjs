/**
 * Tests for actual channel.mjs dispatch logic
 * Mocks the Worker environment to test the real worker code
 */

import { expect } from 'chai';
import * as DB from '../public/worker/db.mjs';
import { setupBrowserMocks, cleanupBrowserMocks, setupAfterEachValidation } from './helpers.mjs';

describe('Worker Dispatch (Real Implementation)', () => {
  let postedMessages;
  let Channel;
  let _handle_message;

  before(async () => {
    // Set up browser API mocks (BroadcastChannel, indexedDB)
    setupBrowserMocks();

    // Set up worker mocks
    global.postMessage = (data) => {
      if (postedMessages) {
        postedMessages.push(data);
      }
    };

    global.self = { onerror: null };

    // Import channel.mjs and get the exported message handler
    const mod = await import('../public/worker/channel.mjs');
    Channel = mod.Channel;
    _handle_message = mod._handle_message;
  });

  beforeEach(() => {
    DB.reset_registries();
    postedMessages = [];
  });
  setupAfterEachValidation();


  after(() => {
    // Clean up mocks
    delete global.postMessage;
    delete global.addEventListener;
    delete global.self;
    cleanupBrowserMocks();
  });

  describe('Built-in handlers', () => {
    it('should handle ping and return pong via ack', async () => {
      // Simulate ping message
      const event = {
        data: ['ping', {}, 1]
      };

      await _handle_message(event);

      // Should send ack with 'pong' result
      expect(postedMessages).to.have.lengthOf(1);
      expect(postedMessages[0]).to.deep.equal(['ack', 1, 'pong']);
    });

    it('should handle start and return ack with result', async () => {
      const event = {
        data: ['start', {}, 2]
      };

      await _handle_message(event);

      // Should send header_set messages and main_add, then ack
      expect(postedMessages.length).to.be.at.least(3);

      // First message is header_set with scenario name
      expect(postedMessages[0]).to.deep.equal(['header_set', 'Loading Workshop']);

      // Last message should be ack with result
      const ackMsg = postedMessages[postedMessages.length - 1];
      expect(ackMsg[0]).to.equal('ack');
      expect(ackMsg[1]).to.equal(2);
      // Result should be {success: true}
      expect(ackMsg[2]).to.deep.equal({success: true});
    });

    it('should require ackid for all messages', async () => {
      const event = {
        data: ['ping', {}] // No ackid
      };

      // Should throw assertion error
      try {
        await _handle_message(event);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err.message).to.include('expected ackid');
      }
    });

    it('should throw for unrecognized commands', async () => {
      const event = {
        data: ['unknown_command', {}, 3]
      };

      try {
        await _handle_message(event);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err.message).to.include('not recognized');
      }
    });

    it('should convert string messages to array format', async () => {
      const event = {
        data: 'ping'
      };

      // String without ackid should fail assertion
      try {
        await _handle_message(event);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err.message).to.include('expected ackid');
      }
    });
  });

  describe('Handler registration', () => {
    it('should allow registering custom handlers', async () => {
      // Register custom handler
      Channel.register('test_command', (data) => {
        return { custom: 'response', received: data };
      });

      const event = {
        data: ['test_command', { foo: 'bar' }, 4]
      };

      await _handle_message(event);

      // Should send ack with handler result
      expect(postedMessages).to.have.lengthOf(1);
      expect(postedMessages[0]).to.deep.equal([
        'ack',
        4,
        { custom: 'response', received: { foo: 'bar' } }
      ]);
    });

    it('should allow async handlers', async () => {
      Channel.register('async_command', async (data) => {
        // Simulate async work
        await new Promise(resolve => setImmediate(resolve));
        return { async: true, value: data.value * 2 };
      });

      const event = {
        data: ['async_command', { value: 21 }, 5]
      };

      await _handle_message(event);

      expect(postedMessages).to.have.lengthOf(1);
      expect(postedMessages[0]).to.deep.equal([
        'ack',
        5,
        { async: true, value: 42 }
      ]);
    });

    it('should support handlers that return void', async () => {
      Channel.register('void_command', (data) => {
        // No return value
      });

      const event = {
        data: ['void_command', {}, 6]
      };

      await _handle_message(event);

      // Should send ack with undefined result
      expect(postedMessages).to.have.lengthOf(1);
      expect(postedMessages[0]).to.deep.equal(['ack', 6, undefined]);
    });
  });

  describe('Message format handling', () => {
    it('should parse ClientMessage format correctly', async () => {
      let receivedData = null;
      Channel.register('format_test', (data) => {
        receivedData = data;
        return 'ok';
      });

      const event = {
        data: ['format_test', { test: 'data' }, 7]
      };

      await _handle_message(event);

      expect(receivedData).to.deep.equal({ test: 'data' });
      expect(postedMessages[0]).to.deep.equal(['ack', 7, 'ok']);
    });

    it('should send AckMessage format correctly', async () => {
      const event = {
        data: ['ping', {}, 8]
      };

      await _handle_message(event);

      const ackMsg = postedMessages[0];
      // Should be exactly ['ack', ackid, result]
      expect(ackMsg).to.be.an('array');
      expect(ackMsg).to.have.lengthOf(3);
      expect(ackMsg[0]).to.equal('ack');
      expect(ackMsg[1]).to.be.a('number');
      expect(ackMsg[2]).to.equal('pong');
    });
  });

  // Note: "Start command special handling" tests removed as they were duplicates
  // of the "should handle start and return ack with result" test above, which already
  // verifies that header_set comes before ack and that the result is true.
});
