import { expect } from 'chai';
import { Mind, Materia, State, Belief, Archetype, Traittype, Session, save_mind, load, logos, logos_state, eidos, DB } from '../public/worker/cosmos.mjs';
import { learn_about } from '../public/worker/perception.mjs';
import { stdTypes, Thing, setupBrowserMocks, cleanupBrowserMocks, MockBroadcastChannel, setupAfterEachValidation } from './helpers.mjs';

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
  setupAfterEachValidation();


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
      const workshop_belief = learn_about(npc_state, workshop, {traits: []});

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

    it('shows has_promotions icon on bases with promotions', () => {
      // Promotions can only be in Eidos hierarchy
      const mind = new Materia(eidos(), 'promo_test_mind');
      const state = mind.create_state(eidos().origin_state, {tt: 1});

      // Create locations
      const workshop = state.add_belief_from_template({
        bases: ['Location'], label: 'workshop'
      });
      const tavern = state.add_belief_from_template({
        bases: ['Location'], label: 'tavern'
      });

      // Create base belief for location variations
      const merchant_loc = state.add_belief_from_template({
        bases: ['ObjectPhysical'], label: 'merchant_location',
        promotable: true
      });

      // Create promotions with certainty
      const location_tt = Traittype.get_by_label('location');
      merchant_loc.replace(state, { location: workshop.subject }, { promote: true, certainty: 0.6 });
      merchant_loc.replace(state, { location: tavern.subject }, { promote: true, certainty: 0.4 });

      // Create child that inherits from merchant_loc
      const merchant = Belief.from(state, [Archetype.get_by_label('Actor'), merchant_loc]);
      merchant.label = 'wandering_merchant';

      messages.length = 0;

      Channel.dispatch.query_belief({
        belief: String(merchant._id),
        state_id: String(state._id),
        client_id: 1
      });

      expect(messages).to.have.lengthOf(1);
      expect(messages[0].bases).to.be.an('array');

      // Find the merchant_location base
      const merchant_loc_base = messages[0].bases.find(b => b.label === 'merchant_location');
      expect(merchant_loc_base).to.exist;
      expect(merchant_loc_base.has_promotions).to.equal(true);
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
      Session.ready();
      messages.length = 0;

      // First connect (now async)
      await Channel.dispatch.connect({});
      expect(messages).to.have.lengthOf(1);
      expect(messages[0].msg).to.equal('welcome');
      expect(messages[0].client_id).to.equal(1);

      // Second connect
      await Channel.dispatch.connect({});
      expect(messages).to.have.lengthOf(2);
      expect(messages[1].client_id).to.equal(2);
    });
  });
});
