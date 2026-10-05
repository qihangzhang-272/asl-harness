const fs=require('node:fs/promises');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const {launch}=require('./fixture.cjs');

(async()=>{
  const baseline=process.env.ASL_PERF_BASELINE,core=process.env.ASL_PERF_CORE_BASELINE,library=process.env.ASL_PERF_WORKSPACE;
  if(!baseline&&!core)throw new Error('设置 ASL_PERF_BASELINE（旧 dist）或 ASL_PERF_CORE_BASELINE（包含旧 src）的绝对路径');
  const rows=[];
  for(let i=0;i<10;i++)for(const variant of i%2?['B','A']:['A','B']){
    const {app,page,errors}=await launch({baseline:variant==='A'?baseline:undefined,core:core&&(variant==='A'?core:path.resolve(__dirname,'../..')),library});
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
      const click=performance.now();await page.locator('.architecture-section g.node[role=button]').first().click();
      await page.locator('.skill-canvas-panel .markdown-content').waitFor();
      const fileMs=performance.now()-click;
      if(errors.length)throw new Error(errors.join('\n'));
      rows.push({round:i+1,variant,libraryMs,diagramMs,fileMs});console.log(JSON.stringify(rows.at(-1)));
    }finally{await page.close();await app.close();}
  }
  const summary={};
  for(const v of ['A','B']){summary[v]={};for(const metric of ['libraryMs','diagramMs','fileMs']){
    const values=rows.filter(r=>r.variant===v).map(r=>r[metric]).sort((a,b)=>a-b);
    summary[v][metric]=Object.fromEntries([50,75,95].map(p=>['p'+p,Math.round(values[Math.ceil(values.length*p/100)-1])]));
  }}
  const output=path.resolve(process.env.ASL_PERF_OUTPUT||'performance-result.json');
  await fs.writeFile(output,JSON.stringify({method:'fresh-profile, selected assets/core warmed before timed reload, alternating A/B, identical Electron/Python/library; not cold OS startup or live network',baseline,core,rows,summary},null,2));
  console.log(JSON.stringify({output,summary},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
