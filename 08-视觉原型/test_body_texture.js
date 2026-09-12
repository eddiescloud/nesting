'use strict';
// 人体贴图模块已于 2026-09-11 降为脚手架（蜂巢 js/hive.js 取代，入口不再加载）。
// 本文件只测模块自身行为；时间线绘制顺序契约见 test_hive.js。
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict');
const root = path.join(__dirname, '..', 'web', 'visual', 'js');
const pixels = new Uint8ClampedArray(112 * 241 * 4);
for (let y=0;y<241;y++) for(let x=30;x<80;x++) pixels[(y*112+x)*4+3]=255;
const scope = vm.createContext({window:{}, console, URL, Math,
 document:{currentScript:{src:'http://localhost/web/visual/js/body-texture.js'},
 createElement:()=>({getContext:()=>({drawImage(){},getImageData:()=>({data:pixels})})})}});
for (const name of ['config.js','body-texture.js','timeline.js']) vm.runInContext(fs.readFileSync(path.join(root,name),'utf8'),scope);
const {BodyTextureModule:Body, NestingConfig:config, Timeline}=scope.window;
const body=new Body({},config,{});
assert(body.target(0,4).y<body.target(3,4).y,'asset sampling progresses from head to feet');
assert(body.target(0,4).x>225,'targets use nontransparent asset pixels');
assert.equal(body.progress(23),0); assert.equal(body.progress(40),1);
assert(body.progress(32)>0 && body.progress(32)<1);
assert.equal(new Body({},config,null).target(0,2),null,'missing asset preserves old layout');
const timeline=new Timeline(config,{bodyTexture:body});timeline.seek(36);timeline.sync();
assert.equal(body.time,36);timeline.pause();timeline.tick(4);assert.equal(body.time,36,'pause freezes reveal');
timeline.seek(25);timeline.sync();assert.equal(body.time,25,'seeking backwards follows host clock');
body.stamp={};timeline.reset();assert.equal(body.time,0);assert.equal(body.stamp,null,'replay clears cached imprint');
body.time=30;body.draw({save(){},restore(){},drawImage(){}});assert.equal(body.stamp,null,'no linked bee draws no imprints');
console.log('Body texture: 12 checks passed (asset placement, transition, pause, seek, reset, no-bee no-imprint).');
