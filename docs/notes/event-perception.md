Stage 1 Implementation Plan: LOOK Command with Perception Tracking                              
                                                                                                
Why Track Perceptions?                                                                          
                                                                                                
This is an investigation game where "who saw what when" matters. NPCs will later claim "I saw   
the hammer in the workshop this morning" - we need Event_perception beliefs to back those       
claims. The perception events become evidence/testimony.                                        
                                                                                                
Three-Tier Knowledge Architecture                                                               
                                                                                                
Tier 1: World Events (ground truth)                                                             
                                                                                                
world_mind:                                                                                     
  hammer: {location: workshop}  # Objective reality                                             
                                                                                                
Tier 2: Perception Events (who observed what, when)                                             
                                                                                                
player_mind:                                                                                    
  obs_look_1: {                                                                                 
    archetype: Event_perception,                                                                
    observer: player,                                                                           
    target: workshop,  # What was observed                                                      
    time: tick_2                                                                                
  }                                                                                             
                                                                                                
Tier 3: Learned Beliefs (knowledge extracted from observations)                                 
                                                                                                
player_mind:                                                                                    
  hammer_knowledge: {                                                                           
    about: hammer,           # Links to world's hammer                                          
    source: obs_look_1,      # Where knowledge came from                                        
    location: workshop                                                                          
  }                                                                                             
                                                                                                
Why three tiers? Later stages need:                                                             
- "When did you last see the hammer?" → Query perception events by time                         
- "Who saw the hammer in the workshop?" → Query perceptions with target=workshop                
- Conflicting claims → Compare perception times and learned beliefs                             
- Unreliable witnesses → Perceptions exist even if learned beliefs are wrong                    
                                                                                                
Implementation Steps                                                                            
                                                                                                
1. Add Event_perception Archetype & Traits                                                      
                                                                                                
File: public/worker/world.mjs                                                                   
                                                                                                
Add traits:                                                                                     
traittypes: {                                                                                   
  observer: 'Actor',    // Who observed                                                         
  target: 'ObjectPhysical',  // What was observed (location or object)                          
  source: 'ObjectPhysical',  // Where belief came from (for learned beliefs)                    
  time: 'number',       // When observed                                                        
}                                                                                               
                                                                                                
Add archetype:                                                                                  
archetypes: {                                                                                   
  Event_perception: {                                                                           
    traits: {                                                                                   
      observer: null,                                                                           
      target: null,                                                                             
      time: null,                                                                               
    }                                                                                           
  }                                                                                             
}                                                                                               
                                                                                                
Why? Defines the structure for observation records that will be queried in later stages.        
                                                                                                
2. Modify learn_about() to Accept Source Parameter                                              
                                                                                                
File: public/worker/db.mjs, State.learn_about()                                                 
                                                                                                
Change signature:                                                                               
learn_about(belief, trait_names = [], source = null)                                            
                                                                                                
Add source to copied traits:                                                                    
const new_belief = new Belief(this.in_mind, {                                                   
  about: original,                                                                              
  bases: archetype_bases,                                                                       
  traits: {                                                                                     
    ...copied_traits,                                                                           
    ...(source ? {source} : {})  // Add source if provided                                      
  }                                                                                             
})                                                                                              
                                                                                                
Why? Links learned beliefs back to the perception that created them. Essential for testimony    
chains: "How do you know?" → "I saw it myself" vs "Bob told me".                                
                                                                                                
3. Remove Pre-existing Player Knowledge                                                         
                                                                                                
File: public/worker/world.mjs (lines 107-114)                                                   
                                                                                                
Remove:                                                                                         
const hammer_knowledge = player_mind_state.learn_about(                                         
  DB.Belief.by_label.get('hammer'),                                                             
  ['location']                                                                                  
);                                                                                              
player_mind_state.lock();                                                                       
                                                                                                
Why? Stage 1 test requires: "Player observes hammer, hammer belief created in player_mind".     
Player should start with empty mind, knowledge comes from LOOK command.                         
                                                                                                
4. Implement LOOK Command Handler                                                               
                                                                                                
File: public/worker/world.mjs (new function)                                                    
                                                                                                
Pseudocode:                                                                                     
export function cmd_look() {                                                                    
  // Get current player state (unlocked working state)                                          
  const player = Adventure.player                                                               
  const player_mind = /* extract from player.traits.mind_states */                              
  const current_state = /* get latest unlocked state */                                         
                                                                                                
  // Get player's location                                                                      
  const player_location = player.traits.get('location')                                         
                                                                                                
  // Create perception event                                                                    
  const obs = player_mind.add({                                                                 
    bases: ['Event_perception'],                                                                
    traits: {                                                                                   
      observer: player,                                                                         
      target: player_location,                                                                  
      time: Adventure.state.timestamp                                                           
    }                                                                                           
  })                                                                                            
                                                                                                
  // Find all objects at player's location in world                                             
  const objects_here = []                                                                       
  for (const belief of Adventure.state.get_beliefs()) {                                         
    if (belief.traits.get('location') === player_location) {                                    
      objects_here.push(belief)                                                                 
    }                                                                                           
  }                                                                                             
                                                                                                
  // Learn about each object                                                                    
  const learned = []                                                                            
  for (const obj of objects_here) {                                                             
    const knowledge = current_state.learn_about(                                                
      obj,                                                                                      
      ['location', 'color'],  // Stage 1: just location, Stage 2: adds descriptors              
      obs  // Source of knowledge                                                               
    )                                                                                           
    learned.push(knowledge)                                                                     
  }                                                                                             
                                                                                                
  // Lock state and update player entity
  current_state.lock()

  // Create new world state with updated player
  const new_world_state = Adventure.state.branch(Adventure.state.ground_state)
  const updated_player = Belief.from_template(new_world_state, {
    bases: [player],
    traits: {
      mind: player_mind  // Mind now has the locked current_state
    }
  })
  new_world_state.remove_beliefs(player)
  new_world_state.lock()
  Adventure.state = new_world_state

  // Return description for GUI
  return {
    text: "You see: " + learned.map(b => b.label || "something").join(", ")
  }
}

Why this flow?
1. Perception first - Records that observation happened (evidence)
2. Learn_about after - Extracts knowledge with source link
3. Lock state - Prevents further modifications to this snapshot
4. Update player - New player version with updated mind state via branch()                      
                                                                                                
5. Wire LOOK to Worker Message Handler                                                          
                                                                                                
File: public/worker/worker.mjs                                                                  
                                                                                                
Add handler:                                                                                    
import {cmd_look} from "./world.mjs"                                                            
                                                                                                
const dispatch = {                                                                              
  // ... existing handlers                                                                      
  look(data) {                                                                                  
    return cmd_look()                                                                           
  }                                                                                             
}                                                                                               
                                                                                                
6. Wire LOOK to GUI                                                                             
                                                                                                
File: public/client.mjs (or wherever GUI initialization happens)                                
                                                                                                
Add LOOK button/menu item that sends:                                                           
await Message.send('look')                                                                      
                                                                                                
Display returned text in main content area.                                                     
                                                                                                
Testing Stage 1 Success                                                                         
                                                                                                
Scenario: Player in workshop with hammer and blue ball                                          
                                                                                                
Actions:                                                                                        
1. Player clicks LOOK                                                                           
                                                                                                
Expected Results:                                                                               
- player_mind contains obs_look_1 (Event_perception)                                            
- player_mind contains hammer_knowledge (about: world.hammer, source: obs_look_1)               
- player_mind contains ball_knowledge (about: world.ball, source: obs_look_1)                   
- GUI shows: "You see: hammer, ball"                                                            
                                                                                                
Verification queries:                                                                           
// Find perception                                                                              
for (belief of player_mind_state.get_beliefs()) {                                               
  if (belief has archetype Event_perception) {                                                  
    // Check observer, target, time                                                             
  }                                                                                             
}                                                                                               
                                                                                                
// Find learned beliefs with source                                                             
for (belief of player_mind_state.get_beliefs()) {                                               
  if (belief.traits.has('source')) {                                                            
    // Verify source points to perception                                                       
    // Verify about points to world belief                                                      
  }                                                                                             
}                                                                                               
                                                                                                
Future Stages Foundation                                                                        
                                                                                                
This architecture enables:                                                                      
- Stage 5: NPCs with their own perceptions and beliefs                                          
- Stage 6: Time queries ("when did you see it?")                                                
- Stage 8: "ASK [npc] WHEN SAW [object]" queries NPC's perception events                        
- Stage 9: Observations of events (witness observations)                                        
- Conflict detection: Different NPCs, different perceptions, different learned beliefs          
                                                                                                
Files Modified                                                                                  
                                                                                                
1. public/worker/world.mjs - Add archetypes, traits, cmd_look()                                 
2. public/worker/db.mjs - Modify learn_about() to accept source                                 
3. public/worker/worker.mjs - Wire up 'look' message handler                                    
4. public/client.mjs or GUI - Add LOOK command button/menu                                      
5. test/ - Add tests for perception events and source tracking                                  
                                                                                                
Ready to implement?                                                                             
