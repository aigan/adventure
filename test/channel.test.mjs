import { expect } from 'chai';
import { Mind, State, Belief, Archetype, Traittype, save_mind, load } from '../public/worker/cosmos.mjs';
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
    let mockAdventure;
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

      const world_mind = new Mind('test_mind');
      const hammer = world_mind.add({
        label: 'test_hammer',
        bases: ['PortableObject'],
        traits: { color: 'red' }
      });
      const state = world_mind.create_state(1);
      state.insert.push(hammer);

      mockAdventure = {
        world: world_mind,
        player: hammer,
        state: state
      };

      await Channel.init_channel(mockAdventure, DB);
    });

    it('can find mind by numeric id', () => {
      const mind = mockAdventure.world;
      const state = mockAdventure.state;

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
      const state = mockAdventure.state;
      messages.length = 0;

      Channel.dispatch.query_mind({
        mind: 'test_mind',
        state_id: String(state._id),
        client_id: 1
      });

      expect(messages).to.have.lengthOf(1);
      expect(messages[0].state.mind_label).to.equal('test_mind');
    });

    it('handles non-existent mind gracefully', () => {
      const state = mockAdventure.state;
      messages.length = 0;

      Channel.dispatch.query_mind({
        mind: '999999',
        state_id: String(state._id),
        client_id: 1
      });

      // Should not post message if mind not found
      expect(messages).to.have.lengthOf(0);
    });

    it('handles non-existent state gracefully', () => {
      messages.length = 0;

      Channel.dispatch.query_mind({
        mind: 'test_mind',
        state_id: '999999',
        client_id: 1
      });

      // Should not post message if state not found
      expect(messages).to.have.lengthOf(0);
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

      const mind1 = new Mind('mind1');
      const state1 = mind1.create_state(1);

      const mockAdventure = {
        world: mind1,
        state: state1
      };

      await Channel.init_channel(mockAdventure, DB);
    });

    it('can find state by searching all minds', () => {
      const mind2 = new Mind('mind2');
      const hammer = mind2.add({ label: 'hammer', bases: ['PortableObject'] });
      const state2 = mind2.create_state(1);
      state2.insert.push(hammer);

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

    it('handles non-existent state gracefully', () => {
      messages.length = 0;

      Channel.dispatch.query_state({
        state: '999999',
        client_id: 1
      });

      expect(messages).to.have.lengthOf(0);
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

      const world_mind = new Mind('world');
      const mockAdventure = {
        world: world_mind,
        state: world_mind.create_state(1)
      };

      await Channel.init_channel(mockAdventure, DB);
    });

    it('can find belief by id and returns correct data', () => {
      const mind = new Mind('belief_test_mind');
      const hammer = mind.add({
        label: 'query_hammer',
        bases: ['PortableObject']
      });
      const state = mind.create_state(1);
      state.insert.push(hammer);

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

    it('handles non-existent belief gracefully', () => {
      const mind = new Mind('test_mind');
      const state = mind.create_state(1);
      messages.length = 0;

      Channel.dispatch.query_belief({
        belief: '999999',
        state_id: String(state._id),
        client_id: 1
      });

      expect(messages).to.have.lengthOf(0);
    });

    it('includes about chain in response', () => {
      const world_mind = new Mind('world');
      const workshop = world_mind.add({
        label: 'query_workshop',
        bases: ['Location']
      });
      const world_state = world_mind.create_state(1);
      world_state.insert.push(workshop);

      const npc_mind = new Mind('npc');
      const npc_state = npc_mind.create_state(1);
      const workshop_belief = npc_state.learn_about(world_state, workshop);

      messages.length = 0;

      Channel.dispatch.query_belief({
        belief: String(workshop_belief._id),
        state_id: String(npc_state._id),
        client_id: 1
      });

      expect(messages).to.have.lengthOf(1);
      expect(messages[0].about).to.not.be.null;
      expect(messages[0].about.label).to.equal('query_workshop');
      expect(messages[0].about.mind.label).to.equal('world');
    });

    it('includes bases information', () => {
      const mind = new Mind('bases_test_mind');
      const hammer = mind.add({
        label: 'bases_hammer',
        bases: ['PortableObject']
      });
      const state = mind.create_state(1);
      state.insert.push(hammer);

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

    it('can find belief in Adventure.state', async () => {
      const mind = new Mind('entity_test_mind');
      const ball = mind.add({
        label: 'test_ball',
        bases: ['PortableObject'],
        traits: { color: 'red' }
      });
      const state = mind.create_state(1);
      state.insert.push(ball);

      const mockAdventure = {
        world: mind,
        state: state,
        player: ball
      };

      await Channel.init_channel(mockAdventure, DB);
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

    it('handles non-existent entity gracefully', async () => {
      const mind = new Mind('empty_entity_mind');
      const state = mind.create_state(1);

      const mockAdventure = {
        world: mind,
        state: state
      };

      await Channel.init_channel(mockAdventure, DB);
      messages.length = 0;

      Channel.dispatch.query_entity({
        id: 999999,
        client_id: 1
      });

      expect(messages).to.have.lengthOf(0);
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

      const mind = new Mind('world');
      const mockAdventure = {
        world: mind,
        state: mind.create_state(1)
      };

      await Channel.init_channel(mockAdventure, DB);
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
