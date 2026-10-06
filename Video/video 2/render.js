// node render.js reel.html out.mp4 [fps=60] [workers=6] [audio.wav]
// Frame-exact capture: every frame is seek(t) on 4 subframes across a 180° shutter, averaged by ffmpeg tmix (real motion blur).
const {chromium}=require('playwright');const {spawn,execFileSync}=require('child_process');const path=require('path');const fs=require('fs');
(async()=>{
 const [html,out,fpsA='60',wA='6',audio]=process.argv.slice(2); const FPS=+fpsA, NW=+wA, K=4, sub=1/(FPS*2*K);
 const b=await chromium.launch(); const probe=await b.newPage(); await probe.goto('file://'+path.resolve(html)+'?render');
 const T=await probe.evaluate(async()=>{await document.fonts.ready;return window.DURATION;}); await probe.close();
 const N=Math.round(T*FPS), seg=Math.ceil(N/NW), tmp=path.join(path.dirname(out),'_seg'); fs.rmSync(tmp,{recursive:true,force:true}); fs.mkdirSync(tmp,{recursive:true});
 let done=0; const t0=Date.now();
 const vf=`format=gbrp,tmix=frames=${K}:weights='1 1 1 1',select='eq(mod(n\,${K})\,${K-1})',setpts=N/(${FPS})/TB`;
 const work=async w=>{ const a=w*seg, e=Math.min(N,a+seg); if(a>=e) return null;
  const bw=await chromium.launch(); const p=await bw.newPage({viewport:{width:1920,height:1080}}); const cdp=await p.context().newCDPSession(p); const errs=[]; p.on('pageerror',x=>errs.push(x.message));
  await p.goto('file://'+path.resolve(html)+'?render'); await p.evaluate(()=>document.fonts.ready); await p.waitForTimeout(400);
  const file=path.join(tmp,`s${w}.mp4`);
  const ff=spawn('ffmpeg',['-loglevel','error','-y','-f','image2pipe','-framerate',String(FPS*K),'-c:v','png','-i','-','-vf',vf,'-r',String(FPS),'-c:v','libx264','-crf','10','-preset','fast','-pix_fmt','yuv444p',file]);
  ff.stderr.on('data',d=>process.stderr.write(d));
  for(let f=a;f<e;f++){ for(let k=0;k<K;k++){ const t=Math.max(0,f/FPS+(k-1.5)*sub); await p.evaluate(t=>seek(t),t);
     const buf=Buffer.from((await cdp.send('Page.captureScreenshot',{format:'png',optimizeForSpeed:true})).data,'base64'); if(!ff.stdin.write(buf)) await new Promise(r=>ff.stdin.once('drain',r)); }
   if(++done%60===0){ const el=(Date.now()-t0)/1000; console.log(`${done}/${N} frames  ${el.toFixed(0)}s  eta ${(el/done*(N-done)).toFixed(0)}s`); } }
  ff.stdin.end(); await new Promise(r=>ff.on('close',r)); await bw.close(); if(errs.length) console.log('page errors',w,errs[0]); return file; };
 const files=(await Promise.all([...Array(NW).keys()].map(work))).filter(Boolean); await b.close();
 fs.writeFileSync(path.join(tmp,'list.txt'),files.map(f=>"file '"+path.resolve(f).split(path.sep).join('/')+"'").join('\n'));
 const args=['-v','error','-y','-f','concat','-safe','0','-i',path.join(tmp,'list.txt')]; if(audio) args.push('-i',audio);
 args.push('-c:v','libx264','-crf','14','-preset','slow','-pix_fmt','yuv420p','-profile:v','high','-movflags','+faststart');
 if(audio) args.push('-c:a','aac','-b:a','320k','-shortest'); args.push(out);
 execFileSync('ffmpeg',args,{stdio:'inherit'}); console.log('rendered',out,N,'frames in',((Date.now()-t0)/1000).toFixed(0),'s');
})();
