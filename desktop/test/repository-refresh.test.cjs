const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
test('explicit refresh waits for a cached read then requests fresh content, shared by refresh callers',async()=>{
  const source=fs.readFileSync(path.join(__dirname,'../src/App.jsx'),'utf8');
  const body=source.match(/  function repositoryReport\(url,refresh=false\)\{[\s\S]*?\n  \}/)[0];
  const jobs={current:new Map()},cache={current:new Map()},calls=[];
  let release;
  const api=async(_method,url,refresh)=>{calls.push(refresh);if(!refresh)await new Promise(resolve=>{release=resolve;});return{url,cacheStatus:refresh?'fresh':'cached'};};
  const get=new Function('api','cloudJobs','cloudCache','setSourceVersion',body+'\nreturn repositoryReport;')(api,jobs,cache,()=>{});
  const cached=get('url');await Promise.resolve();
  const fresh=get('url',true),another=get('url',true);assert.equal(fresh,another);
  release();assert.equal((await cached).cacheStatus,'cached');assert.equal((await fresh).cacheStatus,'fresh');
  assert.deepEqual(calls,[false,true]);assert.equal(jobs.current.size,0);
  assert.equal((await get('url')).cacheStatus,'fresh');assert.equal(calls.length,2);
});
