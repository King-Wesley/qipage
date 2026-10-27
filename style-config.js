(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.QipageStyle=api;
})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  const CLOCK_STYLES=['minimal','cards','stacked','analog'];
  const DEFAULTS=Object.freeze({clockStyle:'minimal',clockColor:'#ffffff',accentColor:'#98cbb4',clockSize:100,clockFont:'sans',showSeconds:false,hour12:false,panelStyle:'glass'});
  const color=(value,fallback)=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)?value.toLowerCase():fallback;
  function normalizeStyle(input={}){
    const size=Number(input.clockSize??DEFAULTS.clockSize);
    return{
      clockStyle:CLOCK_STYLES.includes(input.clockStyle)?input.clockStyle:DEFAULTS.clockStyle,
      clockColor:color(input.clockColor,DEFAULTS.clockColor),accentColor:color(input.accentColor,DEFAULTS.accentColor),
      clockSize:Number.isFinite(size)?Math.min(125,Math.max(75,Math.round(size))):DEFAULTS.clockSize,
      clockFont:['sans','serif','mono'].includes(input.clockFont)?input.clockFont:DEFAULTS.clockFont,
      showSeconds:input.showSeconds===true,hour12:input.hour12===true,
      panelStyle:['glass','solid'].includes(input.panelStyle)?input.panelStyle:DEFAULTS.panelStyle
    };
  }
  function timeParts(date,input={}){
    const settings=normalizeStyle(input),hours=date.getHours(),minutes=date.getMinutes(),seconds=date.getSeconds();
    const pad=value=>String(value).padStart(2,'0');
    const hour=pad(settings.hour12?(hours%12||12):hours),minute=pad(minutes),second=pad(seconds),period=settings.hour12?(hours<12?'上午':'下午'):'';
    return{hour,minute,second,period,label:`${hour}:${minute}${settings.showSeconds?':'+second:''}${period?' '+period:''}`,
      hourAngle:(hours%12)*30+minutes*.5+seconds/120,minuteAngle:minutes*6+seconds*.1,secondAngle:seconds*6};
  }
  function rgb(hex){const safe=color(hex,DEFAULTS.accentColor);return[1,3,5].map(start=>parseInt(safe.slice(start,start+2),16)).join(',');}
  return{CLOCK_STYLES,DEFAULTS,normalizeStyle,timeParts,rgb};
});
