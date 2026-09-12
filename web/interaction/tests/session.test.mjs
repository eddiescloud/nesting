import test from 'node:test';
import assert from 'node:assert/strict';
import { Session, phaseAt } from '../session.mjs';
import { VisualBridge, AudioBridge, sameOriginUrl } from '../bridge.mjs';
const preset = { id: 'test', output: { version: '0.1' } };
function fresh() { let id=0; return new Session({ id: () => String(++id) }); }
test('timeline boundaries are exact', () => {
  for (const [time, phase] of [[0,'opening'],[7.99,'opening'],[8,'first'],[20,'second'],[32,'weave'],[47,'settle'],[57,'remain'],[60,'remain']]) assert.equal(phaseAt(time).id,phase);
});
test('double start and paused start cannot create a second session', () => {
  const s=fresh(); assert.equal(s.start(preset),true); const id=s.sessionId;
  assert.equal(s.start(preset),false); assert.equal(s.sessionId,id);
  s.pause(); assert.equal(s.start(preset),false); assert.equal(s.sessionId,id);
});
test('pause does not count background time', () => {
  const s=fresh(); s.start(preset); s.tick(1000); s.tick(9000); assert.equal(s.time,8);
  s.pause(); s.tick(40000); s.resume(); s.tick(50000); assert.equal(s.time,8);
  s.tick(51000); assert.equal(s.time,9);
});
test('one completion and replay receive separate identities', () => {
  const s=fresh(); s.start(preset); s.tick(0); s.tick(61000);
  assert.equal(s.state,'complete'); assert.equal(s.time,60); assert.equal(s.frame().playing,false);
  assert.equal(s.tick(80000),false); const old=s.sessionId; s.start(preset);
  assert.notEqual(s.sessionId,old); assert.equal(s.time,0);
});
test('reset removes data and old frames cannot revive the session', () => {
  const s=fresh();s.start(preset);s.tick(0);s.tick(12000);s.reset();s.tick(40000);
  assert.equal(s.preset,null);assert.equal(s.sessionId,null);assert.equal(s.time,0);assert.equal(s.state,'idle');
});
test('five complete cycles do not retain state', () => {
  const s=fresh();const ids=new Set();
  for(let i=0;i<5;i++){s.start(preset);ids.add(s.sessionId);s.tick(0);s.tick(60000);assert.equal(s.state,'complete');s.reset();assert.equal(s.preset,null);}
  assert.equal(ids.size,5);
});
function harness() {
  const sent=[],statuses=[],errors=[];
  const scope={location:{origin:'http://127.0.0.1:8765',href:'http://127.0.0.1:8765/'},addEventListener(){},removeEventListener(){},setTimeout(){return 1},clearTimeout(){}};
  const frame={contentWindow:{postMessage(...args){sent.push(args)}},addEventListener(){},removeEventListener(){},removeAttribute(){}};
  const b=new VisualBridge({frame,url:'/web/visual/index.html',scope,onStatus:s=>statuses.push(s),onError:e=>errors.push(e)});
  const receive=(data,origin=scope.location.origin,source=frame.contentWindow)=>b.receive({origin,source,data:{channel:'nesting',version:'0.1',...data}});
  return {b,sent,statuses,errors,receive};
}
test('visual handshake flushes only current session and current frame', () => {
  const {b,sent,receive}=harness();b.load('one',{output:1});b.load('two',{output:2});b.frame({time:20,playing:true});
  assert.equal(sent.length,0);receive({type:'ready'});
  assert.deepEqual(sent.map(x=>x[0].type),['load','frame']);assert.equal(sent[0][0].sessionId,'two');assert.equal(sent[1][0].payload.time,20);
});
test('ready after exit sends reset, never stale data', () => {
  const {b,sent,receive}=harness();b.load('old',{output:1});b.reset();receive({type:'ready'});
  assert.equal(sent.length,1);assert.equal(sent[0][0].type,'reset');assert.equal(sent[0][0].sessionId,null);
});
test('foreign origin, source, protocol and stale errors are ignored', () => {
  const {b,sent,errors,receive}=harness();b.load('current',{});
  receive({type:'ready'},'https://other.invalid');receive({type:'ready'},undefined,{});receive({type:'ready',version:'9'});assert.equal(sent.length,0);
  receive({type:'error',sessionId:'old'});assert.equal(errors.length,0);
  receive({type:'error',sessionId:'current'});assert.equal(errors.length,1);
});
test('paused frame says not playing and reset blocks further frames', () => {
  const {b,sent,receive}=harness();receive({type:'ready'});b.load('one',{});b.frame({time:3,playing:false});
  assert.equal(sent.at(-1)[0].payload.playing,false);b.reset();let count=sent.length;b.frame({time:20,playing:true});assert.equal(sent.length,count);
});
test('same-origin boundary rejects remote module URLs', () => {
  const location={origin:'http://localhost:1',href:'http://localhost:1/'};
  assert.equal(sameOriginUrl('/web/visual/index.html',location),'http://localhost:1/web/visual/index.html');
  assert.throws(()=>sameOriginUrl('https://other.invalid/',location));assert.throws(()=>sameOriginUrl('javascript:alert(1)',location));
});
function sound() { const calls=[]; const module={};for(const key of ['unlock','load','frame','setMuted','reset','dispose'])module[key]=(...args)=>calls.push([key,...args]);return {module,calls}; }
test('sound starts muted and only unlocks on explicit toggle', async () => {
  const {module,calls}=sound();const a=new AudioBridge(()=>{});a.attach(module);assert.deepEqual(calls,[['setMuted',true]]);
  assert.equal(await a.toggle(),true);assert.equal(calls[1][0],'unlock');a.reset();assert.equal(a.enabled,false);assert.deepEqual(calls.at(-1),['setMuted',true]);
});
test('sound failure stops module without affecting session', () => {
  const {module,calls}=sound();const errors=[];module.frame=()=>{throw Error('test')};const a=new AudioBridge(e=>errors.push(e));a.attach(module);a.frame({time:1});assert.equal(a.module,null);assert.equal(errors.length,1);assert.ok(calls.some(c=>c[0]==='reset'));
});
test('incomplete sound interface fails explicitly', () => {assert.throws(()=>new AudioBridge(()=>{}).attach({}));});
test('late audio unlock after exit cannot unmute', async () => {
  const {module,calls}=sound();let finish;module.unlock=()=>new Promise(resolve=>{finish=resolve});
  const a=new AudioBridge(()=>{});a.attach(module);const pending=a.toggle();a.reset();finish();
  assert.equal(await pending,false);assert.equal(a.enabled,false);assert.ok(!calls.some(c=>c[0]==='setMuted'&&c[1]===false));
});
test('duplicate ready message cannot reload an active visual session', () => {
  const {b,sent,receive}=harness();b.load('one',{});receive({type:'ready'});b.frame({time:12,playing:true});const count=sent.length;receive({type:'ready'});assert.equal(sent.length,count);
});
test('regressing clock is ignored rather than double counted', () => {
  const s=fresh();s.start(preset);s.tick(1000);s.tick(2000);s.tick(1500);s.tick(3000);assert.equal(s.time,2);
});
