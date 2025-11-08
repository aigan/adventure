import { expect } from 'chai';
import { Mind, State, Belief, Archetype, Traittype, save_mind, load , logos } from '../public/worker/cosmos.mjs';
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
        '@tt': 'number',
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
            '@tt': null,
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
      const world_mind = new Mind(logos(), 'world');
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
      const player_mind = player.get_trait(state, 'mind');
      expect(player_mind).to.be.instanceOf(Mind);

      // Verify the Villager prototype's mind knows about workshop (via about_state)
      const villager = DB.get_subject_by_label('Villager').get_shared_belief_by_state(state);
      const villager_mind = villager.get_trait(state, 'mind');
      expect(villager_mind).to.be.instanceOf(Mind);

      // Verify villager mind has a state with beliefs (learned about workshop)
      const villager_mind_state = [...villager_mind.states_at_tt(0)][0];
      expect(villager_mind_state).to.exist;
      const beliefs = [...villager_mind_state.get_beliefs()];
      expect(beliefs.length).to.be.greaterThan(0);

      // Verify at least one belief has @about pointing to workshop
      const workshop = state.get_belief_by_label('workshop');
      const workshop_knowledge = beliefs.find(b =>
        b.get_trait(villager_mind_state, '@about') === workshop.subject
      );
      expect(workshop_knowledge).to.exist;

      state.lock();
    });

    it('prototypes with mind traits use find_beliefs_about_subject_in_state()', () => {
      // Tests that knowledge about a subject can be queried using the helper
      DB.reset_registries();

      const traittypes = {
        '@about': {
          type: 'Subject',
          mind: 'parent'
        },
        '@tt': 'number',
        location: 'Location',
        mind: 'Mind',
      };

      const archetypes = {
        Thing: {
          traits: {
            '@about': null,
            '@tt': null,
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
      const world_mind = new Mind(logos(), 'world');
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

      // Verify using find_beliefs_about_subject_in_state()
      const villager = DB.get_subject_by_label('Villager').get_shared_belief_by_state(state);
      const villager_mind = villager.get_trait(state, 'mind');
      const villager_mind_state = [...villager_mind.states_at_tt(0)][0];

      const workshop = state.get_belief_by_label('workshop');
      const knowledge_about_workshop = DB.find_beliefs_about_subject_in_state(
        villager_mind,
        workshop.subject,
        villager_mind_state
      );

      // Villager mind should have exactly one belief about workshop
      expect(knowledge_about_workshop.length).to.equal(1);
      expect(knowledge_about_workshop[0].get_trait(villager_mind_state, '@about')).to.equal(workshop.subject);

      // Verify this is knowledge ABOUT workshop, not workshop itself
      expect(knowledge_about_workshop[0]).to.not.equal(workshop);
      expect(knowledge_about_workshop[0].subject).to.not.equal(workshop.subject);

      // Verify the knowledge has the location trait slot (from learning spec)
      const knowledge_archetypes = [...knowledge_about_workshop[0].get_archetypes()].map(a => a.label);
      expect(knowledge_archetypes).to.include('Location');

      state.lock();
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
        traits: {'@label': 'ball', location: 'workshop',},
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
      const player_mind = new Mind(world_state.in_mind, 'player_mind');
      const player_mind_state = player_mind.create_state(world_state);
      player = Belief.from_template(world_state, {
        bases: [player],
        traits: { mind: player_mind }
      });

      const player_inspected = player.to_inspect_view(world_state);
      expect(player_inspected.traits.mind._ref).to.equal(player_mind._id);

      // Verify learn_about
      const workshop = get_first_belief_by_label('workshop');
      const workshop_knowledge = player_mind_state.learn_about(workshop, []);

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
        '@tt': 'number',
        location: 'Location',
        mind: 'Mind',
        color: 'string',
      }, {
        Thing: {
          traits: {'@about': null, '@tt': null}
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
      const world = Mind.create_world();
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
          traits: {color: 'blue'}
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
          '@label': 'player',
          mind: {
            hammer: ['location']  // Player learns hammer location (extending Villager's knowledge)
          }
        }
      });

      const player = world_state.get_belief_by_label('player');
      expect(player).to.not.be.null;
      const player_mind = player.get_trait(world_state, 'mind');
      const player_state = player_mind.origin_state;  // Use origin_state since mind is locked

      // Verify state.base points to Villager's mind state
      const villager = DB.get_subject_by_label('Villager').get_shared_belief_by_state(world_state);
      expect(villager).to.not.be.null;
      const villager_mind = villager.get_trait(world_state, 'mind');
      const villager_state = villager_mind.origin_state;

      // This is the key test - player's mind state should have Villager's state as base
      expect(player_state.base).to.equal(villager_state);

      // Verify player's mind has knowledge from BOTH Villager (via base) and own template
      const beliefs_in_player_mind = [...player_state.get_beliefs()];

      // get_beliefs() walks the base chain, so should include beliefs from Villager's state
      expect(beliefs_in_player_mind.length).to.be.at.least(3);
    });
  });
});
