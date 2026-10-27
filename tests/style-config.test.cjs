const {test}=require('node:test');
const assert=require('node:assert/strict');
const {normalizeStyle,timeParts,DEFAULTS,rgb}=require('../style-config.js');
test('old settings migrate to white text and safe style defaults without changing other preferences',()=>{
  const old={name:'旅行者',scene:'forest',theme:'light',dim:42};
  assert.deepEqual(normalizeStyle(old),DEFAULTS);assert.equal(old.scene,'forest');assert.equal(old.dim,42);
});
test('invalid stored color, font, component and scale cannot inject CSS or overflow layouts',()=>{
  const invalid=normalizeStyle({clockColor:'red;display:none',accentColor:'#000',clockStyle:'evil',clockFont:'url(x)',clockSize:99999,hour12:'true',showSeconds:'true'});
  assert.equal(invalid.clockColor,'#ffffff');assert.equal(invalid.accentColor,DEFAULTS.accentColor);assert.equal(invalid.clockSize,125);
  assert.equal(invalid.clockStyle,'minimal');assert.equal(invalid.clockFont,'sans');assert.equal(invalid.hour12,false);assert.equal(invalid.showSeconds,false);
  assert.equal(normalizeStyle({clockSize:-20}).clockSize,75);assert.equal(normalizeStyle({clockSize:'broken'}).clockSize,100);
});
test('12-hour midnight and noon are 12 AM and 12 PM; 24-hour midnight stays 00',()=>{
  const midnight=new Date(2026,0,1,0,7,9),noon=new Date(2026,0,1,12,0,0);
  assert.equal(timeParts(midnight,{hour12:true,showSeconds:true}).label,'12:07:09 上午');
  assert.equal(timeParts(noon,{hour12:true}).label,'12:00 下午');
  assert.equal(timeParts(midnight).label,'00:07');
});
test('analog hands include minute/second fractions and use correct hour rollover',()=>{
  const clock=timeParts(new Date(2026,0,1,15,30,30));
  assert.equal(clock.hourAngle,105.25);assert.equal(clock.minuteAngle,183);assert.equal(clock.secondAngle,180);
});
test('manual style selection and hex colors survive JSON storage round trips',()=>{
  const chosen={clockStyle:'analog',clockColor:'#AACCFF',accentColor:'#FFAA88',clockFont:'mono',clockSize:110,hour12:true,showSeconds:true,panelStyle:'solid'};
  const restored=normalizeStyle(JSON.parse(JSON.stringify(chosen)));
  assert.equal(restored.clockStyle,'analog');assert.equal(restored.clockColor,'#aaccff');assert.equal(restored.panelStyle,'solid');assert.equal(restored.showSeconds,true);assert.equal(rgb(restored.accentColor),'255,170,136');
});
