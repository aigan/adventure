import { expect } from 'chai';
import { Mind, Materia, State, Belief, Archetype, Traittype, Session, save_mind, load } from '../public/worker/cosmos.mjs';
import { logos, logos_state } from '../public/worker/logos.mjs'
import * as DB from '../public/worker/db.mjs';
import { stdTypes, Thing, setupBrowserMocks, cleanupBrowserMocks, MockBroadcastChannel } from './helpers.mjs';

// Set up browser mocks at module load time
setupBrowserMocks();

describe('Channel Message Handlers', () => {
  beforeEach(() => {
    setupBrowserMocks(); // Reset mocks (including sequence counter)
    DB.reset_registries();
    const traittypes = {
      ...stdTypes,
      location: 'Location',
      mind: {
        type: 'Mind',
        composable: true,
        exposure: 'internal'
      },
      mind_states: {
        type: 'State',
        container: Array,
        min: 1
      },
      color: 'string',
    }

    const archetypes = {
      Thing,
      ObjectPhysical: {
        bases: ['Thing'],
        traits: {
          location: null,
          color: null,
        },
      },
      Mental: {
        traits: {
          mind: null,
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

    DB.register(traittypes, archetypes, {});
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

      const world_mind = new Materia(logos(), 'test_mind');
      const state = world_mind.create_state(logos().origin_state, {tt: 1});
      const hammer = state.add_belief_from_template({
        bases: ['PortableObject'],
        traits: { color: 'red' }, label: 'test_hammer'
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

      const mind1 = new Materia(logos(), 'mind1');
      const state1 = mind1.create_state(logos().origin_state, {tt: 1});

      const mockSession = new Session(mind1, state1);

      await Channel.init_channel(mockSession);
    });

    it('can find state by searching all minds', () => {
      const mind2 = new Materia(logos(), 'mind2');
      const state2 = mind2.create_state(logos().origin_state, {tt: 1});
      const hammer = state2.add_belief_from_template({ bases: ['PortableObject'], traits: {}, label: 'hammer' });

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

      const world_mind = new Materia(logos(), 'world');
      const mockSession = new Session(world_mind, world_mind.create_state(logos().origin_state, {tt: 1}));

      await Channel.init_channel(mockSession);
    });

    it('can find belief by id and returns correct data', () => {
      const mind = new Materia(logos(), 'belief_test_mind');
      const state = mind.create_state(logos().origin_state, {tt: 1});
      const hammer = state.add_belief_from_template({
        traits: {}, label: 'query_hammer',
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
      const mind = new Materia(logos(), 'test_mind');
      const state = mind.create_state(logos().origin_state, {tt: 1});
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
      const world_mind = new Materia(logos(), 'world');
      const world_state = world_mind.create_state(logos().origin_state, {tt: 1});
      const workshop = world_state.add_belief_from_template({
        traits: {}, label: 'query_workshop',
        bases: ['Location']
      });

      const npc_mind = new Materia(world_mind, 'npc');
      const npc_state = npc_mind.create_state(world_state);
      const workshop_belief = npc_state.learn_about(workshop, {traits: []});

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
      const mind = new Materia(logos(), 'bases_test_mind');
      const state = mind.create_state(logos().origin_state, {tt: 1});
      const hammer = state.add_belief_from_template({
        traits: {}, label: 'bases_hammer',
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
      // Archetypes have no id field
      expect(messages[0].bases.some(b => b.label === 'PortableObject' && !b.id)).to.be.true;
    });

    it('returns mind trait correctly for Person with mind', () => {
      const world_mind = new Materia(logos(), 'world');
      const world_state = world_mind.create_state(logos().origin_state, {tt: 1});

      // Create player with mind trait (like in world.mjs)
      const player = world_state.add_belief_from_template({
        bases: ['Person'],
        traits: {
          mind: {
            // Empty mind knowledge for now
          }
        },
        label: 'player'
      });

      messages.length = 0;

      Channel.dispatch.query_belief({
        belief: String(player._id),
        state_id: String(world_state._id),
        client_id: 1
      });

      expect(messages).to.have.lengthOf(1);
      expect(messages[0].data.data.traits.mind).to.not.be.null;
      expect(messages[0].data.data.traits.mind._type).to.equal('Mind');
      expect(messages[0].data.data.traits.mind.label).to.equal('player');
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
      const mind = new Materia(logos(), 'entity_test_mind');
      const state = mind.create_state(logos().origin_state, {tt: 1});
      const ball = state.add_belief_from_template({
                bases: ['PortableObject'],
        traits: {color: 'red'}, label: 'test_ball'
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
      const mind = new Materia(logos(), 'empty_entity_mind');
      const state = mind.create_state(logos().origin_state, {tt: 1});

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

      const mind = new Materia(logos(), 'world');
      const mockSession = new Session(mind, mind.create_state(logos().origin_state, {tt: 1}));

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
