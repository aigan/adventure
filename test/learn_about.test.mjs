import { expect } from 'chai';
import { Mind, State, Belief, Subject, Archetype, Traittype, save_mind, load } from '../public/worker/cosmos.mjs';
import * as DB from '../public/worker/db.mjs';
import { createMindWithBeliefs, setupStandardArchetypes, setupMinimalArchetypes } from './helpers.mjs';

describe('learn_about', () => {
  beforeEach(() => {
    DB.reset_registries();
    setupStandardArchetypes();
  });

  describe('Basic Functionality', () => {
    it('copies archetypes to different mind', () => {
      const world_state = createMindWithBeliefs('world', {
        workshop: {
          bases: ['Location']
        }
      });

      const player_mind = new Mind('player');
      const player_mind_state = player_mind.create_state(1);
      const workshop = DB.get_belief_by_label('workshop');
      const workshop_knowledge = player_mind_state.learn_about(world_state, workshop);

      const inspected = workshop_knowledge.inspect(player_mind_state);
      expect(inspected.about._ref).to.equal(workshop._id);
      // Location inherits from ObjectPhysical
      expect(inspected.archetypes).to.deep.equal(['Location', 'ObjectPhysical']);
    });

    it('learned belief can use traits from archetype chain', () => {
      const world_state = createMindWithBeliefs('world', {
        hammer: {
          bases: ['PortableObject'],
          traits: {
            color: 'red'
          }
        }
      });

      const npc_mind = new Mind('npc');
      const npc_mind_state = npc_mind.create_state(1);
      const hammer = DB.get_belief_by_label('hammer');
      const hammer_belief = npc_mind_state.learn_about(world_state, hammer, ['color']);

      expect(hammer_belief.can_have_trait('color')).to.be.true;
      expect(hammer_belief.can_have_trait('location')).to.be.true;
      expect(hammer_belief.traits.get('color')).to.equal('red');
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      DB.reset_registries();
      setupMinimalArchetypes();
    });

    it('learn_about on versioned belief walks chain to find archetypes', () => {
      const world_mind = new Mind('world');
      const world_mind_state = world_mind.create_state(1);
      const hammer_v1_belief = world_mind_state.add_belief({label: 'hammer_v1', bases: ['PortableObject']});

      const hammer_v1 = DB.get_belief_by_label('hammer_v1');
      const hammer_v2 = Belief.from_template(hammer_v1.in_mind, {
        bases: [hammer_v1],
        traits: { color: 'red' }
      });

      const npc_mind = new Mind('npc');
      const npc_mind_state = npc_mind.create_state(1);
      const hammer_knowledge = npc_mind_state.learn_about(world_mind_state, hammer_v2);

      // hammer_v2.bases only contains hammer_v1 (Belief)
      // But learn_about walks the chain and finds PortableObject
      const bases = [...hammer_knowledge.bases];
      expect(bases.length).to.be.greaterThan(0);

      // Should find archetypes by walking the chain
      const archetypes = [...hammer_knowledge.get_archetypes()].map(a => a.label);
      expect(archetypes).to.include('PortableObject');
      expect(archetypes).to.include('ObjectPhysical');
    });

    it('learned belief can be used as trait reference', () => {
      const world_state = createMindWithBeliefs('world', {
        workshop: { bases: ['Location'] },
        hammer: {
          bases: ['PortableObject'],
          traits: { location: 'workshop' }
        }
      });

      const player_mind = new Mind('player');
      const player_mind_state = player_mind.create_state(1);
      const workshop_knowledge = player_mind_state.learn_about(
        world_state,
        DB.get_belief_by_label('workshop')
      );

      // Should be able to reference learned belief in traits
      const hammer_knowledge = player_mind_state.add_belief({
        label: 'hammer_knowledge',
        bases: ['PortableObject'],
        traits: { location: workshop_knowledge }
      });

      const location_trait = hammer_knowledge.traits.get('location');
      expect(location_trait).to.be.instanceOf(Subject);
      expect(location_trait.sid).to.equal(workshop_knowledge.sid);
    });

    it('learn_about directly from base belief works', () => {
      const world_mind = new Mind('world');
      const world_mind_state = world_mind.create_state(1);
      const base_hammer_belief = world_mind_state.add_belief({label: 'base_hammer', bases: ['PortableObject']});

      const base_hammer = DB.get_belief_by_label('base_hammer');

      const npc_mind = new Mind('npc');
      const npc_mind_state = npc_mind.create_state(1);
      const learned = npc_mind_state.learn_about(world_mind_state, base_hammer);

      // Works when learning directly from belief with archetype bases
      const archetypes = [...learned.get_archetypes()].map(a => a.label);
      expect(archetypes).to.include('PortableObject');
      expect(archetypes).to.include('ObjectPhysical');
    });

    it('learn_about should dereference trait beliefs to learning mind', () => {
      const world_state = createMindWithBeliefs('world', {
        workshop: { bases: ['Location'] },
        hammer: {
          bases: ['PortableObject'],
          traits: { location: 'workshop' }  // References DB.get_belief_by_label('workshop')
        }
      });

      const npc_mind = new Mind('npc');
      const npc_mind_state = npc_mind.create_state(1);
      const hammer_knowledge = npc_mind_state.learn_about(
        world_state,
        DB.get_belief_by_label('hammer'),
        ['location']
      );

      // Expected behavior: trait references should be dereferenced to npc_mind
      const location_ref = hammer_knowledge.get_trait(npc_mind_state, 'location');

      // Should be a belief in npc_mind, not world_mind
      expect(location_ref.in_mind).to.equal(npc_mind);

      // Should be about the workshop from world_mind
      expect(location_ref.get_about(npc_mind_state)).to.equal(DB.get_belief_by_label('workshop'));

      // Should have the same archetypes
      const archetypes = [...location_ref.get_archetypes()].map(a => a.label);
      expect(archetypes).to.include('Location');
    });

    it('learn_about should reuse existing beliefs with same about reference', () => {
      const world_state = createMindWithBeliefs('world', {
        workshop: { bases: ['Location'] },
        hammer: {
          bases: ['PortableObject'],
          traits: { location: 'workshop' }
        }
      });

      const npc_mind = new Mind('npc');
      const npc_mind_state = npc_mind.create_state(1);

      // NPC already knows about the workshop
      const existing_workshop = npc_mind_state.add_belief({
        label: 'my_workshop',
        bases: ['Location'],
        traits: {
          '@about': DB.get_belief_by_label('workshop')
        }
      });

      const hammer_knowledge = npc_mind_state.learn_about(
        world_state,
        DB.get_belief_by_label('hammer'),
        ['location']
      );

      // Should reuse existing belief about the workshop
      const location_ref = hammer_knowledge.get_trait(npc_mind_state, 'location');
      expect(location_ref).to.equal(existing_workshop);
    });

    it('learn_about should error when multiple beliefs about same entity exist', () => {
      const world_state = createMindWithBeliefs('world', {
        workshop: { bases: ['Location'] },
        hammer: {
          bases: ['PortableObject'],
          traits: { location: 'workshop' }
        }
      });

      const npc_mind = new Mind('npc');
      const npc_mind_state = npc_mind.create_state(1);

      // NPC has two different beliefs about the workshop (uncertainty case)
      const belief1 = npc_mind_state.add_belief({
        label: 'workshop_belief_1',
        bases: ['Location'],
        traits: {
          '@about': DB.get_belief_by_label('workshop')
        }
      });

      const belief2 = npc_mind_state.add_belief({
        label: 'workshop_belief_2',
        bases: ['Location'],
        traits: {
          '@about': DB.get_belief_by_label('workshop')
        }
      });

      // Should error - can't determine which to use without certainty tracking
      expect(() => {
        npc_mind_state.learn_about(
          world_state,
          DB.get_belief_by_label('hammer'),
          ['location']
        );
      }).to.throw();
    });

    it('learn_about should follow about chain to original entity', () => {
      const world_mind = new Mind('world');
      const world_mind_state = world_mind.create_state(1);
      world_mind_state.add_belief({label: 'workshop', bases: ['Location']});

      const npc1_mind = new Mind('npc1');
      const npc1_mind_state = npc1_mind.create_state(1);
      const workshop_from_npc1 = npc1_mind_state.add_belief({
        label: 'workshop_knowledge',
        bases: ['Location'],
        traits: {
          '@about': DB.get_belief_by_label('workshop')
        }
      });

      const npc2_mind = new Mind('npc2');
      const npc2_mind_state = npc2_mind.create_state(1);
      // NPC2 learns about NPC1's belief
      const workshop_from_npc2 = npc2_mind_state.learn_about(npc1_mind_state, workshop_from_npc1);

      // Should follow about chain: npc2_belief.about = world.workshop (not npc1_belief)
      expect(workshop_from_npc2.get_about(npc2_mind_state)).to.equal(DB.get_belief_by_label('workshop'));
      expect(workshop_from_npc2.get_about(npc2_mind_state)).to.not.equal(workshop_from_npc1);
    });

    it('learn_about should walk belief chain to find archetypes', () => {
      const world_mind = new Mind('world');
      const world_mind_state = world_mind.create_state(1);
      world_mind_state.add_belief({label: 'hammer_v1', bases: ['PortableObject']});

      const hammer_v1 = DB.get_belief_by_label('hammer_v1');
      const hammer_v2 = Belief.from_template(hammer_v1.in_mind, {
        bases: [hammer_v1],
        traits: { color: 'red' }
      });

      const npc_mind = new Mind('npc');
      const npc_mind_state = npc_mind.create_state(1);
      const hammer_knowledge = npc_mind_state.learn_about(world_mind_state, hammer_v2);

      // Should walk belief chain to find PortableObject
      const archetypes = [...hammer_knowledge.get_archetypes()].map(a => a.label);
      expect(archetypes).to.include('PortableObject');
      expect(archetypes).to.include('ObjectPhysical');
    });

    it('learn_about should copy non-Belief trait values as-is', () => {
      const world_state = createMindWithBeliefs('world', {
        hammer: {
          bases: ['PortableObject'],
          traits: { color: 'red' }
        }
      });

      const npc_mind = new Mind('npc');
      const npc_mind_state = npc_mind.create_state(1);
      const hammer_knowledge = npc_mind_state.learn_about(
        world_state,
        DB.get_belief_by_label('hammer'),
        ['color']
      );

      // String trait should be copied as-is
      expect(hammer_knowledge.traits.get('color')).to.equal('red');
    });

    it('learn_about should dereference arrays of beliefs', () => {
      // Setup: Create a container belief with an array trait
      DB.reset_registries();

      const traittypes = {
        '@about': {
          type: 'Subject',
          mind: 'parent'
        },
        location: 'Location',
        items: {
          type: 'PortableObject',
          container: Array,
          min: 0
        }
      };

      const archetypes = {
        ObjectPhysical: {
          traits: {
            '@about': null,
            location: null,
          },
        },
        Location: {
          bases: ['ObjectPhysical'],
        },
        PortableObject: {
          bases: ['ObjectPhysical'],
        },
        Container: {
          bases: ['ObjectPhysical'],
          traits: {
            items: null,
          },
        },
      };

      DB.register(archetypes, traittypes);

      const world_mind = new Mind('world');

      const world_mind_state = world_mind.create_state(1);

      // Create items
      const sword = world_mind_state.add_belief({
        label: 'sword',
        bases: ['PortableObject']
      });

      const shield = world_mind_state.add_belief({
        label: 'shield',
        bases: ['PortableObject']
      });

      // Create container with array of items
      const chest = world_mind_state.add_belief({
        label: 'chest',
        bases: ['Container'],
        traits: {
          items: [sword, shield]
        }
      });

      const npc_mind = new Mind('npc');
      const npc_mind_state = npc_mind.create_state(1);

      const chest_knowledge = npc_mind_state.learn_about(world_mind_state, chest, ['items']);

      // Array should be dereferenced - each item copied to npc_mind
      const items = chest_knowledge.get_trait(npc_mind_state, 'items');
      expect(Array.isArray(items)).to.be.true;
      expect(items).to.have.lengthOf(2);

      // Each dereferenced belief should be in npc_mind
      expect(items[0].in_mind).to.equal(npc_mind);
      expect(items[1].in_mind).to.equal(npc_mind);

      // Should preserve the about links to original beliefs
      expect(items[0].get_about(npc_mind_state)).to.equal(sword);
      expect(items[1].get_about(npc_mind_state)).to.equal(shield);
    });
  });
});
