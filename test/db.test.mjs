import { expect } from 'chai';
import * as DB from '../public/worker/db.mjs';

// Helper to create a mind with initial beliefs (for test compatibility)
function createMindWithBeliefs(label, beliefs = {}) {
  const mind = new DB.Mind(label);
  for (const [label, def] of Object.entries(beliefs)) {
    mind.add({...def, label});
  }
  return mind;
}

describe('Mind', () => {
  it('creates mind with unique ID', () => {
    const mind = new DB.Mind('test_mind');
    expect(mind._id).to.be.a('number');
    expect(mind.label).to.equal('test_mind');
  });

  it('registers mind by id and label', () => {
    const mind = new DB.Mind('registered');
    expect(DB.Mind.get_by_id(mind._id)).to.equal(mind);
    expect(DB.Mind.get_by_label('registered')).to.equal(mind);
  });
});

describe('Archetypes', () => {
  beforeEach(() => {
    DB.reset_registries();
    // Setup archetypes like world.mjs
    const traittypes = {
      location: 'Location',
      mind: 'Mind',
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
      Player: {
        bases: ['Actor', 'Mental'],
      },
    }

    DB.register(archetypes, traittypes);
  });

  describe('Archetype Composition', () => {
    it('single archetype has correct structure', () => {
      const mind = new DB.Mind('test');
      const workshop = mind.add({
        label: 'workshop',
        bases: ['Location']
      });

      const inspected = workshop.inspect();
      // Location inherits from ObjectPhysical, so we get both
      expect(inspected.archetypes).to.deep.equal(['Location', 'ObjectPhysical']);
    });

    it('archetype with base inherits traits from parent', () => {
      const mind = new DB.Mind('test');
      const hammer = mind.add({
        label: 'hammer',
        bases: ['PortableObject'],
        traits: {
          color: 'black'
        }
      });

      // PortableObject → ObjectPhysical, so should have color trait
      expect(hammer.can_have_trait('color')).to.be.true;
      expect(hammer.can_have_trait('location')).to.be.true;
    });

    it('Player archetype inherits from multiple bases', () => {
      const mind = new DB.Mind('test');
      const player = mind.add({
        label: 'player',
        bases: ['Player']
      });

      const inspected = player.inspect();
      expect(inspected.archetypes).to.deep.equal(['Player', 'Actor', 'Mental', 'ObjectPhysical']);

      // Player → Actor → ObjectPhysical (has location, color)
      // Player → Mental (has mind)
      expect(player.can_have_trait('location')).to.be.true;
      expect(player.can_have_trait('mind')).to.be.true;
    });

    it('get_archetypes walks full inheritance chain', () => {
      const mind = new DB.Mind('test');
      const player = mind.add({
        label: 'player',
        bases: ['Player']
      });

      const archetype_labels = [...player.get_archetypes()].map(a => a.label);

      expect(archetype_labels).to.include('Player');
      expect(archetype_labels).to.include('Actor');
      expect(archetype_labels).to.include('Mental');
      expect(archetype_labels).to.include('ObjectPhysical');
    });
  });

  describe('Belief Versioning', () => {
    it('with_traits creates new belief with base reference', () => {
      const mind = createMindWithBeliefs('test', {
        workshop: {
          bases: ['Location']
        }
      });

      const ball = mind.add({
        label: 'ball',
        bases: ['PortableObject'],
        traits: {
          location: 'workshop'
        }
      });

      const ball_v2 = ball.with_traits({
        color: 'blue'
      });

      const inspected = ball_v2.inspect();
      expect(inspected.bases).to.include(ball._id);
      expect(inspected.traits.color).to.equal('blue');

      // Should still have location from base
      expect(ball_v2.can_have_trait('location')).to.be.true;
    });

    it('versioned belief inherits archetypes from base', () => {
      const mind = new DB.Mind('test');
      const hammer = mind.add({
        label: 'hammer',
        bases: ['PortableObject']
      });

      const hammer_v2 = hammer.with_traits({
        color: 'black'
      });

      const inspected = hammer_v2.inspect();
      // hammer_v2 doesn't directly have archetypes in bases, inherits from base belief
      expect(inspected.bases).to.include(hammer._id);

      // But get_archetypes should walk to base
      const archetype_labels = [...hammer_v2.get_archetypes()].map(a => a.label);
      expect(archetype_labels).to.include('PortableObject');
      expect(archetype_labels).to.include('ObjectPhysical');
    });
  });

  describe('learn_about', () => {
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

  describe('Complex Scenarios from world.mjs', () => {
    it('recreates world.mjs setup and verifies structure', () => {
      const world_belief = {
        workshop: {
          bases: ['Location'],
        },
        hammer: {
          bases: ['PortableObject'],
          traits: {
            location: 'workshop',
          },
        },
        player: {
          bases: ['Player'],
          traits: {
            location: 'workshop',
          },
        },
      }

      const world_mind = createMindWithBeliefs('world', world_belief);
      const state = world_mind.create_state(1);
      const world_beliefs = [...DB.Belief.by_id.values()].filter(b => b.in_mind === world_mind);
      state.insert.push(...world_beliefs);

      let ball = world_mind.add({
        label: 'ball',
        bases: ['PortableObject'],
        traits: {
          location: 'workshop',
        },
      });

      ball = ball.with_traits({
        color: 'blue',
      });

      // Verify ball structure
      const ball_inspected = ball.inspect();
      expect(ball_inspected.traits.color).to.equal('blue');
      expect([...ball.get_archetypes()].map(a => a.label)).to.include('PortableObject');

      // Verify player
      let player = DB.Belief.by_label.get('player');
      const player_mind = new DB.Mind('player_mind');
      const player_mind_state = player_mind.create_state(1);
      player = player.with_traits({mind: player_mind});

      const player_inspected = player.inspect();
      expect(player_inspected.traits.mind._ref).to.equal(player_mind._id);

      // Verify learn_about
      const workshop = DB.Belief.by_label.get('workshop');
      const workshop_knowledge = player_mind_state.learn_about(workshop);

      const workshop_inspected = workshop_knowledge.inspect();
      expect(workshop_inspected.about._ref).to.equal(workshop._id);
      expect(workshop_inspected.archetypes).to.include('Location');
    });
  });
});

describe('Pre-Refactor Tests', () => {
  beforeEach(() => {
    DB.reset_registries();
    const traittypes = {
      location: 'Location',
      color: 'string',
    }

    const archetypes = {
      ObjectPhysical: {
        traits: {
          location: null,
          color: null,
        },
      },
      Location: {
        bases: ['ObjectPhysical'],
      },
      PortableObject: {
        bases: ['ObjectPhysical'],
      },
    }

    DB.register(archetypes, traittypes);
  });

  describe('Current Iteration Patterns', () => {
    it('mind.belief Set contains all beliefs for that mind', () => {
      const mind = new DB.Mind('test');
      mind.add({label: 'workshop', bases: ['Location']});

      const hammer = mind.add({
        label: 'hammer',
        bases: ['PortableObject']
      });

      expect([...DB.Belief.by_id.values()].filter(b => b.in_mind === mind).length).to.equal(2);
      expect([...DB.Belief.by_id.values()].some(b => b.in_mind === mind && b === DB.Belief.by_label.get('workshop'))).to.be.true;
      expect([...DB.Belief.by_id.values()].some(b => b.in_mind === mind && b === hammer)).to.be.true;
    });

    it('can iterate over beliefs for a mind', () => {
      const mind = createMindWithBeliefs('test', {
        workshop: { bases: ['Location'] },
        hammer: { bases: ['PortableObject'] }
      });

      const labels = [];
      for (const belief of DB.Belief.by_id.values()) {
        if (belief.in_mind === mind) {
          labels.push(belief.label);
        }
      }

      expect(labels).to.have.members(['workshop', 'hammer']);
    });

    it('mind.belief_by_label provides fast label lookup', () => {
      const mind = new DB.Mind('test');
      mind.add({label: 'workshop', bases: ['Location']});

      expect(DB.Belief.by_label.get('workshop')).to.exist;
      expect(DB.Belief.by_label.get('workshop').label).to.equal('workshop');
    });
  });

  describe('Cross-Mind Visibility via States', () => {
    it('state.get_beliefs only returns beliefs from that state\'s mind', () => {
      const mind_a = new DB.Mind('mind_a');
      mind_a.add({label: 'item_a', bases: ['PortableObject']});
      const state_a = mind_a.create_state(1);
      const beliefs_for_a = [...DB.Belief.by_id.values()].filter(b => b.in_mind === mind_a);
      state_a.insert.push(...beliefs_for_a);

      const mind_b = new DB.Mind('mind_b');
      mind_b.add({label: 'item_b', bases: ['PortableObject']});
      const state_b = mind_b.create_state(1);
      const beliefs_for_b = [...DB.Belief.by_id.values()].filter(b => b.in_mind === mind_b);
      state_b.insert.push(...beliefs_for_b);

      const beliefs_a = [...state_a.get_beliefs()];
      const beliefs_b = [...state_b.get_beliefs()];

      expect(beliefs_a).to.have.lengthOf(1);
      expect(beliefs_a[0].label).to.equal('item_a');

      expect(beliefs_b).to.have.lengthOf(1);
      expect(beliefs_b[0].label).to.equal('item_b');
    });

    it('beliefs from different minds don\'t mix in states', () => {
      const mind_a = new DB.Mind('mind_a');
      mind_a.add({label: 'workshop_a', bases: ['Location']});

      const mind_b = new DB.Mind('mind_b');
      mind_b.add({label: 'workshop_b', bases: ['Location']});

      const state_a = mind_a.create_state(1);
      const beliefs_a = [...DB.Belief.by_id.values()].filter(b => b.in_mind === mind_a);
      state_a.insert.push(...beliefs_a);
      const state_b = mind_b.create_state(1);
      const beliefs_b = [...DB.Belief.by_id.values()].filter(b => b.in_mind === mind_b);
      state_b.insert.push(...beliefs_b);

      const labels_a = [...state_a.get_beliefs()].map(b => b.label);
      const labels_b = [...state_b.get_beliefs()].map(b => b.label);

      expect(labels_a).to.deep.equal(['workshop_a']);
      expect(labels_b).to.deep.equal(['workshop_b']);
    });
  });

  describe('learn_about Edge Cases', () => {
    it('learn_about on versioned belief walks chain to find archetypes', () => {
      const world_mind = new DB.Mind('world');
      const world_mind_state = world_mind.create_state(1);
      world_mind.add({label: 'hammer_v1', bases: ['PortableObject']});

      const hammer_v1 = DB.Belief.by_label.get('hammer_v1');
      const hammer_v2 = hammer_v1.with_traits({ color: 'red' });

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
      const hammer_v2 = hammer_v1.with_traits({ color: 'red' });

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
  });

  describe('State Operations', () => {
    it('state.tick with replace removes correct belief', () => {
      const mind = new DB.Mind('test');
      mind.add({label: 'hammer_v1', bases: ['PortableObject']});

      const state1 = mind.create_state(1);
      const hammer_v1 = DB.Belief.by_label.get('hammer_v1');
      const hammer_v2 = hammer_v1.with_traits({ color: 'red' });

      const state2 = state1.tick({ replace: [hammer_v2] });

      const beliefs = [...state2.get_beliefs()];
      expect(beliefs).to.have.lengthOf(1);
      expect(beliefs[0]).to.equal(hammer_v2);
      expect(beliefs[0].traits.get('color')).to.equal('red');
    });

    it('multiple minds can have states without interference', () => {
      const mind_a = new DB.Mind('mind_a');
      mind_a.add({label: 'item_in_a', bases: ['PortableObject']});
      const state_a1 = mind_a.create_state(1);

      const mind_b = new DB.Mind('mind_b');
      mind_b.add({label: 'item_in_b', bases: ['PortableObject']});
      const state_b1 = mind_b.create_state(1);

      // Add different beliefs to each mind
      const item_a = DB.Belief.by_label.get('item_in_a');
      const item_a2 = item_a.with_traits({ color: 'red' });
      const state_a2 = state_a1.tick({ replace: [item_a2] });

      const item_b = DB.Belief.by_label.get('item_in_b');
      const item_b2 = item_b.with_traits({ color: 'blue' });
      const state_b2 = state_b1.tick({ replace: [item_b2] });

      // Verify states are independent
      const beliefs_a = [...state_a2.get_beliefs()];
      const beliefs_b = [...state_b2.get_beliefs()];

      expect(beliefs_a[0].traits.get('color')).to.equal('red');
      expect(beliefs_b[0].traits.get('color')).to.equal('blue');
    });

    it('state inheritance chain works correctly', () => {
      const mind = createMindWithBeliefs('test', {
        item1: { bases: ['PortableObject'] },
        item2: { bases: ['PortableObject'] }
      });

      const state1 = mind.create_state(1);
      const initial_beliefs = [...DB.Belief.by_id.values()].filter(b => b.in_mind === mind);
      state1.insert.push(...initial_beliefs);
      const item3 = mind.add({ label: 'item3', bases: ['PortableObject'] });
      const state2 = state1.tick({ insert: [item3] });

      // state2 should have all three items
      const beliefs = [...state2.get_beliefs()];
      expect(beliefs).to.have.lengthOf(3);

      const labels = beliefs.map(b => b.label).sort();
      expect(labels).to.deep.equal(['item1', 'item2', 'item3']);
    });
  });

  describe('Label Uniqueness (Current Behavior)', () => {
    it('currently allows duplicate labels across minds', () => {
      const mind_a = new DB.Mind('mind_a');
      const workshop_a = mind_a.add({label: 'workshop_unique_a', bases: ['Location']});

      const mind_b = new DB.Mind('mind_b');
      const workshop_b = mind_b.add({label: 'workshop_unique_b', bases: ['Location']});

      // Labels are globally unique now
      expect(DB.Belief.by_label.get('workshop_unique_a')).to.exist;
      expect(DB.Belief.by_label.get('workshop_unique_b')).to.exist;
      expect(DB.Belief.by_label.get('workshop_unique_a')).to.not.equal(
        DB.Belief.by_label.get('workshop_unique_b')
      );
    });

    it('throws error on duplicate labels', () => {
      const mind = new DB.Mind('test');
      mind.add({label: 'item1', bases: ['PortableObject']});

      // Adding another with same label should throw
      expect(() => {
        mind.add({ label: 'item1', bases: ['Location'] });
      }).to.throw(/Label 'item1' is already used/);
    });

    it('throws error when belief label matches archetype label', () => {
      const mind = new DB.Mind('test');

      // Trying to create belief with same label as archetype should throw
      expect(() => {
        mind.add({ label: 'PortableObject', bases: ['Location'] });
      }).to.throw(/Label 'PortableObject' is already used by an archetype/);
    });
  });

  describe('Mind Isolation (Current Behavior)', () => {
    it('beliefs store in_mind reference', () => {
      const mind = new DB.Mind('test');
      mind.add({label: 'workshop', bases: ['Location']});

      const workshop = DB.Belief.by_label.get('workshop');
      expect(workshop.in_mind).to.equal(mind);
    });

    it('each mind has independent belief storage', () => {
      const mind_a = new DB.Mind('mind_a');
      const mind_b = new DB.Mind('mind_b');

      const item_a = mind_a.add({ label: 'item_unique_a', bases: ['PortableObject'] });
      const item_b = mind_b.add({ label: 'item_unique_b', bases: ['PortableObject'] });

      // Stored in different minds
      expect(item_a.in_mind).to.equal(mind_a);
      expect(item_b.in_mind).to.equal(mind_b);

      expect(item_a.in_mind).to.not.equal(mind_b);
      expect(item_b.in_mind).to.not.equal(mind_a);
    });

    it('currently allows referencing other mind\'s beliefs in bases', () => {
      const mind_a = new DB.Mind('mind_a');
      mind_a.add({label: 'workshop', bases: ['Location']});

      const mind_b = new DB.Mind('mind_b');

      // Currently this works - mind_b can reference mind_a's belief
      const workshop_a = DB.Belief.by_label.get('workshop');
      const item = mind_b.add({
        label: 'item',
        bases: [workshop_a]  // Using belief from another mind
      });

      expect(item.bases.has(workshop_a)).to.be.true;
    });
  });
});
