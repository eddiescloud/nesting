import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createAudio, buildLayers } from '../../audio/audio.mjs';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const output=JSON.parse(fs.readFileSync(root+'/04-AI转译/output.example-手工占位.json','utf8'));
const origin='http://127.0.0.1:8765';

/** 视觉入口现在只加载 bee.js；协议测试必须走真实入口，否则测的是已停用的脚手架。 */
function visual() {
 const nodes=new Map(),callbacks=[],listeners={};
 const ctx=new Proxy({},{get:(_,p)=>p==='createLinearGradient'||p==='createRadialGradient'?()=>({addColorStop(){}}):()=>{},set:()=>true});
 const doc={readyState:'complete',getElementById(id){if(!nodes.has(id))nodes.set(id,{style:{},dataset:{},clientWidth:600,clientHeight:720,textContent:'',getContext:()=>ctx,addEventListener(){}});return nodes.get(id)},addEventListener(){}};
 const w={parent:{postMessage(){}},location:{origin,href:origin+'/web/visual/index.html'},addEventListener(type,fn){listeners[type]=fn}};
 const scope=vm.createContext({window:w,document:doc,performance:{now:()=>0},requestAnimationFrame:fn=>callbacks.push(fn),console,Math});
 for(const f of ['config','bee','timeline','host-adapter'])vm.runInContext(fs.readFileSync(root+'/web/visual/js/'+f+'.js','utf8'),scope);
 const Base=w.Timeline;w.Timeline=class extends Base{constructor(...args){super(...args);w.latest=this}};
 vm.runInContext(fs.readFileSync(root+'/web/visual/js/main.js','utf8'),scope);
 const send=(type,payload={},sessionId='one',extras={})=>listeners.message({source:w.parent,origin,data:{channel:'nesting',version:'0.1',type,sessionId,payload},...extras});
 return {w,nodes,send,draw(){callbacks.shift()?.(10000)}};
}

/** 旧人形/蜂群/交织模块仍是仓库里的脚手架，直接实例化逐个验证，不经过入口。 */
function scaffold() {
 const scope=vm.createContext({window:{},Math,console});
 for(const f of ['config','humanoid','swarm','weave'])vm.runInContext(fs.readFileSync(root+'/web/visual/js/'+f+'.js','utf8'),scope);
 const config=scope.window.NestingConfig;
 const swarm=new scope.window.SwarmModule(output,config);
 const weave=new scope.window.WeaveModule(output,config,swarm);
 return {config,swarm,weave};
}

test('host frames advance the bee instance created by load',()=>{
 const v=visual();v.send('load',{output,sourceText:'你可以慢慢说。'});
 v.send('frame',{time:25,phase:'second',playing:true});
 assert.equal(v.w.latest.currentTime,25);assert.equal(v.w.latest.currentPhase,'enter_b');
 assert.ok(v.w.latest.modules.bee,'宿主 load 后渲染的是文字结构蜂');
 assert.equal(v.w.latest.modules.bee.segments.length,7);
});
test('load carries sourceText and the decoded bee spec into the bee module',()=>{
 const v=visual();
 v.send('load',{output,sourceText:'你不要给别人添麻烦。',beeSpec:{hue:210,posture:'open',decoded:true,caption:'语气：压抑'}});
 const bee=v.w.latest.modules.bee;
 assert.equal(bee.sourceText,'你不要给别人添麻烦。');
 assert.equal(bee.spec.hue,210);assert.equal(bee.spec.posture,'open');assert.equal(bee.spec.decoded,true);
 v.send('load',{output,sourceText:'不要。',beeSpec:{hue:210,decoded:false}});
 assert.equal(v.w.latest.modules.bee.spec.decoded,false,'未解码的规格必须如实带过来');
});
test('hosted RAF draws but never advances its own clock',()=>{
 const v=visual();v.send('load',{output});v.send('frame',{time:25,playing:true});const time=v.w.latest.currentTime;v.draw();assert.equal(v.w.latest.currentTime,time);
});
test('foreign messages and stale session frames cannot mutate the scene',()=>{
 const v=visual();v.send('load',{output});v.send('frame',{time:30,playing:true},'one',{source:{}});assert.equal(v.w.latest.currentTime,0);
 v.send('frame',{time:30,playing:true},'old');assert.equal(v.w.latest.currentTime,0);
 v.send('reset');v.send('frame',{time:40,playing:true});assert.equal(v.w.latest.currentTime,0);
});
test('scaffold: deposited particles fade out instead of fading back in',()=>{
 const {swarm}=scaffold();const p=swarm.groups[0].particles[0];p.active=true;p.alpha=1;swarm.freezeParticle(0,0);
 for(let i=0;i<240;i++)swarm.update(1/60,'settle',.5,52);assert.ok(p.alpha<.01);
});
test('scaffold: audio deposit count matches the cross-group visual pair count',()=>{
 const {weave}=scaffold();
 assert.equal(buildLayers(output).events.filter(e=>e.cue==='deposit').length,weave.depositedCount);
});
test('pause silences actual master gain and stops active voices',async()=>{
 const c=context(),a=createAudio({injectedContext:c});await a.unlock();a.load({output});a.setMuted(false);a.frame({time:30,playing:true});a.frame({time:30,playing:false});assert.equal(c.gains[0].gain.value,0);assert.ok(c.oscs.every(o=>o.stopped));
});
test('late unlock schedules at audio time, not at scene seconds',async()=>{
 const c=context(),a=createAudio({injectedContext:c,createRng:()=>()=>.9});a.load({output});a.frame({time:40,playing:true});await a.unlock();a.setMuted(false);a.frame({time:40.2,playing:true});assert.ok(c.oscs.length>0);assert.ok(c.oscs.every(o=>o.startTime<=c.currentTime+.1));
});
test('reset cancels previous scheduled gain before loading a new story',async()=>{
 const c=context(),a=createAudio({injectedContext:c});await a.unlock();a.load({output});a.setMuted(false);a.frame({time:30,playing:true});a.reset();assert.equal(c.gains[0].gain.value,0);assert.ok(c.oscs.every(o=>o.stopped));
});
function context() {
 const oscs=[],gains=[];
 const param=()=>({value:0,calls:[],setValueAtTime(v,t){this.value=v;this.calls.push([v,t])},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(v,t){this.value=v;this.calls.push([v,t])},cancelScheduledValues(){}});
 return {currentTime:0,destination:{},oscs,gains,createGain(){const n={gain:param(),connect(){}};gains.push(n);return n},createOscillator(){const n={frequency:param(),connect(){},start(t){this.startTime=t},stop(){this.stopped=true}};oscs.push(n);return n},resume:()=>Promise.resolve(),close:()=>Promise.resolve()};
}
