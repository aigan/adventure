import { expect } from 'chai';
import * as DB from '../public/worker/db.mjs';
import { createMindWithBeliefs, setupStandardArchetypes, setupMinimalArchetypes } from './helpers.mjs';

describe('learn_about', () => {
  beforeEach(() => {
    DB.reset_registries();
    setupStandardArchetypes();
  });

  describe('Basic Functionality', () => {
    it('copies archetypes to different mind', () => {
      const world_mind = createMindWithBeliefs('world', {
        workshop: {
          bases: ['Location']
        }
      });

      const player_mind = new DB.Mind('player');
      const player_mind_state = player_mind.create_state(1);
      const workshop = DB.Belief.by_label.get('workshop');
      const workshop_knowledge = player_mind_state.learn_about(workshop);

      const inspected = workshop_knowledge.inspect();
      expect(inspected.about._ref).to.equal(workshop._id);
      // Location inherits from ObjectPhysical
      expect(inspected.archetypes).to.deep.equal(['Location', 'ObjectPhysical']);
    });

    it('learned belief can use traits from archetype chain', () => {
      const world_mind = createMindWithBeliefs('world', {
        hammer: {
          bases: ['PortableObject'],
          traits: {
            color: 'red'
          }
        }
      });

      const npc_mind = new DB.Mind('npc');
      const npc_mind_state = npc_mind.create_state(1);
      const hammer = DB.Belief.by_label.get('hammer');
      const hammer_belief = npc_mind_state.learn_about(hammer, ['color']);

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
      const world_mind = new DB.Mind('world');
      const world_mind_state = world_mind.create_state(1);
      world_mind.add({label: 'hammer_v1', bases: ['PortableObject']});

      const hammer_v1 = DB.Belief.by_label.get('hammer_v1');
      const hammer_v2 = new DB.Belief(hammer_v1.in_mind, {
        bases: [hammer_v1],
        traits: { color: 'red' }
      });

      const npc_mind = new DB.Mind('npc');
      const npc_mind_state = npc_mind.create_state(1);
      const hammer_knowledge = npc_mind_state.learn_about(hammer_v2);

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
      const world_mind = createMindWithBeliefs('world', {
        workshop: { bases: ['Location'] },
        hammer: {
          bases: ['PortableObject'],
          traits: { location: 'workshop' }
        }
      });

      const player_mind = new DB.Mind('player');
      const player_mind_state = player_mind.create_state(1);
      const workshop_knowledge = player_mind_state.learn_about(
        DB.Belief.by_label.get('workshop')
      );

      // Should be able to reference learned belief in traits
      const hammer_knowledge = player_mind.add({
        label: 'hammer_knowledge',
        bases: ['PortableObject'],
        traits: { location: workshop_knowledge }
      });

      expect(hammer_knowledge.traits.get('location')).to.equal(workshop_knowledge);
    });

    it('learn_about directly from base belief works', () => {
      const world_mind = new DB.Mind('world');
      const world_mind_state = world_mind.create_state(1);
      world_mind.add({label: 'base_hammer', bases: ['PortableObject']});

      const base_hammer = DB.Belief.by_label.get('base_hammer');

      const npc_mind = new DB.Mind('npc');
      const npc_mind_state = npc_mind.create_state(1);
      const learned = npc_mind_state.learn_about(base_hammer);

      // Works when learning directly from belief with archetype bases
      const archetypes = [...learned.get_archetypes()].map(a => a.label);
      expect(archetypes).to.include('PortableObject');
      expect(archetypes).to.include('ObjectPhysical');
    });

    it('learn_about should dereference trait beliefs to learning mind', () => {
      const world_mind = createMindWithBeliefs('world', {
        workshop: { bases: ['Location'] },
        hammer: {
          bases: ['PortableObject'],
          traits: { location: 'workshop' }  // References DB.Belief.by_label.get('workshop')
        }
      });

      const npc_mind = new DB.Mind('npc');
      const npc_mind_state = npc_mind.create_state(1);
      const hammer_knowledge = npc_mind_state.learn_about(
        DB.Belief.by_label.get('hammer'),
        ['location']
      );

      // Expected behavior: trait references should be dereferenced to npc_mind
      const location_ref = hammer_knowledge.traits.get('location');

      // Should be a belief in npc_mind, not world_mind
      expect(location_ref.in_mind).to.equal(npc_mind);

      // Should be about the workshop from world_mind
      expect(location_ref.about).to.equal(DB.Belief.by_label.get('workshop'));

      // Should have the same archetypes
      const archetypes = [...location_ref.get_archetypes()].map(a => a.label);
      expect(archetypes).to.include('Location');
    });

    it('learn_about should reuse existing beliefs with same about reference', () => {
      const world_mind = createMindWithBeliefs('world', {
        workshop: { bases: ['Location'] },
        hammer: {
          bases: ['PortableObject'],
          traits: { location: 'workshop' }
        }
      });

      const npc_mind = new DB.Mind('npc');
      const npc_mind_state = npc_mind.create_state(1);

      // NPC already knows about the workshop
      const existing_workshop = npc_mind.add({
        label: 'my_workshop',
        about: DB.Belief.by_label.get('workshop'),
        bases: ['Location']
      });
      npc_mind_state.insert.push(existing_workshop);

      const hammer_knowledge = npc_mind_state.learn_about(
        DB.Belief.by_label.get('hammer'),
        ['location']
      );

      // Should reuse existing belief about the workshop
      const location_ref = hammer_knowledge.traits.get('location');
      expect(location_ref).to.equal(existing_workshop);
    });

    it('learn_about should error when multiple beliefs about same entity exist', () => {
      const world_mind = createMindWithBeliefs('world', {
        workshop: { bases: ['Location'] },
        hammer: {
          bases: ['PortableObject'],
          traits: { location: 'workshop' }
        }
      });

      const npc_mind = new DB.Mind('npc');
      const npc_mind_state = npc_mind.create_state(1);

      // NPC has two different beliefs about the workshop (uncertainty case)
      const belief1 = npc_mind.add({
        label: 'workshop_belief_1',
        about: DB.Belief.by_label.get('workshop'),
        bases: ['Location']
      });

      const belief2 = npc_mind.add({
        label: 'workshop_belief_2',
        about: DB.Belief.by_label.get('workshop'),
        bases: ['Location']
      });

      npc_mind_state.insert.push(belief1, belief2);

      // Should error - can't determine which to use without certainty tracking
      expect(() => {
        npc_mind_state.learn_about(
          DB.Belief.by_label.get('hammer'),
          ['location']
        );
      }).to.throw();
    });

    it('learn_about should follow about chain to original entity', () => {
      const world_mind = new DB.Mind('world');
      const world_mind_state = world_mind.create_state(1);
      world_mind.add({label: 'workshop', bases: ['Location']});

      const npc1_mind = new DB.Mind('npc1');
      const npc1_mind_state = npc1_mind.create_state(1);
      const workshop_from_npc1 = npc1_mind.add({
        label: 'workshop_knowledge',
        about: DB.Belief.by_label.get('workshop'),
        bases: ['Location']
      });

      const npc2_mind = new DB.Mind('npc2');
      const npc2_mind_state = npc2_mind.create_state(1);
      // NPC2 learns about NPC1's belief
      const workshop_from_npc2 = npc2_mind_state.learn_about(workshop_from_npc1);

      // Should follow about chain: npc2_belief.about = world.workshop (not npc1_belief)
      expect(workshop_from_npc2.about).to.equal(DB.Belief.by_label.get('workshop'));
      expect(workshop_from_npc2.about).to.not.equal(workshop_from_npc1);
    });

    it('learn_about should walk belief chain to find archetypes', () => {
      const world_mind = new DB.Mind('world');
      const world_mind_state = world_mind.create_state(1);
      world_mind.add({label: 'hammer_v1', bases: ['PortableObject']});

      const hammer_v1 = DB.Belief.by_label.get('hammer_v1');
      const hammer_v2 = new DB.Belief(hammer_v1.in_mind, {
        bases: [hammer_v1],
        traits: { color: 'red' }
      });

      const npc_mind = new DB.Mind('npc');
      const npc_mind_state = npc_mind.create_state(1);
      const hammer_knowledge = npc_mind_state.learn_about(hammer_v2);

      // Should walk belief chain to find PortableObject
      const archetypes = [...hammer_knowledge.get_archetypes()].map(a => a.label);
      expect(archetypes).to.include('PortableObject');
      expect(archetypes).to.include('ObjectPhysical');
    });

    it('learn_about should copy non-Belief trait values as-is', () => {
      const world_mind = createMindWithBeliefs('world', {
        hammer: {
          bases: ['PortableObject'],
          traits: { color: 'red' }
        }
      });

      const npc_mind = new DB.Mind('npc');
      const npc_mind_state = npc_mind.create_state(1);
      const hammer_knowledge = npc_mind_state.learn_about(
        DB.Belief.by_label.get('hammer'),
        ['color']
      );

      // String trait should be copied as-is
      expect(hammer_knowledge.traits.get('color')).to.equal('red');
    });

    it('learn_about should dereference arrays of beliefs', () => {
      // Setup: Create a container belief with an array trait
      DB.reset_registries();

      const traittypes = {
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

      const world_mind = new DB.Mind('world');

      // Create items
      const sword = world_mind.add({
        label: 'sword',
        bases: ['PortableObject']
      });

      const shield = world_mind.add({
        label: 'shield',
        bases: ['PortableObject']
      });

      // Create container with array of items
      const chest = world_mind.add({
        label: 'chest',
        bases: ['Container'],
        traits: {
          items: [sword, shield]
        }
      });

      const npc_mind = new DB.Mind('npc');
      const npc_mind_state = npc_mind.create_state(1);

      const chest_knowledge = npc_mind_state.learn_about(chest, ['items']);

      // Array should be dereferenced - each item copied to npc_mind
      const items = chest_knowledge.traits.get('items');
      expect(Array.isArray(items)).to.be.true;
      expect(items).to.have.lengthOf(2);

      // Each dereferenced belief should be in npc_mind
      expect(items[0].in_mind).to.equal(npc_mind);
      expect(items[1].in_mind).to.equal(npc_mind);

      // Should preserve the about links to original beliefs
      expect(items[0].about).to.equal(sword);
      expect(items[1].about).to.equal(shield);
    });
  });
});
