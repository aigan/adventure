/**
 * Integration tests for cross-system scenarios
 *
 * MATRIX COVERAGE: None (tests complex scenarios, not specific matrix cases)
 *
 * TESTS:
 * ✅ Cross-mind queries with @about trait
 * ✅ Shared beliefs with mind traits
 * ✅ Complex world setup scenarios
 *
 * NOTE: These are integration tests combining multiple systems,
 * not focused on trait inheritance permutations
 */

import { expect } from 'chai';
import { Mind, Materia, State, Belief, Archetype, Traittype, save_mind, load , logos } from '../public/worker/cosmos.mjs';
import * as DB from '../public/worker/db.mjs';
import { createMindWithBeliefs, setupStandardArchetypes, get_first_belief_by_label } from './helpers.mjs';

describe('Integration', () => {
  beforeEach(() => {
    DB.reset_registries();
    setupStandardArchetypes();
  });

  describe('Complex Scenarios from world.mjs', () => {
    it('world.mjs setupStandardArchetypes with Villager prototype', () => {
      // Tests prototypes with mind traits that reference world beliefs
      // Uses about_state to allow Villager prototype in Eidos to reference workshop in world

      DB.reset_registries();

      // Register archetypes and Person prototype (no mind trait yet)
      const traittypes = {
        '@about': {
          type: 'Subject',
          mind: 'parent'
        },
        location: 'Location',
        mind: 'Mind',
        color: 'string',
        name: 'string',
        inventory: 'PortableObject',
      };

      const archetypes = {
        Thing: {
          traits: {
            '@about': null,
          },
        },
        ObjectPhysical: {
          bases: ['Thing'],
          traits: {
            location: null,
            color: null,
          },
        },
        Mental: {
          bases: ['Thing'],
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
      };

      const prototypes = {
        Person: {
          bases: ['ObjectPhysical', 'Mental'],
        },
      };

      DB.register(traittypes, archetypes, prototypes);

      // Create world state with workshop
      const world_mind = new Materia(logos(), 'world');
      const state = world_mind.create_state(logos().origin_state, {tt: 1});

      state.add_beliefs_from_template({
        workshop: {
          bases: ['Location'],
        },
        hammer: {
          bases: ['PortableObject'],
          traits: {
            location: 'workshop',
          },
        },
      });

      // Now create Villager prototype that references workshop via about_state
      state.add_shared_from_template({
        Villager: {
          bases: ['Person'],
          traits: {
            mind: {
              workshop: ['location']
            }
          },
        },
      });

      // Create player using Villager prototype
      state.add_beliefs_from_template({
        player: {
          bases: ['Villager'],
          traits: {
            location: 'workshop',
          },
        },
      });

      const player = state.get_belief_by_label('player');
      expect(player).to.exist;

      // Verify player inherits from Villager prototype
      expect([...player.get_prototypes()].map(p => p.label)).to.include('Villager');

      // Verify player has archetypes from Person (Mental, ObjectPhysical)
      expect([...player.get_archetypes()].map(a => a.label)).to.include('Mental');
      expect([...player.get_archetypes()].map(a => a.label)).to.include('ObjectPhysical');

      // Verify player has mind trait inherited from Villager
      const player_mind = player.get_trait(state, Traittype.get_by_label('mind'));
      expect(player_mind).to.be.instanceOf(Mind);

      // Verify the Villager prototype's mind knows about workshop (via about_state)
      const villager = DB.get_subject_by_label('Villager').get_shared_belief_by_state(state);
      const villager_mind = villager.get_trait(state, Traittype.get_by_label('mind'));
      expect(villager_mind).to.be.instanceOf(Mind);

      // Verify villager mind has a state with beliefs (learned about workshop)
      const villager_mind_state = [...villager_mind.states_at_tt(0)][0];
      expect(villager_mind_state).to.exist;
      const beliefs = [...villager_mind_state.get_beliefs()];
      expect(beliefs.length).to.be.greaterThan(0);

      // Verify at least one belief has @about pointing to workshop
      const workshop = state.get_belief_by_label('workshop');
      const workshop_knowledge = beliefs.find(b =>
        b.get_trait(villager_mind_state, Traittype.get_by_label('@about')) === workshop.subject
      );
      expect(workshop_knowledge).to.exist;

      state.lock();
    });

    it('prototypes with mind traits can query knowledge using rev_trait()', () => {
      // Tests that knowledge about a subject can be queried using rev_trait with @about
      DB.reset_registries();

      const traittypes = {
        '@about': {
          type: 'Subject',
          mind: 'parent'
        },
        location: 'Location',
        mind: 'Mind',
      };

      const archetypes = {
        Thing: {
          traits: {
            '@about': null,
          },
        },
        Location: {
          bases: ['Thing'],
          traits: {
            location: null,
          },
        },
        Mental: {
          bases: ['Thing'],
          traits: {
            mind: null,
          },
        },
        Person: {
          bases: ['Mental'],
        },
      };

      DB.register(traittypes, archetypes, {});

      // Create world with workshop
      const world_mind = new Materia(logos(), 'world');
      const state = world_mind.create_state(logos().origin_state, {tt: 1});

      state.add_beliefs_from_template({
        workshop: {
          bases: ['Location'],
        },
      });

      // Create Villager prototype that knows about workshop
      state.add_shared_from_template({
        Villager: {
          bases: ['Person'],
          traits: {
            mind: {
              workshop: ['location']
            }
          },
        },
      });

      // Verify using rev_trait() to find beliefs where @about points to workshop
      const villager = DB.get_subject_by_label('Villager').get_shared_belief_by_state(state);
      const villager_mind = villager.get_trait(state, Traittype.get_by_label('mind'));
      const villager_mind_state = [...villager_mind.states_at_tt(0)][0];

      const workshop = state.get_belief_by_label('workshop');
      const about_traittype = Traittype.get_by_label('@about');
      const knowledge_about_workshop = [...workshop.rev_trait(villager_mind_state, about_traittype)];

      // Villager mind should have exactly one belief about workshop
      expect(knowledge_about_workshop.length).to.equal(1);
      expect(knowledge_about_workshop[0].get_trait(villager_mind_state, Traittype.get_by_label('@about'))).to.equal(workshop.subject);

      // Verify this is knowledge ABOUT workshop, not workshop itself
      expect(knowledge_about_workshop[0]).to.not.equal(workshop);
      expect(knowledge_about_workshop[0].subject).to.not.equal(workshop.subject);

      // Verify the knowledge has the location trait slot (from learning spec)
      const knowledge_archetypes = [...knowledge_about_workshop[0].get_archetypes()].map(a => a.label);
      expect(knowledge_archetypes).to.include('Location');

      state.lock();
    });

    it('finds no beliefs when subject is unknown to mind', () => {
      // Test that function returns empty array when no knowledge exists
      DB.reset_registries();

      const traittypes = {
        '@about': {
          type: 'Subject',
          mind: 'parent'
        },
        location: 'Location',
        mind: 'Mind',
      };

      const archetypes = {
        Thing: {
          traits: {
            '@about': null,
          },
        },
        Location: {
          bases: ['Thing'],
          traits: {
            location: null,
          },
        },
        Mental: {
          bases: ['Thing'],
          traits: {
            mind: null,
          },
        },
        Person: {
          bases: ['Mental'],
        },
      };

      DB.register(traittypes, archetypes, {});

      // Create world with workshop
      const world_mind = new Materia(logos(), 'world');
      const world_state = world_mind.create_state(logos().origin_state, {tt: 1});

      world_state.add_beliefs_from_template({
        workshop: {
          bases: ['Location'],
        },
      });

      const workshop = world_state.get_belief_by_label('workshop');

      // Create NPC with mind but NO knowledge about workshop
      world_state.add_beliefs_from_template({
        npc: {
          bases: ['Person'],
          traits: {
            mind: {}  // Empty mind - no knowledge
          }
        }
      });

      world_state.lock();

      const npc = world_state.get_belief_by_label('npc');
      const npc_mind = npc.get_trait(world_state, Traittype.get_by_label('mind'));
      const npc_state = [...npc_mind.states_at_tt(world_state.vt)][0];

      // Query for beliefs about workshop in NPC's mind - should be empty
      const about_traittype = Traittype.get_by_label('@about');
      const beliefs_about_workshop = [...workshop.rev_trait(npc_state, about_traittype)];

      expect(beliefs_about_workshop.length).to.equal(0);
    });

    it('finds beliefs across temporal versions (knowledge accumulation)', () => {
      // Test knowledge accumulation over multiple time steps
      DB.reset_registries();

      const traittypes = {
        '@about': {
          type: 'Subject',
          mind: 'parent'
        },
        location: 'Location',
        color: 'string',
        weight: 'number',
        mind: 'Mind',
      };

      const archetypes = {
        Thing: {
          traits: {
            '@about': null,
          },
        },
        Location: {
          bases: ['Thing'],
        },
        ObjectPhysical: {
          bases: ['Thing'],
          traits: {
            location: null,
            color: null,
            weight: null,
          },
        },
        Mental: {
          bases: ['Thing'],
          traits: {
            mind: null,
          },
        },
        Person: {
          bases: ['Mental'],
        },
      };

      DB.register(traittypes, archetypes, {});

      // Create world with hammer
      const world_mind = new Materia(logos(), 'world');
      const world_state = world_mind.create_state(logos().origin_state, {tt: 1});

      world_state.add_beliefs_from_template({
        workshop: {
          bases: ['Location'],
        },
        hammer: {
          bases: ['ObjectPhysical'],
          traits: {
            location: 'workshop',
            color: 'grey',
            weight: 5,
          }
        },
        npc: {
          bases: ['Person'],
          traits: {
            mind: {
              hammer: ['location']  // Learn location at tt=1
            }
          }
        }
      });

      world_state.lock();

      const npc = world_state.get_belief_by_label('npc');
      const hammer = world_state.get_belief_by_label('hammer');
      const npc_mind = npc.get_trait(world_state, Traittype.get_by_label('mind'));
      const state1 = [...npc_mind.states_at_tt(world_state.vt)][0];

      // At tt=1, should have 1 belief about hammer (location only)
      const about_traittype = Traittype.get_by_label('@about');
      let beliefs_about_hammer = [...hammer.rev_trait(state1, about_traittype)];
      expect(beliefs_about_hammer.length).to.equal(1);

      const knowledge1 = beliefs_about_hammer[0];
      const location_trait = knowledge1.get_trait(state1, Traittype.get_by_label('location'));
      expect(location_trait).to.not.be.null;

      // Learn more about hammer at tt=2 (color)
      const state2 = state1.branch_state(world_state, 2);
      state2.learn_about(hammer, {traits: ['color']});
      state2.lock();

      // Should still have 1 belief (versioned with new trait)
      beliefs_about_hammer = [...hammer.rev_trait(state2, about_traittype)];
      expect(beliefs_about_hammer.length).to.equal(1);

      const knowledge2 = beliefs_about_hammer[0];
      const color_trait = knowledge2.get_trait(state2, Traittype.get_by_label('color'));
      expect(color_trait).to.equal('grey');

      // Learn weight at tt=3
      const state3 = state2.branch_state(world_state, 3);
      state3.learn_about(hammer, {traits: ['weight']});
      state3.lock();

      // Should still have 1 belief (further versioned)
      beliefs_about_hammer = [...hammer.rev_trait(state3, about_traittype)];
      expect(beliefs_about_hammer.length).to.equal(1);

      const knowledge3 = beliefs_about_hammer[0];
      const weight_trait = knowledge3.get_trait(state3, Traittype.get_by_label('weight'));
      expect(weight_trait).to.equal(5);
    });

    it('finds beliefs inherited through prototype bases', () => {
      // Test that knowledge inherited from prototypes is found
      DB.reset_registries();

      const traittypes = {
        '@about': {
          type: 'Subject',
          mind: 'parent'
        },
        location: 'Location',
        color: 'string',
        mind: 'Mind',
      };

      const archetypes = {
        Thing: {
          traits: {
            '@about': null,
          },
        },
        Location: {
          bases: ['Thing'],
        },
        ObjectPhysical: {
          bases: ['Thing'],
          traits: {
            location: null,
            color: null,
          },
        },
        Mental: {
          bases: ['Thing'],
          traits: {
            mind: null,
          },
        },
        Person: {
          bases: ['Mental'],
        },
      };

      DB.register(traittypes, archetypes, {});

      // Create world
      const world_mind = new Materia(logos(), 'world');
      const world_state = world_mind.create_state(logos().origin_state, {tt: 1});

      world_state.add_beliefs_from_template({
        tavern: {
          bases: ['Location'],
        },
      });

      // Create villager PROTOTYPE with knowledge about tavern
      world_state.add_shared_from_template({
        VillagerProto: {
          bases: ['Person'],
          traits: {
            mind: {
              tavern: ['location']
            }
          }
        }
      });

      world_state.lock();

      const tavern = world_state.get_belief_by_label('tavern');
      const villager_proto = DB.get_subject_by_label('VillagerProto').get_shared_belief_by_state(world_state);

      // Create specific villager instance (inherits prototype's knowledge)
      const world_state2 = world_state.branch_state(logos().origin_state, 2);
      world_state2.add_beliefs_from_template({
        bob: {
          bases: [villager_proto],
          traits: {}  // Inherits mind from prototype
        }
      });
      world_state2.lock();

      const bob = world_state2.get_belief_by_label('bob');
      const bob_mind = bob.get_trait(world_state2, Traittype.get_by_label('mind'));
      const bob_state = [...bob_mind.states_at_tt(0)][0];

      // Bob's mind should find knowledge about tavern (inherited from prototype)
      const about_traittype = Traittype.get_by_label('@about');
      const beliefs_about_tavern = [...tavern.rev_trait(bob_state, about_traittype)];

      expect(beliefs_about_tavern.length).to.be.at.least(1);
      const knowledge = beliefs_about_tavern[0];
      expect(knowledge.get_trait(bob_state, Traittype.get_by_label('@about'))).to.equal(tavern.subject);
    });

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
          bases: ['Person'],
          traits: {
            location: 'workshop',
          },
        },
      }

      const world_state = createMindWithBeliefs('world', world_belief);
      const world_mind = world_state.in_mind;

      let ball = world_state.add_belief_from_template({
                bases: ['PortableObject'],
        traits: {location: 'workshop'},
        label: 'ball'
      });

      ball = Belief.from_template(world_state, {
        bases: [ball],
        traits: { color: 'blue' }
      });

      // Verify ball structure
      const ball_inspected = ball.to_inspect_view(world_state);
      expect(ball_inspected.traits.color).to.equal('blue');
      expect([...ball.get_archetypes()].map(a => a.label)).to.include('PortableObject');

      // Verify player
      let player = get_first_belief_by_label('player');
      const player_mind = new Materia(world_state.in_mind, 'player_mind');
      const player_mind_state = player_mind.create_state(world_state);
      player = Belief.from_template(world_state, {
        bases: [player],
        traits: { mind: player_mind }
      });

      const player_inspected = player.to_inspect_view(world_state);
      expect(player_inspected.traits.mind._ref).to.equal(player_mind._id);

      // Verify learn_about
      const workshop = get_first_belief_by_label('workshop');
      const workshop_knowledge = player_mind_state.learn_about(workshop, {traits: []});

      const workshop_inspected = workshop_knowledge.to_inspect_view(player_mind_state);
      expect(workshop_inspected.traits['@about']._ref).to.equal(workshop._id);
      expect(workshop_inspected.archetypes).to.include('Location');
    });

    it('mind extension via state.base inheritance', () => {
      // Test that beliefs with mind templates inherit knowledge from base beliefs
      DB.reset_registries();

      // Setup traittypes and archetypes
      DB.register({
        '@about': {type: 'Subject', mind: 'parent'},
        location: 'Location',
        mind: 'Mind',
        color: 'string',
      }, {
        Thing: {
          traits: {'@about': null}
        },
        Location: {
          bases: ['Thing'],
          traits: {location: null}
        },
        PortableObject: {
          bases: ['Thing'],
          traits: {location: null, color: null}
        },
        Mental: {
          bases: ['Thing'],
          traits: {mind: null}
        },
        Person: {
          bases: ['Mental'],
        },
      }, {});

      // Create world with entities
      const world = Materia.create_world();
      const world_state = world.create_state(DB.get_logos_state(), {tt: 1});
      world_state.add_beliefs_from_template({
        village: {
          bases: ['Location']
        },
        workshop: {
          bases: ['Location'],
          traits: {location: 'village'}
        },
        hammer: {
          bases: ['PortableObject'],
          traits: {color: 'blue', location: 'workshop'}
        }
      });

      // Create Villager prototype with mind template
      // add_shared_from_template creates prototypes in Eidos that reference beliefs in world_state
      world_state.add_shared_from_template({
        Villager: {
          bases: ['Person'],
          traits: {
            mind: {
              workshop: ['location'],
              hammer: ['color']
            }
          }
        }
      });

      // Create player that inherits from Villager and extends with own knowledge
      const player_belief = Belief.from_template(world_state, {
        bases: ['Villager'],
        traits: {
          mind: {
            hammer: ['location']  // Player learns hammer location (extending Villager's knowledge)
          }
        },
        label: 'player'
      });

      const player = world_state.get_belief_by_label('player');
      expect(player).to.not.be.null;
      const player_mind = player.get_trait(world_state, Traittype.get_by_label('mind'));
      const player_state = player_mind.origin_state;  // Use origin_state since mind is locked

      // Verify state.base points to Villager's mind state
      const villager = DB.get_subject_by_label('Villager').get_shared_belief_by_state(world_state);
      expect(villager).to.not.be.null;
      const villager_mind = villager.get_trait(world_state, Traittype.get_by_label('mind'));
      const villager_state = villager_mind.origin_state;

      // This is the key test - player's mind state should have Villager's state as base
      expect(player_state.base).to.equal(villager_state);

      // Verify player's mind has knowledge from BOTH Villager (via base) and own template
      const beliefs_in_player_mind = [...player_state.get_beliefs()];

      // get_beliefs() walks the base chain, so should include beliefs from Villager's state
      expect(beliefs_in_player_mind.length).to.be.at.least(3);

      // Verify exactly ONE belief about workshop (inherited from Villager)
      const workshop = world_state.get_belief_by_label('workshop');
      const workshop_beliefs = beliefs_in_player_mind.filter(b => {
        const about = b.get_about(player_state);
        return about && about.subject === workshop.subject;
      });
      expect(workshop_beliefs.length).to.equal(1);

      // Verify exactly ONE belief about hammer (versioned from Villager's belief)
      const hammer = world_state.get_belief_by_label('hammer');
      const hammer_beliefs = beliefs_in_player_mind.filter(b => {
        const about = b.get_about(player_state);
        return about && about.subject === hammer.subject;
      });
      expect(hammer_beliefs.length).to.equal(1);

      // Verify the hammer belief has BOTH traits (inherited color + own location)
      const player_hammer = hammer_beliefs[0];
      expect(player_hammer.get_trait(player_state, Traittype.get_by_label('color'))).to.equal('blue'); // inherited from Villager
      expect(player_hammer.get_trait(player_state, Traittype.get_by_label('location'))).to.not.be.null; // added by player
    });

    it('P1.1: multiple bases with mind traits (VillageBlacksmith = Villager + Blacksmith)', () => {
      // Tests Convergence composition with knowledge from multiple prototype bases
      // VillageBlacksmith inherits knowledge from BOTH Villager and Blacksmith minds

      DB.reset_registries();

      // Setup traittypes and archetypes
      DB.register({
        '@about': {type: 'Subject', mind: 'parent'},
        location: 'Location',
        mind: {type: 'Mind', composable: true},
        skill: 'string',
      }, {
        Thing: {
          traits: {'@about': null}
        },
        Location: {
          bases: ['Thing'],
          traits: {location: null}
        },
        Mental: {
          bases: ['Thing'],
          traits: {mind: null}
        },
        Person: {
          bases: ['Mental'],
          traits: {skill: null}
        },
      }, {});

      // Create world with entities
      const world = Materia.create_world();
      const world_state = world.create_state(DB.get_logos_state(), {tt: 1});
      world_state.add_beliefs_from_template({
        village: {
          bases: ['Location']
        },
        workshop: {
          bases: ['Location'],
          traits: {location: 'village'}
        },
        tavern: {
          bases: ['Location'],
          traits: {location: 'village'}
        }
      });

      // Create Villager prototype with mind template (knows about tavern)
      world_state.add_shared_from_template({
        Villager: {
          bases: ['Person'],
          traits: {
            mind: {
              tavern: ['location']
            }
          }
        }
      });

      // Create Blacksmith prototype with mind template (knows about workshop)
      world_state.add_shared_from_template({
        Blacksmith: {
          bases: ['Person'],
          traits: {
            mind: {
              workshop: ['location']
            }
          }
        }
      });

      // Create VillageBlacksmith with BOTH bases
      // When Convergence is implemented, this should merge knowledge from both minds
      const village_blacksmith_belief = Belief.from_template(world_state, {
        bases: ['Villager', 'Blacksmith'],
        traits: {},
        label: 'village_blacksmith'
      });

      const village_blacksmith = world_state.get_belief_by_label('village_blacksmith');
      expect(village_blacksmith).to.not.be.null;

      // Verify VillageBlacksmith has mind trait
      const vb_mind = village_blacksmith.get_trait(world_state, Traittype.get_by_label('mind'));
      expect(vb_mind).to.be.instanceOf(Mind);

      const vb_state = vb_mind.origin_state;

      // KEY TEST: Verify VillageBlacksmith's mind has knowledge from BOTH bases
      const beliefs_in_vb_mind = [...vb_state.get_beliefs()];

      // Should have at least 2 beliefs (tavern knowledge + workshop knowledge)
      expect(beliefs_in_vb_mind.length).to.be.at.least(2);

      // Verify knowledge about tavern (from Villager)
      const tavern = world_state.get_belief_by_label('tavern');
      const tavern_beliefs = beliefs_in_vb_mind.filter(b => {
        const about = b.get_about(vb_state);
        return about && about.subject === tavern.subject;
      });
      expect(tavern_beliefs.length).to.equal(1, 'Should have exactly one belief about tavern (no duplication)');

      // Verify knowledge about workshop (from Blacksmith)
      const workshop = world_state.get_belief_by_label('workshop');
      const workshop_beliefs = beliefs_in_vb_mind.filter(b => {
        const about = b.get_about(vb_state);
        return about && about.subject === workshop.subject;
      });
      expect(workshop_beliefs.length).to.equal(1, 'Should have exactly one belief about workshop (no duplication)');

      // Verify the beliefs have correct traits
      const vb_tavern = tavern_beliefs[0];
      expect(vb_tavern.get_trait(vb_state, Traittype.get_by_label('location'))).to.not.be.null;

      const vb_workshop = workshop_beliefs[0];
      expect(vb_workshop.get_trait(vb_state, Traittype.get_by_label('location'))).to.not.be.null;
    });

    it('P1.3: empty mind template behavior (override vs inherit)', () => {
      // Tests what happens when belief explicitly provides `mind: {}` while inheriting from base with mind
      // Expected: Empty template creates new Mind instance, but state inherits via base chain

      DB.reset_registries();

      // Setup traittypes and archetypes
      DB.register({
        '@about': {type: 'Subject', mind: 'parent'},
        location: 'Location',
        mind: 'Mind',
      }, {
        Thing: {
          traits: {'@about': null}
        },
        Location: {
          bases: ['Thing'],
          traits: {location: null}
        },
        Mental: {
          bases: ['Thing'],
          traits: {mind: null}
        },
        Person: {
          bases: ['Mental'],
        },
      }, {});

      // Create world with entities
      const world = Materia.create_world();
      const world_state = world.create_state(DB.get_logos_state(), {tt: 1});
      world_state.add_beliefs_from_template({
        workshop: {
          bases: ['Location']
        }
      });

      // Create Villager prototype with mind template
      world_state.add_shared_from_template({
        Villager: {
          bases: ['Person'],
          traits: {
            mind: {
              workshop: ['location']
            }
          }
        }
      });

      // Create player that inherits from Villager but provides EMPTY mind template
      const player = Belief.from_template(world_state, {
        bases: ['Villager'],
        traits: {
          mind: {}  // Empty template - does this override or inherit?
        },
        label: 'player'
      });

      const player_belief = world_state.get_belief_by_label('player');
      const player_mind = player_belief.get_trait(world_state, Traittype.get_by_label('mind'));
      const player_state = player_mind.origin_state;

      const villager = DB.get_subject_by_label('Villager').get_shared_belief_by_state(world_state);
      const villager_mind = villager.get_trait(world_state, Traittype.get_by_label('mind'));
      const villager_state = villager_mind.origin_state;

      // Empty template creates NEW mind instance (not same as Villager's)
      expect(player_mind).to.not.equal(villager_mind);

      // But player's mind state should have Villager's state as base (inherits knowledge)
      expect(player_state.base).to.equal(villager_state);

      // Player's mind should inherit knowledge from Villager via state.base
      const player_beliefs = [...player_state.get_beliefs()];
      expect(player_beliefs.length).to.be.greaterThan(0, 'Should inherit knowledge via state.base');

      // Verify player can access workshop knowledge from Villager
      const workshop = world_state.get_belief_by_label('workshop');
      const workshop_beliefs = player_beliefs.filter(b => {
        const about = b.get_about(player_state);
        return about && about.subject === workshop.subject;
      });
      expect(workshop_beliefs.length).to.equal(1, 'Should inherit workshop knowledge from Villager');
    });

    it('P2.1: transitive mind inheritance (depth 2+ state.base chain)', () => {
      // Tests that knowledge inheritance works through multiple levels
      // Culture → Villager → Player (depth 2 chain)
      // Each level adds knowledge, player should inherit from all

      DB.reset_registries();

      // Setup traittypes and archetypes
      DB.register({
        '@about': {type: 'Subject', mind: 'parent'},
        location: 'Location',
        mind: 'Mind',
      }, {
        Thing: {
          traits: {'@about': null}
        },
        Location: {
          bases: ['Thing'],
          traits: {location: null}
        },
        Mental: {
          bases: ['Thing'],
          traits: {mind: null}
        },
        Person: {
          bases: ['Mental'],
        },
      }, {});

      // Create world with entities
      const world = Materia.create_world();
      const world_state = world.create_state(DB.get_logos_state(), {tt: 1});
      world_state.add_beliefs_from_template({
        workshop: {bases: ['Location']},
        tavern: {bases: ['Location']},
        market: {bases: ['Location']},
      });

      // Create Culture prototype (depth 2 - root of chain)
      world_state.add_shared_from_template({
        Culture: {
          bases: ['Person'],
          traits: {
            mind: {
              workshop: ['location']
            }
          }
        }
      });

      // Create Villager prototype (depth 1 - inherits from Culture)
      world_state.add_shared_from_template({
        Villager: {
          bases: ['Culture'],
          traits: {
            mind: {
              tavern: ['location']
            }
          }
        }
      });

      // Create Player (depth 0 - inherits from Villager)
      const player = Belief.from_template(world_state, {
        bases: ['Villager'],
        traits: {
          mind: {
            market: ['location']
          }
        },
        label: 'player'
      });

      // Get all the minds and states in the chain
      const culture = DB.get_subject_by_label('Culture').get_shared_belief_by_state(world_state);
      const culture_mind = culture.get_trait(world_state, Traittype.get_by_label('mind'));
      const culture_state = culture_mind.origin_state;

      const villager = DB.get_subject_by_label('Villager').get_shared_belief_by_state(world_state);
      const villager_mind = villager.get_trait(world_state, Traittype.get_by_label('mind'));
      const villager_state = villager_mind.origin_state;

      const player_belief = world_state.get_belief_by_label('player');
      const player_mind = player_belief.get_trait(world_state, Traittype.get_by_label('mind'));
      const player_state = player_mind.origin_state;

      // Verify the state.base chain: Player → Villager → Culture
      expect(player_state.base).to.equal(villager_state, 'Player state.base should be Villager state');
      expect(villager_state.base).to.equal(culture_state, 'Villager state.base should be Culture state');
      expect(culture_state.base).to.be.null; // Culture is root

      // Verify Player has knowledge from ALL levels
      const player_beliefs = [...player_state.get_beliefs()];

      const workshop = world_state.get_belief_by_label('workshop');
      const tavern = world_state.get_belief_by_label('tavern');
      const market = world_state.get_belief_by_label('market');

      // Check for workshop knowledge (from Culture, depth 2)
      const workshop_beliefs = player_beliefs.filter(b => {
        const about = b.get_about(player_state);
        return about && about.subject === workshop.subject;
      });
      expect(workshop_beliefs.length).to.equal(1, 'Should inherit workshop from Culture (depth 2)');

      // Check for tavern knowledge (from Villager, depth 1)
      const tavern_beliefs = player_beliefs.filter(b => {
        const about = b.get_about(player_state);
        return about && about.subject === tavern.subject;
      });
      expect(tavern_beliefs.length).to.equal(1, 'Should inherit tavern from Villager (depth 1)');

      // Check for market knowledge (from Player, depth 0)
      const market_beliefs = player_beliefs.filter(b => {
        const about = b.get_about(player_state);
        return about && about.subject === market.subject;
      });
      expect(market_beliefs.length).to.equal(1, 'Should have market from own template (depth 0)');

      // Total should be at least 3 (workshop + tavern + market)
      expect(player_beliefs.length).to.be.at.least(3);
    });

    it('P2.2: overlapping knowledge merging (extending inherited knowledge)', () => {
      // Tests what happens when child learns new traits about subject already known from base
      // Villager knows: workshop (location, tools)
      // Player inherits from Villager, learns: workshop (size)
      // Expected: Player has ONE belief with ALL traits (location, tools, size)

      DB.reset_registries();

      // Setup traittypes and archetypes
      DB.register({
        '@about': {type: 'Subject', mind: 'parent'},
        location: 'Location',
        mind: 'Mind',
        tools: {type: 'string', container: Array},
        size: 'number',
      }, {
        Thing: {
          traits: {'@about': null}
        },
        Location: {
          bases: ['Thing'],
          traits: {location: null, tools: null, size: null}
        },
        Mental: {
          bases: ['Thing'],
          traits: {mind: null}
        },
        Person: {
          bases: ['Mental'],
        },
      }, {});

      // Create world with entities
      const world = Materia.create_world();
      const world_state = world.create_state(DB.get_logos_state(), {tt: 1});
      world_state.add_beliefs_from_template({
        village: {bases: ['Location']},
        workshop: {
          bases: ['Location'],
          traits: {
            location: 'village',
            tools: ['hammer', 'anvil'],
            size: 500
          }
        }
      });

      // Create Villager prototype - knows workshop location and tools
      world_state.add_shared_from_template({
        Villager: {
          bases: ['Person'],
          traits: {
            mind: {
              workshop: ['location', 'tools']  // Partial knowledge
            }
          }
        }
      });

      // Create Player - inherits from Villager, extends workshop knowledge with size
      const player = Belief.from_template(world_state, {
        bases: ['Villager'],
        traits: {
          mind: {
            workshop: ['size']  // Adds size to inherited location+tools
          }
        },
        label: 'player'
      });

      const player_belief = world_state.get_belief_by_label('player');
      const player_mind = player_belief.get_trait(world_state, Traittype.get_by_label('mind'));
      const player_state = player_mind.origin_state;

      // Get beliefs in player's mind
      const player_beliefs = [...player_state.get_beliefs()];

      const workshop = world_state.get_belief_by_label('workshop');

      // Find beliefs about workshop
      const workshop_beliefs = player_beliefs.filter(b => {
        const about = b.get_about(player_state);
        return about && about.subject === workshop.subject;
      });

      // Should have exactly ONE belief about workshop (merged, not duplicated)
      expect(workshop_beliefs.length).to.equal(1, 'Should have one merged belief, not two separate ones');

      const player_workshop = workshop_beliefs[0];

      // Verify ALL traits are present (inherited + new)
      expect(player_workshop.get_trait(player_state, Traittype.get_by_label('location'))).to.not.be.null;
      expect(player_workshop.get_trait(player_state, Traittype.get_by_label('tools'))).to.not.be.null;
      expect(player_workshop.get_trait(player_state, Traittype.get_by_label('size'))).to.equal(500);

      // Verify the belief is versioned (extends inherited knowledge)
      // Player's workshop belief should have bases array with at least the archetype
      const player_workshop_archetypes = [...player_workshop.get_archetypes()].map(a => a.label);
      expect(player_workshop_archetypes).to.include('Location');

      // Verify inheritance structure
      const villager = DB.get_subject_by_label('Villager').get_shared_belief_by_state(world_state);
      const villager_mind = villager.get_trait(world_state, Traittype.get_by_label('mind'));
      const villager_state = villager_mind.origin_state;

      // Villager should also have workshop knowledge
      const villager_beliefs = [...villager_state.get_beliefs()];
      const villager_workshop_beliefs = villager_beliefs.filter(b => {
        const about = b.get_about(villager_state);
        return about && about.subject === workshop.subject;
      });
      expect(villager_workshop_beliefs.length).to.equal(1, 'Villager should have workshop knowledge');

      // Verify villager's workshop only has partial knowledge (location, tools, NOT size)
      const villager_workshop = villager_workshop_beliefs[0];
      expect(villager_workshop.get_trait(villager_state, Traittype.get_by_label('location'))).to.not.be.null;
      expect(villager_workshop.get_trait(villager_state, Traittype.get_by_label('tools'))).to.not.be.null;

      // Villager doesn't have size trait (returns null from trait resolution)
      const villager_size = villager_workshop.get_trait(villager_state, Traittype.get_by_label('size'));
      expect(villager_size === null || villager_size === undefined).to.be.true;
    });

    it('P2.3: complete re-learning (no duplication when re-learning same traits)', () => {
      // Tests what happens when child tries to learn exactly same traits as base
      // Villager knows: workshop (location)
      // Player inherits from Villager, tries to learn: workshop (location) again
      // Expected: Player has ONE belief (recognizes inherited knowledge, no duplication)

      DB.reset_registries();

      // Setup traittypes and archetypes
      DB.register({
        '@about': {type: 'Subject', mind: 'parent'},
        location: 'Location',
        mind: 'Mind',
      }, {
        Thing: {
          traits: {'@about': null}
        },
        Location: {
          bases: ['Thing'],
          traits: {location: null}
        },
        Mental: {
          bases: ['Thing'],
          traits: {mind: null}
        },
        Person: {
          bases: ['Mental'],
        },
      }, {});

      // Create world with entities
      const world = Materia.create_world();
      const world_state = world.create_state(DB.get_logos_state(), {tt: 1});
      world_state.add_beliefs_from_template({
        village: {bases: ['Location']},
        workshop: {
          bases: ['Location'],
          traits: {location: 'village'}
        }
      });

      // Create Villager prototype - knows workshop location
      world_state.add_shared_from_template({
        Villager: {
          bases: ['Person'],
          traits: {
            mind: {
              workshop: ['location']
            }
          }
        }
      });

      // Create Player - inherits from Villager, tries to learn SAME traits
      const player = Belief.from_template(world_state, {
        bases: ['Villager'],
        traits: {
          mind: {
            workshop: ['location']  // Same trait as Villager - should recognize, not duplicate
          }
        },
        label: 'player'
      });

      const player_belief = world_state.get_belief_by_label('player');
      const player_mind = player_belief.get_trait(world_state, Traittype.get_by_label('mind'));
      const player_state = player_mind.origin_state;

      // Get beliefs in player's mind
      const player_beliefs = [...player_state.get_beliefs()];

      const workshop = world_state.get_belief_by_label('workshop');

      // Find beliefs about workshop
      const workshop_beliefs = player_beliefs.filter(b => {
        const about = b.get_about(player_state);
        return about && about.subject === workshop.subject;
      });

      // Should have exactly ONE belief about workshop (recognized inherited, no duplication)
      expect(workshop_beliefs.length).to.equal(1, 'Should recognize inherited knowledge, not create duplicate');

      // Verify the belief has the location trait
      const player_workshop = workshop_beliefs[0];
      expect(player_workshop.get_trait(player_state, Traittype.get_by_label('location'))).to.not.be.null;

      // Verify Villager has the same knowledge
      const villager = DB.get_subject_by_label('Villager').get_shared_belief_by_state(world_state);
      const villager_mind = villager.get_trait(world_state, Traittype.get_by_label('mind'));
      const villager_state = villager_mind.origin_state;
      const villager_beliefs = [...villager_state.get_beliefs()];
      const villager_workshop_beliefs = villager_beliefs.filter(b => {
        const about = b.get_about(villager_state);
        return about && about.subject === workshop.subject;
      });

      expect(villager_workshop_beliefs.length).to.equal(1);

      // Since Player didn't add any new traits, should just inherit from Villager
      // (no new belief created in Player's state, just inherited through base chain)
    });
  });
});
