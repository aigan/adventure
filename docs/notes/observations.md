
trait color is surface_visual

traittypes: {
  color: {
    type: string,
    exposure: visual
  },
  weight: {
    type: number,
    exposure: tactile,  // requires holding
  },
  location: {
    type: Location,
    exposure: spatial,
  },
  mind: {
    type: Mind'
    exposure: internal,  // no physical exposure
  },
  temperature: {
    type: string,
    exposure: tactile,
  }
}

entity: {
  spatial_prominence: 'prominent'  // or 'exposed', 'obscured', 'hidden', 'intangible'
}

ObjectPhysical: {
  traits: {
    @form: 'solid',
    location: null,
    color: null,
  }
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
