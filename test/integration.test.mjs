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
    it.skip('world.mjs setupStandardArchetypes with Villager prototype - NOT IMPLEMENTED', () => {
      // This test documents that prototypes with mind traits are NOT YET SUPPORTED
      // Issue: Villager prototype tries to resolve 'workshop' belief which doesn't exist in Eidos
      // The feature needs to be designed and implemented before this can work
      //
      // Error progression so far:
      // 1. ✓ Fixed: ground_state must be in parent mind - Timeless now uses parent.origin_state
      // 2. ✓ Fixed: tt must be derivable - State creation now provides tt=0 for Timeless
      // 3. ✗ Current: Cannot learn about 'workshop': belief not found
      //    - Mind.create_from_template tries to resolve workshop in ground_state
      //    - But workshop doesn't exist in Eidos, only in world_state later
      //    - Need to design how mind traits in prototypes should work

      DB.reset_registries();

      // Exact traittypes/archetypes/prototypes from world.mjs
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
        Villager: {
          bases: ['Person'],
          traits: {
            mind: {
              workshop: ['location']
            }
          },
        },
      };

      // This line causes the failure
      DB.register(traittypes, archetypes, prototypes);

      // If we get here, the bug is fixed and we can continue with world setup
      const world_mind = new Mind(logos(), 'world');
      const state = world_mind.create_state(logos().origin_state, {tt: 1});

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
          bases: ['Villager'],
          traits: {
            location: 'workshop',
          },
        },
      };

      state.add_beliefs_from_template(world_belief);

      const player = state.get_belief_by_label('player');
      expect(player).to.exist;
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
  });
});
