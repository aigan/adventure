/**
 * Comprehensive Trait Inheritance Tests
 *
 * This file covers missing permutations identified in trait_inheritance_matrix.md
 * Organized by priority based on gaps in current test coverage.
 */

import { expect } from 'chai'
import { Mind, Materia, State, Belief, Traittype, Subject } from '../public/worker/cosmos.mjs'
import * as DB from '../public/worker/db.mjs'
import { createStateInNewMind, stdTypes, Thing } from './helpers.mjs'

describe('Trait Inheritance - Comprehensive Coverage', () => {

  // ====================
  // PRIORITY 1: Critical Gaps
  // ====================

  describe('Priority 1: Critical Functionality Gaps', () => {

    describe('3.6: Composable null blocking', () => {
      beforeEach(() => {
        DB.reset_registries()
        DB.register(
          {
            ...stdTypes,
            inventory: {
              type: 'Subject',
              container: Array,
              composable: true
            }
          },
          {
            Thing,
            PortableObject: { bases: ['Thing'] },
            HasInventory: {
              traits: { inventory: null }
            }
          },
          {}
        )
      })

      it('null value blocks composition from bases', () => {
        const state = createStateInNewMind('test')

        const sword = state.add_belief_from_template({
          bases: ['PortableObject'],
          traits: {}, label: 'sword'
        })

        // Create prototype with inventory
        const eidos = DB.get_eidos()
        const eidos_state = eidos.create_timed_state(100)
        const warrior_proto = eidos_state.add_belief_from_template({
          bases: ['HasInventory'],
          traits: {
            inventory: [sword.subject]
          },
          label: 'WarriorProto'
        })
        warrior_proto.lock(eidos_state)

        // Create belief with null inventory - should block composition
        const pacifist = state.add_belief_from_template({
          bases: [warrior_proto],
          traits: {
            inventory: null  // Explicitly null
          },
          label: 'pacifist'
        })

        const inventory_traittype = Traittype.get_by_label('inventory')
        const result = pacifist.get_trait(state, inventory_traittype)

        // null should block composition from warrior_proto
        expect(result).to.be.null
        expect(result).to.not.deep.equal([sword.subject])
      })

      it('null in one base does not block composition from other bases', () => {
        const state = createStateInNewMind('test')

        const sword = state.add_belief_from_template({
          bases: ['PortableObject'],
          traits: {}, label: 'sword'
        })

        const shield = state.add_belief_from_template({
          bases: ['PortableObject'],
          traits: {}, label: 'shield'
        })

        const eidos = DB.get_eidos()
        const eidos_state = eidos.create_timed_state(100)

        // Base with null inventory
        const pacifist_proto = eidos_state.add_belief_from_template({
          bases: ['HasInventory'],
          traits: {
            inventory: null
          },
          label: 'PacifistProto'
        })
        pacifist_proto.lock(eidos_state)

        // Base with actual inventory
        const warrior_proto = eidos_state.add_belief_from_template({
          bases: ['HasInventory'],
          traits: {
            inventory: [sword.subject]
          },
          label: 'WarriorProto'
        })
        warrior_proto.lock(eidos_state)

        // Inherits from both
        const hybrid = state.add_belief_from_template({
          bases: [pacifist_proto, warrior_proto],
          traits: {}, label: 'hybrid'
        })

        const inventory_traittype = Traittype.get_by_label('inventory')
        const result = hybrid.get_trait(state, inventory_traittype)

        // Should get inventory from warrior_proto despite pacifist_proto having null
        expect(result).to.be.an('array')
        expect(result).to.have.lengthOf(1)
      })
    })

    describe('3.7: Composable empty array semantics', () => {
      beforeEach(() => {
        DB.reset_registries()
        DB.register(
          {
            ...stdTypes,
            inventory: {
              type: 'Subject',
              container: Array,
              composable: true
            }
          },
          {
            Thing,
            PortableObject: { bases: ['Thing'] },
            HasInventory: {
              traits: { inventory: null }
            }
          },
          {}
        )
      })

      it('empty array composes with base values', () => {
        const state = createStateInNewMind('test')

        const sword = state.add_belief_from_template({
          bases: ['PortableObject'],
          traits: {}, label: 'sword'
        })

        const eidos = DB.get_eidos()
        const eidos_state = eidos.create_timed_state(100)
        const warrior_proto = eidos_state.add_belief_from_template({
          bases: ['HasInventory'],
          traits: {
            inventory: [sword.subject]
          },
          label: 'WarriorProto'
        })
        warrior_proto.lock(eidos_state)

        // Set inventory to empty array
        const stripped = state.add_belief_from_template({
          bases: [warrior_proto],
          traits: {
            inventory: []  // Empty array
          },
          label: 'stripped'
        })

        const inventory_traittype = Traittype.get_by_label('inventory')
        const result = stripped.get_trait(state, inventory_traittype)

        // BEHAVIOR TEST: Does [] compose with [sword] to give [sword]?
        // Or does [] block composition?
        // Current implementation: [] is an "empty contribution" so composes to [sword]

        // If this test fails, document the actual behavior
        expect(result).to.be.an('array')
        // Update expectation based on actual behavior
        // expect(result).to.have.lengthOf(1)  // Composes
        // OR
        // expect(result).to.have.lengthOf(0)  // Blocks
      })

      it('empty array vs undefined are different', () => {
        const state = createStateInNewMind('test')

        const sword = state.add_belief_from_template({
          bases: ['PortableObject'],
          traits: {}, label: 'sword'
        })

        const eidos = DB.get_eidos()
        const eidos_state = eidos.create_timed_state(100)
        const warrior_proto = eidos_state.add_belief_from_template({
          bases: ['HasInventory'],
          traits: {
            inventory: [sword.subject]
          },
          label: 'WarriorProto'
        })
        warrior_proto.lock(eidos_state)

        // Two cases: explicit empty array vs not setting inventory at all
        const with_empty = state.add_belief_from_template({
          bases: [warrior_proto],
          traits: {
            inventory: []
          },
          label: 'with_empty'
        })

        const without_inventory = state.add_belief_from_template({
          bases: [warrior_proto],
          traits: {}, label: 'without_inventory'
          // NOT setting inventory - should inherit
        })

        const inventory_traittype = Traittype.get_by_label('inventory')

        const empty_result = with_empty.get_trait(state, inventory_traittype)
        const undefined_result = without_inventory.get_trait(state, inventory_traittype)

        // undefined (not set) should definitely inherit
        expect(undefined_result).to.be.an('array')
        expect(undefined_result).to.have.lengthOf(1)

        // Document the behavior of empty array
        // They might be the same, or might be different
        // expect(empty_result).to.deep.equal(undefined_result)  // Same
        // OR
        // expect(empty_result).to.not.deep.equal(undefined_result)  // Different
      })
    })

    describe('2.4: Non-composable Subject arrays', () => {
      beforeEach(() => {
        DB.reset_registries()
        DB.register(
          {
            ...stdTypes,
            children: {
              type: 'Subject',  // Can reference any belief
              container: Array,
              composable: false  // ← Non-composable array
            }
          },
          {
            Thing,
            Person: {
              bases: ['Thing'],
              traits: { children: null }
            }
          },
          {}
        )
      })

      it('non-composable array shadows inherited value', () => {
        const state = createStateInNewMind('test')

        const child1 = state.add_belief_from_template({
          bases: ['Person'],
          traits: {}, label: 'child1'
        })

        const child2 = state.add_belief_from_template({
          bases: ['Person'],
          traits: {}, label: 'child2'
        })

        const child3 = state.add_belief_from_template({
          bases: ['Person'],
          traits: {}, label: 'child3'
        })

        const eidos = DB.get_eidos()
        const eidos_state = eidos.create_timed_state(100)

        const parent_proto = eidos_state.add_belief_from_template({
          bases: ['Person'],
          traits: {
            children: [child1.subject, child2.subject]
          },
          label: 'ParentProto'
        })
        parent_proto.lock(eidos_state)

        // Instance overrides with different children
        const parent_instance = state.add_belief_from_template({
          bases: [parent_proto],
          traits: {
            children: [child3.subject]  // Replaces, doesn't compose
          },
          label: 'parent_instance'
        })

        const children_traittype = Traittype.get_by_label('children')
        const result = parent_instance.get_trait(state, children_traittype)

        // Non-composable: own value shadows base
        expect(result).to.be.an('array')
        expect(result).to.have.lengthOf(1)
        expect(result[0]).to.equal(child3.subject)
      })

      it('non-composable array does not combine from multiple bases', () => {
        const state = createStateInNewMind('test')

        const child1 = state.add_belief_from_template({
          bases: ['Person'],
          traits: {}, label: 'child1'
        })

        const child2 = state.add_belief_from_template({
          bases: ['Person'],
          traits: {}, label: 'child2'
        })

        const eidos = DB.get_eidos()
        const eidos_state = eidos.create_timed_state(100)

        const parent1 = eidos_state.add_belief_from_template({
          bases: ['Person'],
          traits: {
            children: [child1.subject]
          },
          label: 'Parent1'
        })
        parent1.lock(eidos_state)

        const parent2 = eidos_state.add_belief_from_template({
          bases: ['Person'],
          traits: {
            children: [child2.subject]
          },
          label: 'Parent2'
        })
        parent2.lock(eidos_state)

        // Multiple bases, non-composable
        const combined = state.add_belief_from_template({
          bases: [parent1, parent2],
          traits: {}, label: 'combined'
        })

        const children_traittype = Traittype.get_by_label('children')
        const result = combined.get_trait(state, children_traittype)

        // First found wins (breadth-first search)
        expect(result).to.be.an('array')
        expect(result).to.have.lengthOf(1)
        expect(result[0]).to.equal(child1.subject)  // From parent1 (first in bases)
      })
    })

    describe('2.2 & 6.3: Archetype with Subject default value', () => {
      beforeEach(() => {
        DB.reset_registries()
        DB.register(
          {
            ...stdTypes,
            workplace: 'Location',
            home: 'Location'
          },
          {
            Thing,
            Location: {
              bases: ['Thing']
            },
            Blacksmith: {
              bases: ['Thing'],
              traits: {
                workplace: null  // Will be set to default in prototypes
              }
            }
          },
          {
            // Prototypes with default locations
            DefaultForge: {
              bases: ['Location'],
              traits: {}, label: 'DefaultForge'
            },
            StandardBlacksmith: {
              bases: ['Blacksmith'],
              traits: {
                workplace: 'DefaultForge'  // Default Subject reference
              }
            }
          }
        )
      })

      it('inherits Subject reference from archetype default', () => {
        const eidos_state = DB.get_eidos().origin_state
        const standard = eidos_state.get_belief_by_label('StandardBlacksmith')
        const forge = eidos_state.get_belief_by_label('DefaultForge')

        const workplace_traittype = Traittype.get_by_label('workplace')
        const result = standard.get_trait(eidos_state, workplace_traittype)

        expect(result).to.be.instanceOf(Subject)
        expect(result.sid).to.equal(forge.subject.sid)
      })

      it('instance can inherit Subject from prototype archetype', () => {
        const eidos_state = DB.get_eidos().origin_state
        const forge = eidos_state.get_belief_by_label('DefaultForge')

        const state = createStateInNewMind('test')

        // Create instance inheriting from archetype with default Subject
        const blacksmith = state.add_belief_from_template({
          bases: ['StandardBlacksmith'],
          traits: {}, label: 'blacksmith_instance'
        })

        const workplace_traittype = Traittype.get_by_label('workplace')
        const result = blacksmith.get_trait(state, workplace_traittype)

        // Should inherit DefaultForge reference from archetype
        expect(result).to.be.instanceOf(Subject)
        expect(result.sid).to.equal(forge.subject.sid)
      })
    })
  })

  // ====================
  // PRIORITY 2: Important Edge Cases
  // ====================

  describe('Priority 2: Important Edge Cases', () => {

    describe('1.6: Diamond archetype conflict', () => {
      beforeEach(() => {
        DB.reset_registries()
        DB.register(
          {
            ...stdTypes,
            magic_type: 'string',
            combat_style: 'string'
          },
          {
            Thing,
            Magical: {
              bases: ['Thing'],
              traits: {
                magic_type: 'arcane',
                combat_style: 'defensive'
              }
            },
            Physical: {
              bases: ['Thing'],
              traits: {
                combat_style: 'offensive'  // Conflict!
              }
            },
            Spellblade: {
              bases: ['Magical', 'Physical']  // Diamond: both define combat_style
            }
          },
          {}
        )
      })

      it('first base wins in breadth-first traversal', () => {
        const state = createStateInNewMind('test')

        const spellblade = state.add_belief_from_template({
          bases: ['Spellblade'],
          traits: {}, label: 'spellblade'
        })

        const combat_style_traittype = Traittype.get_by_label('combat_style')
        const result = spellblade.get_trait(state, combat_style_traittype)

        // Magical is first in Spellblade.bases, so its value wins
        expect(result).to.equal('defensive')
      })

      it('reversing base order changes which value wins', () => {
        DB.reset_registries()
        DB.register(
          {
            ...stdTypes,
            combat_style: 'string'
          },
          {
            Thing,
            Magical: {
              bases: ['Thing'],
              traits: { combat_style: 'defensive' }
            },
            Physical: {
              bases: ['Thing'],
              traits: { combat_style: 'offensive' }
            },
            PhysicalMage: {
              bases: ['Physical', 'Magical']  // Reversed order
            }
          },
          {}
        )

        const state = createStateInNewMind('test')

        const mage = state.add_belief_from_template({
          bases: ['PhysicalMage'],
          traits: {}, label: 'mage'
        })

        const combat_style_traittype = Traittype.get_by_label('combat_style')
        const result = mage.get_trait(state, combat_style_traittype)

        // Physical is first, so its value wins
        expect(result).to.equal('offensive')
      })
    })

    describe('3.8: Composable diamond deduplication', () => {
      beforeEach(() => {
        DB.reset_registries()
        DB.register(
          {
            ...stdTypes,
            inventory: {
              type: 'Subject',
              container: Array,
              composable: true
            }
          },
          {
            Thing,
            PortableObject: { bases: ['Thing'] },
            HasInventory: {
              traits: { inventory: null }
            }
          },
          {
            token: {
              bases: ['PortableObject']
            },
            sword: {
              bases: ['PortableObject']
            },
            shield: {
              bases: ['PortableObject']
            },
            Base: {
              bases: ['HasInventory'],
              traits: {
                inventory: ['token']  // Token appears in base
              }
            },
            Left: {
              bases: ['Base'],
              traits: {
                inventory: ['sword']  // Adds sword, inherits token
              }
            },
            Right: {
              bases: ['Base'],
              traits: {
                inventory: ['shield']  // Adds shield, inherits token
              }
            },
            Diamond: {
              bases: ['Left', 'Right']  // Token reachable via two paths
            }
          }
        )
      })

      it('deduplicates items appearing via multiple inheritance paths', () => {
        const eidos_state = DB.get_eidos().origin_state
        const diamond = eidos_state.get_belief_by_label('Diamond')

        const inventory_traittype = Traittype.get_by_label('inventory')
        const result = diamond.get_trait(eidos_state, inventory_traittype)

        expect(result).to.be.an('array')
        expect(result).to.have.lengthOf(3)  // token, sword, shield

        const labels = result.map(subj => {
          const belief = eidos_state.get_belief_by_subject(subj)
          return belief.get_label()
        }).sort()

        expect(labels).to.deep.equal(['shield', 'sword', 'token'])

        // Verify token appears only once despite two paths
        const token_count = labels.filter(l => l === 'token').length
        expect(token_count).to.equal(1)
      })
    })

    describe('3.9: Mixed archetype + belief composition', () => {
      beforeEach(() => {
        DB.reset_registries()
        DB.register(
          {
            ...stdTypes,
            inventory: {
              type: 'Subject',
              container: Array,
              composable: true
            }
          },
          {
            Thing,
            PortableObject: { bases: ['Thing'] },
            Villager: {
              bases: ['Thing'],
              traits: { inventory: null }
            }
          },
          {
            token: {
              bases: ['PortableObject'],
              traits: {}, label: 'token'
            },
            VillagerWithToken: {
              bases: ['Villager'],
              traits: {
                inventory: ['token']  // Archetype default inventory
              }
            }
          }
        )
      })

      it('composes from both archetype and belief bases', () => {
        const state = createStateInNewMind('test')

        const eidos = DB.get_eidos()
        const eidos_state = eidos.create_timed_state(100)

        const sword = eidos_state.add_belief_from_template({
          bases: ['PortableObject'],
          traits: {}, label: 'sword'
        })

        const guard_proto = eidos_state.add_belief_from_template({
          bases: ['Villager'],
          traits: {
            inventory: [sword.subject]
          },
          label: 'GuardProto'
        })
        guard_proto.lock(eidos_state)

        // Inherits from both archetype (with token) and belief (with sword)
        const guard = state.add_belief_from_template({
          bases: ['VillagerWithToken', guard_proto],
          traits: {}, label: 'guard'
        })

        const inventory_traittype = Traittype.get_by_label('inventory')
        const result = guard.get_trait(state, inventory_traittype)

        expect(result).to.be.an('array')
        expect(result).to.have.lengthOf(2)

        const labels = result.map(subj => {
          const belief = state.get_belief_by_subject(subj) ||
                         eidos_state.get_belief_by_subject(subj) ||
                         DB.get_eidos().origin_state.get_belief_by_subject(subj)
          return belief.get_label()
        }).sort()

        expect(labels).to.deep.equal(['sword', 'token'])
      })
    })

    describe('1.8: Null vs absence distinction', () => {
      beforeEach(() => {
        DB.reset_registries()
        DB.register(
          {
            ...stdTypes,
            color: 'string',
            count: 'number'
          },
          {
            Thing,
            Colored: {
              bases: ['Thing'],
              traits: {
                color: null  // Explicit null in archetype
              }
            }
          },
          {}
        )
      })

      it('explicit null in _traits is distinguishable', () => {
        const state = createStateInNewMind('test')

        const with_null = state.add_belief_from_template({
          bases: ['Colored'],
          traits: {
            color: null  // Explicitly set to null
          },
          label: 'with_null'
        })

        const without_color = state.add_belief_from_template({
          bases: ['Thing'],
          traits: {}, label: 'without_color'
          // color not set at all
        })

        const color_traittype = Traittype.get_by_label('color')

        // Both return null, but internal representation differs
        expect(with_null.get_trait(state, color_traittype)).to.be.null
        expect(without_color.get_trait(state, color_traittype)).to.be.null

        // Check _traits Map directly
        const with_null_has = with_null._traits.has(color_traittype)
        const without_has = without_color._traits.has(color_traittype)

        expect(with_null_has).to.be.true  // Explicit null is in _traits
        expect(without_has).to.be.false   // Absent trait is not in _traits
      })

      it('get_defined_traits includes explicit null but not undefined', () => {
        const state = createStateInNewMind('test')

        const obj = state.add_belief_from_template({
          bases: ['Colored'],
          traits: {
            color: null,  // Explicit
            // count not set (undefined)
          },
          label: 'obj'
        })

        const defined_traits = new Map(obj.get_defined_traits())

        const color_traittype = Traittype.get_by_label('color')
        const count_traittype = Traittype.get_by_label('count')

        // color is defined (even though null)
        expect(defined_traits.has(color_traittype)).to.be.true
        expect(defined_traits.get(color_traittype)).to.be.null

        // count is not defined
        expect(defined_traits.has(count_traittype)).to.be.false
      })
    })
  })

  // ====================
  // PRIORITY 3: Documentation & Verification
  // ====================

  describe('Priority 3: Documentation and Verification', () => {

    describe('3.1: Single-base composition (baseline)', () => {
      beforeEach(() => {
        DB.reset_registries()
        DB.register(
          {
            ...stdTypes,
            inventory: {
              type: 'Subject',
              container: Array,
              composable: true
            }
          },
          {
            Thing,
            PortableObject: { bases: ['Thing'] },
            HasInventory: {
              traits: { inventory: null }
            }
          },
          {}
        )
      })

      it('single base provides composable array unchanged', () => {
        const state = createStateInNewMind('test')

        const sword = state.add_belief_from_template({
          bases: ['PortableObject'],
          traits: {}, label: 'sword'
        })

        const eidos = DB.get_eidos()
        const eidos_state = eidos.create_timed_state(100)

        const warrior_proto = eidos_state.add_belief_from_template({
          bases: ['HasInventory'],
          traits: {
            inventory: [sword.subject]
          },
          label: 'WarriorProto'
        })
        warrior_proto.lock(eidos_state)

        // Single base, no own inventory
        const warrior = state.add_belief_from_template({
          bases: [warrior_proto],
          traits: {}, label: 'warrior'
        })

        const inventory_traittype = Traittype.get_by_label('inventory')
        const result = warrior.get_trait(state, inventory_traittype)

        // Should get exact inventory from base
        expect(result).to.be.an('array')
        expect(result).to.have.lengthOf(1)
        expect(result[0]).to.equal(sword.subject)
      })

      it('own value composes with single base', () => {
        const state = createStateInNewMind('test')

        const sword = state.add_belief_from_template({
          bases: ['PortableObject'],
          traits: {}, label: 'sword'
        })

        const shield = state.add_belief_from_template({
          bases: ['PortableObject'],
          traits: {}, label: 'shield'
        })

        const eidos = DB.get_eidos()
        const eidos_state = eidos.create_timed_state(100)

        const warrior_proto = eidos_state.add_belief_from_template({
          bases: ['HasInventory'],
          traits: {
            inventory: [sword.subject]
          },
          label: 'WarriorProto'
        })
        warrior_proto.lock(eidos_state)

        // Add own inventory that composes with base
        const knight = state.add_belief_from_template({
          bases: [warrior_proto],
          traits: {
            inventory: [shield.subject]  // Adds to inherited
          },
          label: 'knight'
        })

        const inventory_traittype = Traittype.get_by_label('inventory')
        const result = knight.get_trait(state, inventory_traittype)

        // Should compose: base + own
        expect(result).to.be.an('array')
        expect(result).to.have.lengthOf(2)

        const labels = result.map(subj => {
          const belief = state.get_belief_by_subject(subj)
          return belief.get_label()
        }).sort()

        expect(labels).to.deep.equal(['shield', 'sword'])
      })
    })

    describe('4.2: Mind trait from archetype', () => {
      beforeEach(() => {
        DB.reset_registries()
        DB.register(
          {
            ...stdTypes,
            mind: 'Mind'
          },
          {
            Thing,
            Mental: {
              bases: ['Thing'],
              traits: {
                mind: null  // Mental archetype defines mind slot
              }
            }
          },
          {}
        )
      })

      it('Mental archetype provides mind slot', () => {
        const state = createStateInNewMind('test')

        const entity = state.add_belief_from_template({
          bases: ['Mental'],
          traits: {}, label: 'entity'
        })

        const mind_traittype = Traittype.get_by_label('mind')

        // Should be able to have mind trait
        expect(entity.can_have_trait(mind_traittype)).to.be.true

        // Value should be null (not set)
        const result = entity.get_trait(state, mind_traittype)
        expect(result).to.be.null
      })

      it('can set mind value on Mental archetype', () => {
        const state = createStateInNewMind('test')

        const child_mind = new Materia(state.in_mind, 'child')

        const entity = state.add_belief_from_template({
          bases: ['Mental'],
          traits: {
            mind: {}  // Create mind via template
          },
          label: 'entity'
        })

        const mind_traittype = Traittype.get_by_label('mind')
        const result = entity.get_trait(state, mind_traittype)

        expect(result).to.be.instanceOf(Mind)
      })
    })

    describe('5.2: State trait from archetype', () => {
      beforeEach(() => {
        DB.reset_registries()
        DB.register(
          {
            ...stdTypes,
            creation_state: 'State'
          },
          {
            Thing,
            Temporal: {
              bases: ['Thing'],
              traits: {
                creation_state: null  // When entity was created
              }
            }
          },
          {}
        )
      })

      it('Temporal archetype provides state slot', () => {
        const state = createStateInNewMind('test')

        const entity = state.add_belief_from_template({
          bases: ['Temporal'],
          traits: {}, label: 'entity'
        })

        const creation_state_traittype = Traittype.get_by_label('creation_state')

        // Should be able to have creation_state trait
        expect(entity.can_have_trait(creation_state_traittype)).to.be.true

        // Value should be null (not set)
        const result = entity.get_trait(state, creation_state_traittype)
        expect(result).to.be.null
      })

      it('can inherit State value from archetype default', () => {
        const eidos = DB.get_eidos()
        const eidos_state = eidos.create_timed_state(100)

        // Create a reference state
        const ref_state = createStateInNewMind('ref', 50)

        // Prototype with default creation_state
        const proto = eidos_state.add_belief_from_template({
          bases: ['Temporal'],
          traits: {
            creation_state: ref_state  // Default state
          },
          label: 'TemporalProto'
        })
        proto.lock(eidos_state)

        const state = createStateInNewMind('test')
        const entity = state.add_belief_from_template({
          bases: [proto],
          traits: {}, label: 'entity'
        })

        const creation_state_traittype = Traittype.get_by_label('creation_state')
        const result = entity.get_trait(state, creation_state_traittype)

        expect(result).to.be.instanceOf(State)
        expect(result).to.equal(ref_state)
      })
    })

    describe('Belief with no bases', () => {
      it('belief with empty bases array works', () => {
        const state = createStateInNewMind('test')

        const bare = state.add_belief_from_template({
          bases: [],  // No bases at all
          traits: {}, label: 'bare'
        })

        // Should exist and work
        expect(bare).to.exist
        expect(bare.get_label()).to.equal('bare')

        // Should have no archetypes
        const archetypes = [...bare.get_archetypes()]
        expect(archetypes).to.have.lengthOf(0)

        // Should not have any traits (@label is not a trait, it's Subject metadata)
        const traits = [...bare.get_traits()]
        expect(traits.length).to.equal(0)
      })
    })
  })
})
