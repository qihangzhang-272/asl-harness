import {Service} from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import {defineTool} from '@deepseek-ai/dsh-tools';
import {homedir} from 'node:os';
import {join,extname,basename,dirname,relative,isAbsolute,sep} from 'node:path';
import {readFile,realpath,stat} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import domain from './domain.cjs';
import execution from './execution.cjs';

export const name='dsh-asl-workspace';
export const inject=['webServer','connection','tools'];
export const Config=z.object({
  sourceRoot:z.string().description('现有 ASL Harness 开发仓库或完整安装目录；使用工作区前配置'),
  environment:z.string().description('现有 ASL Environment 目录；使用工作区前配置'),
  python:z.string().description('现有 Python 3.11+，需安装 ASL 核心依赖'),
  coreExecutable:z.string().description('正式安装版 ASL 核心，复用随包 Mermaid 渲染器'),
  bindings:z.dict(z.array(z.object({package:z.string().required(),panel:z.string().required(),title:z.string().required()}))).default({}),
});

class WorkspaceService extends Service {
  constructor(ctx,config){
    super(ctx,'aslWorkspace');
    this.workspaceConfig=config;
  }
  get domain(){
    if(this.workspaceDomain)return this.workspaceDomain;
    const config=this.workspaceConfig;
    if(!config.sourceRoot?.trim()||!config.environment?.trim())throw Object.assign(new Error('ASL 工作区尚未配置。请在当前 DSH profile 的 cordis.patch.yml 中设置 sourceRoot（包含 desktop/bridge.cjs 的完整 ASL 仓库）和 environment（含 skills/、modes/ 的技能库），然后重启 DSH。安装步骤：https://github.com/qihangzhang-272/dsh-asl#开始使用'),{code:'ASL_SETUP_REQUIRED'});
    try{
      this.workspaceDomain=new domain.WorkspaceDomain({...config,storage:join(process.env.DSH_HOME||join(homedir(),'.dsh'),'asl-workspace')});
    }catch(error){
      throw Object.assign(new Error('ASL 桥接运行时未能加载。请检查 cordis.patch.yml 的 sourceRoot 是否指向包含 desktop/bridge.cjs 的完整 ASL 仓库；GitHub 直装不会初始化 upstream 子模块，请按安装指南递归克隆 ASL 后配置路径并重启 DSH。原因：'+error.message),{code:'ASL_SETUP_INVALID',cause:error});
    }
    return this.workspaceDomain;
  }
  dispatch(action,args,options){return this.domain.dispatch(action,args,options);}
}
const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
const within=(root,file)=>{const value=relative(root,file);return value!=='..'&&!value.startsWith('..'+sep)&&!isAbsolute(value);};
const reveal=location=>new Promise((resolve,reject)=>{
  const command=process.platform==='win32'?'explorer.exe':process.platform==='darwin'?'open':'xdg-open';
  const args=process.platform==='win32'?[location.directory?location.path:'/select,'+location.path]:process.platform==='darwin'?['-R',location.path]:[location.directory?location.path:dirname(location.path)];
  const child=spawn(command,args,{windowsHide:true,stdio:'ignore'});
  child.once('error',reject);child.once('spawn',()=>{child.unref();resolve({started:true});});
});

export function apply(ctx,config){
  const service=new WorkspaceService(ctx,config);
  async function definitionRoots(catalog){
    const roots=await Promise.all([...catalog.skills.map(s=>s.path),join(config.environment,'modes')].filter(Boolean).map(root=>realpath(root).catch(()=>null)));
    return roots.filter(Boolean);
  }
  async function artifactLocation(args,sessionId){
    const session=ctx.get('sessions')?.get(sessionId);
    if(!session?.header.cwd)throw new Error('会话尚未就绪或没有工作目录');
    const location=await execution.checkedPath(session.header.cwd,args.path);
    const catalog=await service.dispatch('catalog');
    if((await definitionRoots(catalog)).some(root=>within(root,location.path)))throw new Error('技能与 Mode 定义不是业务产物');
    return location;
  }
  async function dispatch(action,args={},options={}){
    if(action==='revealSkill')return reveal(await service.domain.fileLocation(args.identifier,args.file));
    if(['activity','artifact','artifactPreview','revealArtifact'].includes(action)){
      const sessionId=options.sessionId||args.sessionId;
      if(typeof sessionId!=='string'||!sessionId||sessionId.length>200)throw new Error('需要当前 DeepSeek 会话');
      const session=ctx.get('sessions')?.get(sessionId);
      if(!session)throw new Error('会话尚未就绪，请重新连接');
      const cwd=session.header.cwd;
      if(!cwd)throw new Error('会话没有工作目录');
      if(action==='activity'){
        const catalog=await service.dispatch('catalog');
        const roots=await definitionRoots(catalog);
        const value=execution.executionSnapshot(session.snapshotEvents(),ctx.get('agents')?.get(sessionId)?.status||'unknown',catalog.skills);
        const files=[];
        for(const artifact of value.artifacts){
          try{const location=await execution.checkedPath(cwd,artifact.path);if(!location.directory&&!roots.some(root=>within(root,location.path)))files.push({...artifact,...location,title:artifact.title||basename(location.path)});}catch{}
        }
        return {...value,artifacts:files,cwd};
      }
      const location=await artifactLocation(args,sessionId);
      if(location.directory)throw new Error('请选择产物文件');
      if(action==='revealArtifact')return reveal(location);
      const info=await stat(location.path);
      const artifact={...location,title:basename(location.path),size:info.size};
      if(action==='artifact')return {artifact};
      const text=['.md','.markdown','.txt','.csv','.json','.yaml','.yml','.html','.css','.js','.py'].includes(extname(location.path).toLowerCase())&&info.size<=1024*1024;
      return {artifact,document:text?await readFile(location.path,'utf8'):null};
    }
    return service.dispatch(action,args,options);
  }
  ctx.inject(['systemPrompt'],promptCtx=>promptCtx.systemPrompt.context({
    name:'asl-workspace',order:100,required:true,interpolate:false,
    text:({agent})=>{
      const view=service.workspaceDomain?.context(agent?.session.id);
      return view?'ASL 当前工作内容（每步刷新）：'+JSON.stringify(view)+'。画板只是技能关系，选中节点或 inspection 预览不代表正在执行，也不授权改写技能定义。用户提出业务任务时读取相应技能，在当前项目中制作业务产物，用宿主文件工具保存，然后 asl_workspace artifact({path}) 登记真实文件供界面预览；不要把业务正文写回 SKILL.md/MODE.md。仅当用户明确要修改技能或画板定义时，先 context 核对编辑目标，再 read 最新完整原文；save/adopt 必须携带 contextRevision，save 还须携带 expected 指纹。界面有草稿时先请用户保存或放弃，不用 shell 绕过保存校验。只有工具保存成功后才能说已修改。':'';
    },
  }));
  ctx.effect(()=>ctx.webServer.register({kind:'prefix',path:'/asl-workspace',handler:async(req,res)=>{
    try{
      if(typeof ctx.connection.requestRejection!=='function')return send(res,403,{error:'鉴权服务不可用'});
      const rejection=ctx.connection.requestRejection({headers:req.headers});
      if(rejection)return send(res,rejection,{error:'未授权'});
      const url=new URL(req.url,'http://local');
      if(url.pathname==='/asl-workspace/file'&&req.method==='GET'){
        const args=Object.fromEntries(url.searchParams);
        const location=args.kind==='skill'?await service.domain.fileLocation(args.identifier,args.file):await artifactLocation(args,args.sessionId);
        if(location.directory)throw new Error('不能预览目录');
        const info=await stat(location.path);if(info.size>20*1024*1024)throw new Error('预览文件超过 20 MB，请在系统文件夹中打开');
        const mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.svg':'image/svg+xml','.pdf':'application/pdf','.html':'text/html; charset=utf-8'}[extname(location.path).toLowerCase()];
        if(!mime)throw new Error('此格式请在 Sidebar 或系统文件夹中打开');
        res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'"});res.end(await readFile(location.path));return;
      }
      if(url.pathname!=='/asl-workspace/api')return send(res,404,{error:'接口不存在'});
      if(req.method!=='POST')return send(res,405,{error:'请使用 POST'});
      if(req.headers['sec-fetch-site']&&!['same-origin','none'].includes(req.headers['sec-fetch-site']))return send(res,403,{error:'拒绝跨站请求'});
      let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>2*1024*1024)return send(res,413,{error:'请求超过 2 MB'});}
      const {action,args}=JSON.parse(raw);
      const result=action==='setContext'?service.domain.updateContext(args?.sessionId,args?.view):await dispatch(action,args);
      if(action==='catalog'){
        result.cwd=config.environment;
        result.sessionMissing=['agentDefaultModel','agents','attachments','fileUploads','fs','llm','remoteAccess','sessions','sessionProjections','sessionQuery','typert','workspaceRegistry','sessionController'].filter(name=>!ctx.get(name));
        const graph=ctx.get('clientModules')?.graph?.();
        result.bindings=Object.fromEntries(Object.entries(result.bindings).map(([mode,entries])=>[mode,entries.map(entry=>({...entry,available:!!graph?.entries.some(p=>p.id===entry.package)}))]));
      }
      send(res,200,{result});
    }catch(error){if(!res.headersSent)send(res,400,{error:error.message,code:error.code});else res.end();}
  }}),'asl-workspace: authenticated domain API');
  ctx.tools.register(defineTool({
    name:'asl_workspace',
    description:'ASL 工作区工具。正常业务任务：读取技能，用宿主工具在项目中保存业务产物，再 artifact({path}) 登记实际文件供用户预览。选中节点或 inspection 是只读预览，不是执行状态，也不改变编辑目标。仅当用户明确修改工作区定义时：先 context({}) 获取当前会话的 Mode/文件/图/选区和 contextRevision，再 read({kind,identifier,file}) 获取完整 document 和 fingerprint；save({kind,identifier,file,contextRevision,expected:fingerprint,document,skills?:引用技能ID列表}) 写回并刷新界面。切换目标、未保存草稿或指纹冲突会拒绝写入，须重新读取，不得强制覆盖或用 shell 绕过。MODE.md 内 Mermaid 是画板真源；%% asl-bind 节点ID [\"技能ID\"] 绑定一至两个技能，保留其他图和分支。catalog 查看 Mode/Skill；discover({query}) 搜索；repository({url}) 下载检查；adopt({snapshot,source,mode,contextRevision}) 采用后逐个更新 MODE.md。不执行下载包的安装脚本。',
    parameters:{action:{type:'string',required:true},args:{oneOf:[{type:'object',additionalProperties:true},{type:'string'}],description:'直接传参数对象；兼容旧版 JSON 字符串。具体参数见 asl-workspace Skill；缺省为空对象'}},
    output:{schema:{type:'string'},render:(_args,value)=>[{type:'text',text:value}]},
    async execute(args,exec){
      const sessionId=exec.agent?.session.id;
      if(!sessionId)throw new Error('此工具需要原生 DeepSeek 会话');
      if(['activity','artifactPreview','revealArtifact','revealSkill','fileLocation'].includes(args.action))throw new Error('此操作仅用于界面；登记业务产物请用 artifact({path})');
      return JSON.stringify(await dispatch(args.action,typeof args.args==='string'?JSON.parse(args.args):args.args??{},{signal:exec.signal,sessionId}));
    },
  }));
}
