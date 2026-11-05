/* Parts of Speech Blaster — a built file from the TeachersDeck Game Library Kit. Edit games/kit/ or games/src/parts-of-speech-blaster.js, then run games/tools/build_games.py. */
const TD=(()=>{
const LV=['easy','moderate','hard'],LN={easy:'Easy',moderate:'Moderate',hard:'Hard'};
let cfg,level='easy',teams=[],act=0,muted=false,ac;
const $=(s,r=document)=>r.querySelector(s);
const store={get(k,d){try{return JSON.parse(localStorage.getItem(k))??d}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
/* language: a game that lists langs:['en','vi'] in TD.init follows ?lang= from the app (kept for the next visit) and has a
   switch in its header; other games stay English. TD.L(en, vi) picks a string; TD.num(x) writes 0,5 and −3 in Vietnamese;
   elements with data-vi get that text in Vietnamese. */
const UI={vi:{Easy:'Dễ',Moderate:'Vừa',Hard:'Khó','How to play':'Cách chơi','Sound on':'Âm thanh: bật','Sound off':'Âm thanh: tắt',Teams:'Các đội','+ Team':'+ Đội','Reset scores':'Đặt lại điểm',Podium:'Bục vinh quang','Send to Scoreboard':'Gửi sang Bảng điểm',
'Six teams is the maximum':'Tối đa sáu đội','Scores reset':'Đã đặt lại điểm','Scores sent to the Scoreboard widget':'Đã gửi điểm sang Bảng điểm',Team:'Đội','Motion: full':'Hiệu ứng: đầy đủ','Motion: reduced':'Hiệu ứng: giảm','Motion: off':'Hiệu ứng: tắt',
'the podium':'bục vinh quang',Close:'Đóng','in a row!':'câu đúng liên tiếp!','Animations: full, reduced or off':'Hiệu ứng: đầy đủ, giảm hoặc tắt',Difficulty:'Độ khó'}};
let lang='en';const want=(()=>{const q=new URLSearchParams(location.search).get('lang');if(q==='en'||q==='vi'){store.set('td_game_lang',q);return q}return store.get('td_game_lang','en')})();
const U=s=>(UI[lang]&&UI[lang][s])||s,L=(en,vi)=>lang==='vi'&&vi!=null?vi:en;
const num=x=>{let s=String(+(+x).toFixed(4));if(lang==='vi')s=s.replace('.',',');return s.replace(/^-/,'−')};
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove('show'),2200)}
function tone(f,d,t='sine',at=0,v=.15,f2){if(muted)return;ac=ac||new (window.AudioContext||window.webkitAudioContext)();const o=ac.createOscillator(),g=ac.createGain(),s=ac.currentTime+at;o.type=t;o.frequency.setValueAtTime(f,s);if(f2)o.frequency.exponentialRampToValueAtTime(f2,s+d);g.gain.setValueAtTime(v,s);g.gain.exponentialRampToValueAtTime(.001,s+d);o.connect(g).connect(ac.destination);o.start(s);o.stop(s+d)}
function sfx(k){if(k==='ok'){tone(660,.12);tone(880,.18,'sine',.1);fx.sparkle();fx.mascot('cheer');fx.streakHit()}
else if(k==='bad'){tone(220,.25,'sawtooth',0,.1);fx.flash();fx.mascot('sad');fx.streakReset()}
else if(k==='win'){[523,659,784,1047].forEach((f,i)=>tone(f,.25,'triangle',i*.12));fx.confetti();fx.mascot('cheer')}
else if(k==='tick'){tone(900,.05,'square',0,.05)}
else if(k==='pop'){tone(520,.08,'sine',0,.12,900)}
else if(k==='whoosh'){tone(300,.3,'triangle',0,.06,1400)}
else if(k==='fanfare'){[[523,0],[523,.14],[659,.28],[784,.42],[1047,.62]].forEach(([f,t])=>tone(f,t>.6?.5:.16,'triangle',t,.13))}
else if(k==='drum'){for(let i=0;i<12;i++)tone(140+i*4,.06,'triangle',i*.07,.05+i*.006)}}
function speak(text){if(muted||!window.speechSynthesis)return;speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang=lang==='vi'?'vi-VN':'en-US';u.rate=.85;speechSynthesis.speak(u)}
function saveTeams(){store.set('td_teams_'+cfg.id,{teams,act})}
function renderTeams(){const box=$('#td-teams .list');box.innerHTML='';teams.forEach((t,i)=>{const d=document.createElement('div');d.className='team'+(i===act?' act':'');
d.innerHTML=`<span class="nm" contenteditable="true" spellcheck="false"></span><span class="sc">${t.score}</span><span class="pm"><button aria-label="minus one">−1</button><button aria-label="plus one">+1</button></span>`;
const nm=$('.nm',d);nm.textContent=t.name;nm.onclick=e=>e.stopPropagation();nm.oninput=()=>{t.name=nm.textContent;saveTeams()};
d.onclick=()=>{act=i;saveTeams();renderTeams()};
const b=d.querySelectorAll('.pm button');b[0].onclick=e=>{e.stopPropagation();award(-1,i)};b[1].onclick=e=>{e.stopPropagation();award(1,i)};box.appendChild(d)});}
function award(n,i=act){const was=teams[i].score;teams[i].score=Math.max(0,was+n);saveTeams();renderTeams();fx.scored(i,was,teams[i].score)}
function nextTeam(){act=(act+1)%teams.length;fx.streakReset();saveTeams();renderTeams()}
function sendScores(){store.set('td_scoreboard_transfer',{teams:teams.map(t=>({name:t.name,score:t.score})),from:cfg.title,ts:Date.now()});toast(U('Scores sent to the Scoreboard widget'))}
function init(c){cfg=c;lang=(c.langs||['en']).includes(want)?want:'en';document.documentElement.lang=lang;
const q=new URLSearchParams(location.search).get('level');
level=LV.includes(q)?q:store.get('td_level_'+c.id,'easy');
const s=store.get('td_teams_'+c.id,null);teams=s?s.teams:[{name:U('Team')+' 1',score:0},{name:U('Team')+' 2',score:0}];act=s?s.act:0;
$('#td-header').className='hdr';
const multi=(c.langs||[]).length>1;
$('#td-header').innerHTML=`<h1>${c.title}</h1><div class="lv" role="group" aria-label="${U('Difficulty')}">${LV.map(l=>`<button data-l="${l}">${U(LN[l])}</button>`).join('')}</div><a class="hbtn" href="${lang==='vi'&&multi?'instructions.vi.html':'instructions.html'}" target="_blank" rel="noopener">${U('How to play')}</a><button class="hbtn" id="mute">${U('Sound on')}</button><button class="hbtn" id="motion" title="${U('Animations: full, reduced or off')}"></button>${multi?`<button class="hbtn" id="langB" lang="${lang==='vi'?'en':'vi'}">${lang==='vi'?'English':'Tiếng Việt'}</button>`:''}`;
if(multi)$('#langB').onclick=()=>{const u=new URL(location.href);u.searchParams.set('lang',lang==='vi'?'en':'vi');u.searchParams.set('level',level);location.replace(u.href)};
if(lang==='vi')document.querySelectorAll('[data-vi]').forEach(e=>e.textContent=e.dataset.vi);
$('#td-teams').className='side';
$('#td-teams').innerHTML=`<h2>${U('Teams')}</h2><div class="list"></div><div class="row"><button class="btn ghost" id="addT">${U('+ Team')}</button><button class="btn ghost" id="rstT">${U('Reset scores')}</button></div><div class="row"><button class="btn ghost" id="podT">\u{1F3C6} ${U('Podium')}</button><button class="btn" id="sendT">${U('Send to Scoreboard')}</button></div>`;
$('#mute').onclick=()=>{muted=!muted;$('#mute').textContent=U(muted?'Sound off':'Sound on');if(muted&&window.speechSynthesis)speechSynthesis.cancel()};
$('#motion').onclick=()=>fx.cycleMotion();
$('#addT').onclick=()=>{if(teams.length<6){teams.push({name:U('Team')+' '+(teams.length+1),score:0});saveTeams();renderTeams()}else toast(U('Six teams is the maximum'))};
$('#rstT').onclick=()=>{teams.forEach(t=>t.score=0);saveTeams();renderTeams();toast(U('Scores reset'))};
$('#sendT').onclick=sendScores;
$('#podT').onclick=()=>fx.podium();
document.querySelectorAll('.lv button').forEach(b=>b.onclick=()=>setLevel(b.dataset.l));
fx.start();setLevel(level,true);renderTeams()}
function setLevel(l,first){level=l;store.set('td_level_'+cfg.id,l);fx.streakReset();document.querySelectorAll('.lv button').forEach(b=>b.classList.toggle('on',b.dataset.l===l));cfg.onLevel(l,first)}
const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const rnd=(a,b)=>Math.floor(Math.random()*(b-a+1))+a;

/* ---- TD.fx: the effects layer. Every game gets these through the calls it already makes: sfx('ok') sparkles, cheers
   and counts the streak, sfx('bad') flashes red, sfx('win') throws confetti, award() flies the points to the team card.
   Games may also call TD.fx.ring(el), .banner(title, sub), .shake(el), .podium(), .sparkle(x, y), .mascot(pose).
   Motion (header button, kept for all games on this device): full, reduced (fades only: no confetti, sparkles, flight
   or shaking) or off. It starts at reduced when the device asks for reduced motion. Built with the Web Animations API
   and one canvas: no libraries, nothing loaded from the web, nothing runs while the tab is hidden. ---- */
const fx=(()=>{
const MOT=['full','reduced','off'],MN={full:'Motion: full',reduced:'Motion: reduced',off:'Motion: off'};
let motion=store.get('td_motion',null);
if(!MOT.includes(motion))motion=(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches)?'reduced':'full';
const full=()=>motion==='full',still=()=>motion==='off';
let last={x:innerWidth/2,y:innerHeight/3,el:null},cv,cx,parts=[],raf=0,streak=0,mas,blinkT;
addEventListener('pointerdown',e=>{last={x:e.clientX,y:e.clientY,el:e.target}},true);
const anim=(el,k,o)=>el&&el.animate?el.animate(k,o):null;
/* run fn once when the animation ends, or after ms anyway (a hidden tab may never finish it) */
const done=(a,fn,ms)=>{let once=false;const go=()=>{if(!once){once=true;fn()}};if(a)a.onfinish=go;setTimeout(go,ms+150)};
const CSS=`#td-fx{position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:50}
.td-fly{position:fixed;z-index:51;pointer-events:none;font-family:'Baloo 2',sans-serif;font-weight:800;font-size:2.2rem;color:var(--gold,#f5c542);text-shadow:0 2px 10px rgba(0,0,0,.55);left:0;top:0}
.td-flash{position:fixed;inset:0;pointer-events:none;z-index:49;box-shadow:inset 0 0 0 6px var(--bad,#ef5350),inset 0 0 90px rgba(239,83,80,.45);opacity:0}
.td-banner{position:fixed;left:0;right:0;top:34%;z-index:52;pointer-events:none;text-align:center;padding:18px 12px;background:linear-gradient(90deg,transparent,rgba(20,34,80,.97) 14%,rgba(20,34,80,.97) 86%,transparent);border-block:3px solid var(--gold,#f5c542)}
.td-banner b{display:block;font-family:'Baloo 2',sans-serif;font-size:clamp(2.2rem,6vw,3.8rem);line-height:1.05;color:var(--gold,#f5c542)}
.td-banner span{font-weight:600;font-size:1.15rem;color:var(--ink,#eef2ff)}
.td-streak{position:fixed;left:50%;top:92px;z-index:52;pointer-events:none;white-space:nowrap;background:linear-gradient(135deg,#ff9f1c,#ff3d6e);color:#fff;font-family:'Baloo 2',sans-serif;font-weight:800;font-size:1.5rem;padding:6px 22px;border-radius:999px;box-shadow:0 6px 26px rgba(255,80,60,.45)}
.td-ring{position:relative;display:inline-grid;place-items:center;width:92px;height:92px;flex:none}
.td-ring svg{position:absolute;inset:0;transform:rotate(-90deg)}
.td-ring circle{fill:none;stroke-width:8}.td-ring .bg{stroke:var(--panel2,#1c2f6b)}
.td-ring .fg{stroke:var(--blue,#4da3ff);stroke-linecap:round;transition:stroke-dashoffset .95s linear,stroke .3s}
.td-ring.warn .fg{stroke:var(--gold,#f5c542)}.td-ring.low .fg{stroke:var(--bad,#ef5350)}
.td-ring>:not(svg){position:relative;font-size:1.7rem!important;line-height:1}
.team.td-glow{box-shadow:0 0 0 3px var(--gold,#f5c542),0 0 26px rgba(245,197,66,.55)}
.td-mascot{position:fixed;left:14px;bottom:10px;width:84px;height:84px;z-index:48;pointer-events:none;filter:drop-shadow(0 6px 10px rgba(0,0,0,.4))}
.td-mascot .sad,.td-mascot.is-sad .happy{display:none}.td-mascot.is-sad .sad{display:inline}
@media(max-width:700px){.td-mascot{width:56px;height:56px}}
.td-pod{position:fixed;inset:0;z-index:60;display:grid;place-items:center;background:rgba(5,10,30,.84);padding:16px}
.td-pod .box{background:var(--panel,#142250);border:3px solid var(--gold,#f5c542);border-radius:22px;padding:22px 26px;text-align:center;width:min(620px,100%)}
.td-pod h2{font-size:2.2rem;color:var(--gold,#f5c542);margin:0}
.td-pod .cols{display:flex;align-items:flex-end;justify-content:center;gap:12px;height:290px;margin:14px 0 18px}
.td-pod .col{flex:0 1 150px;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%}
.td-pod .medal{font-size:2.2rem;line-height:1}
.td-pod .nm{font-family:'Baloo 2',sans-serif;font-weight:700;font-size:1.25rem;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.td-pod .bar{width:100%;border-radius:14px 14px 0 0;display:flex;justify-content:center;padding-top:8px;font-family:'Baloo 2',sans-serif;font-weight:800;font-size:2.1rem;color:#2a2000;transform-origin:bottom}
.td-pod .p1 .bar{height:62%;background:linear-gradient(#ffe07a,var(--gold,#f5c542))}.td-pod .p2 .bar{height:44%;background:linear-gradient(#eef2ff,#b9c4dc)}.td-pod .p3 .bar{height:30%;background:linear-gradient(#f2c08f,#d08a4c)}
.td-pod .rest{color:var(--muted,#9fb0d8);margin:0 0 14px}
.td-pod .acts{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.td-scene{position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden}.td-scene>svg{width:100%;height:100%;display:block}
.td-scened body{background:transparent}.td-scened .hdr{background:rgba(20,34,80,.9)}
.td-scened .stage,.td-scened .side{background:rgba(20,34,80,.7);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)}
.td-slash{position:fixed;height:7px;border-radius:7px;pointer-events:none;z-index:51;transform-origin:left center;background:linear-gradient(90deg,transparent,#fff 30%,var(--gold,#f5c542) 70%,transparent);box-shadow:0 0 18px rgba(255,255,255,.8)}
.td-critter{position:fixed;left:0;top:0;width:56px;height:56px;pointer-events:none;z-index:51}.td-critter svg{width:100%;height:100%}`;
function start(){const st=document.createElement('style');st.textContent=CSS;document.head.appendChild(st);
cv=document.createElement('canvas');cv.id='td-fx';cv.setAttribute('aria-hidden','true');document.body.appendChild(cv);cx=cv.getContext('2d');size();addEventListener('resize',size);
mascotMake();label();document.addEventListener('visibilitychange',()=>{if(sceneEl)sceneEl.getAnimations({subtree:true}).forEach(a=>document.hidden?a.pause():a.play());if(document.hidden){parts=[];cancelAnimationFrame(raf);raf=0;cx.clearRect(0,0,cv.width,cv.height)}})}
function size(){const r=devicePixelRatio||1;cv.width=innerWidth*r;cv.height=innerHeight*r;cx.setTransform(r,0,0,r,0,0)}
function label(){const b=$('#motion');if(b)b.textContent=U(MN[motion]);document.documentElement.dataset.motion=motion}
function cycleMotion(){motion=MOT[(MOT.indexOf(motion)+1)%3];store.set('td_motion',motion);label();toast(U(MN[motion]));if(!full()){parts=[]}sceneMove()}
/* particles: one canvas over the page, drawn only while something is moving, at most 160 pieces */
const COL=['#f5c542','#3ddbb0','#4da3ff','#ff6fae','#ffffff'];
function add(p){if(parts.length<160)parts.push(p)}
function loop(){cx.clearRect(0,0,innerWidth,innerHeight);parts=parts.filter(p=>p.t<p.life);
for(const p of parts){p.t++;p.vy+=p.g;p.vx*=p.drag;p.vy*=p.drag;p.x+=p.vx;p.y+=p.vy;p.r+=p.vr;p.s+=p.ds||0;const a=1-Math.pow(p.t/p.life,3);cx.globalAlpha=Math.max(0,a);cx.fillStyle=p.c;
cx.save();cx.translate(p.x,p.y);cx.rotate(p.r);if(p.k==='star'){star(p.s)}else if(p.k==='rect'){cx.fillRect(-p.s/2,-p.s/4,p.s,p.s/2)}else{cx.beginPath();cx.arc(0,0,p.s/2,0,7);cx.fill()}cx.restore()}
cx.globalAlpha=1;raf=parts.length?requestAnimationFrame(loop):0}
function star(s){cx.beginPath();for(let i=0;i<10;i++){const r=i%2?s*.22:s*.55,a=i*Math.PI/5;cx.lineTo(Math.sin(a)*r,-Math.cos(a)*r)}cx.closePath();cx.fill()}
function go(){if(!cx){parts=[];return}if(!raf&&parts.length&&!document.hidden)raf=requestAnimationFrame(loop)}
function sparkle(x=last.x,y=last.y){if(!full())return;for(let i=0;i<18;i++){const a=Math.random()*7,v=2+Math.random()*5;add({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-1.5,g:.12,drag:.96,r:0,vr:(Math.random()-.5)*.3,s:8+Math.random()*10,k:i%3?'star':'dot',c:COL[i%COL.length],t:0,life:38+Math.random()*24})}go()}
function confetti(n=130){if(!full())return;for(let i=0;i<n;i++){add({x:Math.random()*innerWidth,y:-20-Math.random()*innerHeight*.5,vx:(Math.random()-.5)*3,vy:2+Math.random()*3,g:.05,drag:.995,r:Math.random()*6,vr:(Math.random()-.5)*.25,s:9+Math.random()*8,k:i%5?'rect':'dot',c:COL[i%COL.length],t:0,life:200+Math.random()*80})}go()}
function flash(){if(still())return;const d=document.createElement('div');d.className='td-flash';document.body.appendChild(d);const a=anim(d,[{opacity:0},{opacity:1,offset:.25},{opacity:0}],{duration:420,easing:'ease-out'});done(a,()=>d.remove(),420)}
function shake(el){if(!full()||!el)return;anim(el,[{transform:'translateX(0)'},{transform:'translateX(-10px)'},{transform:'translateX(9px)'},{transform:'translateX(-6px)'},{transform:'translateX(4px)'},{transform:'translateX(0)'}],{duration:340})}
/* points fly from where the answer was tapped to the team's card, which glows and counts up */
function scored(i,was,now){const card=document.querySelectorAll('#td-teams .team')[i];if(!card||still())return;const sc=$('.sc',card),gain=now-was;if(!gain)return;
const fromSide=last.el&&last.el.closest&&last.el.closest('#td-teams');const land=()=>{count(sc,was,i);card.classList.add('td-glow');setTimeout(()=>card.classList.remove('td-glow'),700);if(full())anim(card,[{transform:'scale(1)'},{transform:'scale(1.06)'},{transform:'scale(1)'}],{duration:380,easing:'ease-out'})};
if(!full()||fromSide||gain<0){land();return}
const r=sc.getBoundingClientRect(),f=document.createElement('div');f.className='td-fly'+(gain<0?' neg':'');f.textContent=(gain>0?'+':'')+gain;document.body.appendChild(f);sc.textContent=was;
const tx=r.left+r.width/2-20,ty=r.top+r.height/2-24,sx=last.x-20,sy=last.y-40,mx=(sx+tx)/2,my=Math.min(sy,ty)-120;
const a=anim(f,[{transform:`translate(${sx}px,${sy}px) scale(.6)`,opacity:0},{transform:`translate(${sx}px,${sy-30}px) scale(1.5)`,opacity:1,offset:.2},{transform:`translate(${mx}px,${my}px) scale(1.2)`,offset:.55},{transform:`translate(${tx}px,${ty}px) scale(.7)`,opacity:.9}],{duration:720,easing:'cubic-bezier(.5,0,.6,1)'});
done(a,()=>{f.remove();if(sc.isConnected)land();else count($('.sc',document.querySelectorAll('#td-teams .team')[i]),was,i)},720)}
/* counts el up from a to the team's live score; the final number is always written, also in a hidden tab (no frames) */
function count(el,a,i){if(!el)return;const end=()=>teams[i]?teams[i].score:a;if(still()||document.hidden){el.textContent=end();return}const t0=performance.now(),d=450;let over=false;
const fin=()=>{if(!over){over=true;if(el.isConnected)el.textContent=end()}};setTimeout(fin,d+100);
(function step(t){if(over)return;const k=Math.min(1,(t-t0)/d),b=end();el.textContent=Math.round(a+(b-a)*(1-Math.pow(1-k,3)));if(k<1&&el.isConnected)requestAnimationFrame(step);else fin()})(t0)}
/* streaks: counted from sfx('ok') / sfx('bad'), reset on a new team or level; a badge at 3, 5, 10 and every 5 after */
function streakHit(){streak++;if(streak===3||streak===5||(streak>=10&&streak%5===0))badge('\u{1F525} '+streak+' '+U('in a row!'))}
function streakReset(){streak=0}
function badge(text){if(still())return;const d=document.createElement('div');d.className='td-streak';d.textContent=text;document.body.appendChild(d);sfx('pop');
const a=full()?anim(d,[{transform:'translateX(-50%) scale(.3)',opacity:0},{transform:'translateX(-50%) scale(1.15)',opacity:1,offset:.18},{transform:'translateX(-50%) scale(1)',offset:.3},{transform:'translateX(-50%) scale(1)',opacity:1,offset:.85},{transform:'translateX(-50%) translateY(-20px)',opacity:0}],{duration:1600}):anim(d,[{transform:'translateX(-50%)',opacity:0},{opacity:1,offset:.15},{opacity:1,offset:.85},{transform:'translateX(-50%)',opacity:0}],{duration:1600});
done(a,()=>d.remove(),1600)}
/* banner across the middle: round starts, a team's turn, level up */
function banner(title,sub=''){const d=document.createElement('div');d.className='td-banner';d.setAttribute('role','status');d.innerHTML='<b></b><span></span>';d.firstChild.textContent=title;d.lastChild.textContent=sub;document.body.appendChild(d);sfx('whoosh');
const k=full()?[{transform:'translateX(-100%)',opacity:0},{transform:'translateX(0)',opacity:1,offset:.18},{transform:'translateX(0)',opacity:1,offset:.8},{transform:'translateX(100%)',opacity:0}]:[{opacity:0},{opacity:1,offset:.15},{opacity:1,offset:.8},{opacity:0}];
const a=still()?null:anim(d,k,{duration:1600,easing:'cubic-bezier(.2,.8,.2,1)'});done(a,()=>d.remove(),1600)}
/* timer ring around a game's own time readout: r = TD.fx.ring(el); r.set(secondsLeft, secondsTotal) */
function ring(el){if(el.parentNode&&el.parentNode.classList.contains('td-ring'))return el.parentNode._ring;
const w=document.createElement('span');w.className='td-ring';const C=2*Math.PI*40;w.innerHTML=`<svg viewBox="0 0 92 92" aria-hidden="true"><circle class="bg" cx="46" cy="46" r="40"/><circle class="fg" cx="46" cy="46" r="40" stroke-dasharray="${C}" stroke-dashoffset="0"/></svg>`;
el.parentNode.insertBefore(w,el);w.appendChild(el);const fg=w.querySelector('.fg');
const api={set(left,total){fg.style.transition=still()?'none':'';fg.style.strokeDashoffset=C*(1-Math.max(0,Math.min(1,left/total)));w.classList.toggle('warn',left<=10&&left>5);w.classList.toggle('low',left<=5);
if(left<=5&&left>0&&full())anim(w,[{transform:'scale(1)'},{transform:'scale(1.08)'},{transform:'scale(1)'}],{duration:300})},reset(){api.set(1,1)}};w._ring=api;return api}
/* podium: 1st, 2nd, 3rd rise from the team scores; also in the Teams panel */
function podium(){$('.td-pod')&&$('.td-pod').remove();const order=teams.map((t,i)=>({...t,i})).sort((a,b)=>b.score-a.score),top=order.slice(0,3),rest=order.slice(3);
const M=['\u{1F947}','\u{1F948}','\u{1F949}'],place=[1,0,2].filter(p=>p<top.length);
const o=document.createElement('div');o.className='td-pod';o.setAttribute('role','dialog');o.setAttribute('aria-label','Podium');
o.innerHTML=`<div class="box"><h2>${cfg.title}: ${U('the podium')}</h2><div class="cols"></div><p class="rest"></p><div class="acts"><button class="btn" data-a="send">${U('Send to Scoreboard')}</button><button class="btn ghost" data-a="close">${U('Close')}</button></div></div>`;
const cols=$('.cols',o);place.forEach(p=>{const t=top[p],c=document.createElement('div');c.className='col p'+(p+1);c.innerHTML='<div class="medal"></div><div class="nm"></div><div class="bar"></div>';$('.medal',c).textContent=M[Math.min(2,order.filter(o=>o.score>t.score).length)];$('.nm',c).textContent=t.name;$('.bar',c).textContent=t.score;cols.appendChild(c)});
$('.rest',o).textContent=rest.map(t=>`${order.filter(o=>o.score>t.score).length+1}. ${t.name} ${t.score}`).join('   ');
const close=()=>{o.remove();removeEventListener('keydown',esc)},esc=e=>{if(e.key==='Escape')close()};
o.onclick=e=>{const a=e.target.dataset&&e.target.dataset.a;if(a==='send'){sendScores()}if(a==='close'||e.target===o)close()};addEventListener('keydown',esc);document.body.appendChild(o);$('[data-a=close]',o).focus();
if(still()){return}sfx('drum');
const bars=[...o.querySelectorAll('.col')].map(c=>({c,p:+c.className.match(/p(\d)/)[1]})).sort((a,b)=>b.p-a.p);
bars.forEach(({c},k)=>{const kids=[$('.bar',c),$('.nm',c),$('.medal',c)];kids.forEach(e=>e.style.opacity=0);setTimeout(()=>{kids.forEach(e=>e.style.opacity='');
if(full())anim($('.bar',c),[{transform:'scaleY(0)'},{transform:'scaleY(1.04)',offset:.8},{transform:'scaleY(1)'}],{duration:600,easing:'ease-out'});else anim(c,[{opacity:0},{opacity:1}],{duration:400});
if(k===bars.length-1){setTimeout(()=>{sfx('fanfare');confetti(160);mascot('cheer')},500)}},300+k*700)})}
/* mascot: Deckie, the TeachersDeck owl in a graduation cap. Poses: cheer, sad; blinks now and then. */
function mascotMake(){mas=document.createElement('div');mas.className='td-mascot';mas.setAttribute('aria-hidden','true');
mas.innerHTML=`<svg viewBox="0 0 100 100"><g class="body"><ellipse cx="50" cy="92" rx="22" ry="4" fill="rgba(0,0,0,.25)"/>
<g class="wing l"><path d="M20 58c-9 6-11 18-5 24 5-1 10-8 11-16z" fill="#c9962a"/></g><g class="wing r"><path d="M80 58c9 6 11 18 5 24-5-1-10-8-11-16z" fill="#c9962a"/></g>
<path d="M50 30c18 0 30 13 30 31S68 90 50 90 20 79 20 61s12-31 30-31z" fill="#f5c542"/><path d="M50 52c11 0 18 8 18 17s-8 17-18 17-18-8-18-17 7-17 18-17z" fill="#fde9a6"/>
<path d="M38 74l4 3M48 76l4 3M58 74l4 3" stroke="#e3b23c" stroke-width="2" stroke-linecap="round"/>
<g class="eyes"><circle cx="39" cy="51" r="9" fill="#fff"/><circle cx="61" cy="51" r="9" fill="#fff"/><circle cx="40" cy="52" r="4.5" fill="#1b2350"/><circle cx="62" cy="52" r="4.5" fill="#1b2350"/><circle cx="41.5" cy="50.5" r="1.5" fill="#fff"/><circle cx="63.5" cy="50.5" r="1.5" fill="#fff"/></g>
<path d="M46 60l4 5 4-5z" fill="#ff9f1c"/><path class="happy" d="M44 67q6 5 12 0" stroke="#7a4b00" stroke-width="2.4" fill="none" stroke-linecap="round"/><path class="sad" d="M44 70q6-5 12 0" stroke="#7a4b00" stroke-width="2.4" fill="none" stroke-linecap="round"/>
<circle cx="31" cy="62" r="3.5" fill="#ff6fae" opacity=".55"/><circle cx="69" cy="62" r="3.5" fill="#ff6fae" opacity=".55"/>
<path d="M22 30l28-12 28 12-28 12z" fill="#1b2350"/><path d="M36 35v8c8 5 20 5 28 0v-8l-14 6z" fill="#26306a"/><path d="M78 30v14" stroke="#f5c542" stroke-width="2"/><circle cx="78" cy="46" r="3" fill="#f5c542"/></g></svg>`;
document.body.appendChild(mas);blinkT=setInterval(()=>{if(!document.hidden&&!still())anim(mas.querySelector('.eyes'),[{transform:'scaleY(1)'},{transform:'scaleY(.1)'},{transform:'scaleY(1)'}],{duration:180})},4200);
const e=mas.querySelector('.eyes');e.style.transformOrigin='50px 51px';e.style.transformBox='view-box'}
function mascot(p){if(!mas||still())return;const b=mas.querySelector('.body');clearTimeout(mas._h);mas.classList.toggle('is-sad',p==='sad');
if(p==='cheer'&&full()){anim(b,[{transform:'translateY(0)'},{transform:'translateY(-16px) rotate(-6deg)'},{transform:'translateY(0)'},{transform:'translateY(-8px) rotate(5deg)'},{transform:'translateY(0)'}],{duration:620,easing:'ease-out'});
['l','r'].forEach((s,k)=>{const w=mas.querySelector('.wing.'+s);w.style.transformBox='fill-box';w.style.transformOrigin=k?'0% 0%':'100% 0%';anim(w,[{transform:'rotate(0)'},{transform:`rotate(${k?-50:50}deg)`},{transform:'rotate(0)'},{transform:`rotate(${k?-40:40}deg)`},{transform:'rotate(0)'}],{duration:620})})}
else if(p==='sad'&&full()){anim(b,[{transform:'translateY(0)'},{transform:'translateY(5px) rotate(-3deg)'},{transform:'translateY(5px) rotate(3deg)'},{transform:'translateY(0)'}],{duration:700})}
if(p==='sad')mas._h=setTimeout(()=>mas.classList.remove('is-sad'),1200)}
/* scenes: a game passes its own SVG backdrop (viewBox 0 0 1600 900, preserveAspectRatio xMidYMid slice). Elements with
   data-fx move slowly in full motion: drift:<px>:<s> sways sideways, bob:<px>:<s> up and down, float:<dy>:<s> rises and
   starts again, twinkle:<s> fades in and out, spin:<s> turns. Panels turn see-through so the scene shows behind them. */
let sceneEl=null;
function scene(svg){if(sceneEl)sceneEl.remove();sceneEl=document.createElement('div');sceneEl.className='td-scene';sceneEl.setAttribute('aria-hidden','true');sceneEl.innerHTML=svg;document.body.prepend(sceneEl);document.documentElement.classList.add('td-scened');sceneMove();return sceneEl}
function sceneMove(){if(!sceneEl||!sceneEl.getAnimations)return;sceneEl.getAnimations({subtree:true}).forEach(a=>a.cancel());if(!full())return;
sceneEl.querySelectorAll('[data-fx]').forEach(el=>{const [k,a,b]=el.dataset.fx.split(':'),A=+a,D=(+b||A||10)*1000,o={duration:k==='twinkle'||k==='spin'?A*1000:D,iterations:Infinity,easing:'ease-in-out'};o.delay=-Math.random()*o.duration;
el.style.transformBox='fill-box';el.style.transformOrigin='center';let a2;
if(k==='drift')a2=anim(el,[{transform:'translateX(0)'},{transform:`translateX(${A}px)`},{transform:'translateX(0)'}],o);
else if(k==='bob')a2=anim(el,[{transform:'translateY(0)'},{transform:`translateY(${A}px)`},{transform:'translateY(0)'}],o);
else if(k==='float')a2=anim(el,[{transform:'translateY(0)',opacity:0},{opacity:1,offset:.1},{opacity:1,offset:.85},{transform:`translateY(${A}px)`,opacity:0}],{...o,easing:'linear'});
else if(k==='twinkle')a2=anim(el,[{opacity:1},{opacity:.2},{opacity:1}],o);
else if(k==='spin')a2=anim(el,[{transform:'rotate(0)'},{transform:'rotate(360deg)'}],{...o,easing:'linear'});
if(a2&&document.hidden)a2.pause()})}
/* moves: const m = TD.fx.moves(root); redraw(); m();  elements with the same data-k glide from where they were to where
   the redraw put them (in an arc when the move is long) and land with a small squash; new ones pop in. */
function moves(root=document){const before=new Map();root.querySelectorAll('[data-k]').forEach(e=>before.set(e.dataset.k,e.getBoundingClientRect()));
return()=>{if(still())return;root.querySelectorAll('[data-k]').forEach(e=>{const b=before.get(e.dataset.k);if(!b){pop(e);return}if(!full())return;const a=e.getBoundingClientRect(),dx=b.left-a.left,dy=b.top-a.top;if(Math.abs(dx)+Math.abs(dy)<2)return;
const lift=Math.min(140,Math.hypot(dx,dy)*.3),z=e.style.zIndex,ps=e.style.position;e.style.zIndex=5;if(getComputedStyle(e).position==='static')e.style.position='relative';
const an=anim(e,[{transform:`translate(${dx}px,${dy}px)`},{transform:`translate(${dx/2}px,${dy/2-lift}px) scale(1.08)`,offset:.5},{transform:'translate(0,0) scale(1)',offset:.84},{transform:'scale(1.07,.93)',offset:.92},{transform:'none'}],{duration:500,easing:'ease-out'});done(an,()=>{e.style.zIndex=z;e.style.position=ps},500)})}}
/* pop one element in; deal pops a container's children in turn */
function pop(el,delay=0){if(still()||!el)return;anim(el,full()?[{transform:'scale(.4)',opacity:0},{transform:'scale(1.1)',opacity:1,offset:.7},{transform:'scale(1)',opacity:1}]:[{opacity:0},{opacity:1}],{duration:320,delay,easing:'ease-out',fill:'backwards'})}
function deal(box){if(box)[...box.children].forEach((c,i)=>pop(c,i*60))}
/* a blade of light across an element (a right answer in Number Ninja) */
function slash(el){if(!full()||!el)return;const r=el.getBoundingClientRect(),d=document.createElement('div');d.className='td-slash';d.style.left=(r.left-10)+'px';d.style.top=(r.top+r.height*.62)+'px';d.style.width=(r.width+20)+'px';document.body.appendChild(d);sfx('whoosh');
done(anim(d,[{transform:'rotate(-14deg) scaleX(0)',opacity:1},{transform:'rotate(-14deg) scaleX(1)',opacity:1,offset:.45},{transform:'rotate(-14deg) scaleX(1)',opacity:0}],{duration:420,easing:'ease-out'}),()=>d.remove(),420)}
/* a gold glow round an element; a wave hops its children one after another */
function glow(el){if(still()||!el)return;anim(el,[{boxShadow:'0 0 0 0 rgba(245,197,66,0)'},{boxShadow:'0 0 0 6px rgba(245,197,66,.6),0 0 46px rgba(245,197,66,.55)',offset:.35},{boxShadow:'0 0 0 0 rgba(245,197,66,0)'}],{duration:1300})}
function wave(box){if(!full()||!box)return;[...box.children].forEach((c,i)=>anim(c,[{transform:'none'},{transform:'translateY(-14px)',offset:.4},{transform:'none'}],{duration:440,delay:i*70,easing:'ease-out'}))}
/* dust kicked up at a point (Tug of War's feet) */
function puff(x,y){if(!full())return;for(let i=0;i<10;i++)add({x:x+(Math.random()-.5)*20,y,vx:(Math.random()-.5)*2.4,vy:-.3-Math.random()*1.2,g:-.01,drag:.97,r:0,vr:0,s:8+Math.random()*8,ds:.45,k:'dot',c:'rgba(214,222,236,.75)',t:0,life:34+Math.random()*16});go()}
/* a little creature (the game's own SVG) flies across an element, bobbing */
function critter(el,svg,ms=1300){if(!full()||!el)return;const r=el.getBoundingClientRect(),d=document.createElement('div');d.className='td-critter';d.innerHTML=svg;document.body.appendChild(d);
const y=r.top+r.height/2-46,k=[];for(let i=0;i<=8;i++){const t=i/8;k.push({transform:`translate(${r.left-50+(r.width+60)*t}px,${y+Math.sin(t*Math.PI*3)*16}px) rotate(${Math.cos(t*Math.PI*3)*10}deg)`})}
done(anim(d,k,{duration:ms,easing:'ease-in-out'}),()=>d.remove(),ms)}
/* a line or arrow draws itself from the left */
function drawIn(el,delay=0){if(still()||!el)return;anim(el,full()?[{transform:'scaleX(0)',transformOrigin:'left center'},{transform:'scaleX(1)',transformOrigin:'left center'}]:[{opacity:0},{opacity:1}],{duration:300,delay,easing:'ease-out',fill:'backwards'})}
return{start,cycleMotion,sparkle,confetti,flash,shake,scored,streakHit,streakReset,banner,ring,podium,mascot,scene,moves,pop,deal,slash,glow,wave,puff,critter,drawIn,get motion(){return motion}}})();
return{init,toast,sfx,speak,award,nextTeam,shuffle,rnd,fx,L,num,get lang(){return lang},get level(){return level},get team(){return teams[act]},get teamIndex(){return act},get teamCount(){return teams.length}}})();

const $=s=>document.querySelector(s);
/* Parts of Speech Blaster: words drift across space as asteroids; tap only the kind of word asked for. The kind changes
   every 15 seconds. Words were picked to be clearly one part of speech in everyday use (no "run", "dance", "cook"). */
const W={
noun:['apple','teacher','river','chair','garden','pencil','rabbit','mountain','window','kitchen','doctor','bridge','flower','school','banana','island','village','blanket','lemon','elephant'],
verb:['swim','write','sing','eat','climb','throw','carry','build','listen','borrow','bring','choose','forget','explain','arrive','whisper','grow','sit','speak','think'],
adjective:['happy','tall','noisy','bright','heavy','gentle','brave','empty','delicious','famous','careful','sleepy','ancient','narrow','wooden','curious','friendly','honest','huge','shiny'],
adverb:['quickly','slowly','quietly','loudly','carefully','happily','often','never','always','soon','badly','easily','gently','suddenly','nearly','rarely','finally','bravely','politely','sometimes'],
pronoun:['they','she','him','we','us','them','myself','everyone','someone','nobody','yours','ours','theirs','himself','ourselves','whom','mine','anything','itself','herself'],
preposition:['under','between','beside','among','through','during','across','behind','without','towards','beneath','against','despite','onto','into','above','beyond','except','upon','throughout'],
conjunction:['and','but','or','because','although','unless','whereas','whether','though','if','nor','whenever','wherever','so','even though']};
const NAME={noun:'nouns',verb:'verbs',adjective:'adjectives',adverb:'adverbs',pronoun:'pronouns',preposition:'prepositions',conjunction:'conjunctions'};
const CFG={easy:{kinds:['noun','verb'],time:60,pts:1,pen:0,speed:[38,64],every:1150,max:6},
moderate:{kinds:['noun','verb','adjective','adverb'],time:60,pts:1,pen:1,speed:[52,86],every:950,max:7},
hard:{kinds:['pronoun','preposition','conjunction'],time:60,pts:2,pen:1,speed:[62,100],every:900,max:7}};
let run=false,left,timer,spawnT,target,order=[],rocks=[],raf=0,lastT=0,hits=0,misses=0,streak=0,best=0,ring;
const rnd=(a,b)=>a+Math.random()*(b-a),pick=a=>a[Math.floor(Math.random()*a.length)];
function field(){return $('#field')}
function stats(){$('#nh').textContent=hits;$('#nm').textContent=misses;$('#nb').textContent=best}
function setTarget(k,announce){target=k;$('#target').innerHTML='Tap the <b>'+NAME[k]+'</b>!';if(announce)TD.fx.banner('Tap the '+NAME[k]+'!',TD.team.name)}
function nextTarget(){if(!order.length)order=TD.shuffle(CFG[TD.level].kinds.filter(k=>k!==target));setTarget(order.shift(),true)}
function spawn(){const c=CFG[TD.level],f=field();if(!run||rocks.length>=c.max)return;
const want=Math.random()<.45,kinds=c.kinds.filter(k=>want?k===target:k!==target),kind=pick(kinds),onField=new Set(rocks.map(r=>r.word));
const words=W[kind].filter(w=>!onField.has(w));if(!words.length)return;const word=pick(words);
const el=document.createElement('button');el.className='rock';el.textContent=word;f.appendChild(el);
const fw=f.clientWidth,fh=f.clientHeight,w=el.offsetWidth,h=el.offsetHeight,fromLeft=Math.random()<.5,sp=rnd(...c.speed);
const r={el,kind,word,w,x:fromLeft?-w:fw,y0:rnd(10,Math.max(12,fh-h-10)),vx:fromLeft?sp:-sp,ph:rnd(0,6),amp:rnd(6,18),spin:rnd(-1,1),dead:false};
el.onclick=()=>tap(r);rocks.push(r);place(r)}
function place(r){const y=r.y0+Math.sin(r.ph)*r.amp,rot=TD.fx.motion==='full'?Math.sin(r.ph*.7)*4*r.spin:0;r.el.style.transform=`translate(${r.x}px,${y}px) rotate(${rot}deg)`}
function loop(t){const dt=Math.max(0,Math.min(.05,(t-lastT)/1000||0));lastT=t;const fw=field().clientWidth;
rocks.forEach(r=>{if(r.dead)return;r.x+=r.vx*dt;r.ph+=dt*1.4;place(r);if(r.x>fw+30||r.x<-r.w-30){r.dead=true;r.el.remove()}});
rocks=rocks.filter(r=>!r.dead);if(run)raf=requestAnimationFrame(loop)}
function tap(r){if(!run||r.dead)return;const c=CFG[TD.level];
if(r.kind===target){r.dead=true;hits++;streak++;best=Math.max(best,streak);TD.award(c.pts);TD.sfx('ok');rocks=rocks.filter(x=>x!==r);
const a=TD.fx.motion==='off'?null:r.el.animate([{scale:'1',opacity:1},{scale:'1.7',opacity:0}],{duration:320,easing:'ease-out'});if(a)a.onfinish=()=>r.el.remove();setTimeout(()=>r.el.remove(),400)}
else{misses++;streak=0;TD.sfx('bad');if(c.pen)TD.award(-c.pen);$('#msg').textContent='"'+r.word+'" is not one of the '+NAME[target]+'.';
r.vx*=-1.25;r.el.classList.add('bad');setTimeout(()=>r.el.classList.remove('bad'),450)}
stats()}
function clear(){rocks.forEach(r=>r.el.remove());rocks=[];cancelAnimationFrame(raf);raf=0}
function reset(){clearInterval(timer);clearInterval(spawnT);run=false;clear();hits=misses=streak=best=0;stats();order=[];target=null;
ring=ring||TD.fx.ring($('#time'));ring.reset();$('#time').textContent=CFG[TD.level].time+'s';$('#time').classList.remove('low');
$("#ready").style.display="";$('#target').innerHTML='';$('#msg').textContent='';$('#prog').textContent=CFG[TD.level].kinds.map(k=>NAME[k]).join(', ');
$('#turn').textContent=TD.team.name+"'s turn";$('#ctl').innerHTML='<button class="btn" id="go">Start round</button>';$('#go').onclick=begin}
function begin(){const c=CFG[TD.level];run=true;left=c.time;hits=misses=streak=best=0;stats();$('#ctl').innerHTML='';$('#msg').textContent='';$("#ready").style.display="none";
order=TD.shuffle(c.kinds);setTarget(order.shift(),true);clock();
timer=setInterval(()=>{left--;clock();if(left<=5&&left>0)TD.sfx('tick');if(left>0&&(c.time-left)%15===0)nextTarget();if(left<=0)end()},1000);
spawn();spawnT=setInterval(spawn,c.every);lastT=performance.now();raf=requestAnimationFrame(loop)}
function clock(){$('#time').textContent=left+'s';$('#time').classList.toggle('low',left<=10);ring.set(left,CFG[TD.level].time)}
function end(){clearInterval(timer);clearInterval(spawnT);run=false;clear();$('#target').innerHTML='Time!';TD.sfx('win');
$('#msg').textContent=TD.team.name+': '+hits+' hits, '+misses+' misses, best streak '+best+'.';TD.nextTeam();
$('#ctl').innerHTML='<button class="btn" id="go">Next team: '+TD.team.name+'</button>'+(TD.teamIndex===0?' <button class="btn ghost" id="pod">\u{1F3C6} Everyone has played: podium</button>':'');
$('#go').onclick=reset;if($('#pod'))$('#pod').onclick=()=>TD.fx.podium()}
addEventListener('resize',()=>{const fw=field().clientWidth;rocks.forEach(r=>{if(r.x>fw)r.x=fw-r.w})});
document.head.insertAdjacentHTML('beforeend','<style>.rock.bad{background:radial-gradient(circle at 30% 28%,#ffa0a0,#c23a3a 58%,#6e1a1a)!important}</style>');

/* deep space: stars, a ringed planet, a nebula, a passing rocket */
let stars='';for(let i=0;i<70;i++){const x=(i*233)%1600,y=(i*97+i*i*3)%900,r=.8+(i%4)*.5;stars+=`<circle${i%3?'':` data-fx="twinkle:${2+i%4}"`} cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity="${.4+(i%5)*.12}"/>`}
const SPACE=`<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="pb-neb" cx=".3" cy=".4" r=".6"><stop offset="0" stop-color="#6a2a8a" stop-opacity=".55"/><stop offset="1" stop-color="#6a2a8a" stop-opacity="0"/></radialGradient>
<radialGradient id="pb-neb2" cx=".75" cy=".7" r=".5"><stop offset="0" stop-color="#1a6a8a" stop-opacity=".45"/><stop offset="1" stop-color="#1a6a8a" stop-opacity="0"/></radialGradient><radialGradient id="pb-pl" cx=".35" cy=".35"><stop offset="0" stop-color="#f7b267"/><stop offset="1" stop-color="#a0522d"/></radialGradient></defs>
<rect width="1600" height="900" fill="#050816"/><rect width="1600" height="900" fill="url(#pb-neb)"/><rect width="1600" height="900" fill="url(#pb-neb2)"/>${stars}
<g transform="translate(1340 720)"><ellipse rx="210" ry="40" fill="none" stroke="#e8c48a" stroke-width="10" opacity=".55" transform="rotate(-18)"/><circle r="120" fill="url(#pb-pl)"/><path d="M-200 30a210 40 -18 0 0 400 -100" fill="none" stroke="#e8c48a" stroke-width="10" opacity=".8" transform="rotate(-18)"/></g>
<circle cx="230" cy="180" r="46" fill="#c9d1e6"/><circle cx="215" cy="170" r="9" fill="#a8b0c8"/><circle cx="245" cy="198" r="6" fill="#a8b0c8"/>
<g data-fx="drift:420:26"><g transform="translate(260 640) rotate(38)"><path d="M0 -40q14 16 14 44v26h-28v-26q0-28 14-44z" fill="#eef2ff"/><circle cy="-6" r="7" fill="#4da3ff"/><path d="M-14 22l-12 16h12zM14 22l12 16h-12z" fill="#ef5350"/><path data-fx="twinkle:.4" d="M-8 32l8 26l8-26z" fill="#ffb347"/></g></g></svg>`;
TD.fx.scene(SPACE);
TD.init({id:'parts-of-speech-blaster',title:'Parts of Speech Blaster',onLevel:()=>reset()});
