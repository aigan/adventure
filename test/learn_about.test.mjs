import { expect } from 'chai';
import { Mind, State, Belief, Subject, Archetype, Traittype, save_mind, load } from '../public/worker/cosmos.mjs';
import * as DB from '../public/worker/db.mjs';
import { createMindWithBeliefs, setupStandardArchetypes, setupMinimalArchetypes, get_first_belief_by_label } from './helpers.mjs';

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

      const player_mind = new Mind(world_state.in_mind, 'player');
      const player_mind_state = player_mind.create_state(1, world_state);
      const workshop = get_first_belief_by_label('workshop');
      const workshop_knowledge = player_mind_state.learn_about(workshop, []);

      const inspected = workshop_knowledge.to_inspect_view(player_mind_state);
      expect(inspected.traits['@about']._ref).to.equal(workshop._id);
      // Location inherits from ObjectPhysical, which inherits from Thing
      expect(inspected.archetypes).to.deep.equal(['Location', 'ObjectPhysical', 'Thing']);
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

      const npc_mind = new Mind(world_state.in_mind, 'npc');
      const npc_mind_state = npc_mind.create_state(1, world_state);
      const hammer = get_first_belief_by_label('hammer');
      const hammer_belief = npc_mind_state.learn_about(hammer, ['color']);

      expect(hammer_belief.can_have_trait('color')).to.be.true;
      expect(hammer_belief.can_have_trait('location')).to.be.true;
      expect(hammer_belief.get_trait(npc_mind_state, 'color')).to.equal('red');
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      DB.reset_registries();
      setupMinimalArchetypes();
    });

    it('learn_about on versioned belief walks chain to find archetypes', () => {
      const world_mind = new Mind(null, 'world');
      const world_mind_state = world_mind.create_state(1);
      const hammer_v1_belief = world_mind_state.add_belief_from_template({bases: ['PortableObject'], traits: {'@label': 'hammer_v1'}});

      const hammer_v1 = get_first_belief_by_label('hammer_v1');
      const hammer_v2 = Belief.from_template(world_mind_state, {
        bases: [hammer_v1],
        traits: { color: 'red' }
      });
      world_mind_state.insert.push(hammer_v2);

      const npc_mind = new Mind(world_mind, 'npc');
      const npc_mind_state = npc_mind.create_state(1, world_mind_state);
      const hammer_knowledge = npc_mind_state.learn_about(hammer_v2, []);

      // hammer_v2._bases only contains hammer_v1 (Belief)
      // But learn_about walks the chain and finds PortableObject
      const bases = [...hammer_knowledge._bases];
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

      const player_mind = new Mind(world_state.in_mind, 'player');
      const player_mind_state = player_mind.create_state(1, world_state);
      const workshop_knowledge = player_mind_state.learn_about(
        get_first_belief_by_label('workshop'),
        [],
        world_state
      );

      // Should be able to reference learned belief in traits
      const hammer_knowledge = player_mind_state.add_belief_from_template({
        bases: ['PortableObject'],
        traits: { '@label': 'hammer_knowledge', location: workshop_knowledge.subject }
      });

      const location_trait = hammer_knowledge._traits.get('location');
      expect(location_trait).to.be.instanceOf(Subject);
      expect(location_trait).to.equal(workshop_knowledge.subject);
    });

    it('learn_about directly from base belief works', () => {
      const world_mind = new Mind(null, 'world');
      const world_mind_state = world_mind.create_state(1);
      const base_hammer_belief = world_mind_state.add_belief_from_template({bases: ['PortableObject'], traits: {'@label': 'base_hammer'}});

      const base_hammer = get_first_belief_by_label('base_hammer');

      const npc_mind = new Mind(world_mind, 'npc');
      const npc_mind_state = npc_mind.create_state(1, world_mind_state);
      const learned = npc_mind_state.learn_about(base_hammer, []);

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
          traits: { location: 'workshop' }  // References get_first_belief_by_label('workshop')
        }
      });

      const npc_mind = new Mind(world_state.in_mind, 'npc');
      const npc_mind_state = npc_mind.create_state(1, world_state);
      const hammer_knowledge = npc_mind_state.learn_about(
        get_first_belief_by_label('hammer'),
        ['location']
      );

      // Expected behavior: trait references should be dereferenced to npc_mind
      const location_ref = hammer_knowledge.get_trait(npc_mind_state, 'location')?.get_belief_by_state(npc_mind_state);

      // Should be a belief in npc_mind, not world_mind
      expect(location_ref.in_mind).to.equal(npc_mind);

      // Should be about the workshop from world_mind
      expect(location_ref.get_about(npc_mind_state)).to.equal(get_first_belief_by_label('workshop'));

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

      const npc_mind = new Mind(world_state.in_mind, 'npc');
      const npc_mind_state = npc_mind.create_state(1, world_state);

      // NPC already knows about the workshop
      const existing_workshop = npc_mind_state.add_belief_from_template({
                bases: ['Location'],
        traits: {'@label': 'my_workshop', '@about': get_first_belief_by_label('workshop').subject}
      });

      const hammer_knowledge = npc_mind_state.learn_about(
        get_first_belief_by_label('hammer'),
        ['location']
      );

      // Should reuse existing belief about the workshop
      const location_ref = hammer_knowledge.get_trait(npc_mind_state, 'location')?.get_belief_by_state(npc_mind_state);
      expect(location_ref).to.equal(existing_workshop);
    });

    it('learn_about should update first belief when multiple beliefs about same entity exist', () => {
      const world_state = createMindWithBeliefs('world', {
        workshop: { bases: ['Location'] },
        hammer: {
          bases: ['PortableObject'],
          traits: { location: 'workshop' }
        }
      });

      const npc_mind = new Mind(world_state.in_mind, 'npc');
      const npc_mind_state = npc_mind.create_state(1, world_state);

      // NPC has two different beliefs about the workshop (uncertainty case)
      const belief1 = npc_mind_state.add_belief_from_template({
                bases: ['Location'],
        traits: {'@label': 'workshop_belief_1', '@about': get_first_belief_by_label('workshop')}
      });

      const belief2 = npc_mind_state.add_belief_from_template({
                bases: ['Location'],
        traits: {'@label': 'workshop_belief_2', '@about': get_first_belief_by_label('workshop')}
      });

      npc_mind_state.lock();
      const new_state = npc_mind_state.branch_state(world_state);

      // New behavior: updates first belief (highest confidence in future)
      const hammer_knowledge = new_state.learn_about(
        get_first_belief_by_label('hammer'),
        ['location'],
        world_state
      );

      // Should have created hammer knowledge with location reference
      const location_ref = hammer_knowledge.get_trait(new_state, 'location')?.get_belief_by_state(new_state);
      expect(location_ref).to.exist;
      expect(location_ref.in_mind).to.equal(npc_mind);
    });

    // TODO: This test is skipped because learn_about() now requires source_belief to be in ground_state.
    // Cross-NPC observation (learning about sibling mind's beliefs) is not currently supported.
    // The @about trait has mind_scope='parent', so it only resolves in ground_state.
    // Future: Cross-NPC communication will work via communication events in the world that NPCs observe and learn from.
    it.skip('learn_about is not transitive - about points to the belief, not what it\'s about', () => {
      const world_mind = new Mind(null, 'world');
      const world_mind_state = world_mind.create_state(1);
      world_mind_state.add_belief_from_template({bases: ['Location'], traits: {'@label': 'workshop'}});

      const npc1_mind = new Mind(world_mind, 'npc1');
      const npc1_mind_state = npc1_mind.create_state(1, world_mind_state);
      const workshop_from_npc1 = npc1_mind_state.add_belief_from_template({
                bases: ['Location'],
        traits: {'@label': 'workshop_knowledge', '@about': get_first_belief_by_label('workshop').subject}
      });

      const npc2_mind = new Mind(world_mind, 'npc2');
      const npc2_mind_state = npc2_mind.create_state(1, world_mind_state);
      // NPC2 learns about NPC1's belief - NO LONGER SUPPORTED
      // This would require workshop_from_npc1 to be in world_mind_state (ground_state)
      const workshop_from_npc2 = npc2_mind_state.learn_about(workshop_from_npc1, []);

      // @about is not transitive: npc2's belief is about npc1's belief, not the workshop
      expect(workshop_from_npc2.get_about(npc2_mind_state)).to.equal(workshop_from_npc1);
      expect(workshop_from_npc2.get_about(npc2_mind_state)).to.not.equal(get_first_belief_by_label('workshop'));
    });

    it('learn_about should walk belief chain to find archetypes', () => {
      const world_mind = new Mind(null, 'world');
      const world_mind_state = world_mind.create_state(1);
      world_mind_state.add_belief_from_template({bases: ['PortableObject'], traits: {'@label': 'hammer_v1'}});

      const hammer_v1 = get_first_belief_by_label('hammer_v1');
      const hammer_v2 = Belief.from_template(world_mind_state, {
        bases: [hammer_v1],
        traits: { color: 'red' }
      });
      world_mind_state.insert.push(hammer_v2);

      const npc_mind = new Mind(world_mind, 'npc');
      const npc_mind_state = npc_mind.create_state(1, world_mind_state);
      const hammer_knowledge = npc_mind_state.learn_about(hammer_v2, []);

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

      const npc_mind = new Mind(world_state.in_mind, 'npc');
      const npc_mind_state = npc_mind.create_state(1, world_state);
      const hammer_knowledge = npc_mind_state.learn_about(
        get_first_belief_by_label('hammer'),
        ['color'],
        world_state
      );

      // String trait should be copied as-is
      expect(hammer_knowledge.get_trait(npc_mind_state, 'color')).to.equal('red');
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

      const world_mind = new Mind(null, 'world');

      const world_mind_state = world_mind.create_state(1);

      // Create items
      const sword = world_mind_state.add_belief_from_template({
        traits: {'@label': 'sword'},
        bases: ['PortableObject']
      });

      const shield = world_mind_state.add_belief_from_template({
        traits: {'@label': 'shield'},
        bases: ['PortableObject']
      });

      // Create container with array of items
      const chest = world_mind_state.add_belief_from_template({
                bases: ['Container'],
        traits: {'@label': 'chest', items: [sword.subject, shield.subject]}
      });

      const npc_mind = new Mind(world_mind, 'npc');
      const npc_mind_state = npc_mind.create_state(1, world_mind_state);

      const chest_knowledge = npc_mind_state.learn_about(chest, ['items']);

      // Array should be dereferenced - each item copied to npc_mind
      const items_raw = chest_knowledge.get_trait(npc_mind_state, 'items');
      const items = items_raw?.map(item =>
        item instanceof Subject ? item.get_belief_by_state(npc_mind_state) : item
      );
      expect(Array.isArray(items)).to.be.true;
      expect(items).to.have.lengthOf(2);

      // Each dereferenced belief should be in npc_mind
      expect(items[0].in_mind).to.equal(npc_mind);
      expect(items[1].in_mind).to.equal(npc_mind);

      // Should preserve the about links to original beliefs
      expect(items[0].get_about(npc_mind_state)).to.equal(sword);
      expect(items[1].get_about(npc_mind_state)).to.equal(shield);
    });

    it('learn_about copies trait values even when inherited from base', () => {
      const world_mind = new Mind(null, 'world');
      const world_state = world_mind.create_state(100);

      const workshop = world_state.add_belief_from_template({
        traits: {'@label': 'workshop'},
        bases: ['Location']
      });

      const hammer_v1 = world_state.add_belief_from_template({
                bases: ['PortableObject'],
        traits: {'@label': 'hammer', location: workshop.subject,
          color: 'grey'}
      });

      world_state.lock();

      // Hammer gets repainted - only color in _traits, location inherited
      const world_state2 = world_state.branch_state(null, 101);
      const hammer_v2 = Belief.from_template(world_state2, {
        sid: hammer_v1.subject.sid,
        bases: [hammer_v1],
        traits: {
          color: 'blue'
        }
      });
      world_state2.insert.push(hammer_v2);

      world_state2.lock();

      // Player sees hammer and learns its location (NOT color)
      const player_mind = new Mind(world_mind, 'player');
      const player_state = player_mind.create_state(101, world_state2);

      const player_hammer = player_state.learn_about(hammer_v2, ['location']);

      // Should have learned location (inherited from v1)
      expect(player_hammer._traits.has('location')).to.be.true;
      const player_knowledge_of_location = player_hammer.get_trait(player_state, 'location');
      expect(player_knowledge_of_location).to.be.instanceOf(Subject);

      // Location should reference the player's knowledge ABOUT workshop (learned belief)
      // not the original workshop.subject - this is the correct behavior!
      expect(player_knowledge_of_location.sid).to.not.equal(workshop.subject.sid);

      // Verify it's a belief about the workshop
      const location_knowledge_belief = player_state.get_belief_by_subject(player_knowledge_of_location);
      expect(location_knowledge_belief).to.exist;
      const about_subject = location_knowledge_belief.get_trait(player_state, '@about');
      expect(about_subject).to.equal(workshop.subject);

      // Should NOT have color (we didn't learn about it)
      expect(player_hammer._traits.has('color')).to.be.false;
    });

    it('incremental knowledge accumulation via inheritance', () => {
      const world_mind = new Mind(null, 'world');
      const world_state = world_mind.create_state(100);

      const workshop = world_state.add_belief_from_template({
        traits: {'@label': 'workshop'},
        bases: ['Location']
      });

      const hammer = world_state.add_belief_from_template({
                bases: ['PortableObject'],
        traits: {'@label': 'hammer', location: workshop.subject,
          color: 'grey'}
      });

      world_state.lock();

      // T1: Player learns color only
      const player_mind = new Mind(world_mind, 'player');
      const player_state1 = player_mind.create_state(1, world_state);

      const player_hammer_v1 = player_state1.learn_about(hammer, ['color']);

      expect(player_hammer_v1._traits.has('color')).to.be.true;
      expect(player_hammer_v1._traits.has('location')).to.be.false;
      expect(player_hammer_v1.get_trait(player_state1, 'color')).to.equal('grey');

      // T2: Player learns location (new observation)
      // Create new state and learn additional trait
      const player_state2 = player_mind.create_state(2, world_state);
      const player_hammer_v2 = player_state2.learn_about(hammer, ['location']);

      // v2 has location in _traits, color inherited from v1
      expect(player_hammer_v2._traits.has('location')).to.be.true;
      expect(player_hammer_v2._traits.has('color')).to.be.false;  // not in _traits

      // But get_trait finds both
      const player_knowledge_of_location_v2 = player_hammer_v2.get_trait(player_state2, 'location');
      expect(player_knowledge_of_location_v2).to.be.instanceOf(Subject);

      // Should be player's knowledge about workshop, not original workshop
      expect(player_knowledge_of_location_v2.sid).to.not.equal(workshop.subject.sid);

      // Verify it points to knowledge about workshop
      const location_belief = player_state2.get_belief_by_subject(player_knowledge_of_location_v2);
      expect(location_belief.get_trait(player_state2, '@about')).to.equal(workshop.subject);

      expect(player_hammer_v2.get_trait(player_state2, 'color')).to.equal('grey');  // inherited!
    });
  });
});
