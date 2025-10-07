//## OO version: Hero extends Actor. Monster extends Actor. Monster has Breed.
// class Action has method perform() returns ActionResult.

//## Parent/child: Parenting{Parent}, Aiming, Aligning, Tracking, Interposing, Billboarding, Grabbing{Grip/Grab placement}

//#### Templates based on https://www.ultimate-adom.com/index.php/2018/10/25/making-ultimate-adom-moddable-by-using-entity-component-systems/
// ADOM core concepts: tiles, features, beings, items
// ADOM entity: Statistics, Brain

const ADOM_templates = {
  Thing: {
    components: [],
  },
  Actor: {
    baseTempaltes: ['Thing'],
    components: [],
  },
  Location: {
    baseTempaltes: ['Thing'],
    components: [],
  },
  Item: {
    baseTemplate: ['Thing'],
    components: [],
  },
  Being: {
    baseTemplates: ['Actor'],
    components: [],
  },
  HumanoidHand: {
    baseTemplates: ['Hand'],
    components: [
      {
        BodyPartContentSlot: {
          permissableTypes: ['MeleeWeapon', 'Shield'],
          statusWhenContained: 'Wielded',
          canFumble: true,
          longStorageMessage: "HumanoidHandLongStorageMessage",
          longCurrentlyStoredMessage: "HJumanoidHandLongCurrentlyStoredMessage",
        },
      },
    ],
  },
  HumanRace: {
    baseTemplates: ['Humanoid'],
    components: [
      {
        labeled: {
          singular: 'HumanRaceSingularName',
          plural: 'HumanRacePluralName',
        },
      },
      {Strength:"=2d3+7"},
      {Dexterity:"=2d2+7"},
      {RacialAttribute:'HumanRacialAttribute'},
    ],
    types: ['Race'],
  },
  Human: {
    baseTemplates: ['Being'],
    slots: {
      Race: 'HumanRace',
    },
    components: [
      {defaultEquipment: []},
      {
        labeled: {
          singular: 'HumanSingularName',
          plural: 'HumanPluralName',
        },
      },
      {
        gendered: ['Male','Female'],
      },
      {
        slot: {
          template: 'HumanRace',
          name: 'Race',
        },
      },
      {
        Description: {
          verbosity: 'short',
          description: ['HumanDescription0', 'HumanDescription1'],
        },
      },
      {
        capability: "",
      },
      {
        triggeredEffect: {
          trigger: "",
          effects: [],
        }
      }
    ],
  },
  Player: {
    baseTemplates: ['Human'],
    components: ['controlled_by_ui'],
    slots: {
      Profession: 'Adventurer',
    },
  },
};
