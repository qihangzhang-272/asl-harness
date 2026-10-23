import {Marked} from 'marked';

// Only Markdown in the same public repository stays in the repository reader.
export function repositoryDocumentLink(href,baseUrl) {
  try {
    const base=new URL(baseUrl),url=new URL(href,base);
    if(base.hostname!=='github.com'||url.protocol!=='https:')return null;
    const parts=base.pathname.split('/').filter(Boolean);
    const target=url.pathname.split('/').filter(Boolean);
    if(!['github.com','raw.githubusercontent.com'].includes(url.hostname)||target[0]?.toLowerCase()!==parts[0]?.toLowerCase()||target[1]?.toLowerCase()!==parts[1]?.toLowerCase())return null;
    const start=url.hostname==='github.com'?(target[2]==='blob'?4:0):3;
    if(!start)return null;
    const file=decodeURIComponent(target.slice(start).join('/'));
    if(!/\.md$/i.test(file)||file.split('/').some(p=>p==='..'))return null;
    return {file,ref:decodeURIComponent(target[start-1]),hash:url.hash,url:url.href};
  }catch{return null;}
}

export function repositoryFileLink(href,baseUrl) {
  const document=repositoryDocumentLink(href,baseUrl);
  return document?document.file.replaceAll('%','%25').replaceAll('#','%23')+document.hash:null;
}

const languages={zh:'中文',cn:'中文','zh-cn':'中文','zh-tw':'繁體中文',en:'English',ja:'日本語',ko:'한국어',fr:'Français',de:'Deutsch',es:'Español',pt:'Português',ru:'Русский'};
const languageSuffix=/[._-](zh(?:[._-](?:cn|tw))?|cn|en|ja|ko|fr|de|es|pt|ru)\.md$/i;
function fileLanguage(file){return file.match(languageSuffix)?.[1].toLowerCase().replaceAll('_','-').replaceAll('.','-')||'';}

export function repositoryLanguageOptions(document,files=[]) {
  const original=repositoryDocumentLink(document.url,document.url);
  if(!original)return [];
  const options=[],seen=new Set(),directory=original.file.split('/').slice(0,-1).join('/');
  const family=file=>file.split('/').at(-1).replace(languageSuffix,'.md').toLowerCase();
  function add(route,label){
    if(!route)return;
    const key=route.ref+':'+route.file;if(seen.has(key))return;
    const language=fileLanguage(route.file)||Object.keys(languages).find(code=>languages[code]===label)||'';
    if(options.length&&!language)return;
    seen.add(key);options.push({...route,language,label:languages[language]||'原文'});
  }
  add(original);
  const root=document.url.slice(0,document.url.indexOf('/blob/'))+'/blob/'+encodeURIComponent(original.ref)+'/';
  for(const file of files)if(file.split('/').slice(0,-1).join('/')===directory&&family(file)===family(original.file))
    add(repositoryDocumentLink(root+file.split('/').map(encodeURIComponent).join('/'),document.url));
  const parser=new Marked();
  parser.walkTokens(parser.lexer(document.text||''),token=>{
    if(token.type!=='link')return;
    const label=({'简体中文':'中文','Chinese':'中文','英文':'English'})[token.text]||token.text;
    const route=repositoryDocumentLink(token.href,document.url);
    if(Object.values(languages).includes(label)||route?.file.split('/').slice(0,-1).join('/')===directory&&family(route.file)===family(original.file))add(route,label);
  });
  return options;
}
