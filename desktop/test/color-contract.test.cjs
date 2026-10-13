const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('workbench text and status pairs meet the reading contrast floor',()=>{
  const css=fs.readFileSync(path.join(__dirname,'../style.css'),'utf8').split('}')[0];
  const tokens=Object.fromEntries([...css.matchAll(/(--[\w-]+):\s*(#[\da-f]{6})/gi)].map(match=>[match[1],match[2]]));
  const luminance=hex=>{
    assert.ok(hex,'颜色角色必须存在');
    const channels=hex.slice(1).match(/../g).map(value=>parseInt(value,16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);
    return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;
  };
  for(const [foreground,background] of [['--ink','--surface'],['--muted','--canvas'],['--faint','--surface-muted'],['--sidebar-ink','--sidebar-bg'],['--success-ink','--success-bg'],['--warn-ink','--warn-bg'],['--danger','--danger-bg']]){
    const values=[luminance(tokens[foreground]),luminance(tokens[background])].sort((a,b)=>b-a);
    assert.ok((values[0]+.05)/(values[1]+.05)>=4.5,`${foreground} / ${background} 对比度不足`);
  }
  const primary=luminance(tokens['--brand']);assert.ok(1.05/(primary+.05)>=4.5,'主按钮白字必须可读');
});
