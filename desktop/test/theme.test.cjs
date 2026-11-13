const {test}=require('node:test');
const assert=require('node:assert/strict');
test('宿主已解析的主题优先，桌面跟随系统',async()=>{
  const {readTheme}=await import('../src/useTheme.mjs');
  const doc=(host,dark)=>({documentElement:{hasAttribute:()=>host},body:{hasAttribute:()=>dark}});
  assert.equal(readTheme(doc(true,false),{matches:true}),'light');
  assert.equal(readTheme(doc(true,true),{matches:false}),'dark');
  assert.equal(readTheme(doc(false,false),{matches:true}),'dark');
  assert.equal(readTheme(doc(false,false),{matches:false}),'light');
});
