// Same workspace and runtime, alternating processes; compare full JSON, not just timing.
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {runCore}=require('../../desktop/bridge.cjs');

(async()=>{
  const baseline=process.env.ASL_PERF_CORE_BASELINE,workspace=process.env.ASL_PERF_WORKSPACE,output=process.env.ASL_PERF_OUTPUT;
  if(!baseline||!workspace||!output)throw new Error('设置 ASL_PERF_CORE_BASELINE、ASL_PERF_WORKSPACE 和 ASL_PERF_OUTPUT 的绝对路径');
  const current=path.resolve(__dirname,'../..'),rows=[];
  const initial=await runCore('catalog',{workspace},{root:current});
  const skill=initial.skills[0].id;
  let expected;
  for(let round=1;round<=10;round++)for(const variant of round%2?['A','B']:['B','A']){
    const root=variant==='A'?baseline:current,row={round,variant};
    const results={};
    for(const [action,values] of [['catalog',{workspace}],['files',{workspace,skill,file:'SKILL.md'}]]){
      const start=performance.now();results[action]=await runCore(action,values,{root});row[action+'Ms']=performance.now()-start;
    }
    expected??=results;assert.deepEqual(results,expected,'优化不能改变目录、图原文、文件或指纹');
    rows.push(row);console.log(JSON.stringify(row));
  }
  const summary={};
  for(const variant of ['A','B']){summary[variant]={};for(const metric of ['catalogMs','filesMs']){
    const values=rows.filter(r=>r.variant===variant).map(r=>r[metric]).sort((a,b)=>a-b);
    summary[variant][metric]=Object.fromEntries([50,75,95].map(p=>['p'+p,Math.round(values[Math.ceil(values.length*p/100)-1])]));
  }}
  await fs.writeFile(output,JSON.stringify({method:'alternating A/B, identical local workspace and Python; fresh CLI processes, warm filesystem; exact JSON parity; not OS cold-start or network',skills:initial.skills.length,modes:initial.modes.length,rows,summary},null,2));
  console.log(JSON.stringify({output,summary},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
