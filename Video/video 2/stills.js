// node stills.js reel.html out.png t1 t2 ...   -> contact sheet (3 per row)
const {chromium}=require('playwright');const path=require('path');const {execFileSync}=require('child_process');const fs=require('fs');
(async()=>{const [html,out,...ts]=process.argv.slice(2);const b=await chromium.launch();const p=await b.newPage({viewport:{width:1920,height:1080}});
const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.goto('file://'+path.resolve(html)+'?render');await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(300);
const dir=path.join(path.dirname(out),'_st');fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(dir,{recursive:true});
for(let i=0;i<ts.length;i++){await p.evaluate(t=>seek(t),+ts[i]);await p.screenshot({path:path.join(dir,`s${String(i).padStart(3,'0')}.png`)});}
await b.close();const cols=Math.min(3,ts.length),rows=Math.ceil(ts.length/cols);
execFileSync('ffmpeg',['-v','error','-y','-framerate','1','-i',path.join(dir,'s%03d.png'),'-vf',`scale=640:-1,tile=${cols}x${rows}:padding=4`,'-frames:v','1',out]);
console.log('ok',errs.length?'ERRORS: '+errs.join(' | '):'');})();
