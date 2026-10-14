import {browser} from 'wxt/browser';
import {UserError} from '../shared/errors';
import {HEARTBEAT_MS} from '../shared/constants';
export function rpc<T=unknown>(message:Record<string,unknown>):Promise<T> {
  return new Promise((resolve,reject)=>{
    const port=browser.runtime.connect({name:'mc-settings:'+crypto.randomUUID()});let settled=false;
    const heartbeat=setInterval(()=>{try{port.postMessage({type:'heartbeat'});}catch{}},HEARTBEAT_MS);
    const finish=()=>{settled=true;clearInterval(heartbeat);port.disconnect();};
    port.onMessage.addListener(res=>{if(settled)return;finish();if(res.ok)resolve(res.data as T);else reject(new UserError(res.code,res.message));});
    port.onDisconnect.addListener(()=>{if(!settled){settled=true;clearInterval(heartbeat);reject(new UserError('background-restarted','扩展连接已断开。'));}});
    port.postMessage(message);
  });
}
