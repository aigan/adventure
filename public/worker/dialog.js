// log('Loading');

handler_register( 'greet', async context =>{
  const {from,target} = context;

  // TODO: Remember observation
  const obs = observation(from,target);

  const html_target = description(obs, {form:'definite'});
  // log("Greeting", target)

  const lines = [`&#8250; You greet ${html_target}.`];
  postMessage(['main_add', ...lines ]);

  // For now, switch attention directly

  target.modify('Attention', {focus:from});
  log('target', target);

});

// handler_register( 'attention', async context =>{});
