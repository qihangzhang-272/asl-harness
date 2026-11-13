import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
let esbuild;try{esbuild=require('esbuild');}catch{esbuild=createRequire(new URL('../../../../.local/dsh-build/package.json',import.meta.url))('esbuild');}
const pkg=JSON.parse(await readFile(new URL('./package.json',import.meta.url),'utf8'));
await mkdir(new URL('./dist',import.meta.url),{recursive:true});
await esbuild.build({absWorkingDir:fileURLToPath(new URL('.',import.meta.url)),entryPoints:['client/index.jsx'],outfile:'dist/client.js',bundle:true,format:'cjs',platform:'browser',target:'chrome120',
  jsx:'transform',jsxFactory:'React.createElement',jsxFragment:'React.Fragment',external:['react','react-dom','@deepseek-ai/dsh-client-ui-primitives'],nodePaths:[fileURLToPath(new URL('../../desktop/node_modules',import.meta.url)),fileURLToPath(new URL('../../../../.local/dsh-build/node_modules',import.meta.url))],loader:{'.css':'text'},minify:true,legalComments:'none',
  banner:{js:`window.__ModuleLoader__.load({id:${JSON.stringify(pkg.name)},factory:(require)=>{const module={exports:{}};const exports=module.exports;`},footer:{js:'return module.exports}})'}});
console.log('DSH native client built');
