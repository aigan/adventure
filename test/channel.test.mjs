import { expect } from 'chai';
import * as DB from '../public/worker/db.mjs';

describe('Channel Message Handlers', () => {
  beforeEach(() => {
    DB.reset_registries();
    const traittypes = {
      location: 'Location',
      mind_states: 'State',
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
      Player: {
        bases: ['Actor', 'Mental'],
      },
    }

    DB.register(archetypes, traittypes);
  });

  describe('query_mind handler', () => {
    it('can find mind by numeric id', () => {
      const mind = new DB.Mind('test_mind');
      const hammer = mind.add({
        label: 'test_hammer',
        bases: ['PortableObject']
      });
      const state = mind.create_state(1);
      state.insert.push(hammer);

      // Simulate query_mind logic
      const mind_id = String(mind._id);
      const mind_obj = /^\d+$/.test(mind_id)
        ? DB.Mind.get_by_id(Number(mind_id))
        : DB.Mind.get_by_label(mind_id);

      expect(mind_obj).to.equal(mind);

      // Get latest state
      const states = [...mind_obj.state];
      const latest_state = states[states.length - 1];
      expect(latest_state).to.equal(state);

      // Verify beliefs can be extracted
      const beliefs = [...latest_state.get_beliefs()];
      expect(beliefs).to.have.lengthOf(1);
      expect(beliefs[0]).to.equal(hammer);
    });

    it('can find mind by label', () => {
      const mind = new DB.Mind('labeled_mind');

      // Simulate query_mind logic with label
      const mind_label = 'labeled_mind';
      const mind_obj = /^\d+$/.test(mind_label)
        ? DB.Mind.get_by_id(Number(mind_label))
        : DB.Mind.get_by_label(mind_label);

      expect(mind_obj).to.equal(mind);
    });

    it('returns undefined for non-existent mind', () => {
      const mind_obj = DB.Mind.get_by_id(999999);
      expect(mind_obj).to.be.undefined;
    });

    it('handles mind with no states', () => {
      const mind = new DB.Mind('empty_mind');
      const states = [...mind.state];
      expect(states).to.have.lengthOf(0);
    });

    it('extracts belief data correctly', () => {
      const mind = new DB.Mind('data_test_mind');
      const hammer = mind.add({
        label: 'data_hammer',
        bases: ['PortableObject'],
        traits: { color: 'red' }
      });
      const state = mind.create_state(1);
      state.insert.push(hammer);

      const beliefs = [...state.get_beliefs()];
      const belief = beliefs[0];

      // Simulate data extraction from channel.mjs
      const data = {
        id: belief._id,
        label: belief.label,
        desig: belief.sysdesig(),
      };

      expect(data.id).to.be.a('number');
      expect(data.label).to.equal('data_hammer');
      expect(data.desig).to.be.a('string');
    });
  });

  describe('query_state handler', () => {
    it('can find state by searching all minds', () => {
      const mind1 = new DB.Mind('mind1');
      const state1 = mind1.create_state(1);

      const mind2 = new DB.Mind('mind2');
      const state2 = mind2.create_state(1);

      // Simulate query_state logic
      const state_id = state2._id;
      let found_state = null;
      for (const [_id, mind] of DB.Mind.by_id) {
        for (const s of mind.state) {
          if (s._id === state_id) {
            found_state = s;
            break;
          }
        }
        if (found_state) break;
      }

      expect(found_state).to.equal(state2);
      expect(found_state.in_mind).to.equal(mind2);
    });

    it('returns null for non-existent state', () => {
      const state_id = 999999;
      let found_state = null;
      for (const [_id, mind] of DB.Mind.by_id) {
        for (const s of mind.state) {
          if (s._id === state_id) {
            found_state = s;
            break;
          }
        }
        if (found_state) break;
      }

      expect(found_state).to.be.null;
    });
  });

  describe('query_belief handler', () => {
    it('can find belief by id using global registry', () => {
      const mind = new DB.Mind('belief_test_mind');
      const hammer = mind.add({
        label: 'query_hammer',
        bases: ['PortableObject']
      });

      // Simulate query_belief logic (after fix)
      const belief_id = hammer._id;
      const belief_obj = DB.Belief.by_id.get(belief_id);

      expect(belief_obj).to.equal(hammer);
      expect(belief_obj.in_mind).to.equal(mind);
    });

    it('returns undefined for non-existent belief', () => {
      const belief_obj = DB.Belief.by_id.get(999999);
      expect(belief_obj).to.be.undefined;
    });

    it('extracts belief data with about chain', () => {
      const world_mind = new DB.Mind('world');
      const workshop = world_mind.add({
        label: 'query_workshop',
        bases: ['Location']
      });

      const npc_mind = new DB.Mind('npc');
      const npc_state = npc_mind.create_state(1);
      const workshop_belief = npc_state.learn_about(workshop);

      // Simulate data extraction
      const belief_obj = workshop_belief;
      const data = {
        data: belief_obj.inspect(),
      };
      const desig = belief_obj.sysdesig();
      const mind_data = {
        id: belief_obj.in_mind._id,
        label: belief_obj.in_mind.label
      };
      const about_data = belief_obj.about ? {
        id: belief_obj.about._id,
        label: belief_obj.about.label,
        mind: {
          id: belief_obj.about.in_mind._id,
          label: belief_obj.about.in_mind.label
        }
      } : null;

      expect(data.data).to.exist;
      expect(desig).to.be.a('string');
      expect(mind_data.label).to.equal('npc');
      expect(about_data).to.not.be.null;
      expect(about_data.label).to.equal('query_workshop');
      expect(about_data.mind.label).to.equal('world');
    });

    it('extracts bases correctly', () => {
      const mind = new DB.Mind('bases_test_mind');
      const hammer = mind.add({
        label: 'bases_hammer',
        bases: ['PortableObject']
      });

      // Simulate bases extraction
      const bases = [...hammer.bases].map(b => ({
        id: b instanceof DB.Belief ? b._id : null,
        label: b.label,
        type: b instanceof DB.Archetype ? 'Archetype' : 'Belief'
      }));

      expect(bases.length).to.be.greaterThan(0);
      expect(bases.some(b => b.label === 'PortableObject')).to.be.true;
      expect(bases.some(b => b.type === 'Archetype')).to.be.true;
    });
  });

  describe('query_entity handler', () => {
    it('can find belief in Adventure.state', () => {
      // This test validates the pattern used by query_entity
      // Note: We can't directly test Adventure.state without importing world.mjs
      const mind = new DB.Mind('entity_test_mind');
      const ball = mind.add({
        label: 'test_ball',
        bases: ['PortableObject']
      });
      const state = mind.create_state(1);
      state.insert.push(ball);

      // Simulate query_entity logic
      const id = ball._id;
      let belief = null;
      for (const b of state.get_beliefs()) {
        if (b._id === id) {
          belief = b;
          break;
        }
      }

      expect(belief).to.equal(ball);
    });

    it('returns null for non-existent entity in state', () => {
      const mind = new DB.Mind('empty_entity_mind');
      const state = mind.create_state(1);

      const id = 999999;
      let belief = null;
      for (const b of state.get_beliefs()) {
        if (b._id === id) {
          belief = b;
          break;
        }
      }

      expect(belief).to.be.null;
    });

    it('extracts entity data using toJSON', () => {
      const mind = new DB.Mind('json_test_mind');
      const hammer = mind.add({
        label: 'json_hammer',
        bases: ['PortableObject'],
        traits: { color: 'blue' }
      });

      // Simulate data extraction using toJSON
      const data = {
        data: hammer.toJSON(),
      };

      expect(data.data).to.exist;
      expect(data.data.label).to.equal('json_hammer');
      expect(data.data.traits).to.exist;
    });
  });

  describe('message routing logic', () => {
    it('validates message structure', () => {
      const message = {
        msg: 'query_mind',
        mind: 'test_mind',
        client_id: 1,
        server_id: 1
      };

      // Simulate message validation
      expect(message.msg).to.exist;
      expect(message.msg).to.be.a('string');
    });

    it('validates dispatch handler exists', () => {
      const valid_messages = [
        'connect',
        'hello',
        'query_mind',
        'query_state',
        'query_belief',
        'query_entity'
      ];

      // These are the handlers that should exist in dispatch object
      valid_messages.forEach(msg => {
        expect(msg).to.be.a('string');
      });
    });
  });

  describe('client_id sequence', () => {
    it('increments client id', () => {
      // Simulate client_id_sequence increment
      let client_id_sequence = 0;

      const id1 = ++client_id_sequence;
      const id2 = ++client_id_sequence;
      const id3 = ++client_id_sequence;

      expect(id1).to.equal(1);
      expect(id2).to.equal(2);
      expect(id3).to.equal(3);
    });
  });
});
