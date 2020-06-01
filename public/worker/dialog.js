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
    const html_target = description(obs, {form:'definite'});
    const lines = [`&#8250; You greet ${html_target}.`];
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
  log('asking');
});
