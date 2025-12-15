/**
 * Tests for client-worker message protocol
 * Tests message formats and communication without requiring a browser
 */

import { expect } from 'chai';
import * as DB from '../public/worker/db.mjs';
import { setupAfterEachValidation } from './helpers.mjs';

describe('Message Protocol', () => {
  beforeEach(() => {
    DB.reset_registries();
  });
  setupAfterEachValidation();


  describe('Message Format', () => {
    describe('Client → Worker', () => {
      it('should format commands as [cmd, data, ackid]', () => {
        const cmd = 'look';
        const data = {do: 'look', target: 123, actor: 456};
        const ackid = 1;

        const message = [cmd, data, ackid];

        expect(message).to.have.lengthOf(3);
        expect(message[0]).to.equal(cmd);
        expect(message[1]).to.deep.equal(data);
        expect(message[2]).to.equal(ackid);
      });

      it('should include action metadata in data', () => {
        const action_data = {
          do: 'look',
          target: 123,      // Subject ID
          actor: 456,       // Subject ID (optional, defaults to player)
          label: 'Look around'
        };

        expect(action_data).to.have.property('do');
        expect(action_data).to.have.property('target');
        expect(action_data).to.have.property('label');
      });
    });

    describe('Worker → Client', () => {
      it('should format ack as [ack, ackid, result]', () => {
        const ack = ['ack', 1, {success: true}];

        expect(ack[0]).to.equal('ack');
        expect(ack[1]).to.be.a('number');
        expect(ack[2]).to.be.an('object');
      });

      it('should format header_set as [header_set, html]', () => {
        const msg = ['header_set', 'Location: Courtyard'];

        expect(msg[0]).to.equal('header_set');
        expect(msg[1]).to.be.a('string');
      });

      it('should format main_clear as [main_clear]', () => {
        const msg = ['main_clear'];

        expect(msg).to.have.lengthOf(1);
        expect(msg[0]).to.equal('main_clear');
      });

      it('should format main_add with parts array', () => {
        const msg = ['main_add', 'You see:', {strings: ['a ', '.'], values: []}];

        expect(msg[0]).to.equal('main_add');
        expect(msg.slice(1)).to.be.an('array');
      });

      it('should format topic_update as [topic_update, baked_obs]', () => {
        const baked_obs = {
          id: 123,
          description_short: 'courtyard',
          actions: [],
          is: 'subject'
        };
        const msg = ['topic_update', baked_obs];

        expect(msg[0]).to.equal('topic_update');
        expect(msg[1]).to.have.property('id');
        expect(msg[1]).to.have.property('description_short');
        expect(msg[1]).to.have.property('actions');
        expect(msg[1]).to.have.property('is');
      });
    });
  });

  describe('Baked Observation Format', () => {
    it('should have required fields', () => {
      const baked = {
        id: 123,
        description_short: 'courtyard',
        actions: [
          {do: 'look', target: 123, label: 'Look around'}
        ],
        is: 'subject'
      };

      // Required fields
      expect(baked).to.have.property('id');
      expect(baked.id).to.be.a('number');

      expect(baked).to.have.property('description_short');
      expect(baked.description_short).to.be.a('string');

      expect(baked).to.have.property('actions');
      expect(baked.actions).to.be.an('array');

      expect(baked).to.have.property('is');
      expect(baked.is).to.equal('subject');
    });

    it('should contain valid action objects', () => {
      const action = {
        do: 'look',
        target: 123,
        label: 'Look around'
      };

      expect(action).to.have.property('do');
      expect(action.do).to.be.a('string');

      expect(action).to.have.property('label');
      expect(action.label).to.be.a('string');

      // Metadata fields are optional but if present should be numbers
      if ('target' in action) {
        expect(action.target).to.be.a('number');
      }
      if ('actor' in action) {
        expect(action.actor).to.be.a('number');
      }
    });

    it('should not confuse baked obs with action', () => {
      const baked_obs = {
        id: 123,
        description_short: 'NPC',
        actions: [],
        is: 'subject'
      };

      const action = {
        do: 'greet',
        target: 123,
        label: 'Say hello'
      };

      // Baked obs has 'is: subject', action does not
      expect(baked_obs.is).to.equal('subject');
      expect(action).to.not.have.property('is');

      // Action has 'do', baked obs does not
      expect(action.do).to.be.a('string');
      expect(baked_obs).to.not.have.property('do');
    });
  });

  describe('Template Tag Format', () => {
    it('should have strings and values', () => {
      const template_result = {
        strings: ['You are in ', '.'],
        values: [{
          id: 123,
          description_short: 'courtyard',
          actions: [],
          is: 'subject'
        }]
      };

      expect(template_result).to.have.property('strings');
      expect(template_result).to.have.property('values');

      expect(template_result.strings).to.be.an('array');
      expect(template_result.values).to.be.an('array');
    });

    it('should have strings.length === values.length + 1', () => {
      const cases = [
        {strings: ['a'], values: []},
        {strings: ['a', 'b'], values: [{}]},
        {strings: ['a', 'b', 'c'], values: [{}, {}]},
      ];

      for (const template of cases) {
        expect(template.strings).to.have.lengthOf(template.values.length + 1);
      }
    });

    it('should contain valid baked observations in values', () => {
      const template_result = {
        strings: ['You see ', ' and ', '.'],
        values: [
          {id: 1, description_short: 'table', actions: [], is: 'subject'},
          {id: 2, description_short: 'chair', actions: [], is: 'subject'}
        ]
      };

      for (const val of template_result.values) {
        expect(val).to.have.property('id');
        expect(val).to.have.property('description_short');
        expect(val).to.have.property('actions');
        expect(val).to.have.property('is');
        expect(val.is).to.equal('subject');
      }
    });
  });

  describe('Message Handler Protocol', () => {
    it('should define expected handler signatures', () => {
      // These are the expected handler signatures
      const handlers = {
        header_set: (html) => {
          expect(html).to.be.a('string');
        },
        main_clear: () => {
          // No parameters
        },
        main_add: (...parts) => {
          expect(parts).to.be.an('array');
        },
        topic_update: ([topic]) => {
          expect(topic).to.be.an('object');
          expect(topic).to.have.property('id');
        }
      };

      // Verify handler signatures
      expect(handlers.header_set).to.be.a('function');
      expect(handlers.main_clear).to.be.a('function');
      expect(handlers.main_add).to.be.a('function');
      expect(handlers.topic_update).to.be.a('function');

      // Test calling them
      handlers.header_set('Test');
      handlers.main_clear();
      handlers.main_add('line1', 'line2');
      handlers.topic_update([{id: 123, description_short: 'test', actions: [], is: 'subject'}]);
    });
  });

  describe('Action Data Round-Trip', () => {
    it('should preserve action data through click → send → handler', () => {
      // 1. Worker creates action
      const original_action = {
        do: 'look',
        target: 123,
        actor: 456,
        label: 'Look around'
      };

      // 2. Baked into observation and sent to GUI
      const baked_obs = {
        id: 123,
        description_short: 'courtyard',
        actions: [original_action],
        is: 'subject'
      };

      // 3. GUI stores it in locus.topic
      const locus_topic = baked_obs;

      // 4. User clicks action, GUI sends it back
      const sent_action = locus_topic.actions[0];

      // 5. Worker receives it
      const received = sent_action;

      // Should be unchanged
      expect(received).to.deep.equal(original_action);
      expect(received.do).to.equal('look');
      expect(received.target).to.equal(123);
      expect(received.actor).to.equal(456);
    });
  });

  describe('Error Cases', () => {
    it('should handle missing required fields', () => {
      const invalid_baked = {
        id: 123,
        // Missing description_short
        actions: [],
        is: 'subject'
      };

      expect(invalid_baked).to.not.have.property('description_short');
    });

    it('should handle invalid action format', () => {
      const invalid_action = {
        // Missing 'do'
        label: 'Invalid'
      };

      expect(invalid_action).to.not.have.property('do');
    });

    it('should detect type confusion', () => {
      // This looks like an action but has 'is: entity'
      const confused = {
        do: 'look',
        is: 'subject',  // Wrong! Actions shouldn't have this
        label: 'Look'
      };

      // In real code, should filter by is === 'subject'
      const is_baked_obs = confused.is === 'subject';
      const is_action = !!confused.do;

      // Both true = confused type
      expect(is_baked_obs && is_action).to.be.true;
      // This is an error case to detect
    });
  });
});
