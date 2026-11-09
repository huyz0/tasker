import {chromium} from 'playwright';import{createRequire}from'node:module';import{readFileSync,writeFileSync,mkdirSync}from'node:fs';
const req=createRequire(new URL('../../../apps/gui/package.json', import.meta.url));const axe=readFileSync(req.resolve('axe-core/axe.min.js'),'utf8');
const ids=[...['workflows','schedules'].flatMap(k=>['empty','loading','permission-denied','populated','create'].map(s=>`features-${k}-screen--${s}`)),...['default','empty','loading','permission-denied'].map(s=>`features-tasksworkbench--${s}`),...['empty','populated'].map(s=>`features-tasks-optional-context--${s}`),...['no-org-selected','empty','loading','permission-denied','with-org-selected'].map(s=>`pages-dashboard--${s}`),'features-reports--stalled-long-preview','design-system-visual-roles--operational-workspace',...['title-only','with-description','with-actions','with-toolbar'].map(s=>`ui-pageheader--${s}`),...['loading','error-state','empty','populated','collection-introduction'].map(s=>`ui-liststate--${s}`),'layout-appshell--desktop','layout-appshell--mobile-drawer-open','layout-currentuser--default'];
const selectedIds=process.env.STORY_IDS?.split(',')??ids;
const root=process.env.STORY_OUTPUT??'/tmp/tasker-ui-review/selected-stories';mkdirSync(root,{recursive:true});const b=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']});const results=[];
for(const[width,theme]of[[1280,'light'],[375,'dark']]){
 const p=await b.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});let errors=[];p.on('pageerror',e=>errors.push(e.message));
 for(const id of selectedIds){
  errors=[];await p.goto(`http://localhost:6006/iframe.html?id=${id}&viewMode=story`,{waitUntil:'networkidle',timeout:30000});
  await p.waitForFunction(()=>document.querySelector('#storybook-root')?.textContent?.trim().length>0,{},{timeout:10000});
  await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  await p.addScriptTag({content:axe});const audit=await p.evaluate(()=>window.axe.run('#storybook-root',{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}}));
  const overflow=await p.evaluate(()=>{const root=document.querySelector('#storybook-root');const elements=[...root.querySelectorAll('*')];return elements.filter(e=>{const r=e.getBoundingClientRect();if(!r.width||!r.height||r.right<=innerWidth+1)return false;let a=e;while(a&&a!==root){if(['auto','scroll'].includes(getComputedStyle(a).overflowX))return false;a=a.parentElement}return true}).slice(0,5).map(e=>e.tagName+'.'+e.className)});
  results.push({id,width,theme,errors,violations:audit.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),overflow});
  await p.screenshot({path:`${root}/${id}-${theme}-${width}.png`});
 }
 await p.close();
}
await b.close();writeFileSync(root+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify({stories:selectedIds.length,checks:results.length,failures:results.filter(r=>r.errors.length||r.violations.length||r.overflow.length)}));

if(results.some(r=>r.errors.length||r.violations.length||r.overflow.length))process.exitCode=1;
