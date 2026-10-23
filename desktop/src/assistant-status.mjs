// Read only this App's native session receipt; never infer model or task progress.
export function watchAssistantSession({id,read,onStatus,onError,delay=2000}) {
  let active=true,timer;
  async function poll(){
    let finished=false;
    try{
      const status=await read(id);
      if(!active)return;
      onStatus(status);
      finished=['ended','failed'].includes(status.status);
    }catch(error){if(active)onError(error);}
    if(active&&!finished)timer=setTimeout(poll,delay);
  }
  poll();
  return()=>{active=false;clearTimeout(timer);};
}
