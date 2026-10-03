import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { createLanyardPhysics } from '../src/physics.js';

// Exercises the public behavior: stable motion, actual pointer/touch interaction,
// responsive rendering, editing, and export. No access to renderer internals.
const output=new URL('../test-artifacts/',import.meta.url);
mkdirSync(output,{recursive:true});
const physics=await createLanyardPhysics();
const step=(seconds)=>{for(let i=0;i<seconds*120;i++) physics.step(1/120);};
step(5);
const rest=physics.getCardTransform().position;
physics.startDrag(rest);
physics.dragTo({x:1.8,y:rest.y+1,z:0});
step(1);
const dragged=physics.getCardTransform().position;
assert.ok(dragged.x>rest.x+.5,'The badge follows a horizontal drag');
physics.endDrag(); step(.5);
assert.ok(Math.hypot(physics.getCardTransform().position.x-dragged.x,physics.getCardTransform().position.y-dragged.y)>.04,'Release retains physical motion');
for(let i=0;i<1200;i++) {
  physics.step(1/60);
  assert.ok(Object.values(physics.getCardTransform().position).every(Number.isFinite),'The simulation stays finite');
}
physics.reset(); step(2);
const beforePull=physics.getCardTransform().position;
physics.startDrag(beforePull); physics.dragTo({...beforePull,y:beforePull.y-1}); step(1);
const pulled=physics.getCardTransform().position;
const travel=beforePull.y-pulled.y;
assert.ok(travel>.15&&travel<.4,'A downward pull has visible but firmly bounded travel');
assert.ok(physics.getTension()>.5&&physics.getTension()<=1,'Tension reflects the loaded strap');
physics.endDrag();step(.3);
assert.ok(physics.getCardTransform().position.y>pulled.y+travel*.75,'The firmer strap recoils promptly');
step(5);physics.dispose();
console.log('Physics: drag, release, elasticity, and settling passed.');

const port=5175;
const url=process.env.PREVIEW_URL||`http://127.0.0.1:${port}/`;
const production=process.argv.includes('--production');
const server=process.env.PREVIEW_URL?null:spawn(process.execPath,['node_modules/vite/bin/vite.js',...(production?['preview']:[]),'--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:'ignore',cwd:new URL('../',import.meta.url)});
let browser;
try {
  for(let i=0;i<80;i++) {
    try {if((await fetch(url)).ok) break;} catch { /* Wait for our server. */ }
    if(i===79) throw new Error('Preview server did not start');
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  const macChrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const executablePath=process.env.CHROME_PATH||(existsSync(macChrome)?macChrome:undefined);
  browser=await chromium.launch({headless:true,executablePath,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const errors=[];
  const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  // All runtime code, fonts, and artwork must work without external services.
  await page.route('**/*',route=>route.request().url().startsWith(new URL(url).origin)?route.continue():route.abort());
  await page.goto(url,{waitUntil:'networkidle'});
  await page.locator('#loading[hidden]').waitFor({state:'attached'});
  assert.equal(await page.title(),'SuperCompress · Arjun Shah');
  assert.equal(await page.locator('body').getAttribute('class'),'light','Light studio is the default');
  assert.equal(await page.locator('[name=name]').inputValue(),'Arjun Shah');
  assert.equal(await page.locator('[name=brand]').inputValue(),'SuperCompress');
  assert.equal(await page.locator('#theme').getAttribute('aria-label'),'Switch to dark studio');
  await page.waitForTimeout(600);
  await page.screenshot({path:new URL('desktop.png',output).pathname});
  await page.mouse.move(720,580); await page.mouse.down();
  assert.match(await page.locator('#scene').getAttribute('class'),/is-dragging/);
  await page.mouse.move(940,410,{steps:20}); await page.waitForTimeout(500);
  await page.screenshot({path:new URL('dragging.png',output).pathname});
  await page.mouse.up();
  assert.doesNotMatch(await page.locator('#scene').getAttribute('class'),/is-dragging/);
  await page.locator('#reset').click(); await page.waitForTimeout(600);
  const imageBefore=await page.locator('canvas').screenshot();
  await page.locator('#spin').click(); await page.waitForTimeout(250);
  const imageAfter=await page.locator('canvas').screenshot();
  assert.notEqual(createHash('sha256').update(imageBefore).digest('hex'),createHash('sha256').update(imageAfter).digest('hex'),'Spin changes the rendered badge');
  await page.locator('#reset').click();
  await page.locator('#edit-button').click();
  await page.locator('[name=name]').fill('Jordan Lee');
  await page.getByRole('button',{name:'Lilac',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Lilac',exact:true}).getAttribute('aria-pressed'),'true');
  await page.waitForTimeout(200);
  await page.screenshot({path:new URL('editor.png',output).pathname});
  const downloaded=page.waitForEvent('download');
  await page.locator('#download-config').click();
  const download=await downloaded;
  const stream=await download.createReadStream();
  const chunks=[];for await(const chunk of stream) chunks.push(chunk);
  const source=Buffer.concat(chunks).toString();
  assert.match(source,/Jordan Lee/);assert.match(source,/#bcb1f7/);
  await page.keyboard.press('Escape');assert.equal(await page.locator('#editor').isVisible(),false);
  await page.locator('#theme').click();
  assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('light')),false);
  await page.screenshot({path:new URL('dark.png',output).pathname});
  await page.locator('#theme').click();
  await page.screenshot({path:new URL('light.png',output).pathname});
  for(const [width,height] of [[390,844],[320,568],[844,390]]) {
    await page.setViewportSize({width,height});await page.waitForTimeout(200);
    const size=await page.evaluate(()=>({w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight}));
    assert.equal(size.w,width,'No horizontal overflow');assert.equal(size.h,height,'No vertical overflow');
    await page.screenshot({path:new URL(`responsive-${width}.png`,output).pathname});
  }
  const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  mobile.on('pageerror',error=>errors.push(error.message));
  await mobile.goto(url,{waitUntil:'networkidle'});await mobile.locator('#loading[hidden]').waitFor({state:'attached'});
  const touch=await mobile.context().newCDPSession(mobile);
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:195,y:475}]});
  assert.match(await mobile.locator('#scene').getAttribute('class'),/is-dragging/);
  for(let i=1;i<=12;i++) await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:195+i*7,y:475-i*6}]});
  await mobile.waitForTimeout(300);
  await mobile.screenshot({path:new URL('touch-drag.png',output).pathname});
  await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.doesNotMatch(await mobile.locator('#scene').getAttribute('class'),/is-dragging/);
  const reduced=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
  reduced.on('pageerror',error=>errors.push(error.message));
  await reduced.goto(url,{waitUntil:'networkidle'});await reduced.locator('#loading[hidden]').waitFor({state:'attached'});
  assert.equal(await reduced.locator('#spin').isDisabled(),true);
  assert.deepEqual(errors,[],'No browser errors');
  console.log('Browser: desktop drag/release/spin, touch drag, editor/export, lighting, 3 responsive sizes, and reduced motion passed.');
  console.log(`Screenshots: ${output.pathname}`);
} finally {
  await browser?.close();
  server?.kill('SIGTERM');
}
