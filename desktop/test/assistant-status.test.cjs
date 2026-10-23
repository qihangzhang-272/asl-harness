const {test}=require('node:test');
const assert=require('node:assert/strict');

test('session status refreshes until the native receipt ends, without starting an Agent',async()=>{
  const {watchAssistantSession}=await import('../src/assistant-status.mjs');
  let calls=0,finish;
  const done=new Promise(resolve=>{finish=resolve;});
  const states=[];
  const stop=watchAssistantSession({id:'owned-session',delay:1,
    read:async id=>{assert.equal(id,'owned-session');return {id,status:++calls===1?'opened':'ended'};},
    onStatus:value=>{states.push(value.status);if(value.status==='ended')finish();},
    onError:()=>assert.fail('valid receipts must stay readable')});
  await done;stop();assert.deepEqual(states,['opened','ended']);assert.equal(calls,2);
});

test('temporary read failure is visible and recovers without relaunch',async()=>{
  const {watchAssistantSession}=await import('../src/assistant-status.mjs');
  let calls=0,finish;const events=[];
  const done=new Promise(resolve=>{finish=resolve;});
  const stop=watchAssistantSession({id:'owned-session',delay:1,
    read:async()=>{if(++calls===1)throw Error('unavailable');return {status:'failed',exitCode:7};},
    onError:()=>events.push('unavailable'),onStatus:value=>{events.push(value.status);finish();}});
  await done;stop();assert.deepEqual(events,['unavailable','failed']);assert.equal(calls,2);
});

test('leaving ignores a late receipt and cancels further reads',async()=>{
  const {watchAssistantSession}=await import('../src/assistant-status.mjs');
  let resolve,calls=0;
  const stop=watchAssistantSession({id:'owned-session',delay:1,
    read:()=>{calls++;return new Promise(done=>{resolve=done;});},
    onStatus:()=>assert.fail('unmounted viewer must not update'),onError:()=>assert.fail('unmounted viewer must not update')});
  stop();resolve({status:'ended'});await new Promise(done=>setImmediate(done));assert.equal(calls,1);
});
