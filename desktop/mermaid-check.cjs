// CLI and App share the offline Blink + Mermaid renderer, not a syntax-only proxy.
async function check({app,BrowserWindow},directory) {
  let window;
  // A canceled CLI caller closes stdout. Treat that as cancellation, not a GUI exception.
  process.stdout.on('error',()=>app.exit(1));
  const finish=result=>{
    window?.destroy();
    try{process.stdout.write(JSON.stringify(result)+'\n',()=>app.exit(result.ok?0:1));}
    catch{app.exit(1);}
  };
  try {
    const file=process.argv[process.argv.indexOf('--validate-mermaid')+1];
    const fs=require('node:fs/promises');
    if(!file||!require('node:path').isAbsolute(file)||(await fs.stat(file)).size>8*1024*1024)throw new Error('图文档路径或总量无效');
    const documents=JSON.parse(await fs.readFile(file,'utf8'));
    await app.whenReady();
    window=new BrowserWindow({show:false,width:1440,height:900,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,partition:'asl-mermaid-check'}});
    window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    window.webContents.session.setPermissionRequestHandler((_w,_p,cb)=>cb(false));
    const timer=setTimeout(()=>finish({ok:false,errors:[{message:'渲染超时，请简化图后重新提交'}]}),45000);
    await window.loadFile(require('node:path').join(directory,'dist/mermaid-check.html'));
    const result=await window.webContents.executeJavaScript(`window.validateMermaid(${JSON.stringify(documents)})`);
    clearTimeout(timer);finish(result);
  }catch(error){finish({ok:false,errors:[{message:error.message}]});}
}
module.exports={check};
