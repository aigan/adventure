// log('Loading');

handler_register( 'greet', async function(context){
  // log('player', player);
  const target = player.world.entity.get(context.target);
  // TODO: Remember observation
  const obs = observation(player,target);

  const html_target = description_short(obs, {form:'definite'});
  log("Greeting", target)

  const lines = [`&#8250; You greet ${html_target}`];
  postMessage(['main_add', ...lines ]);
});
