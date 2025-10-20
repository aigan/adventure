
trait color is surface_visual

traittypes: {
  color: {
    type: 'string',
    exposure: 'surface_visual'
  },
  weight: {
    type: 'number', 
    exposure: 'tactile_mass'  // requires holding
  },
  location: {
    type: 'Location',
    exposure: 'spatial_presence'
  },
  mind: {
    type: 'Mind',
    exposure: 'internal_state'  // no physical exposure
  },
  temperature: {
    type: 'string',
    exposure: 'surface_thermal'
  }
}

entity: {
  spatial_prominence: 'prominent'  // or 'exposed', 'obscured', 'hidden', 'intangible'
}

ObjectPhysical: {
  meta: {exposure: 'physical_form'},
  traits: {location: null, color: null}
}



exposed + observaton + acquaintance to parent subject = recognition

belief: {
  about: world.bob,           // system correspondence
  subject: bob_subject,        // identity through time
  acquaintance: bob_subject,   // "I'd recognize this subject"
  source: obs_initial,
  traits: {
    appearance: 'tall',        // what I know about the subject
    role: 'blacksmith'
  }
}
