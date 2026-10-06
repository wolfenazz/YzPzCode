const {chromium}=require('playwright');const path=require('path');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1920,height:900}});
await p.goto('file://'+path.resolve(process.argv[2]));await p.waitForTimeout(500);await p.screenshot({path:process.argv[3],fullPage:true});await b.close();})();
