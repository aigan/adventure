import { expect } from 'chai';
import { Mind, State, Belief, Archetype, Traittype, Session, save_mind, load } from '../public/worker/cosmos.mjs';
import * as DB from '../public/worker/db.mjs';

// Mock BroadcastChannel
class MockBroadcastChannel {
  constructor(name) {
    this.name = name;
    this.onmessage = null;
    this.messages = [];
  }
  postMessage(data) {
    this.messages.push(data);
  }
}
global.BroadcastChannel = MockBroadcastChannel;

// Mock indexedDB
let mockCounter = 0;
global.indexedDB = {
  open: () => {
    const request = {
      onupgradeneeded: null,
      onsuccess: null,
      result: null
    };

    // Trigger onsuccess async
    setTimeout(() => {
      const mockDB = {
        transaction: () => ({
          objectStore: () => ({
            get: (label) => {
              const getRequest = {
                onsuccess: null,
                result: mockCounter
              };
              setTimeout(() => {
                if (getRequest.onsuccess) getRequest.onsuccess();
              }, 0);
              return getRequest;
            },
            put: (value, label) => {
              mockCounter = value;
            }
          })
        })
      };
      request.result = mockDB;
      if (request.onsuccess) request.onsuccess({ target: request });
    }, 0);

    return request;
  }
};

describe('Channel Message Handlers', () => {
  beforeEach(() => {
    mockCounter = 0; // Reset sequence counter
    DB.reset_registries();
    const traittypes = {
      '@about': {
        type: 'Subject',
        mind: 'parent'
      },
      location: 'Location',
      mind_states: {
        type: 'State',
        container: Array,
        min: 1
      },
      color: 'string',
    }

    const archetypes = {
      ObjectPhysical: {
        traits: {
          '@about': null,
          location: null,
          color: null,
        },
      },
      Mental: {
        traits: {
          mind_states: null,
        },
      },
      Location: {
        bases: ['ObjectPhysical'],
      },
      PortableObject: {
        bases: ['ObjectPhysical'],
      },
      Actor: {
        bases: ['ObjectPhysical'],
      },
      Person: {
        bases: ['Actor', 'Mental'],
      },
    }

    DB.register(archetypes, traittypes);
  });

  describe('query_mind handler', () => {
    let Channel;
    let mockSession;
    let messages;
    let mockChannel;

    before(async () => {
      Channel = await import('../public/worker/channel.mjs');
    });

    beforeEach(async () => {
      messages = [];
      mockChannel = {
        postMessage: (msg) => messages.push(msg),
        onmessage: null
      };
      global.BroadcastChannel = function() { return mockChannel; };

      const world_mind = new Mind(null, 'test_mind');
      const state = world_mind.create_state(1);
      const hammer = state.add_belief({
        label: 'test_hammer',
        bases: ['PortableObject'],
        traits: { color: 'red' }
      });

      mockSession = new Session(world_mind, state, hammer);

      await Channel.init_channel(mockSession);
    });

    it('can find mind by numeric id', () => {
      const mind = mockSession.world;
      const state = mockSession.state;

      // Clear init messages
      messages.length = 0;

      Channel.dispatch.query_mind({
        mind: String(mind._id),
        state_id: String(state._id),
        client_id: 1
      });

      expect(messages).to.have.lengthOf(1);
      expect(messages[0].msg).to.equal('world_entity_list');
      expect(messages[0].state.mind_label).to.equal('test_mind');
      expect(messages[0].state.beliefs).to.have.lengthOf(1);
      expect(messages[0].state.beliefs[0].label).to.equal('test_hammer');
    });

    it('can find mind by label', () => {
      const state = mockSession.state;
      messages.length = 0;

      Channel.dispatch.query_mind({
        mind: 'test_mind',
        state_id: String(state._id),
        client_id: 1
      });

      expect(messages).to.have.lengthOf(1);
      expect(messages[0].state.mind_label).to.equal('test_mind');
    });

    it('throws assertion for non-existent mind', () => {
      const state = mockSession.state;
      messages.length = 0;

      expect(() => {
        Channel.dispatch.query_mind({
          mind: '999999',
          state_id: String(state._id),
          client_id: 1
        });
      }).to.throw('Mind not found');
    });

    it('throws assertion for non-existent state', () => {
      messages.length = 0;

      expect(() => {
        Channel.dispatch.query_mind({
          mind: 'test_mind',
          state_id: '999999',
          client_id: 1
        });
      }).to.throw('State not found');
    });
  });

  describe('query_state handler', () => {
    let Channel;
    let messages;

    before(async () => {
      Channel = await import('../public/worker/channel.mjs');
    });

    beforeEach(async () => {
      messages = [];
      const mockChannel = {
        postMessage: (msg) => messages.push(msg),
        onmessage: null
      };
      global.BroadcastChannel = function() { return mockChannel; };

      const mind1 = new Mind(null, 'mind1');
      const state1 = mind1.create_state(1);

      const mockSession = new Session(mind1, state1);

      await Channel.init_channel(mockSession);
    });

    it('can find state by searching all minds', () => {
      const mind2 = new Mind(null, 'mind2');
      const state2 = mind2.create_state(1);
      const hammer = state2.add_belief({ label: 'hammer', bases: ['PortableObject'] });

      messages.length = 0;

      Channel.dispatch.query_state({
        state: String(state2._id),
        client_id: 1
      });

      expect(messages).to.have.lengthOf(1);
      expect(messages[0].msg).to.equal('world_entity_list');
      expect(messages[0].state.mind_label).to.equal('mind2');
      expect(messages[0].state.beliefs).to.have.lengthOf(1);
    });

    it('throws assertion for non-existent state', () => {
      messages.length = 0;

      expect(() => {
        Channel.dispatch.query_state({
          state: '999999',
          client_id: 1
        });
      }).to.throw('State not found');
    });
  });

  describe('query_belief handler', () => {
    let Channel;
    let messages;

    before(async () => {
      Channel = await import('../public/worker/channel.mjs');
    });

    beforeEach(async () => {
      messages = [];
      const mockChannel = {
        postMessage: (msg) => messages.push(msg),
        onmessage: null
      };
      global.BroadcastChannel = function() { return mockChannel; };

      const world_mind = new Mind(null, 'world');
      const mockSession = new Session(world_mind, world_mind.create_state(1));

      await Channel.init_channel(mockSession);
    });

    it('can find belief by id and returns correct data', () => {
      const mind = new Mind(null, 'belief_test_mind');
      const state = mind.create_state(1);
      const hammer = state.add_belief({
        label: 'query_hammer',
        bases: ['PortableObject']
      });

      messages.length = 0;

      Channel.dispatch.query_belief({
        belief: String(hammer._id),
        state_id: String(state._id),
        client_id: 1
      });

      expect(messages).to.have.lengthOf(1);
      expect(messages[0].msg).to.equal('world_entity');
      expect(messages[0].mind.label).to.equal('belief_test_mind');
      expect(messages[0].data.data.label).to.equal('query_hammer');
    });

    it('throws assertion for non-existent belief', () => {
      const mind = new Mind(null, 'test_mind');
      const state = mind.create_state(1);
      messages.length = 0;

      expect(() => {
        Channel.dispatch.query_belief({
          belief: '999999',
          state_id: String(state._id),
          client_id: 1
        });
      }).to.throw('Belief not found');
    });

    it('includes about chain in response', () => {
      const world_mind = new Mind(null, 'world');
      const world_state = world_mind.create_state(1);
      const workshop = world_state.add_belief({
        label: 'query_workshop',
        bases: ['Location']
      });

      const npc_mind = new Mind(world_mind, 'npc');
      const npc_state = npc_mind.create_state(1, world_state);
      const workshop_belief = npc_state.learn_about(workshop, []);

      messages.length = 0;

      Channel.dispatch.query_belief({
        belief: String(workshop_belief._id),
        state_id: String(npc_state._id),
        client_id: 1
      });

      expect(messages).to.have.lengthOf(1);
      expect(messages[0].data.data.traits['@about']).to.not.be.undefined;
      expect(messages[0].data.data.traits['@about'].label).to.equal('query_workshop');
      expect(messages[0].data.data.traits['@about'].mind_label).to.equal('world');
    });

    it('includes bases information', () => {
      const mind = new Mind(null, 'bases_test_mind');
      const state = mind.create_state(1);
      const hammer = state.add_belief({
        label: 'bases_hammer',
        bases: ['PortableObject']
      });

      messages.length = 0;

      Channel.dispatch.query_belief({
        belief: String(hammer._id),
        state_id: String(state._id),
        client_id: 1
      });

      expect(messages).to.have.lengthOf(1);
      expect(messages[0].bases).to.be.an('array');
      expect(messages[0].bases.some(b => b.label === 'PortableObject')).to.be.true;
      expect(messages[0].bases.some(b => b.type === 'Archetype')).to.be.true;
    });
  });

  describe('query_entity handler', () => {
    let Channel;
    let messages;

    before(async () => {
      Channel = await import('../public/worker/channel.mjs');
    });

    beforeEach(async () => {
      messages = [];
      const mockChannel = {
        postMessage: (msg) => messages.push(msg),
        onmessage: null
      };
      global.BroadcastChannel = function() { return mockChannel; };
    });

    it('can find belief in Session.state', async () => {
      const mind = new Mind(null, 'entity_test_mind');
      const state = mind.create_state(1);
      const ball = state.add_belief({
        label: 'test_ball',
        bases: ['PortableObject'],
        traits: { color: 'red' }
      });

      const mockSession = new Session(mind, state, ball);

      await Channel.init_channel(mockSession);
      messages.length = 0;

      Channel.dispatch.query_entity({
        id: ball._id,
        client_id: 1
      });

      expect(messages).to.have.lengthOf(1);
      expect(messages[0].msg).to.equal('world_entity');
      expect(messages[0].data.data.label).to.equal('test_ball');
      expect(messages[0].data.data.traits.color).to.equal('red');
    });

    it('throws assertion for non-existent entity', async () => {
      const mind = new Mind(null, 'empty_entity_mind');
      const state = mind.create_state(1);

      const mockSession = new Session(mind, state);

      await Channel.init_channel(mockSession);
      messages.length = 0;

      expect(() => {
        Channel.dispatch.query_entity({
          id: 999999,
          client_id: 1
        });
      }).to.throw('Belief 999999 not found in Session.state');
    });
  });

  describe('connect handler', () => {
    let Channel;
    let messages;

    before(async () => {
      Channel = await import('../public/worker/channel.mjs');
    });

    it('increments client_id and sends welcome message', async () => {
      messages = [];
      const mockChannel = {
        postMessage: (msg) => messages.push(msg),
        onmessage: null
      };
      global.BroadcastChannel = function() { return mockChannel; };

      const mind = new Mind(null, 'world');
      const mockSession = new Session(mind, mind.create_state(1));

      await Channel.init_channel(mockSession);
      messages.length = 0;

      // First connect
      Channel.dispatch.connect({});
      expect(messages).to.have.lengthOf(1);
      expect(messages[0].msg).to.equal('welcome');
      expect(messages[0].client_id).to.equal(1);

      // Second connect
      Channel.dispatch.connect({});
      expect(messages).to.have.lengthOf(2);
      expect(messages[1].client_id).to.equal(2);
    });
  });
});
