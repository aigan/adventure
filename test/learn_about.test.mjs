import { expect } from 'chai';
import { Mind, State, Belief, Subject, Archetype, Traittype, save_mind, load , logos } from '../public/worker/cosmos.mjs';
import * as DB from '../public/worker/db.mjs';
import { createMindWithBeliefs, setupStandardArchetypes, setupMinimalArchetypes, get_first_belief_by_label, stdTypes, Thing } from './helpers.mjs';


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
      const player_mind_state = player_mind.create_state(world_state);
      const workshop = get_first_belief_by_label('workshop');
      const workshop_knowledge = player_mind_state.learn_about(workshop, {traits: []});

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
      const npc_mind_state = npc_mind.create_state(world_state);
      const hammer = get_first_belief_by_label('hammer');
      const hammer_belief = npc_mind_state.learn_about(hammer, {traits: ['color']});

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
      const world_mind = new Mind(logos(), 'world');
      const world_mind_state = world_mind.create_state(logos().origin_state, {tt: 1});
      const hammer_v1_belief = world_mind_state.add_belief_from_template({bases: ['PortableObject'], traits: {'@label': 'hammer_v1'}});

      const hammer_v1 = get_first_belief_by_label('hammer_v1');
      const hammer_v2 = Belief.from_template(world_mind_state, {
        bases: [hammer_v1],
        traits: { color: 'red' }
      });
      world_mind_state.insert.push(hammer_v2);

      const npc_mind = new Mind(world_mind, 'npc');
      const npc_mind_state = npc_mind.create_state(world_mind_state);
      const hammer_knowledge = npc_mind_state.learn_about(hammer_v2, {traits: []});

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
      const player_mind_state = player_mind.create_state(world_state);
      const workshop_knowledge = player_mind_state.learn_about(
        get_first_belief_by_label('workshop'),
        {traits: []}
      );

      // Should be able to reference learned belief in traits
      const hammer_knowledge = player_mind_state.add_belief_from_template({
        bases: ['PortableObject'],
        traits: { '@label': 'hammer_knowledge', location: workshop_knowledge.subject }
      });

      const location_trait = hammer_knowledge._traits.get(Traittype.get_by_label('location'));
      expect(location_trait).to.be.instanceOf(Subject);
      expect(location_trait).to.equal(workshop_knowledge.subject);
    });

    it('learn_about directly from base belief works', () => {
      const world_mind = new Mind(logos(), 'world');
      const world_mind_state = world_mind.create_state(logos().origin_state, {tt: 1});
      const base_hammer_belief = world_mind_state.add_belief_from_template({bases: ['PortableObject'], traits: {'@label': 'base_hammer'}});

      const base_hammer = get_first_belief_by_label('base_hammer');

      const npc_mind = new Mind(world_mind, 'npc');
      const npc_mind_state = npc_mind.create_state(world_mind_state);
      const learned = npc_mind_state.learn_about(base_hammer, {traits: []});

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
      const npc_mind_state = npc_mind.create_state(world_state);
      const hammer_knowledge = npc_mind_state.learn_about(
        get_first_belief_by_label('hammer'),
        {traits: ['location']}
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
      const npc_mind_state = npc_mind.create_state(world_state);

      // NPC already knows about the workshop
      const existing_workshop = npc_mind_state.add_belief_from_template({
                bases: ['Location'],
        traits: {'@label': 'my_workshop', '@about': get_first_belief_by_label('workshop').subject}
      });

      const hammer_knowledge = npc_mind_state.learn_about(
        get_first_belief_by_label('hammer'),
        {traits: ['location']}
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
      const npc_mind_state = npc_mind.create_state(world_state);

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
        {traits: ['location']}
      );

      // Should have created hammer knowledge with location reference
      const location_ref = hammer_knowledge.get_trait(new_state, 'location')?.get_belief_by_state(new_state);
      expect(location_ref).to.exist;
      expect(location_ref.in_mind).to.equal(npc_mind);
    });

    it('learn_about should walk belief chain to find archetypes', () => {
      const world_mind = new Mind(logos(), 'world');
      const world_mind_state = world_mind.create_state(logos().origin_state, {tt: 1});
      world_mind_state.add_belief_from_template({bases: ['PortableObject'], traits: {'@label': 'hammer_v1'}});

      const hammer_v1 = get_first_belief_by_label('hammer_v1');
      const hammer_v2 = Belief.from_template(world_mind_state, {
        bases: [hammer_v1],
        traits: { color: 'red' }
      });
      world_mind_state.insert.push(hammer_v2);

      const npc_mind = new Mind(world_mind, 'npc');
      const npc_mind_state = npc_mind.create_state(world_mind_state);
      const hammer_knowledge = npc_mind_state.learn_about(hammer_v2, {traits: []});

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
      const npc_mind_state = npc_mind.create_state(world_state);
      const hammer_knowledge = npc_mind_state.learn_about(
        get_first_belief_by_label('hammer'),
        {traits: ['color']}
      );

      // String trait should be copied as-is
      expect(hammer_knowledge.get_trait(npc_mind_state, 'color')).to.equal('red');
    });

    it('learn_about should dereference arrays of beliefs', () => {
      // Setup: Create a container belief with an array trait
      DB.reset_registries();

      const traittypes = {
        ...stdTypes,
        location: 'Location',
        items: {
          type: 'PortableObject',
          container: Array,
          min: 0
        }
      };

      const archetypes = {
        Thing,
        ObjectPhysical: {
          bases: ['Thing'],
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

      DB.register(traittypes, archetypes, {});

      const world_mind = new Mind(logos(), 'world');

      const world_mind_state = world_mind.create_state(logos().origin_state, {tt: 1});

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
      const npc_mind_state = npc_mind.create_state(world_mind_state);

      const chest_knowledge = npc_mind_state.learn_about(chest, {traits: ['items']});

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
      const world_mind = new Mind(logos(), 'world');
      const world_state = world_mind.create_state(logos().origin_state, {tt: 100});

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
      const world_state2 = world_state.branch_state(logos().origin_state, 101);
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
      const player_state = player_mind.create_state(world_state2);

      const player_hammer = player_state.learn_about(hammer_v2, {traits: ['location']});

      // Should have learned location (inherited from v1)
      expect(player_hammer._traits.has(Traittype.get_by_label('location'))).to.be.true;
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
      expect(player_hammer._traits.has(Traittype.get_by_label('color'))).to.be.false;
    });

    it('incremental knowledge accumulation via inheritance', () => {
      const world_mind = new Mind(logos(), 'world');
      const world_state = world_mind.create_state(logos().origin_state, {tt: 100});

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
      const player_state1 = player_mind.create_state(world_state);

      const player_hammer_v1 = player_state1.learn_about(hammer, {traits: ['color']});

      expect(player_hammer_v1._traits.has(Traittype.get_by_label('color'))).to.be.true;
      expect(player_hammer_v1._traits.has(Traittype.get_by_label('location'))).to.be.false;
      expect(player_hammer_v1.get_trait(player_state1, 'color')).to.equal('grey');

      player_state1.lock();

      // T2: Player learns location (new observation)
      // Chain from player_state1 so v2 can inherit from v1 through base chain
      const player_state2 = player_state1.branch_state(world_state);
      const player_hammer_v2 = player_state2.learn_about(hammer, {traits: ['location']});

      // v2 has location in _traits, color inherited from v1
      expect(player_hammer_v2._traits.has(Traittype.get_by_label('location'))).to.be.true;
      expect(player_hammer_v2._traits.has(Traittype.get_by_label('color'))).to.be.false;  // not in _traits

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

  describe('Observable Trait Filtering', () => {
    it('learns only visual traits when modality is visual', () => {
      const world_state = createMindWithBeliefs('world', {
        workshop: {
          bases: ['Location']
        },
        hammer: {
          bases: ['PortableObject'],
          traits: {
            color: 'blue',     // visual exposure
            location: 'workshop'  // spatial exposure
          }
        }
      });

      const npc_mind = new Mind(world_state.in_mind, 'npc');
      const npc_state = npc_mind.create_state(world_state);

      const hammer = get_first_belief_by_label('hammer');
      const hammer_knowledge = npc_state.learn_about(hammer, {modalities: ['visual']});

      // Should have color (visual)
      expect(hammer_knowledge._traits.has(Traittype.get_by_label('color'))).to.be.true;
      expect(hammer_knowledge.get_trait(npc_state, 'color')).to.equal('blue');

      // Should NOT have location (spatial)
      expect(hammer_knowledge._traits.has(Traittype.get_by_label('location'))).to.be.false;
    });

    it('learns both visual and spatial traits when modalities include both', () => {
      const world_state = createMindWithBeliefs('world', {
        workshop: {
          bases: ['Location']
        },
        hammer: {
          bases: ['PortableObject'],
          traits: {
            color: 'blue',     // visual exposure
            location: 'workshop'  // spatial exposure
          }
        }
      });

      const npc_mind = new Mind(world_state.in_mind, 'npc');
      const npc_state = npc_mind.create_state(world_state);

      const hammer = get_first_belief_by_label('hammer');
      const hammer_knowledge = npc_state.learn_about(hammer, {modalities: ['visual', 'spatial']});

      // Should have both color (visual) and location (spatial)
      expect(hammer_knowledge._traits.has(Traittype.get_by_label('color'))).to.be.true;
      expect(hammer_knowledge._traits.has(Traittype.get_by_label('location'))).to.be.true;
    });

    it('never learns internal traits even when explicitly requested', () => {
      const world_state = createMindWithBeliefs('world', {
        workshop: {
          bases: ['Location']
        },
        player: {
          bases: ['Person'],
          traits: {
            color: 'blue',  // visual exposure
            mind: {         // internal exposure
              workshop: ['location']
            }
          }
        }
      });

      const npc_mind = new Mind(world_state.in_mind, 'npc');
      const npc_state = npc_mind.create_state(world_state);

      const player = get_first_belief_by_label('player');
      const player_knowledge = npc_state.learn_about(player, {modalities: ['visual', 'internal']});

      // Should have color (visual)
      expect(player_knowledge._traits.has(Traittype.get_by_label('color'))).to.be.true;

      // Should NOT have mind (internal) - internal traits are never observable
      expect(player_knowledge._traits.has(Traittype.get_by_label('mind'))).to.be.false;
    });

    it('uses default modalities (visual + spatial) when none specified', () => {
      const world_state = createMindWithBeliefs('world', {
        workshop: {
          bases: ['Location']
        },
        hammer: {
          bases: ['PortableObject'],
          traits: {
            color: 'blue',     // visual exposure
            location: 'workshop'  // spatial exposure
          }
        }
      });

      const npc_mind = new Mind(world_state.in_mind, 'npc');
      const npc_state = npc_mind.create_state(world_state);

      const hammer = get_first_belief_by_label('hammer');
      const hammer_knowledge = npc_state.learn_about(hammer, {});

      // Should have both color and location (default modalities)
      expect(hammer_knowledge._traits.has(Traittype.get_by_label('color'))).to.be.true;
      expect(hammer_knowledge._traits.has(Traittype.get_by_label('location'))).to.be.true;
    });

    it('explicit traits parameter overrides modalities', () => {
      const world_state = createMindWithBeliefs('world', {
        workshop: {
          bases: ['Location']
        },
        hammer: {
          bases: ['PortableObject'],
          traits: {
            color: 'blue',     // visual exposure
            location: 'workshop'  // spatial exposure
          }
        }
      });

      const npc_mind = new Mind(world_state.in_mind, 'npc');
      const npc_state = npc_mind.create_state(world_state);

      const hammer = get_first_belief_by_label('hammer');
      // Explicit traits should override modalities
      const hammer_knowledge = npc_state.learn_about(hammer, {
        traits: ['color'],
        modalities: ['spatial']  // This should be ignored
      });

      // Should have color (explicitly specified)
      expect(hammer_knowledge._traits.has(Traittype.get_by_label('color'))).to.be.true;

      // Should NOT have location (not in explicit traits)
      expect(hammer_knowledge._traits.has(Traittype.get_by_label('location'))).to.be.false;
    });

    it('skips traits without exposure metadata', () => {
      const world_state = createMindWithBeliefs('world', {
        workshop: {
          bases: ['Location']
        },
        hammer: {
          bases: ['PortableObject'],
          traits: {
            color: 'blue',      // has exposure: visual
            location: 'workshop' // has exposure: spatial
          }
        }
      });

      const npc_mind = new Mind(world_state.in_mind, 'npc');
      const npc_state = npc_mind.create_state(world_state);

      const hammer = get_first_belief_by_label('hammer');
      const hammer_knowledge = npc_state.learn_about(hammer, {modalities: ['visual']});

      // Should have color (has exposure metadata: visual)
      expect(hammer_knowledge._traits.has(Traittype.get_by_label('color'))).to.be.true;

      // Should NOT have location (has exposure metadata but wrong modality: spatial)
      expect(hammer_knowledge._traits.has(Traittype.get_by_label('location'))).to.be.false;
    });
  });
});
