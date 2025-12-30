/**
 * Centralized icon registry for the inspection GUI
 *
 * All icons should be defined here with:
 * - name: identifier used in code
 * - glyph: the emoji/symbol to display
 * - title: description shown on hover (HTML title attribute)
 */

/** @type {Record<string, {glyph: string, title: string}>} */
export const icons = {
  // State icons
  locked: {
    glyph: '🔒',
    title: 'Locked - immutable state'
  },
  promotions: {
    glyph: '🌊',
    title: 'Has promotions - lazy version propagation'
  },

  // Value icons
  fuzzy_unknown: {
    glyph: '❓',
    title: 'Unknown value'
  },
  fuzzy_compact: {
    glyph: '☁️',
    title: 'Fuzzy value - multiple alternatives'
  },

  // Mind type icons
  logos: {
    glyph: '🌟',
    title: 'Logos - root singleton mind'
  },
  eidos: {
    glyph: '💠',
    title: 'Eidos - shared knowledge repository'
  },
  world: {
    glyph: '🌍',
    title: 'World mind - simulation instance'
  },
  prototype: {
    glyph: '👤',
    title: 'Prototype mind - shared NPC template'
  },
  npc: {
    glyph: '🔮',
    title: 'NPC mind - individual agent'
  },

  // Belief type icons
  eidos_belief: {
    glyph: '🌱',
    title: 'Shared belief - universal knowledge'
  },
  belief: {
    glyph: '📍',
    title: 'Particular belief - instance-specific'
  },
  archetype: {
    glyph: '⭕',
    title: 'Archetype - type definition'
  },
  child: {
    glyph: '🔺',
    title: 'Child belief - inherits from this'
  },
}

/**
 * Render an icon with its title as a span element
 * @param {string} name - Icon name from the registry
 * @returns {string} HTML span with icon and title, or empty string if not found
 */
export function renderIcon(name) {
  const icon = icons[name]
  if (!icon) return ''
  return `<span title="${icon.title}">${icon.glyph}</span>`
}

/**
 * Get just the glyph for an icon
 * @param {string} name - Icon name from the registry
 * @returns {string} The glyph or empty string if not found
 */
export function getGlyph(name) {
  return icons[name]?.glyph || ''
}

/**
 * Get the title/description for an icon
 * @param {string} name - Icon name from the registry
 * @returns {string} The title or empty string if not found
 */
export function getTitle(name) {
  return icons[name]?.title || ''
}
