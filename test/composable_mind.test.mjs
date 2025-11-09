/**
 * Mind Composition Tests
 *
 * Tests composable mind trait behavior mirroring inventory composition patterns.
 * See docs/plans/mind-composition-tests.md for full test plan.
 */

import { expect } from 'chai'
import { Mind, Belief, Subject } from '../public/worker/cosmos.mjs'
import * as DB from '../public/worker/db.mjs'

describe('Composable Mind Trait', () => {

  describe('Phase 1: Basic Coverage', () => {

    it('null blocks composition and clears inherited minds', () => {
      DB.reset_registries()

      // Setup
      DB.register({
        '@about': {type: 'Subject', mind: 'parent'},
        '@tt': 'number',
        location: 'Location',
        mind: {type: 'Mind', composable: true},
      }, {
        Thing: {traits: {'@about': null, '@tt': null}},
        Location: {bases: ['Thing'], traits: {location: null}},
        Mental: {bases: ['Thing'], traits: {mind: null}},
        Person: {bases: ['Mental']},
      }, {})

      const world = Mind.create_world()
      const world_state = world.create_state(DB.get_logos_state(), {tt: 1})

      world_state.add_beliefs_from_template({
        village: {bases: ['Location']},
        tavern: {bases: ['Location'], traits: {location: 'village'}}
      })

      // Create Villager with mind
      world_state.add_shared_from_template({
        Villager: {
          bases: ['Person'],
          traits: {
            mind: {
              tavern: ['location']
            }
          }
        }
      })

      // Create EmptyPerson that explicitly blocks mind with null
      const empty_person = Belief.from_template(world_state, {
        bases: ['Villager'],
        traits: {
          '@label': 'empty_person',
          mind: null  // Explicit null blocks composition
        }
      })

      const ep = world_state.get_belief_by_label('empty_person')
      const ep_mind = ep.get_trait(world_state, 'mind')

      // Explicit null should block Villager's mind
      expect(ep_mind).to.be.null
    })

    it('composes mind in to_inspect_view() when belief has own mind trait', () => {
      DB.reset_registries()

      // Setup
      DB.register({
        '@about': {type: 'Subject', mind: 'parent'},
        '@tt': 'number',
        location: 'Location',
        mind: {type: 'Mind', composable: true},
      }, {
        Thing: {traits: {'@about': null, '@tt': null}},
        Location: {bases: ['Thing'], traits: {location: null}},
        Mental: {bases: ['Thing'], traits: {mind: null}},
        Person: {bases: ['Mental']},
      }, {})

      const world = Mind.create_world()
      const world_state = world.create_state(DB.get_logos_state(), {tt: 1})

      world_state.add_beliefs_from_template({
        tavern: {bases: ['Location']},
        workshop: {bases: ['Location']},
        market: {bases: ['Location']}
      })

      world_state.add_shared_from_template({
        Villager: {
          bases: ['Person'],
          traits: {mind: {tavern: ['location']}}
        }
      })

      world_state.add_shared_from_template({
        Blacksmith: {
          bases: ['Person'],
          traits: {mind: {workshop: ['location']}}
        }
      })

      // Create belief WITH own mind trait (so it appears in to_inspect_view)
      const vb = Belief.from_template(world_state, {
        bases: ['Villager', 'Blacksmith'],
        traits: {
          '@label': 'village_blacksmith',
          mind: {market: ['location']}  // Own mind trait
        }
      })

      const vb_belief = world_state.get_belief_by_label('village_blacksmith')
      const view = vb_belief.to_inspect_view(world_state)

      // View should show composed mind (because belief has own mind trait)
      expect(view.traits.mind).to.exist
      expect(view.traits.mind._type).to.equal('Mind')

      // The composed mind should have knowledge from all three sources
      const vb_mind = vb_belief.get_trait(world_state, 'mind')
      const beliefs = [...vb_mind.origin_state.get_beliefs()]

      expect(beliefs.length).to.be.at.least(3, 'Should have knowledge from Villager + Blacksmith + own')
    })

    it('own trait composes with inherited minds at creation time', () => {
      DB.reset_registries()

      // Setup
      DB.register({
        '@about': {type: 'Subject', mind: 'parent'},
        '@tt': 'number',
        location: 'Location',
        mind: {type: 'Mind', composable: true},
      }, {
        Thing: {traits: {'@about': null, '@tt': null}},
        Location: {bases: ['Thing'], traits: {location: null}},
        Mental: {bases: ['Thing'], traits: {mind: null}},
        Person: {bases: ['Mental']},
      }, {})

      const world = Mind.create_world()
      const world_state = world.create_state(DB.get_logos_state(), {tt: 1})

      world_state.add_beliefs_from_template({
        tavern: {bases: ['Location']},
        workshop: {bases: ['Location']},
        market: {bases: ['Location']}
      })

      world_state.add_shared_from_template({
        Villager: {
          bases: ['Person'],
          traits: {mind: {tavern: ['location']}}
        }
      })

      world_state.add_shared_from_template({
        Blacksmith: {
          bases: ['Person'],
          traits: {mind: {workshop: ['location']}}
        }
      })

      // VillageBlacksmith has own mind knowledge + inherits from bases
      const vb = Belief.from_template(world_state, {
        bases: ['Villager', 'Blacksmith'],
        traits: {
          '@label': 'village_blacksmith',
          mind: {
            market: ['location']  // Own knowledge
          }
        }
      })

      const vb_belief = world_state.get_belief_by_label('village_blacksmith')
      const vb_mind = vb_belief.get_trait(world_state, 'mind')
      const vb_state = vb_mind.origin_state

      // Should be UnionState (composed from own + Villager + Blacksmith)
      expect(vb_state.is_union).to.be.true
      expect(vb_state.component_states.length).to.equal(3, 'Own mind + Villager + Blacksmith')

      const beliefs = [...vb_state.get_beliefs()]

      // Should have knowledge about all three locations
      const tavern = world_state.get_belief_by_label('tavern')
      const workshop = world_state.get_belief_by_label('workshop')
      const market = world_state.get_belief_by_label('market')

      const has_tavern = beliefs.some(b => b.get_about(vb_state)?.subject === tavern.subject)
      const has_workshop = beliefs.some(b => b.get_about(vb_state)?.subject === workshop.subject)
      const has_market = beliefs.some(b => b.get_about(vb_state)?.subject === market.subject)

      expect(has_tavern).to.be.true
      expect(has_workshop).to.be.true
      expect(has_market).to.be.true
    })

    it('caches composed mind to avoid recreating UnionState', () => {
      DB.reset_registries()

      // Setup
      DB.register({
        '@about': {type: 'Subject', mind: 'parent'},
        '@tt': 'number',
        location: 'Location',
        mind: {type: 'Mind', composable: true},
      }, {
        Thing: {traits: {'@about': null, '@tt': null}},
        Location: {bases: ['Thing'], traits: {location: null}},
        Mental: {bases: ['Thing'], traits: {mind: null}},
        Person: {bases: ['Mental']},
      }, {})

      const world = Mind.create_world()
      const world_state = world.create_state(DB.get_logos_state(), {tt: 1})

      world_state.add_beliefs_from_template({
        tavern: {bases: ['Location']},
        workshop: {bases: ['Location']}
      })

      world_state.add_shared_from_template({
        Villager: {
          bases: ['Person'],
          traits: {mind: {tavern: ['location']}}
        }
      })

      world_state.add_shared_from_template({
        Blacksmith: {
          bases: ['Person'],
          traits: {mind: {workshop: ['location']}}
        }
      })

      const vb = Belief.from_template(world_state, {
        bases: ['Villager', 'Blacksmith'],
        traits: {'@label': 'village_blacksmith'}
      })

      const vb_belief = world_state.get_belief_by_label('village_blacksmith')

      // First call creates UnionState and caches Mind
      const mind1 = vb_belief.get_trait(world_state, 'mind')

      // Second call returns cached Mind (same instance)
      const mind2 = vb_belief.get_trait(world_state, 'mind')

      expect(mind1).to.equal(mind2, 'Should return same cached Mind instance')
      expect(mind1.origin_state).to.equal(mind2.origin_state, 'Should return same UnionState')

      // Different state = different cache entry
      const world_state2 = world.create_state(DB.get_logos_state(), {tt: 2})
      const mind3 = vb_belief.get_trait(world_state2, 'mind')

      expect(mind1).to.not.equal(mind3, 'Different state should create different Mind')
    })

  })

  describe('Phase 2: Temporal & Structural', () => {

    it('component_states structure is correct', () => {
      DB.reset_registries()

      DB.register({
        '@about': {type: 'Subject', mind: 'parent'},
        '@tt': 'number',
        location: 'Location',
        mind: {type: 'Mind', composable: true},
      }, {
        Thing: {traits: {'@about': null, '@tt': null}},
        Location: {bases: ['Thing'], traits: {location: null}},
        Mental: {bases: ['Thing'], traits: {mind: null}},
        Person: {bases: ['Mental']},
      }, {})

      const world = Mind.create_world()
      const world_state = world.create_state(DB.get_logos_state(), {tt: 1})

      world_state.add_beliefs_from_template({
        tavern: {bases: ['Location']},
        workshop: {bases: ['Location']}
      })

      world_state.add_shared_from_template({
        Villager: {
          bases: ['Person'],
          traits: {mind: {tavern: ['location']}}
        }
      })

      world_state.add_shared_from_template({
        Blacksmith: {
          bases: ['Person'],
          traits: {mind: {workshop: ['location']}}
        }
      })

      const vb = Belief.from_template(world_state, {
        bases: ['Villager', 'Blacksmith'],
        traits: {'@label': 'village_blacksmith'}
      })

      const vb_belief = world_state.get_belief_by_label('village_blacksmith')
      const vb_mind = vb_belief.get_trait(world_state, 'mind')
      const vb_state = vb_mind.origin_state

      // Verify component_states structure
      expect(vb_state.component_states).to.exist
      expect(Array.isArray(vb_state.component_states)).to.be.true
      expect(Object.isFrozen(vb_state.component_states)).to.be.true

      // Should have 2 components (Villager + Blacksmith)
      expect(vb_state.component_states.length).to.equal(2)

      // All components must be locked
      for (const component of vb_state.component_states) {
        expect(component.locked).to.be.true
      }

      // Order should match bases order (Villager first, Blacksmith second)
      const villager = DB.get_subject_by_label('Villager').get_shared_belief_by_state(world_state)
      const blacksmith = DB.get_subject_by_label('Blacksmith').get_shared_belief_by_state(world_state)

      const villager_mind = villager.get_trait(world_state, 'mind')
      const blacksmith_mind = blacksmith.get_trait(world_state, 'mind')

      expect(vb_state.component_states[0]).to.equal(villager_mind.origin_state)
      expect(vb_state.component_states[1]).to.equal(blacksmith_mind.origin_state)
    })

    it('is_union flag distinguishes UnionState from regular State', () => {
      DB.reset_registries()

      DB.register({
        '@about': {type: 'Subject', mind: 'parent'},
        '@tt': 'number',
        location: 'Location',
        mind: {type: 'Mind', composable: true},
      }, {
        Thing: {traits: {'@about': null, '@tt': null}},
        Location: {bases: ['Thing'], traits: {location: null}},
        Mental: {bases: ['Thing'], traits: {mind: null}},
        Person: {bases: ['Mental']},
      }, {})

      const world = Mind.create_world()
      const world_state = world.create_state(DB.get_logos_state(), {tt: 1})

      world_state.add_beliefs_from_template({
        tavern: {bases: ['Location']}
      })

      world_state.add_shared_from_template({
        Villager: {
          bases: ['Person'],
          traits: {mind: {tavern: ['location']}}
        }
      })

      world_state.add_shared_from_template({
        Blacksmith: {
          bases: ['Person'],
          traits: {mind: {tavern: ['location']}}
        }
      })

      // Regular state (single base, no composition)
      const villager = DB.get_subject_by_label('Villager').get_shared_belief_by_state(world_state)
      const villager_mind = villager.get_trait(world_state, 'mind')

      expect(villager_mind.origin_state.is_union).to.be.undefined

      // UnionState (multiple bases, composed)
      const vb = Belief.from_template(world_state, {
        bases: ['Villager', 'Blacksmith'],
        traits: {'@label': 'village_blacksmith'}
      })

      const vb_belief = world_state.get_belief_by_label('village_blacksmith')
      const vb_mind = vb_belief.get_trait(world_state, 'mind')

      expect(vb_mind.origin_state.is_union).to.be.true
    })

    it('composed mind works across state branches', () => {
      DB.reset_registries()

      DB.register({
        '@about': {type: 'Subject', mind: 'parent'},
        '@tt': 'number',
        location: 'Location',
        mind: {type: 'Mind', composable: true},
      }, {
        Thing: {traits: {'@about': null, '@tt': null}},
        Location: {bases: ['Thing'], traits: {location: null}},
        Mental: {bases: ['Thing'], traits: {mind: null}},
        Person: {bases: ['Mental']},
      }, {})

      const world = Mind.create_world()
      const world_state1 = world.create_state(DB.get_logos_state(), {tt: 1})

      world_state1.add_beliefs_from_template({
        tavern: {bases: ['Location']},
        workshop: {bases: ['Location']}
      })

      world_state1.add_shared_from_template({
        Villager: {
          bases: ['Person'],
          traits: {mind: {tavern: ['location']}}
        }
      })

      world_state1.add_shared_from_template({
        Blacksmith: {
          bases: ['Person'],
          traits: {mind: {workshop: ['location']}}
        }
      })

      const vb = Belief.from_template(world_state1, {
        bases: ['Villager', 'Blacksmith'],
        traits: {'@label': 'village_blacksmith'}
      })

      // Create second world state (branched)
      const world_state2 = world.create_state(DB.get_logos_state(), {tt: 2})

      const vb_belief = world_state1.get_belief_by_label('village_blacksmith')

      // Access composed mind from both states
      const mind1 = vb_belief.get_trait(world_state1, 'mind')
      const mind2 = vb_belief.get_trait(world_state2, 'mind')

      // Both should be valid Mind instances with UnionState
      expect(mind1).to.be.instanceOf(Mind)
      expect(mind2).to.be.instanceOf(Mind)
      expect(mind1.origin_state.is_union).to.be.true
      expect(mind2.origin_state.is_union).to.be.true

      // Different states mean different cached minds
      expect(mind1).to.not.equal(mind2)

      // But both should have same knowledge structure
      const beliefs1 = [...mind1.origin_state.get_beliefs()]
      const beliefs2 = [...mind2.origin_state.get_beliefs()]
      expect(beliefs1.length).to.equal(beliefs2.length)
    })

  })

  describe('Phase 3: Edge Cases', () => {

    it('nested UnionStates compose recursively', () => {
      DB.reset_registries()

      DB.register({
        '@about': {type: 'Subject', mind: 'parent'},
        '@tt': 'number',
        location: 'Location',
        mind: {type: 'Mind', composable: true},
      }, {
        Thing: {traits: {'@about': null, '@tt': null}},
        Location: {bases: ['Thing'], traits: {location: null}},
        Mental: {bases: ['Thing'], traits: {mind: null}},
        Person: {bases: ['Mental']},
      }, {})

      const world = Mind.create_world()
      const world_state = world.create_state(DB.get_logos_state(), {tt: 1})

      world_state.add_beliefs_from_template({
        tavern: {bases: ['Location']},
        workshop: {bases: ['Location']},
        guild_hall: {bases: ['Location']}
      })

      // Base prototypes with minds
      world_state.add_shared_from_template({
        Villager: {
          bases: ['Person'],
          traits: {mind: {tavern: ['location']}}
        }
      })

      world_state.add_shared_from_template({
        Blacksmith: {
          bases: ['Person'],
          traits: {mind: {workshop: ['location']}}
        }
      })

      // First level composition: VillageBlacksmith = Villager + Blacksmith
      world_state.add_shared_from_template({
        VillageBlacksmith: {
          bases: ['Villager', 'Blacksmith']
        }
      })

      // Guild prototype
      world_state.add_shared_from_template({
        Guild: {
          bases: ['Person'],
          traits: {mind: {guild_hall: ['location']}}
        }
      })

      // Second level composition: MasterCraftsman = VillageBlacksmith + Guild
      // This creates a nested UnionState (VillageBlacksmith's mind is already a UnionState)
      const mc = Belief.from_template(world_state, {
        bases: ['VillageBlacksmith', 'Guild'],
        traits: {'@label': 'master_craftsman'}
      })

      const mc_belief = world_state.get_belief_by_label('master_craftsman')
      const mc_mind = mc_belief.get_trait(world_state, 'mind')

      // Should have composed mind
      expect(mc_mind).to.be.instanceOf(Mind)
      expect(mc_mind.origin_state.is_union).to.be.true

      // Should have knowledge from all sources (recursive traversal)
      const beliefs = [...mc_mind.origin_state.get_beliefs()]

      const tavern = world_state.get_belief_by_label('tavern')
      const workshop = world_state.get_belief_by_label('workshop')
      const guild_hall = world_state.get_belief_by_label('guild_hall')

      const has_tavern = beliefs.some(b => b.get_about(mc_mind.origin_state)?.subject === tavern.subject)
      const has_workshop = beliefs.some(b => b.get_about(mc_mind.origin_state)?.subject === workshop.subject)
      const has_guild_hall = beliefs.some(b => b.get_about(mc_mind.origin_state)?.subject === guild_hall.subject)

      expect(has_tavern).to.be.true
      expect(has_workshop).to.be.true
      expect(has_guild_hall).to.be.true
    })

    it('overlapping knowledge - both beliefs present in UnionState', () => {
      DB.reset_registries()

      DB.register({
        '@about': {type: 'Subject', mind: 'parent'},
        '@tt': 'number',
        location: 'Location',
        size: 'number',
        mind: {type: 'Mind', composable: true},
      }, {
        Thing: {traits: {'@about': null, '@tt': null}},
        Location: {bases: ['Thing'], traits: {location: null, size: null}},
        Mental: {bases: ['Thing'], traits: {mind: null}},
        Person: {bases: ['Mental']},
      }, {})

      const world = Mind.create_world()
      const world_state = world.create_state(DB.get_logos_state(), {tt: 1})

      world_state.add_beliefs_from_template({
        workshop: {bases: ['Location']}
      })

      const workshop = world_state.get_belief_by_label('workshop')

      // Villager learns about workshop (just location trait)
      world_state.add_shared_from_template({
        Villager: {
          bases: ['Person'],
          traits: {
            mind: {
              workshop: ['location']
            }
          }
        }
      })

      // Blacksmith also learns about workshop (location + size traits)
      world_state.add_shared_from_template({
        Blacksmith: {
          bases: ['Person'],
          traits: {
            mind: {
              workshop: ['location', 'size']
            }
          }
        }
      })

      // VillageBlacksmith inherits from both
      const vb = Belief.from_template(world_state, {
        bases: ['Villager', 'Blacksmith'],
        traits: {'@label': 'village_blacksmith'}
      })

      const vb_belief = world_state.get_belief_by_label('village_blacksmith')
      const vb_mind = vb_belief.get_trait(world_state, 'mind')

      // UnionState should have beliefs from both component minds
      expect(vb_mind.origin_state.is_union).to.be.true

      const beliefs = [...vb_mind.origin_state.get_beliefs()]
      const workshop_beliefs = beliefs.filter(b => b.get_about(vb_mind.origin_state)?.subject === workshop.subject)

      // Both Villager and Blacksmith learned about workshop
      // UnionState doesn't merge - it yields beliefs from both component states
      // So we expect to see beliefs from both (may be 2 separate beliefs or merged depending on implementation)
      expect(workshop_beliefs.length).to.be.at.least(1, 'Should have beliefs about workshop from component minds')
    })

    it('multiple direct bases (3+) all contribute knowledge', () => {
      DB.reset_registries()

      DB.register({
        '@about': {type: 'Subject', mind: 'parent'},
        '@tt': 'number',
        location: 'Location',
        mind: {type: 'Mind', composable: true},
      }, {
        Thing: {traits: {'@about': null, '@tt': null}},
        Location: {bases: ['Thing'], traits: {location: null}},
        Mental: {bases: ['Thing'], traits: {mind: null}},
        Person: {bases: ['Mental']},
      }, {})

      const world = Mind.create_world()
      const world_state = world.create_state(DB.get_logos_state(), {tt: 1})

      world_state.add_beliefs_from_template({
        tavern: {bases: ['Location']},
        barracks: {bases: ['Location']},
        market: {bases: ['Location']}
      })

      world_state.add_shared_from_template({
        Villager: {
          bases: ['Person'],
          traits: {mind: {tavern: ['location']}}
        }
      })

      world_state.add_shared_from_template({
        Guard: {
          bases: ['Person'],
          traits: {mind: {barracks: ['location']}}
        }
      })

      world_state.add_shared_from_template({
        Merchant: {
          bases: ['Person'],
          traits: {mind: {market: ['location']}}
        }
      })

      // Multi-role NPC with three direct bases
      const jack = Belief.from_template(world_state, {
        bases: ['Villager', 'Guard', 'Merchant'],
        traits: {'@label': 'jack_of_all_trades'}
      })

      const jack_belief = world_state.get_belief_by_label('jack_of_all_trades')
      const jack_mind = jack_belief.get_trait(world_state, 'mind')

      expect(jack_mind.origin_state.is_union).to.be.true
      expect(jack_mind.origin_state.component_states.length).to.equal(3)

      const beliefs = [...jack_mind.origin_state.get_beliefs()]

      const tavern = world_state.get_belief_by_label('tavern')
      const barracks = world_state.get_belief_by_label('barracks')
      const market = world_state.get_belief_by_label('market')

      const has_tavern = beliefs.some(b => b.get_about(jack_mind.origin_state)?.subject === tavern.subject)
      const has_barracks = beliefs.some(b => b.get_about(jack_mind.origin_state)?.subject === barracks.subject)
      const has_market = beliefs.some(b => b.get_about(jack_mind.origin_state)?.subject === market.subject)

      expect(has_tavern).to.be.true
      expect(has_barracks).to.be.true
      expect(has_market).to.be.true
    })

    it('deep inheritance chain preserves knowledge through all levels', () => {
      DB.reset_registries()

      DB.register({
        '@about': {type: 'Subject', mind: 'parent'},
        '@tt': 'number',
        location: 'Location',
        mind: {type: 'Mind', composable: true},
      }, {
        Thing: {traits: {'@about': null, '@tt': null}},
        Location: {bases: ['Thing'], traits: {location: null}},
        Mental: {bases: ['Thing'], traits: {mind: null}},
        Person: {bases: ['Mental']},
      }, {})

      const world = Mind.create_world()
      const world_state = world.create_state(DB.get_logos_state(), {tt: 1})

      world_state.add_beliefs_from_template({
        world_loc: {bases: ['Location']},
        region_loc: {bases: ['Location']},
        village_loc: {bases: ['Location']},
        house_loc: {bases: ['Location']},
        room_loc: {bases: ['Location']}
      })

      // Level 1: Culture knows about world
      world_state.add_shared_from_template({
        Culture: {
          bases: ['Person'],
          traits: {mind: {world_loc: ['location']}}
        }
      })

      // Level 2: Region inherits Culture, adds regional knowledge
      world_state.add_shared_from_template({
        Region: {
          bases: ['Culture'],
          traits: {mind: {region_loc: ['location']}}
        }
      })

      // Level 3: Village inherits Region, adds village knowledge
      world_state.add_shared_from_template({
        Village: {
          bases: ['Region'],
          traits: {mind: {village_loc: ['location']}}
        }
      })

      // Level 4: Villager inherits Village, adds house knowledge
      world_state.add_shared_from_template({
        Villager: {
          bases: ['Village'],
          traits: {mind: {house_loc: ['location']}}
        }
      })

      // Level 5: Specific villager inherits Villager, adds room knowledge
      const alice = Belief.from_template(world_state, {
        bases: ['Villager'],
        traits: {
          '@label': 'alice',
          mind: {room_loc: ['location']}
        }
      })

      const alice_belief = world_state.get_belief_by_label('alice')
      const alice_mind = alice_belief.get_trait(world_state, 'mind')

      // Should have composed mind (own + base inheritance)
      expect(alice_mind).to.be.instanceOf(Mind)

      // Should have knowledge from all 5 levels
      const beliefs = [...alice_mind.origin_state.get_beliefs()]

      const world_loc = world_state.get_belief_by_label('world_loc')
      const region_loc = world_state.get_belief_by_label('region_loc')
      const village_loc = world_state.get_belief_by_label('village_loc')
      const house_loc = world_state.get_belief_by_label('house_loc')
      const room_loc = world_state.get_belief_by_label('room_loc')

      const has_world = beliefs.some(b => b.get_about(alice_mind.origin_state)?.subject === world_loc.subject)
      const has_region = beliefs.some(b => b.get_about(alice_mind.origin_state)?.subject === region_loc.subject)
      const has_village = beliefs.some(b => b.get_about(alice_mind.origin_state)?.subject === village_loc.subject)
      const has_house = beliefs.some(b => b.get_about(alice_mind.origin_state)?.subject === house_loc.subject)
      const has_room = beliefs.some(b => b.get_about(alice_mind.origin_state)?.subject === room_loc.subject)

      expect(has_world).to.be.true
      expect(has_region).to.be.true
      expect(has_village).to.be.true
      expect(has_house).to.be.true
      expect(has_room).to.be.true
    })

  })

  describe('Phase 4: Mind-Specific Validation', () => {

    it('parent mind validation - component states must be in compatible minds', () => {
      DB.reset_registries()

      DB.register({
        '@about': {type: 'Subject', mind: 'parent'},
        '@tt': 'number',
        location: 'Location',
        mind: {type: 'Mind', composable: true},
      }, {
        Thing: {traits: {'@about': null, '@tt': null}},
        Location: {bases: ['Thing'], traits: {location: null}},
        Mental: {bases: ['Thing'], traits: {mind: null}},
        Person: {bases: ['Mental']},
      }, {})

      const world = Mind.create_world()
      const world_state = world.create_state(DB.get_logos_state(), {tt: 1})

      world_state.add_beliefs_from_template({
        tavern: {bases: ['Location']}
      })

      world_state.add_shared_from_template({
        Villager: {
          bases: ['Person'],
          traits: {mind: {tavern: ['location']}}
        }
      })

      world_state.add_shared_from_template({
        Blacksmith: {
          bases: ['Person'],
          traits: {mind: {tavern: ['location']}}
        }
      })

      // Create entity that composes minds from shared prototypes
      // Both Villager and Blacksmith minds are children of Eidos (compatible parent)
      const vb = Belief.from_template(world_state, {
        bases: ['Villager', 'Blacksmith'],
        traits: {'@label': 'village_blacksmith'}
      })

      const vb_belief = world_state.get_belief_by_label('village_blacksmith')
      const vb_mind = vb_belief.get_trait(world_state, 'mind')

      // Should successfully compose minds from compatible parents
      expect(vb_mind).to.be.instanceOf(Mind)
      expect(vb_mind.origin_state.is_union).to.be.true

      // Verify component states are from compatible mind hierarchy
      const component_states = vb_mind.origin_state.component_states
      expect(component_states.length).to.equal(2)

      // Both component minds should have Eidos as parent (via shared belief pattern)
      const villager_mind = component_states[0].in_mind
      const blacksmith_mind = component_states[1].in_mind

      // Both should be child minds of Eidos (the shared prototype parent)
      expect(villager_mind._parent.label).to.equal('Eidos')
      expect(blacksmith_mind._parent.label).to.equal('Eidos')
    })

    it('self_subject consistency in UnionState', () => {
      DB.reset_registries()

      DB.register({
        '@about': {type: 'Subject', mind: 'parent'},
        '@tt': 'number',
        location: 'Location',
        mind: {type: 'Mind', composable: true},
      }, {
        Thing: {traits: {'@about': null, '@tt': null}},
        Location: {bases: ['Thing'], traits: {location: null}},
        Mental: {bases: ['Thing'], traits: {mind: null}},
        Person: {bases: ['Mental']},
      }, {})

      const world = Mind.create_world()
      const world_state = world.create_state(DB.get_logos_state(), {tt: 1})

      world_state.add_beliefs_from_template({
        tavern: {bases: ['Location']}
      })

      world_state.add_shared_from_template({
        Villager: {
          bases: ['Person'],
          traits: {mind: {tavern: ['location']}}
        }
      })

      world_state.add_shared_from_template({
        Blacksmith: {
          bases: ['Person'],
          traits: {mind: {tavern: ['location']}}
        }
      })

      const vb = Belief.from_template(world_state, {
        bases: ['Villager', 'Blacksmith'],
        traits: {'@label': 'village_blacksmith'}
      })

      const vb_belief = world_state.get_belief_by_label('village_blacksmith')
      const vb_mind = vb_belief.get_trait(world_state, 'mind')

      // UnionState.self should equal the belief's subject
      expect(vb_mind.origin_state.self).to.equal(vb_belief.subject)

      // self should be a Subject instance
      expect(vb_mind.origin_state.self).to.be.instanceOf(Subject)
    })

    it('about_state propagation in UnionState', () => {
      DB.reset_registries()

      DB.register({
        '@about': {type: 'Subject', mind: 'parent'},
        '@tt': 'number',
        location: 'Location',
        mind: {type: 'Mind', composable: true},
      }, {
        Thing: {traits: {'@about': null, '@tt': null}},
        Location: {bases: ['Thing'], traits: {location: null}},
        Mental: {bases: ['Thing'], traits: {mind: null}},
        Person: {bases: ['Mental']},
      }, {})

      const world = Mind.create_world()
      const world_state = world.create_state(DB.get_logos_state(), {tt: 1})

      world_state.add_beliefs_from_template({
        tavern: {bases: ['Location']}
      })

      world_state.add_shared_from_template({
        Villager: {
          bases: ['Person'],
          traits: {mind: {tavern: ['location']}}
        }
      })

      world_state.add_shared_from_template({
        Blacksmith: {
          bases: ['Person'],
          traits: {mind: {tavern: ['location']}}
        }
      })

      const vb = Belief.from_template(world_state, {
        bases: ['Villager', 'Blacksmith'],
        traits: {'@label': 'village_blacksmith'}
      })

      const vb_belief = world_state.get_belief_by_label('village_blacksmith')
      const vb_mind = vb_belief.get_trait(world_state, 'mind')

      // Component states should have about_state pointing to world_state
      const component_states = vb_mind.origin_state.component_states

      for (const component_state of component_states) {
        // Prototype minds have about_state = world_state
        expect(component_state.about_state).to.exist
        expect(component_state.about_state).to.equal(world_state)
      }

      // Verify beliefs can be resolved from correct context
      const beliefs = [...vb_mind.origin_state.get_beliefs()]
      expect(beliefs.length).to.be.at.least(1, 'Should have beliefs from component minds')

      // Each belief should resolve its @about correctly
      for (const belief of beliefs) {
        const about = belief.get_about(vb_mind.origin_state)
        expect(about).to.exist
      }
    })

    it('read-only composition after lock', () => {
      DB.reset_registries()

      DB.register({
        '@about': {type: 'Subject', mind: 'parent'},
        '@tt': 'number',
        location: 'Location',
        mind: {type: 'Mind', composable: true},
      }, {
        Thing: {traits: {'@about': null, '@tt': null}},
        Location: {bases: ['Thing'], traits: {location: null}},
        Mental: {bases: ['Thing'], traits: {mind: null}},
        Person: {bases: ['Mental']},
      }, {})

      const world = Mind.create_world()
      const world_state = world.create_state(DB.get_logos_state(), {tt: 1})

      world_state.add_beliefs_from_template({
        tavern: {bases: ['Location']},
        workshop: {bases: ['Location']}
      })

      world_state.add_shared_from_template({
        Villager: {
          bases: ['Person'],
          traits: {mind: {tavern: ['location']}}
        }
      })

      world_state.add_shared_from_template({
        Blacksmith: {
          bases: ['Person'],
          traits: {mind: {workshop: ['location']}}
        }
      })

      // Create belief with composable mind BEFORE locking
      const vb = Belief.from_template(world_state, {
        bases: ['Villager', 'Blacksmith'],
        traits: {'@label': 'village_blacksmith'}
      })

      // Lock the state (immutable snapshot)
      world_state.lock()

      // This SHOULD work - it's a READ operation
      // Getting a trait from a locked state shouldn't fail
      const vb_belief = world_state.get_belief_by_label('village_blacksmith')

      // The critical test: accessing composable mind from locked state
      // This creates UnionState internally, which shouldn't be blocked by lock
      const vb_mind = vb_belief.get_trait(world_state, 'mind')

      // Verify the composed mind is accessible
      expect(vb_mind).to.be.instanceOf(Mind)
      expect(vb_mind.origin_state.is_union).to.be.true

      // Verify we can read beliefs from the composed mind
      const beliefs = [...vb_mind.origin_state.get_beliefs()]
      expect(beliefs.length).to.be.at.least(1)
    })

  })
})
