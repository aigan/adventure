// log('Loading');

const Dialog = {
  has_attention({agent,target}){
    const attention = target.getEntity('Attention','focus');
    if( attention === agent) return true;
    return false;
  }
};

handler_register( 'greet', async context =>{
  const {from,target} = context;

  // TODO: Remember observation
  let obs = observation(from,target);

  action: {
    const hdef = description(obs, {form:'definite'});
    const lines = [`&#8250; You greet ${hdef}.`];
    postMessage(['main_add', ...lines ]);
  }
  
  response: {
    // For now, switch attention directly
    target.modify('Attention', {focus:from});
    const html_target = ucfirst(description(obs,{form:'third-subj'}));
    const lines = [`${html_target} notices you.`];
    postMessage(['main_add', ...lines ]);
  }

  // Observe change
  obs = observation(from,target);
  postMessage(['subject_update', bake_obs(obs)]);

  return "stay";

});

handler_register('ask-about-self', async context =>{
  const {from,target} = context;

  // TODO: Remember observation
  let obs = observation(from,target);

  action: {
    const hdef = description(obs, {form:'definite'});
    const hthird = description(obs, {form:'third-obj'});
    const lines = [`&#8250; You ask ${hdef} about ${hthird}self.`];
    postMessage(['main_add', ...lines ]);
  }
  
  response: {
    const html_target = ucfirst(description(obs,{form:'third-subj'}));
    const name = target.get('Name','value');
    const lines = [`${html_target} gives you the name ${name}.`];

    Ponder.remember(from, target,{Name:name});
    // Observe change
    obs = observation(from,target);
    postMessage(['subject_update', bake_obs(obs)]);

    postMessage(['main_add', ...lines ]);
  }

});
