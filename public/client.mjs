// console.log('Loading');
import { log } from "./lib/debug.mjs";
import "./lib/gui.mjs";
import {Message} from "./lib/message.mjs";

try {
  await Message.send('start')
  log('started')
} catch (err) {
  log('start failed:', err)
}
