const fs=require('node:fs/promises');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const {launch}=require('./fixture.cjs');

(async()=>{
  const baseline=process.env.ASL_PERF_BASELINE;if(!baseline)throw new Error('设置 ASL_PERF_BASELINE 为改动前 dist 的绝对路径');
  const rows=[];
  for(let i=0;i<10;i++)for(const variant of i%2?['B','A']:['A','B']){
    const {app,page,errors}=await launch({baseline:variant==='A'?baseline:undefined});
    try{
      // Warm the selected asset set before either timed reload. Installing A's
      // route after launch must not make only A pay its first JS parse cost.
      await page.reload();await page.locator('.mode-library-overview').waitFor();
      const start=performance.now();await page.reload();
      await page.locator('.mode-library-overview').waitFor();
      const libraryMs=performance.now()-start;
      const open=performance.now();await page.locator('.source-tree button').filter({hasText:'Creator Studio'}).first().click();
      await page.locator('.architecture-section .mermaid-drawing svg').waitFor();
      const diagramMs=performance.now()-open;
      if(errors.length)throw new Error(errors.join('\n'));
      rows.push({round:i+1,variant,libraryMs,diagramMs});console.log(JSON.stringify(rows.at(-1)));
    }finally{await page.close();await app.close();}
  }
  const summary={};
  for(const v of ['A','B']){summary[v]={};for(const metric of ['libraryMs','diagramMs']){
    const values=rows.filter(r=>r.variant===v).map(r=>r[metric]).sort((a,b)=>a-b);
    summary[v][metric]=Object.fromEntries([50,75,95].map(p=>['p'+p,Math.round(values[Math.ceil(values.length*p/100)-1])]));
  }}
  const output=path.resolve(process.env.ASL_PERF_OUTPUT||'performance-result.json');
  await fs.writeFile(output,JSON.stringify({method:'fresh-profile, selected assets warmed before timed reload, alternating A/B, identical Electron/core/public fixture; not cold OS startup or live network',rows,summary},null,2));
  console.log(JSON.stringify({output,summary},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
