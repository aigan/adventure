const log = console.log.bind(console);

log("Loading ecs");

const world = new ECSY.World();


const Component_templates = {
  Speed: { value: {default: 10}},
  Direction: {value: {default: ''}},
  Position: { value: {default: [8,1,8]}},
};

const C = {};

for( const name in Component_templates ){
  C[name] = ECSY.createComponentClass(Component_templates[name], name);
}

class Enemy extends ECSY.TagComponent {}
C.Enemy = Enemy;


class Movement extends ECSY.System {
  init(){}
  execute( delta, time ){
    for( const e of this.queries.movable.results ){
      const pos = e.getComponent(C.Position).value;
      log('Moving entity at', pos);
    }
  }
}

Movement.queries = {
  movable: { components: [C.Speed, C.Position]}
}



const wolf = world.createEntity();
wolf.addComponent(C.Enemy);
wolf.addComponent(C.Speed, {value:15});
wolf.addComponent(C.Direction, {value:'E'})
wolf.addComponent(C.Position, {value:[8,8,8]})

world.registerSystem(Movement);

world.execute();

log(world);
