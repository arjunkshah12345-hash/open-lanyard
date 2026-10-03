import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/dm-sans/latin-700.css';
import '@fontsource/platypi/latin-400.css';
import '../styles.css';
import { badgeConfig } from '../config.js';

const config={...badgeConfig};
const container=document.querySelector('#scene');
const editor=document.querySelector('#editor');
const editButton=document.querySelector('#edit-button');
const form=document.querySelector('#badge-form');
const hint=document.querySelector('#hint');
const status=document.querySelector('#status');
const loading=document.querySelector('#loading');
let scene, updateTimer;

if(window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const spin=document.querySelector('#spin');
  spin.disabled=true;
  spin.title='Spinning is off while reduced motion is enabled';
  spin.setAttribute('aria-label',spin.title);
}

for(const [key,value] of Object.entries(config)) {
  if(form.elements.namedItem(key)) form.elements.namedItem(key).value=value;
}

function openEditor(open) {
  editor.hidden=!open; editButton.setAttribute('aria-expanded',String(open));
  if(open) form.elements.name.focus(); else editButton.focus();
}
editButton.addEventListener('click',()=>openEditor(editor.hidden));
document.querySelector('#close-editor').addEventListener('click',()=>openEditor(false));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!editor.hidden) openEditor(false);});
form.addEventListener('submit',e=>e.preventDefault());

function update(next) {
  Object.assign(config,next);
  document.documentElement.style.setProperty('--accent',config.accent);
  const channels=[1,3,5].map(i=>parseInt(config.accent.slice(i,i+2),16)/255);
  const luminance=channels.map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
  document.documentElement.style.setProperty('--accent-ink',luminance>.3?'#182236':'#f4f7ff');
  clearTimeout(updateTimer);
  updateTimer=setTimeout(()=>scene?.update(config),70);
  document.querySelectorAll('[data-color]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.color===config.accent)));
}
form.addEventListener('input',e=>{
  if(e.target.name && Object.hasOwn(config,e.target.name)) update({[e.target.name]:e.target.value});
});
document.querySelectorAll('[data-color]').forEach(b=>b.addEventListener('click',()=>{
  form.elements.accent.value=b.dataset.color; update({accent:b.dataset.color});
}));
document.querySelector('#spin').addEventListener('click',()=>scene?.spin());
document.querySelector('#reset').addEventListener('click',()=>scene?.reset());
document.querySelector('#theme').addEventListener('click',e=>{
  const light=document.body.classList.toggle('light');
  scene?.setLight(light);
  e.currentTarget.setAttribute('aria-label',`Switch to ${light?'dark':'light'} studio`);
});
document.querySelector('#download-config').addEventListener('click',()=>{
  const source=`// Your Open Lanyard configuration.\nexport const badgeConfig = ${JSON.stringify(config,null,2)};\n`;
  const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
  const a=document.createElement('a'); a.href=url; a.download='config.js'; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  status.textContent='Your badge configuration was downloaded.';
});

try {
  const [{createScene}]=await Promise.all([
    import('./scene.js'),
    ...[400,500,600,700].map(weight=>document.fonts.load(`${weight} 24px "DM Sans"`)),
    document.fonts.load('400 24px "Platypi"'),
  ]);
  scene=await createScene(container,config,(action)=>{
    hint.textContent=({drag:'A little tension. A little possibility.',release:'Go on. One more time.',spin:'Made to move.',reset:'Give it a little pull.'})[action];
    if(action==='spin'||action==='reset') status.textContent=action==='spin'?'Badge spinning.':'Badge reset.';
  });
  scene.setLight(document.body.classList.contains('light'));
  loading.classList.add('is-ready');
  setTimeout(()=>loading.hidden=true,400);
} catch(error) {
  console.error('Unable to create the lanyard:',error);
  loading.replaceChildren();
  const message=document.createElement('span');
  message.textContent='The 3D preview needs WebGL. Enable hardware acceleration, then reload.';
  loading.append(message); loading.setAttribute('role','alert');
}
if(import.meta.hot) import.meta.hot.dispose(()=>{clearTimeout(updateTimer);scene?.dispose();});
