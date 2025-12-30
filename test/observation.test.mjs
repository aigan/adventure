import { expect } from 'chai'
import * as DB from '../public/worker/db.mjs'
import * as Cosmos from '../public/worker/cosmos.mjs'
import { logos, logos_state } from '../public/worker/logos.mjs'
import { Belief } from '../public/worker/belief.mjs'
import { Traittype } from '../public/worker/traittype.mjs'
import { perceive, identify, learn_from, recognize, learn_about } from '../public/worker/perception.mjs'
import { setupStandardArchetypes, createMindWithBeliefs, get_knowledge_about, setupAfterEachValidation } from './helpers.mjs'

describe('observation', () => {
  beforeEach(() => {
    DB.reset_registries()
    setupStandardArchetypes()
  })
  setupAfterEachValidation();


  describe('duplicate belief prevention', () => {
    it('should not create duplicate when looking at already-known entity', () => {
      // Setup world similar to world.mjs
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      state.add_beliefs_from_template({
        workshop: {
          bases: ['Location'],
        },
        hammer: {
          bases: ['PortableObject'],
          traits: {
            location: 'workshop',
            color: 'blue',
          },
        }
      })

      state.add_beliefs_from_template({
        player: {
          bases: ['Person'],
          traits: {
            mind: {
              hammer: ['color'],  // Player knows hammer's color from template
            },
            location: 'workshop',
          },
        }
      })

      state.lock()
      state = state.branch(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      const hammer = state.get_belief_by_label('hammer')
      const workshop = state.get_belief_by_label('workshop')

      // Get player's mind state
      const player_state = state.get_active_state_by_host(player.subject)

      // Explicit learn_about (like world.mjs line 200)
      learn_about(player_state,hammer)

      // Count beliefs about hammer before do_look
      const about_traittype = Traittype.get_by_label('@about')
      const beliefs_before = [...hammer.rev_trait(player_state, about_traittype)]
      const count_before = beliefs_before.length

      // Simulate do_look: get content and learn about each
      const location_traittype = Traittype.get_by_label('location')
      const content = [...workshop.rev_trait(state, location_traittype)]

      expect(content).to.include(hammer)
      expect(content).to.include(player)

      // This is what do_look does - learn about each item
      for (const item of content) {
        // Check recognize before
        const existing = recognize(player_state,item)

        learn_about(player_state,item)

        // Count after this learn_about
        const beliefs_after = [...item.rev_trait(player_state, about_traittype)]

        // For hammer, should NOT create duplicate
        if (item === hammer) {
          expect(existing.length, 'should recognize existing hammer knowledge').to.be.at.least(1)
          expect(beliefs_after.length, 'should not duplicate hammer belief').to.equal(count_before)
        }
      }
    })

    it('should match world.mjs flow exactly', () => {
      // Simplified reproduction of world.mjs init_world()
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      state.add_beliefs_from_template({
        village: { bases: ['Location'] },
        workshop: {
          bases: ['Location'],
          traits: { location: 'village' },
        },
        hammer: {
          bases: ['PortableObject'],
          traits: { location: 'workshop', color: 'blue' },
        }
      })

      state.add_beliefs_from_template({
        player: {
          bases: ['Person'],
          traits: {
            mind: { hammer: ['color'] },
            location: 'workshop',
          },
        }
      })

      state.lock()
      state = state.branch(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      expect(player, 'player belief not found').to.exist
      const player_state = state.get_active_state_by_host(player.subject)
      const hammer = state.get_belief_by_label('hammer')
      expect(hammer, 'hammer belief not found').to.exist

      // Count beliefs BEFORE learn_about
      const about_traittype = Traittype.get_by_label('@about')
      const before = [...hammer.rev_trait(player_state, about_traittype)]
      console.log('Before learn_about:', before.length, 'beliefs about hammer')

      learn_about(player_state,hammer)

      // Count beliefs AFTER learn_about
      const after = [...hammer.rev_trait(player_state, about_traittype)]
      console.log('After learn_about:', after.length, 'beliefs about hammer')

      state.lock()

      // Should NOT have duplicated
      expect(after.length, 'learn_about should not create duplicate').to.equal(before.length)
    })

    it('should recognize knowledge from base state after branch', () => {
      // Setup world
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      state.add_beliefs_from_template({
        workshop: { bases: ['Location'] },
        hammer: {
          bases: ['PortableObject'],
          traits: { location: 'workshop', color: 'blue' },
        },
        player: {
          bases: ['Person'],
          traits: {
            mind: { hammer: ['color'] },
            location: 'workshop',
          },
        }
      })

      state.lock()
      state = state.branch(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      const hammer = state.get_belief_by_label('hammer')

      // Get player's mind state - should branch from locked template state
      const player_state = state.get_active_state_by_host(player.subject)

      // Recognize should find hammer knowledge from template (in base state)
      const existing = recognize(player_state,hammer)
      expect(existing.length, 'should find hammer knowledge from template').to.be.at.least(1)

      // Verify the found belief has correct @about
      const about_traittype = Traittype.get_by_label('@about')
      const about_value = existing[0].get_trait(player_state, about_traittype)
      expect(about_value).to.equal(hammer.subject)
    })

    it('should trace player_state base chain correctly', () => {
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      state.add_beliefs_from_template({
        workshop: { bases: ['Location'] },
        hammer: {
          bases: ['PortableObject'],
          traits: { location: 'workshop', color: 'blue' },
        },
        player: {
          bases: ['Person'],
          traits: {
            mind: { hammer: ['color'] },
            location: 'workshop',
          },
        }
      })

      state.lock()
      state = state.branch(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      const player_state = state.get_active_state_by_host(player.subject)

      // Trace base chain
      const bases = []
      let s = player_state
      while (s) {
        bases.push({ id: s._id, locked: s.locked, mind: s.in_mind?.label })
        s = s.base
      }

      console.log('Player state base chain:', bases)

      // Player state should have a base (the template state)
      expect(player_state.base, 'player_state should have base').to.exist
      expect(player_state.base.locked, 'base state should be locked').to.be.true
    })
  })

  describe('EventPerception creation', () => {
    /**
     * Helper: Create a perceived belief in a mind state
     * @param {State} mind_state - Observer's mind state
     * @param {string[]} archetype_bases - Archetype bases (e.g., ['Hammer'])
     * @param {Object} trait_values - Trait key-value pairs
     * @param {Subject|null} about_subject - Recognized entity subject, or null if unrecognized
     * @returns {Belief} The created perceived belief
     */
    function create_perceived_belief(mind_state, archetype_bases, trait_values, about_subject = null) {
      return mind_state.add_belief_from_template({
        bases: archetype_bases,
        traits: {
          '@about': about_subject,
          ...trait_values
        }
      })
    }

    /**
     * Helper: Create an EventPerception holding perceived beliefs
     * @param {State} mind_state - Observer's mind state
     * @param {Belief[]} perceived_beliefs - Array of perceived belief objects
     * @returns {Belief} The created EventPerception belief
     */
    function create_observation(mind_state, perceived_beliefs) {
      return mind_state.add_belief_from_template({
        bases: ['EventPerception'],
        traits: {
          content: perceived_beliefs.map(b => b.subject)
        }
      })
    }

    it('should create perceived belief with flat traits', () => {
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      state.add_beliefs_from_template({
        player: {
          bases: ['Person'],
          traits: { mind: {} }
        }
      })

      state.lock()
      state = state.branch(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      const player_state = state.get_active_state_by_host(player.subject)

      // Create perceived belief with flat traits
      const perceived = create_perceived_belief(player_state, ['PortableObject'], {
        color: 'blue'
      })

      expect(perceived).to.exist

      const color_tt = Traittype.get_by_label('color')
      const about_tt = Traittype.get_by_label('@about')

      expect(perceived.get_trait(player_state, color_tt)).to.equal('blue')
      expect(perceived.get_trait(player_state, about_tt)).to.be.null

      // Verify archetype through get_archetypes
      const archetypes = perceived.get_archetypes()
      expect(archetypes.some(a => a.label === 'PortableObject')).to.be.true
    })

    it('should create perceived belief with nested/compositional traits', () => {
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      // Register hammer traittypes
      DB.register({
        material: { type: 'string', exposure: 'visual' },
        length: { type: 'string', exposure: 'visual' },
        head: { type: 'HammerHead', exposure: 'visual' },
        handle: { type: 'HammerHandle', exposure: 'visual' },
      }, {
        HammerHead: {
          bases: ['ObjectPhysical'],
          traits: { material: null, color: null }
        },
        HammerHandle: {
          bases: ['ObjectPhysical'],
          traits: { material: null, color: null, length: null }
        },
        Hammer: {
          bases: ['PortableObject'],
          traits: { head: null, handle: null }
        },
      }, {})

      state.add_beliefs_from_template({
        player: {
          bases: ['Person'],
          traits: { mind: {} }
        }
      })

      state.lock()
      state = state.branch(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      const player_state = state.get_active_state_by_host(player.subject)

      // Create nested perceived beliefs (handle as separate belief)
      const perceived_handle = create_perceived_belief(player_state, ['HammerHandle'], {
        length: 'short',
        color: 'brown'
      })

      const perceived_hammer = create_perceived_belief(player_state, ['Hammer'], {
        handle: perceived_handle.subject
      })

      expect(perceived_hammer).to.exist
      expect(perceived_handle).to.exist

      const handle_tt = Traittype.get_by_label('handle')
      const length_tt = Traittype.get_by_label('length')

      const handle_ref = perceived_hammer.get_trait(player_state, handle_tt)
      expect(handle_ref).to.equal(perceived_handle.subject)

      const handle_belief = player_state.get_belief_by_subject(handle_ref)
      expect(handle_belief.get_trait(player_state, length_tt)).to.equal('short')
    })

    it('should create EventPerception holding multiple perceived beliefs', () => {
      // Register EventAwareness/EventPerception from world.mjs
      DB.register({
        content: { type: 'Thing', container: Array, exposure: 'internal' }
      }, {
        EventAwareness: {
          bases: ['Thing'],
          traits: { content: null }
        },
        EventPerception: {
          bases: ['EventAwareness']
        }
      }, {})

      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      state.add_beliefs_from_template({
        player: {
          bases: ['Person'],
          traits: { mind: {} }
        }
      })

      state.lock()
      state = state.branch(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      const player_state = state.get_active_state_by_host(player.subject)

      // Create multiple perceived beliefs
      const perceived_hammer = create_perceived_belief(player_state, ['PortableObject'], {
        color: 'blue'
      })

      const perceived_workshop = create_perceived_belief(player_state, ['Location'], {})

      // Create EventPerception
      const perception = create_observation(player_state, [perceived_hammer, perceived_workshop])

      expect(perception).to.exist
      expect(perception.get_archetypes().some(a => a.label === 'EventPerception')).to.be.true

      const content_tt = Traittype.get_by_label('content')
      const content = perception.get_trait(player_state, content_tt)

      expect(content).to.be.an('array')
      expect(content).to.have.lengthOf(2)
      expect(content).to.include(perceived_hammer.subject)
      expect(content).to.include(perceived_workshop.subject)
    })

    it('should track recognized vs unrecognized with @about', () => {
      // Register EventAwareness/EventPerception from world.mjs
      DB.register({
        content: { type: 'Thing', container: Array, exposure: 'internal' }
      }, {
        EventAwareness: {
          bases: ['Thing'],
          traits: { content: null }
        },
        EventPerception: {
          bases: ['EventAwareness']
        }
      }, {})

      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      state.add_beliefs_from_template({
        workshop: { bases: ['Location'] },
        hammer: {
          bases: ['PortableObject'],
          traits: { location: 'workshop', color: 'blue' }
        },
        player: {
          bases: ['Person'],
          traits: { mind: {}, location: 'workshop' }
        }
      })

      state.lock()
      state = state.branch(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      const hammer = state.get_belief_by_label('hammer')
      const workshop = state.get_belief_by_label('workshop')
      const player_state = state.get_active_state_by_host(player.subject)

      // Create perceived belief - recognized (workshop)
      const perceived_workshop = create_perceived_belief(player_state, ['Location'], {}, workshop.subject)

      // Create perceived belief - unrecognized (unknown hammer)
      const perceived_hammer = create_perceived_belief(player_state, ['PortableObject'], {
        color: 'blue'
      }, null)

      const about_tt = Traittype.get_by_label('@about')

      // Workshop should be recognized
      expect(perceived_workshop.get_trait(player_state, about_tt)).to.equal(workshop.subject)

      // Hammer should be unrecognized
      expect(perceived_hammer.get_trait(player_state, about_tt)).to.be.null

      // Both can be in same EventPerception
      const perception = create_observation(player_state, [perceived_workshop, perceived_hammer])
      expect(perception).to.exist
    })
  })

  describe('perceive(), identify(), learn_from()', () => {
    // Note: setupStandardArchetypes() is called in outer beforeEach above

    beforeEach(() => {
      // Register EventAwareness/EventPerception
      DB.register({
        content: { type: 'Thing', container: Array, exposure: 'internal' }
      }, {
        EventAwareness: {
          bases: ['Thing'],
          traits: { content: null }
        },
        EventPerception: {
          bases: ['EventAwareness']
        }
      }, {})
    })

    it('perceive() should create knowledge beliefs for unfamiliar entities (fast path)', () => {
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      state.add_beliefs_from_template({
        workshop: { bases: ['Location'] },
        hammer: {
          bases: ['PortableObject'],
          traits: { location: 'workshop', color: 'blue' }
        },
        player: {
          bases: ['Person'],
          traits: { mind: {}, location: 'workshop' }
        }
      })

      state.lock()
      state = state.branch(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      const hammer = state.get_belief_by_label('hammer')
      const workshop = state.get_belief_by_label('workshop')
      const player_state = state.get_active_state_by_host(player.subject)

      // Player doesn't know about hammer yet
      const existing = recognize(player_state,hammer)
      expect(existing.length).to.equal(0)

      // Perceive hammer
      const perception = perceive(player_state,[hammer])

      expect(perception).to.exist
      expect(perception.get_archetypes().some(a => a.label === 'EventPerception')).to.be.true

      // Check content - should include hammer only (not workshop - location is spatial)
      const content_tt = Traittype.get_by_label('content')
      const content = perception.get_trait(player_state, content_tt)
      expect(content).to.be.an('array')
      expect(content).to.have.lengthOf(1)  // hammer only (location trait excluded with default visual modalities)

      // Find hammer knowledge belief in content
      const hammer_knowledge_subject = content.find(s => {
        const b = player_state.get_belief_by_subject(s)
        const about_tt = Traittype.get_by_label('@about')
        const about = b.get_trait(player_state, about_tt)
        return about && about.sid === hammer.subject.sid
      })
      expect(hammer_knowledge_subject).to.exist

      // Get hammer knowledge belief
      const hammer_knowledge = player_state.get_belief_by_subject(hammer_knowledge_subject)
      const about_tt = Traittype.get_by_label('@about')
      const about = hammer_knowledge.get_trait(player_state, about_tt)
      expect(about).to.not.be.null  // Fast path: @about set to world entity
      expect(about.sid).to.equal(hammer.subject.sid)

      // Should have color trait
      const color_tt = Traittype.get_by_label('color')
      expect(hammer_knowledge.get_trait(player_state, color_tt)).to.equal('blue')
    })

    it('perceive() should reuse knowledge for familiar unchanged entities', () => {
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      state.add_beliefs_from_template({
        workshop: { bases: ['Location'] },
        hammer: {
          bases: ['PortableObject'],
          traits: { location: 'workshop', color: 'blue' }
        },
        player: {
          bases: ['Person'],
          traits: {
            mind: { hammer: ['color'] },  // Player knows hammer
            location: 'workshop'
          }
        }
      })

      state.lock()
      state = state.branch(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      const hammer = state.get_belief_by_label('hammer')
      const workshop = state.get_belief_by_label('workshop')
      const player_state = state.get_active_state_by_host(player.subject)

      // Player should recognize hammer
      const existing_knowledge = recognize(player_state,hammer)
      expect(existing_knowledge.length).to.be.at.least(1)
      const old_knowledge_id = existing_knowledge[0]._id

      // Perceive hammer (familiar, traits unchanged)
      const perception = perceive(player_state,[hammer])

      const content_tt = Traittype.get_by_label('content')
      const content = perception.get_trait(player_state, content_tt)
      expect(content).to.be.an('array')
      expect(content.length).to.equal(1)  // hammer only (location trait excluded)

      // Find hammer knowledge in content
      const hammer_subject = content.find(s => {
        const b = player_state.get_belief_by_subject(s)
        const about_tt = Traittype.get_by_label('@about')
        const about = b.get_trait(player_state, about_tt)
        return about && about.sid === hammer.subject.sid
      })
      expect(hammer_subject).to.exist

      // Should be the same belief (reused, not new version)
      const hammer_knowledge = player_state.get_belief_by_subject(hammer_subject)
      expect(hammer_knowledge._id).to.equal(old_knowledge_id)
    })

    it('identify() should match traits to knowledge beliefs', () => {
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      // Register hammer archetypes
      DB.register({
        material: { type: 'string', exposure: 'visual' },
        length: { type: 'string', exposure: 'visual' },
      }, {
        Hammer: {
          bases: ['PortableObject'],
          traits: { material: null, length: null }
        }
      }, {})

      state.add_beliefs_from_template({
        workshop: { bases: ['Location'] },
        hammer1: {
          bases: ['Hammer'],
          traits: { location: 'workshop', material: 'steel', length: 'short' }
        },
        hammer2: {
          bases: ['Hammer'],
          traits: { location: 'workshop', material: 'wood', length: 'long' }
        },
        player: {
          bases: ['Person'],
          traits: {
            mind: {
              hammer1: ['material', 'length'],  // Player knows hammer1
              hammer2: ['material', 'length']   // Player knows hammer2
            },
            location: 'workshop'
          }
        }
      })

      state.lock()
      state = state.branch(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      const hammer1 = state.get_belief_by_label('hammer1')
      const hammer2 = state.get_belief_by_label('hammer2')
      const player_state = state.get_active_state_by_host(player.subject)

      // Create perceived belief matching hammer1
      const perceived = player_state.add_belief_from_template({
        bases: ['Hammer'],
        traits: {
          '@about': null,
          material: 'steel',
          length: 'short'
        }
      })

      // Identify should return hammer1
      const candidates = identify(player_state,perceived)
      expect(candidates).to.be.an('array')
      expect(candidates.length).to.be.at.least(1)
      expect(candidates[0]).to.equal(hammer1.subject)
    })

    it('identify() should return multiple candidates for ambiguous matches', () => {
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      DB.register({
        material: { type: 'string', exposure: 'visual' }
      }, {
        Hammer: {
          bases: ['PortableObject'],
          traits: { material: null }
        }
      }, {})

      state.add_beliefs_from_template({
        workshop: { bases: ['Location'] },
        hammer1: {
          bases: ['Hammer'],
          traits: { location: 'workshop', material: 'steel' }
        },
        hammer2: {
          bases: ['Hammer'],
          traits: { location: 'workshop', material: 'steel' }  // Same material
        },
        player: {
          bases: ['Person'],
          traits: {
            mind: {
              hammer1: ['material'],
              hammer2: ['material']
            },
            location: 'workshop'
          }
        }
      })

      state.lock()
      state = state.branch(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      const hammer1 = state.get_belief_by_label('hammer1')
      const hammer2 = state.get_belief_by_label('hammer2')
      const player_state = state.get_active_state_by_host(player.subject)

      // Create perceived belief with only material
      const perceived = player_state.add_belief_from_template({
        bases: ['Hammer'],
        traits: {
          '@about': null,
          material: 'steel'
        }
      })

      // Identify should return both hammers (ambiguous)
      const candidates = identify(player_state,perceived)
      expect(candidates).to.be.an('array')
      expect(candidates.length).to.equal(2)
      expect(candidates).to.include(hammer1.subject)
      expect(candidates).to.include(hammer2.subject)
    })

    it('perceive() should auto-update knowledge when new traits are visible', () => {
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      DB.register({
        material: { type: 'string', exposure: 'visual' }
      }, {
        Hammer: {
          bases: ['PortableObject'],
          traits: { material: null }
        }
      }, {})

      state.add_beliefs_from_template({
        workshop: { bases: ['Location'] },
        hammer: {
          bases: ['Hammer'],
          traits: { location: 'workshop', material: 'steel' }
        },
        player: {
          bases: ['Person'],
          traits: {
            mind: { hammer: ['location'] },  // Player knows hammer's location only
            location: 'workshop'
          }
        }
      })

      state.lock()
      state = state.branch(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      const hammer = state.get_belief_by_label('hammer')
      const player_state = state.get_active_state_by_host(player.subject)

      // Player has minimal knowledge (can recognize)
      const old_knowledge = recognize(player_state,hammer)
      expect(old_knowledge.length).to.be.at.least(1)
      const old_knowledge_id = old_knowledge[0]._id
      const material_tt = Traittype.get_by_label('material')
      expect(old_knowledge[0].get_trait(player_state, material_tt)).to.be.null  // Doesn't know material yet

      // Perceive hammer (familiar, but material now visible)
      perceive(player_state,[hammer])

      // Fast path should automatically create versioned belief with material trait
      const updated_knowledge = recognize(player_state,hammer)
      expect(updated_knowledge.length).to.be.at.least(1)
      expect(updated_knowledge[0].get_trait(player_state, material_tt)).to.equal('steel')

      // Should be a new version (different _id but same subject)
      expect(updated_knowledge[0]._id).to.not.equal(old_knowledge_id)
      expect(updated_knowledge[0].subject.sid).to.equal(old_knowledge[0].subject.sid)
    })

    it('learn_from() should handle familiar entities (direct subject refs)', () => {
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      state.add_beliefs_from_template({
        workshop: { bases: ['Location'] },
        hammer: {
          bases: ['PortableObject'],
          traits: { location: 'workshop', color: 'blue' }
        },
        player: {
          bases: ['Person'],
          traits: {
            mind: { hammer: ['color'] },  // Player already knows hammer
            location: 'workshop'
          }
        }
      })

      state.lock()
      state = state.branch(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      const hammer = state.get_belief_by_label('hammer')
      const player_state = state.get_active_state_by_host(player.subject)

      // Count beliefs before
      const about_tt = Traittype.get_by_label('@about')
      const beliefs_before = [...hammer.rev_trait(player_state, about_tt)]

      // Perceive hammer (familiar - will be direct subject ref)
      const perception = perceive(player_state,[hammer])

      // Learn from perception
      learn_from(player_state,perception)

      // Should not create duplicate
      const beliefs_after = [...hammer.rev_trait(player_state, about_tt)]
      expect(beliefs_after.length).to.equal(beliefs_before.length)
    })

    it('end-to-end: perceive location content with familiar entities', () => {
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      state.add_beliefs_from_template({
        workshop: { bases: ['Location'] },
        hammer: {
          bases: ['PortableObject'],
          traits: { location: 'workshop', color: 'blue' }
        },
        player: {
          bases: ['Person'],
          traits: {
            mind: { hammer: ['location'] },  // Player knows hammer's location only
            location: 'workshop'
          }
        }
      })

      state.lock()
      state = state.branch(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      const hammer = state.get_belief_by_label('hammer')
      const workshop = state.get_belief_by_label('workshop')
      const player_state = state.get_active_state_by_host(player.subject)

      // Verify initial knowledge - knows location but not color
      const old_knowledge = recognize(player_state,hammer)
      expect(old_knowledge.length).to.be.at.least(1)
      const color_tt = Traittype.get_by_label('color')
      expect(old_knowledge[0].get_trait(player_state, color_tt)).to.be.null

      // Get location content (what player can see)
      const location_tt = Traittype.get_by_label('location')
      const content = [...workshop.rev_trait(state, location_tt)]

      // Player perceives location content (fast path auto-updates knowledge)
      const perception = perceive(player_state,content)

      // Player should now know about hammer's color (automatically updated)
      const updated_knowledge = recognize(player_state,hammer)
      expect(updated_knowledge.length).to.be.at.least(1)

      // Knowledge should include color (newly observed)
      expect(updated_knowledge[0].get_trait(player_state, color_tt)).to.equal('blue')

      // Should be a new version
      expect(updated_knowledge[0]._id).to.not.equal(old_knowledge[0]._id)
    })

    it('should reuse prototype/shared beliefs for nested parts of uncertain entities', () => {
      // Register hammer archetypes
      DB.register({
        material: { type: 'string', exposure: 'visual' },
        handle: { type: 'HammerHandle', exposure: 'visual' },
        '@uncertain_identity': { type: 'boolean', exposure: 'internal' }
      }, {
        HammerHandle: {
          bases: ['PortableObject'],
          traits: {
            material: null,
            '@uncertain_identity': null  // Inherit from Thing via PortableObject
          }
        },
        Hammer: {
          bases: ['PortableObject'],
          traits: {
            handle: null,
            '@uncertain_identity': null  // Inherit from Thing via PortableObject
          }
        }
      }, {})

      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      // Create shared prototype for handle
      state.add_shared_from_template({
        CommonHandle: {
          bases: ['HammerHandle'],
          traits: { material: 'wood' }
        }
      })

      // Create two uncertain hammers with same shared handle
      state.add_beliefs_from_template({
        hammer1: {
          bases: ['Hammer'],
          traits: {
            '@uncertain_identity': true,
            handle: 'CommonHandle'
          }
        },
        hammer2: {
          bases: ['Hammer'],
          traits: {
            '@uncertain_identity': true,
            handle: 'CommonHandle'
          }
        },
        player: {
          bases: ['Person'],
          traits: { mind: {} }
        }
      })

      state.lock()
      state = state.branch(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      const hammer1 = state.get_belief_by_label('hammer1')
      const hammer2 = state.get_belief_by_label('hammer2')
      const player_state = state.get_active_state_by_host(player.subject)

      // Perceive first hammer
      perceive(player_state,[hammer1])

      // Find the handle knowledge belief created
      const handle_tt = Traittype.get_by_label('handle')
      const about_tt = Traittype.get_by_label('@about')

      let handle_knowledge = null
      for (const belief of player_state.get_beliefs()) {
        const about = belief.get_trait(player_state, about_tt)
        if (about) {
          // Check if this is knowledge about a handle
          const archetypes = [...belief.get_archetypes()]
          if (archetypes.some(a => a.label === 'HammerHandle')) {
            handle_knowledge = belief
            break
          }
        }
      }

      expect(handle_knowledge, 'handle knowledge should exist').to.exist
      const handle_id_1 = handle_knowledge._id

      // Perceive second hammer with same handle
      perceive(player_state,[hammer2])

      // Find handle knowledge again
      let handle_knowledge_2 = null
      for (const belief of player_state.get_beliefs()) {
        const about = belief.get_trait(player_state, about_tt)
        if (about) {
          const archetypes = [...belief.get_archetypes()]
          if (archetypes.some(a => a.label === 'HammerHandle')) {
            handle_knowledge_2 = belief
            break
          }
        }
      }

      expect(handle_knowledge_2, 'handle knowledge should still exist').to.exist

      // The handle knowledge should be reused (same _id)
      // because it's a certain shared prototype, not uncertain
      expect(handle_knowledge_2._id).to.equal(handle_id_1,
        'shared prototype handle should be reused, not duplicated')
    })
  })

  describe('perception modalities and tree pruning', () => {
    it('should not perceive spatial traits with default visual modalities', () => {
      // Register EventPerception archetypes
      DB.register({
        content: { type: 'Thing', container: Array }
      }, {
        EventAwareness: {
          bases: ['Thing'],
          traits: { content: null }
        },
        EventPerception: {
          bases: ['EventAwareness'],
          traits: { content: null }
        }
      }, {})

      // Setup world with locations
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      state.add_beliefs_from_template({
        village: {
          bases: ['Location'],
        },
        workshop: {
          bases: ['Location'],
          traits: {
            location: 'village',  // spatial trait
          },
        },
        person1: {
          bases: ['Person'],
          traits: {
            location: 'workshop',  // spatial trait
          },
        }
      })

      state.add_beliefs_from_template({
        player: {
          bases: ['Person'],
          traits: {
            mind: {},
            location: 'workshop',
          },
        }
      })

      state.lock()
      state = state.branch(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      const person1 = state.get_belief_by_label('person1')
      const workshop = state.get_belief_by_label('workshop')

      let player_state = state.get_active_state_by_host(player.subject)

      // Perceive person1 with default modalities (visual only)
      const perception = perceive(player_state,[person1])

      // Should only perceive person1, NOT workshop or village
      // (location trait has exposure: spatial, excluded by default)
      const beliefs_after = [...player_state.get_beliefs()]
      const about_tt = Traittype.get_by_label('@about')

      // Count beliefs about world entities (exclude EventPerception)
      const knowledge_beliefs = beliefs_after.filter(b => {
        const about = b.get_trait(player_state, about_tt)
        return about !== null  // Has @about → knowledge belief
      })

      // Should only have knowledge about person1, not workshop or village
      expect(knowledge_beliefs.length).to.equal(1)
      expect(knowledge_beliefs[0].get_trait(player_state, about_tt).sid).to.equal(person1.subject.sid)
    })

    it('should reuse current memory and stop tree walk (recognition-based pruning)', () => {
      // Register EventPerception archetypes
      DB.register({
        content: { type: 'Thing', container: Array }
      }, {
        EventAwareness: {
          bases: ['Thing'],
          traits: { content: null }
        },
        EventPerception: {
          bases: ['EventAwareness'],
          traits: { content: null }
        }
      }, {})

      // Setup world
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1, vt: 1})

      state.add_beliefs_from_template({
        workshop: {
          bases: ['Location'],
        },
        hammer: {
          bases: ['PortableObject'],
          traits: {
            color: 'blue',
          },
        }
      })

      state.add_beliefs_from_template({
        player: {
          bases: ['Person'],
          traits: {
            mind: {
              // Player already knows about hammer with same traits
              hammer: ['color'],
            },
            location: 'workshop',
          },
        }
      })

      state.lock()
      state = state.branch(state.ground_state, state.vt + 1)

      const player = state.get_belief_by_label('player')
      const hammer = state.get_belief_by_label('hammer')

      let player_state = state.get_active_state_by_host(player.subject)

      // Player already has knowledge about hammer
      const knowledge_before = recognize(player_state,hammer)
      expect(knowledge_before.length).to.be.at.least(1)
      const original_knowledge = knowledge_before[0]

      // Perceive hammer again (same state, same traits)
      const perception = perceive(player_state,[hammer])

      // Should reuse existing knowledge belief (not create new one)
      const knowledge_after = recognize(player_state,hammer)
      expect(knowledge_after.length).to.be.at.least(1)

      // Same belief object (recognition-based pruning worked)
      expect(knowledge_after[0]._id).to.equal(original_knowledge._id)
    })

    it('should create new perception when world state is stale', () => {
      // Register EventPerception archetypes
      DB.register({
        content: { type: 'Thing', container: Array }
      }, {
        EventAwareness: {
          bases: ['Thing'],
          traits: { content: null }
        },
        EventPerception: {
          bases: ['EventAwareness'],
          traits: { content: null }
        }
      }, {})

      // Setup world at vt=1
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1, vt: 1})

      state.add_beliefs_from_template({
        hammer: {
          bases: ['PortableObject'],
          traits: {
            color: 'blue',
          },
        }
      })

      state.add_beliefs_from_template({
        player: {
          bases: ['Person'],
          traits: {
            mind: {
              hammer: ['color'],
            },
          },
        }
      })

      state.lock()
      state = state.branch(state.ground_state, state.vt + 1)

      const player = state.get_belief_by_label('player')
      const hammer = state.get_belief_by_label('hammer')

      let player_state = state.get_active_state_by_host(player.subject)

      // Player's memory created at tt=1
      const knowledge_before = recognize(player_state,hammer)
      expect(knowledge_before.length).to.be.at.least(1)
      expect(knowledge_before[0].origin_state.tt).to.equal(1)

      // Lock before branching
      state.lock()

      // World progresses to vt=2
      state = state.branch(Cosmos.logos_state(), 2)

      // Update hammer in world
      const hammer_v2 = hammer.replace(state, {color: 'red'})

      player_state = state.get_active_state_by_host(player.subject)

      // Perceive updated hammer (world.vt=2 > memory.tt=1)
      const perception = perceive(player_state,[hammer_v2])

      // Should create NEW perception (memory is stale)
      const knowledge_after = recognize(player_state,hammer_v2)
      expect(knowledge_after.length).to.be.at.least(1)

      // Different belief (new perception created)
      expect(knowledge_after[0]._id).to.not.equal(knowledge_before[0]._id)

      // New memory has updated color
      const color_tt = Traittype.get_by_label('color')
      expect(knowledge_after[0].get_trait(player_state, color_tt)).to.equal('red')
    })
  })

  describe('identify() optimization', () => {
    beforeEach(() => {
      // Register common traittypes
      DB.register({
        material: { type: 'string', exposure: 'visual' },
        handle: { type: 'HammerHandle', exposure: 'visual' },
        head: { type: 'HammerHead', exposure: 'visual' },
        '@uncertain_identity': { type: 'boolean', exposure: 'internal' }
      }, {
        HammerHead: {
          bases: ['PortableObject'],
          traits: {
            material: null,
            '@uncertain_identity': null
          }
        },
        HammerHandle: {
          bases: ['PortableObject'],
          traits: {
            material: null,
            '@uncertain_identity': null
          }
        },
        Hammer: {
          bases: ['PortableObject'],
          traits: {
            head: null,
            handle: null,
            material: null,
            '@uncertain_identity': null
          }
        }
      }, {})
    })

    it('should use rev_trait for certain particular Subject traits', () => {
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      // Create specific head that only 2 hammers use
      state.add_beliefs_from_template({
        head1: { bases: ['HammerHead'], traits: { material: 'steel' } },
        head2: { bases: ['HammerHead'], traits: { material: 'iron' } },
        hammer1: { bases: ['Hammer'], traits: { head: 'head1', material: 'heavy' } },
        hammer2: { bases: ['Hammer'], traits: { head: 'head1', material: 'light' } },
        hammer3: { bases: ['Hammer'], traits: { head: 'head2', material: 'medium' } },
        player: {
          bases: ['Person'],
          traits: {
            mind: {
              head1: ['material'],
              head2: ['material'],
              hammer1: ['head', 'material'],
              hammer2: ['head', 'material'],
              hammer3: ['head', 'material']
            }
          }
        }
      })

      state.lock()
      state = state.branch(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      const head1 = state.get_belief_by_label('head1')
      const hammer1 = state.get_belief_by_label('hammer1')
      const player_state = state.get_active_state_by_host(player.subject)

      // Create perceived belief with certain head
      const perceived = player_state.add_belief_from_template({
        bases: ['Hammer'],
        traits: {
          '@about': null,
          head: head1.subject,  // Certain particular
          material: 'heavy'
        }
      })

      // Identify should use rev_trait on head1, find 2 hammers, verify material
      const candidates = identify(player_state,perceived)
      expect(candidates).to.be.an('array')
      expect(candidates.length).to.equal(1)  // Only hammer1 matches (material filtered)
      expect(candidates[0]).to.equal(hammer1.subject)
    })

    it('should stop at max_candidates (default 3)', () => {
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      // Create 10 identical hammers
      const hammers = {}
      for (let i = 0; i < 10; i++) {
        hammers[`hammer${i}`] = { bases: ['Hammer'], traits: { material: 'steel' } }
      }

      state.add_beliefs_from_template({
        ...hammers,
        player: {
          bases: ['Person'],
          traits: {
            mind: Object.fromEntries(
              Object.keys(hammers).map(k => [k, ['material']])
            )
          }
        }
      })

      state.lock()
      state = state.branch(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      const player_state = state.get_active_state_by_host(player.subject)

      // Create perceived belief
      const perceived = player_state.add_belief_from_template({
        bases: ['Hammer'],
        traits: { '@about': null, material: 'steel' }
      })

      // Should return only 3 candidates (not all 10)
      const candidates = identify(player_state,perceived)
      expect(candidates).to.be.an('array')
      expect(candidates.length).to.equal(3)  // Max candidates = 3
    })

    it('should return breadth-first (most recent first)', () => {
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      state.add_beliefs_from_template({
        hammer1: { bases: ['Hammer'], traits: { material: 'steel' } },
        player: {
          bases: ['Person'],
          traits: { mind: { hammer1: ['material'] } }
        }
      })

      state.lock()

      // Add more hammers at different timestamps
      state = state.branch(Cosmos.logos_state(), 2)
      state.add_beliefs_from_template({
        hammer2: { bases: ['Hammer'], traits: { material: 'steel' } }
      })
      const hammer2 = state.get_belief_by_label('hammer2')
      const player_state = state.get_active_state_by_host(state.get_belief_by_label('player').subject)
      learn_about(player_state,hammer2)

      state.lock()
      state = state.branch(Cosmos.logos_state(), 3)
      state.add_beliefs_from_template({
        hammer3: { bases: ['Hammer'], traits: { material: 'steel' } }
      })
      const hammer3 = state.get_belief_by_label('hammer3')
      const player_state2 = state.get_active_state_by_host(state.get_belief_by_label('player').subject)
      learn_about(player_state2,hammer3)

      // Create perceived belief
      const perceived = player_state2.add_belief_from_template({
        bases: ['Hammer'],
        traits: { '@about': null, material: 'steel' }
      })

      // Should return in temporal order (newest first)
      const candidates = identify(player_state2,perceived)
      expect(candidates).to.be.an('array')
      expect(candidates.length).to.equal(3)
      // Most recent should be first
      expect(candidates[0]).to.equal(hammer3.subject)
    })

    it('should handle no certain traits (fallback to archetype)', () => {
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      state.add_beliefs_from_template({
        hammer1: { bases: ['Hammer'], traits: { '@uncertain_identity': true } },
        player: {
          bases: ['Person'],
          traits: { mind: { hammer1: ['@uncertain_identity'] } }  // Knows hammer exists (learns uncertain flag)
        }
      })

      state.lock()
      state = state.branch(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      const hammer1 = state.get_belief_by_label('hammer1')
      const player_state = state.get_active_state_by_host(player.subject)

      // Create perceived belief with only archetype (no discriminating traits)
      const perceived = player_state.add_belief_from_template({
        bases: ['Hammer'],
        traits: { '@about': null }
      })

      // Should fall back to archetype scan
      const candidates = identify(player_state,perceived)
      expect(candidates).to.be.an('array')
      expect(candidates.length).to.be.at.least(1)
      expect(candidates[0]).to.equal(hammer1.subject)
    })

    it('should verify all traits match when using rev_trait', () => {
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      state.add_beliefs_from_template({
        head1: { bases: ['HammerHead'], traits: { material: 'steel' } },
        hammer1: { bases: ['Hammer'], traits: { head: 'head1', material: 'steel' } },
        hammer2: { bases: ['Hammer'], traits: { head: 'head1', material: 'wood' } },
        player: {
          bases: ['Person'],
          traits: {
            mind: {
              head1: ['material'],
              hammer1: ['head', 'material'],
              hammer2: ['head', 'material']
            }
          }
        }
      })

      state.lock()
      state = state.branch(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      const head1 = state.get_belief_by_label('head1')
      const hammer1 = state.get_belief_by_label('hammer1')
      const player_state = state.get_active_state_by_host(player.subject)

      // Perceived: head1 + material steel
      const perceived = player_state.add_belief_from_template({
        bases: ['Hammer'],
        traits: {
          '@about': null,
          head: head1.subject,
          material: 'steel'
        }
      })

      // rev_trait(head1, 'head') returns [hammer1, hammer2]
      // But only hammer1 matches material: 'steel'
      const candidates = identify(player_state,perceived)
      expect(candidates).to.be.an('array')
      expect(candidates.length).to.equal(1)
      expect(candidates[0]).to.equal(hammer1.subject)
    })

    it('should handle refurbished parts (recognized part moved to new assembly)', () => {
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      state.add_beliefs_from_template({
        head1: { bases: ['HammerHead'], traits: { material: 'steel' } },
        handle1: { bases: ['HammerHandle'], traits: { material: 'wood' } },
        handle2: { bases: ['HammerHandle'], traits: { material: 'oak' } },
        hammer1: { bases: ['Hammer'], traits: { head: 'head1', handle: 'handle1' } },
        player: {
          bases: ['Person'],
          traits: {
            mind: {
              head1: ['material'],
              handle1: ['material'],
              handle2: ['material'],
              hammer1: ['head', 'handle']
            }
          }
        }
      })

      state.lock()
      state = state.branch(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      const head1 = state.get_belief_by_label('head1')
      const handle2 = state.get_belief_by_label('handle2')
      const player_state = state.get_active_state_by_host(player.subject)

      // Perceived: head1 (certain) + handle2 (different from hammer1's handle!)
      const perceived = player_state.add_belief_from_template({
        bases: ['Hammer'],
        traits: {
          '@about': null,
          head: head1.subject,
          handle: handle2.subject
        }
      })

      // rev_trait(head1, 'head') finds hammer1
      // But _all_traits_match() rejects it (handle mismatch)
      const candidates = identify(player_state,perceived)
      expect(candidates).to.be.an('array')
      expect(candidates.length).to.equal(0)  // No match - head was moved to new handle
    })

    it('should distinguish prototype vs particular matching', () => {
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      // Add shared prototype in Eidos
      state.add_shared_from_template({
        GenericHead: { bases: ['HammerHead'], traits: { material: 'generic' } }
      })

      state.add_beliefs_from_template({
        head_particular: { bases: ['HammerHead'], traits: { material: 'specific' } },
        hammer1: { bases: ['Hammer'], traits: { head: 'GenericHead' } },  // Prototype
        hammer2: { bases: ['Hammer'], traits: { head: 'head_particular' } },  // Particular
        player: {
          bases: ['Person'],
          traits: {
            mind: {
              head_particular: ['material'],
              hammer1: ['head'],
              hammer2: ['head']
            }
          }
        }
      })

      state.lock()
      state = state.branch(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      const head_particular = state.get_belief_by_label('head_particular')
      const hammer2 = state.get_belief_by_label('hammer2')
      const player_state = state.get_active_state_by_host(player.subject)

      // Perceived: particular head (should use rev_trait)
      const perceived_particular = player_state.add_belief_from_template({
        bases: ['Hammer'],
        traits: { '@about': null, head: head_particular.subject }
      })

      const candidates_particular = identify(player_state,perceived_particular)
      expect(candidates_particular).to.be.an('array')
      expect(candidates_particular.length).to.equal(1)
      expect(candidates_particular[0]).to.equal(hammer2.subject)
    })
  })

  describe('learn_from() inheritance permutations', () => {
    beforeEach(() => {
      // Register common traittypes and extend Person archetype
      DB.register({
        content: { type: 'Thing', container: Array, exposure: 'internal' },
        inventory: { type: 'PortableObject', container: Array, composable: true, exposure: 'visual' }
      }, {
        EventAwareness: {
          bases: ['Thing'],
          traits: { content: null }
        },
        EventPerception: {
          bases: ['EventAwareness']
        },
        PersonWithInventory: {
          bases: ['Person'],
          traits: { inventory: null }
        }
      }, {})
    })

    describe('Group 2: Subject References (Gap: 2.4)', () => {
      it('learn_from with non-composable Subject arrays - no prior knowledge', () => {
        // Register non-composable children trait
        DB.register({
          children: { type: 'Person', container: Array, composable: false, exposure: 'visual' }
        }, {
          Parent: {
            bases: ['Person'],
            traits: { children: null }
          }
        }, {})

        const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
        let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

        // Setup: Create children first
        state.add_beliefs_from_template({
          child1: { bases: ['Person'] },
          child2: { bases: ['Person'] },
          child3: { bases: ['Person'] }
        })

        const child1 = state.get_belief_by_label('child1')
        const child2 = state.get_belief_by_label('child2')
        const child3 = state.get_belief_by_label('child3')

        state.add_shared_from_template({
          parent_proto: {
            bases: ['Parent'],
            traits: { children: [child1.subject, child2.subject] }
          }
        })

        state.add_beliefs_from_template({
          npc: {
            bases: ['parent_proto'],
            traits: { children: [child3.subject] }  // Shadows, not composes
          },
          player: {
            bases: ['Person'],
            traits: { mind: {} }
          }
        })

        state.lock()
        state = state.branch(Cosmos.logos_state(), 2)

        const player = state.get_belief_by_label('player')
        const npc = state.get_belief_by_label('npc')
        const player_state = state.get_active_state_by_host(player.subject)

        // Player has no prior knowledge
        expect(recognize(player_state, npc)).to.have.lengthOf(0)

        // Perceive NPC with shadowed children array
        const perception = perceive(player_state, [npc])
        learn_from(player_state, perception)

        // Verify: Knowledge created
        const knowledge = recognize(player_state, npc)
        expect(knowledge).to.have.lengthOf(1)

        // Verify: Children array is shadowed (only child3), not composed
        const children_tt = Traittype.get_by_label('children')
        const children = knowledge[0].get_trait(player_state, children_tt)
        expect(children).to.be.an('array')
        expect(children).to.have.lengthOf(1)
        // Check that children contains player's knowledge about child3
        const child3_about = get_knowledge_about(player_state, children[0])
        expect(child3_about.sid).to.equal(child3.subject.sid)
      })
    })

    describe('Group 3: Composable Arrays (Gap: 3.6-3.9)', () => {
      it('learn_from with composable null blocking - no prior knowledge', () => {
        const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
        let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

        state.add_beliefs_from_template({
          sword: { bases: ['PortableObject'] }
        })

        const sword = state.get_belief_by_label('sword')

        state.add_shared_from_template({
          warrior_proto: {
            bases: ['PersonWithInventory'],
            traits: { inventory: [sword.subject] }
          }
        })

        state.add_beliefs_from_template({
          pacifist: {
            bases: ['warrior_proto'],
            traits: { inventory: null }  // Blocks composition
          },
          player: {
            bases: ['Person'],
            traits: { mind: {} }
          }
        })

        state.lock()
        state = state.branch(Cosmos.logos_state(), 2)

        const player = state.get_belief_by_label('player')
        const pacifist = state.get_belief_by_label('pacifist')
        const player_state = state.get_active_state_by_host(player.subject)

        // Perceive pacifist with null inventory
        const perception = perceive(player_state, [pacifist])
        learn_from(player_state, perception)

        // Verify: Knowledge created with null (not composed [sword])
        const knowledge = recognize(player_state, pacifist)
        expect(knowledge).to.have.lengthOf(1)

        const inventory_tt = Traittype.get_by_label('inventory')
        const inventory = knowledge[0].get_trait(player_state, inventory_tt)
        expect(inventory).to.be.null
      })

      it('learn_from with composable empty array semantics - no prior knowledge', () => {
        const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
        let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

        state.add_beliefs_from_template({
          sword: { bases: ['PortableObject'] }
        })

        const sword = state.get_belief_by_label('sword')

        state.add_shared_from_template({
          warrior_proto: {
            bases: ['PersonWithInventory'],
            traits: { inventory: [sword.subject] }
          }
        })

        state.add_beliefs_from_template({
          knight: {
            bases: ['warrior_proto'],
            traits: { inventory: [] }  // Empty array composes (adds nothing)
          },
          pacifist: {
            bases: ['warrior_proto'],
            traits: { inventory: null }  // Null blocks composition
          },
          player: {
            bases: ['Person'],
            traits: { mind: {} }
          }
        })

        state.lock()
        state = state.branch(Cosmos.logos_state(), 2)

        const player = state.get_belief_by_label('player')
        const knight = state.get_belief_by_label('knight')
        const pacifist = state.get_belief_by_label('pacifist')
        const player_state = state.get_active_state_by_host(player.subject)

        // Perceive knight (empty array) and pacifist (null)
        const perception = perceive(player_state, [knight, pacifist])
        learn_from(player_state, perception)

        const inventory_tt = Traittype.get_by_label('inventory')

        // Verify: Knight has composed inventory [sword] ([] adds nothing)
        const knight_knowledge = recognize(player_state, knight)
        expect(knight_knowledge).to.have.lengthOf(1)
        const knight_inventory = knight_knowledge[0].get_trait(player_state, inventory_tt)
        expect(knight_inventory).to.be.an('array')
        expect(knight_inventory).to.have.lengthOf(1)
        // Check that inventory contains player's knowledge about the sword
        const sword_about = get_knowledge_about(player_state, knight_inventory[0])
        expect(sword_about.sid).to.equal(sword.subject.sid)

        // Verify: Pacifist has null (blocks composition)
        const pacifist_knowledge = recognize(player_state, pacifist)
        expect(pacifist_knowledge).to.have.lengthOf(1)
        const pacifist_inventory = pacifist_knowledge[0].get_trait(player_state, inventory_tt)
        expect(pacifist_inventory).to.be.null
      })

      it('learn_from with composable diamond deduplication - no prior knowledge', () => {
        const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
        let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

        state.add_beliefs_from_template({
          token: { bases: ['PortableObject'] },
          sword: { bases: ['PortableObject'] },
          shield: { bases: ['PortableObject'] }
        })

        const token = state.get_belief_by_label('token')
        const sword = state.get_belief_by_label('sword')
        const shield = state.get_belief_by_label('shield')

        // Diamond inheritance pattern
        state.add_shared_from_template({
          Base: {
            bases: ['PersonWithInventory'],
            traits: { inventory: [token.subject] }
          }
        })

        state.add_shared_from_template({
          Left: {
            bases: ['Base'],
            traits: { inventory: [sword.subject] }
          },
          Right: {
            bases: ['Base'],
            traits: { inventory: [shield.subject] }
          }
        })

        state.add_beliefs_from_template({
          Diamond: {
            bases: ['Left', 'Right']  // Inherits token via both paths
          },
          player: {
            bases: ['Person'],
            traits: { mind: {} }
          }
        })

        state.lock()
        state = state.branch(Cosmos.logos_state(), 2)

        const player = state.get_belief_by_label('player')
        const diamond = state.get_belief_by_label('Diamond')
        const player_state = state.get_active_state_by_host(player.subject)

        // Perceive Diamond NPC
        const perception = perceive(player_state, [diamond])
        learn_from(player_state, perception)

        // Verify: Knowledge created
        const knowledge = recognize(player_state, diamond)
        expect(knowledge).to.have.lengthOf(1)

        // Verify: Inventory deduplicated (token appears once, not twice)
        const inventory_tt = Traittype.get_by_label('inventory')
        const inventory = knowledge[0].get_trait(player_state, inventory_tt)
        expect(inventory).to.be.an('array')
        expect(inventory).to.have.lengthOf(3)  // token, sword, shield

        // Extract @about sids for comparison (player's knowledge points to world entities)
        const inventory_about_sids = inventory.map(s => get_knowledge_about(player_state, s).sid).sort()
        const expected_sids = [token.subject.sid, sword.subject.sid, shield.subject.sid].sort()
        expect(inventory_about_sids).to.deep.equal(expected_sids)
      })

      it('learn_from with mixed archetype + belief composition - no prior knowledge', () => {
        const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
        let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

        state.add_beliefs_from_template({
          badge: { bases: ['PortableObject'] },
          sword: { bases: ['PortableObject'] }
        })

        const badge = state.get_belief_by_label('badge')

        // Archetype with default inventory
        DB.register({}, {
          Guard: {
            bases: ['PersonWithInventory'],
            traits: {
              inventory: [badge.subject]  // Archetype default
            }
          }
        }, {})

        const sword = state.get_belief_by_label('sword')

        state.add_shared_from_template({
          guard_proto: {
            bases: ['Guard'],
            traits: { inventory: [sword.subject] }
          }
        })

        state.add_beliefs_from_template({
          npc_guard: {
            bases: ['Guard', 'guard_proto']  // Both archetype and prototype
          },
          player: {
            bases: ['Person'],
            traits: { mind: {} }
          }
        })

        state.lock()
        state = state.branch(Cosmos.logos_state(), 2)

        const player = state.get_belief_by_label('player')
        const npc_guard = state.get_belief_by_label('npc_guard')
        const player_state = state.get_active_state_by_host(player.subject)

        // Perceive guard
        const perception = perceive(player_state, [npc_guard])
        learn_from(player_state, perception)

        // Verify: Knowledge created
        const knowledge = recognize(player_state, npc_guard)
        expect(knowledge).to.have.lengthOf(1)

        // Verify: Inventory composed from both archetype and prototype
        const inventory_tt = Traittype.get_by_label('inventory')
        const inventory = knowledge[0].get_trait(player_state, inventory_tt)
        expect(inventory).to.be.an('array')
        expect(inventory).to.have.lengthOf(2)  // badge + sword

        const inventory_about_sids = inventory.map(s => get_knowledge_about(player_state, s).sid).sort()
        const expected_sids = [badge.subject.sid, sword.subject.sid].sort()
        expect(inventory_about_sids).to.deep.equal(expected_sids)
      })
    })

    describe('Group 4: Mind Traits (Gap: 4.4)', () => {
      it.skip('FUTURE: Mind trait composition requires cultural knowledge (talking not implemented)', () => {
        // This test requires two unimplemented features:
        // 1. Talking/conversation system for learning cultural knowledge
        // 2. Mind trait composition into Convergence structure
        //
        // Minds have exposure:'internal' - cannot be visually perceived.
        // Cultural knowledge is learned through conversation, not visual perception.
        // This test will be enabled when talking feature is implemented.

        const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
        let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

        // Create separate minds for different aspects
        const combat_mind = new Cosmos.Materia(world_mind, 'combat_mind')
        const social_mind = new Cosmos.Materia(world_mind, 'social_mind')
        const combat_state = combat_mind.create_state(state)
        const social_state = social_mind.create_state(state)

        // Create prototype beliefs in world state (can't lock minds in Eidos)
        state.add_beliefs_from_template({
          combat_aspect: {
            bases: ['Person'],
            traits: { mind: combat_mind }
          },
          social_aspect: {
            bases: ['Person'],
            traits: { mind: social_mind }
          }
        })

        const combat_aspect = state.get_belief_by_label('combat_aspect')
        const social_aspect = state.get_belief_by_label('social_aspect')

        state.add_beliefs_from_template({
          npc: {
            bases: [combat_aspect, social_aspect]  // Multiple minds via belief bases
          },
          player: {
            bases: ['Person'],
            traits: { mind: {} }
          }
        })

        state.lock()
        state = state.branch(Cosmos.logos_state(), 2)

        const player = state.get_belief_by_label('player')
        const npc = state.get_belief_by_label('npc')
        const player_state = state.get_active_state_by_host(player.subject)

        // Learn about NPC through cultural knowledge (explicit mind trait)
        // This represents shared cultural knowledge: "guards have combat and social aspects"
        learn_about(player_state, npc, {traits: ['mind']})

        // Verify: Knowledge created
        const knowledge = recognize(player_state, npc)
        expect(knowledge).to.have.lengthOf(1)

        // Verify: Mind trait was learned and is Convergence with component minds
        const mind_tt = Traittype.get_by_label('mind')
        const mind_value = knowledge[0].get_trait(player_state, mind_tt)
        expect(mind_value).to.exist

        // Mind should be a Convergence mind
        expect(mind_value.constructor.name).to.equal('Convergence')
      })
    })

    describe('Group 5: State Traits (Gap: 5.3)', () => {
      it('learn_from with state array composition - no prior knowledge', () => {
        // Register composable states trait
        DB.register({
          states: { type: 'State', container: Array, composable: true, exposure: 'visual' }
        }, {
          TemporalEntity: {
            bases: ['Thing'],
            traits: { states: null }
          }
        }, {})

        const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
        let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

        // Create states for composition
        const temp_mind1 = new Cosmos.Materia(world_mind, 'temp1')
        const temp_mind2 = new Cosmos.Materia(world_mind, 'temp2')
        const state1 = temp_mind1.create_state(state)
        const state2 = temp_mind2.create_state(state)

        state.add_shared_from_template({
          entity_proto1: {
            bases: ['TemporalEntity'],
            traits: { states: [state1] }
          },
          entity_proto2: {
            bases: ['TemporalEntity'],
            traits: { states: [state2] }
          }
        })

        state.add_beliefs_from_template({
          entity: {
            bases: ['entity_proto1', 'entity_proto2']  // Composes states
          },
          player: {
            bases: ['Person'],
            traits: { mind: {} }
          }
        })

        state.lock()
        state = state.branch(Cosmos.logos_state(), 2)

        const player = state.get_belief_by_label('player')
        const entity = state.get_belief_by_label('entity')
        const player_state = state.get_active_state_by_host(player.subject)

        // Perceive entity with composed states
        const perception = perceive(player_state, [entity])
        learn_from(player_state, perception)

        // Verify: Knowledge created
        const knowledge = recognize(player_state, entity)
        expect(knowledge).to.have.lengthOf(1)

        // Verify: States array composed from both prototypes
        const states_tt = Traittype.get_by_label('states')
        const states = knowledge[0].get_trait(player_state, states_tt)
        expect(states).to.be.an('array')
        expect(states).to.have.lengthOf(2)
        expect(states).to.include(state1)
        expect(states).to.include(state2)
      })
    })
  })

  describe('Stage 2: Descriptors & Identity', () => {
    beforeEach(() => {
      // Register EventAwareness/EventPerception
      DB.register({
        content: { type: 'Thing', container: Array, exposure: 'internal' }
      }, {
        EventAwareness: {
          bases: ['Thing'],
          traits: { content: null }
        },
        EventPerception: {
          bases: ['EventAwareness']
        }
      }, {})
    })

    it('2.1 player has separate beliefs distinguishing objects by color', () => {
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      state.add_beliefs_from_template({
        workshop: { bases: ['Location'] },
        hammer_blue: {
          bases: ['PortableObject'],
          traits: { location: 'workshop', color: 'blue' }
        },
        hammer_red: {
          bases: ['PortableObject'],
          traits: { location: 'workshop', color: 'red' }
        },
        player: {
          bases: ['Person'],
          traits: { mind: {}, location: 'workshop' }
        }
      })

      state.lock()
      state = state.branch(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      const hammer_blue = state.get_belief_by_label('hammer_blue')
      const hammer_red = state.get_belief_by_label('hammer_red')
      const player_state = state.get_active_state_by_host(player.subject)

      // Player perceives both hammers
      const perception = perceive(player_state, [hammer_blue, hammer_red])
      learn_from(player_state, perception)

      // Verify: Player has 2 separate beliefs
      const blue_knowledge = recognize(player_state, hammer_blue)
      const red_knowledge = recognize(player_state, hammer_red)

      expect(blue_knowledge).to.have.lengthOf(1)
      expect(red_knowledge).to.have.lengthOf(1)
      expect(blue_knowledge[0]).to.not.equal(red_knowledge[0])

      // Verify: Colors are distinguished
      const color_tt = Traittype.get_by_label('color')
      expect(blue_knowledge[0].get_trait(player_state, color_tt)).to.equal('blue')
      expect(red_knowledge[0].get_trait(player_state, color_tt)).to.equal('red')
    })

    it('2.2 similar black hammers distinguished by size', () => {
      // Register size traittype and SizedObject archetype
      DB.register({
        size: { type: 'string', values: ['small', 'large'], exposure: 'visual' }
      }, {
        SizedObject: {
          bases: ['PortableObject'],
          traits: { size: null }
        }
      }, {})

      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      state.add_beliefs_from_template({
        workshop: { bases: ['Location'] },
        hammer_large: {
          bases: ['SizedObject'],
          traits: { location: 'workshop', color: 'black', size: 'large' }
        },
        hammer_small: {
          bases: ['SizedObject'],
          traits: { location: 'workshop', color: 'black', size: 'small' }
        },
        player: {
          bases: ['Person'],
          traits: {
            mind: {
              hammer_large: ['color', 'size'],
              hammer_small: ['color', 'size']
            },
            location: 'workshop'
          }
        }
      })

      state.lock()
      state = state.branch(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      const hammer_large = state.get_belief_by_label('hammer_large')
      const hammer_small = state.get_belief_by_label('hammer_small')
      const player_state = state.get_active_state_by_host(player.subject)

      // Test identify() with only color (ambiguous)
      const perceived_black = player_state.add_belief_from_template({
        bases: ['SizedObject'],
        traits: { '@about': null, color: 'black' }
      })
      const ambiguous = identify(player_state, perceived_black)
      expect(ambiguous).to.have.lengthOf(2)  // Both match

      // Test identify() with color + size (specific)
      const perceived_large = player_state.add_belief_from_template({
        bases: ['SizedObject'],
        traits: { '@about': null, color: 'black', size: 'large' }
      })
      const specific = identify(player_state, perceived_large)
      expect(specific).to.have.lengthOf(1)
      expect(specific[0]).to.equal(hammer_large.subject)
    })

    it('2.5 query "black objects" returns all matches via recall_by_archetype', () => {
      // Create player's mind directly to demonstrate query by descriptor
      const player_mind = new Cosmos.Materia(Cosmos.logos(), 'player_mind')
      const ground = Cosmos.logos_state()
      const mind_state = player_mind.create_state(ground, { tt: 1 })

      // Player knows about several objects with different colors
      const hammer_black = mind_state.add_belief_from_template({
        label: 'hammer_black',
        bases: ['PortableObject'],
        traits: { color: 'black' }
      })
      const hammer_blue = mind_state.add_belief_from_template({
        label: 'hammer_blue',
        bases: ['PortableObject'],
        traits: { color: 'blue' }
      })
      const wrench_black = mind_state.add_belief_from_template({
        label: 'wrench_black',
        bases: ['PortableObject'],
        traits: { color: 'black' }
      })
      mind_state.lock()

      // Query all PortableObjects and filter by color
      const notions = [...player_mind.recall_by_archetype(
        ground, 'PortableObject', 1, ['color']
      )]
      const color_tt = Traittype.get_by_label('color')

      // Filter for black objects
      const black_objects = notions.filter(notion => {
        const color = notion.get(color_tt)
        // Get the first alternative's value (or the concrete value)
        const value = color?.alternatives?.[0]?.value ?? color
        return value === 'black'
      })

      expect(black_objects).to.have.lengthOf(2)
      const subjects = black_objects.map(n => n.subject)
      expect(subjects).to.include(hammer_black.subject)
      expect(subjects).to.include(wrench_black.subject)
    })
  })
})
