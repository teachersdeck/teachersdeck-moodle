/* Body Builder — a built file from the TeachersDeck Game Library Kit. Edit games/kit/ or games/src/body-builder.js, then run games/tools/build_games.py. */
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
function sfx(k){if(SOLO&&round&&round.done&&k!=='pop')return;if(k==='ok'){tone(660,.12);tone(880,.18,'sine',.1);fx.sparkle();fx.mascot('cheer');fx.streakHit();soloCount(true)}
else if(k==='bad'){tone(220,.25,'sawtooth',0,.1);fx.flash();fx.mascot('sad');fx.streakReset();soloCount(false)}
else if(k==='win'){[523,659,784,1047].forEach((f,i)=>tone(f,.25,'triangle',i*.12));fx.confetti();fx.mascot('cheer');if(SOLO&&round&&!round.done)setTimeout(()=>soloEnd(),700)}
else if(k==='tick'){tone(900,.05,'square',0,.05)}
else if(k==='pop'){tone(520,.08,'sine',0,.12,900)}
else if(k==='whoosh'){tone(300,.3,'triangle',0,.06,1400)}
else if(k==='fanfare'){[[523,0],[523,.14],[659,.28],[784,.42],[1047,.62]].forEach(([f,t])=>tone(f,t>.6?.5:.16,'triangle',t,.13))}
else if(k==='drum'){for(let i=0;i<12;i++)tone(140+i*4,.06,'triangle',i*.07,.05+i*.006)}}
function speak(text){if(muted||!window.speechSynthesis)return;speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang=lang==='vi'?'vi-VN':'en-US';u.rate=.85;speechSynthesis.speak(u)}
function saveTeams(){if(SOLO)return;store.set('td_teams_'+cfg.id,{teams,act})}
function renderTeams(){const box=$('#td-teams .list');box.innerHTML='';teams.forEach((t,i)=>{const d=document.createElement('div');d.className='team'+(i===act?' act':'');
d.innerHTML=`<span class="nm" contenteditable="true" spellcheck="false"></span><span class="sc">${t.score}</span><span class="pm"><button aria-label="minus one">−1</button><button aria-label="plus one">+1</button></span>`;
const nm=$('.nm',d);nm.textContent=t.name;nm.onclick=e=>e.stopPropagation();nm.oninput=()=>{t.name=nm.textContent;saveTeams()};
d.onclick=()=>{act=i;saveTeams();renderTeams()};
const b=d.querySelectorAll('.pm button');b[0].onclick=e=>{e.stopPropagation();award(-1,i)};b[1].onclick=e=>{e.stopPropagation();award(1,i)};box.appendChild(d)});}
function award(n,i=act){if(SOLO){if(i!==0||!round||round.done)return;const was=teams[0].score;teams[0].score=Math.max(0,was+n);round.score=teams[0].score;soloPanel();fx.scored(0,was,teams[0].score);return}const was=teams[i].score;teams[i].score=Math.max(0,was+n);saveTeams();renderTeams();fx.scored(i,was,teams[i].score)}
function nextTeam(){if(SOLO)return;act=(act+1)%teams.length;fx.streakReset();saveTeams();renderTeams()}
function sendScores(){store.set('td_scoreboard_transfer',{teams:teams.map(t=>({name:t.name,score:t.score})),from:cfg.title,ts:Date.now()});toast(U('Scores sent to the Scoreboard widget'))}
function init(c){cfg=c;lang=(c.langs||['en']).includes(want)?want:'en';document.documentElement.lang=lang;
const q=new URLSearchParams(location.search).get('level');
level=LV.includes(q)?q:store.get('td_level_'+c.id,'easy');
const s=store.get('td_teams_'+c.id,null);teams=s?s.teams:[{name:U('Team')+' 1',score:0},{name:U('Team')+' 2',score:0}];act=s?s.act:0;
if(SOLO){soloLoad();teams=[{name:US('You'),score:0}];act=0;if(!open(level))level=LV.filter(open).pop()||'easy';document.documentElement.classList.add('td-solo');soloStyle()}
$('#td-header').className='hdr';
const multi=(c.langs||[]).length>1;
$('#td-header').innerHTML=`<h1>${c.title}</h1><div class="lv" role="group" aria-label="${U('Difficulty')}">${LV.map(l=>`<button data-l="${l}">${U(LN[l])}</button>`).join('')}</div><a class="hbtn" href="${lang==='vi'&&multi?'instructions.vi.html':'instructions.html'}" target="_blank" rel="noopener">${U('How to play')}</a><button class="hbtn" id="mute">${U('Sound on')}</button><button class="hbtn" id="motion" title="${U('Animations: full, reduced or off')}"></button>${multi?`<button class="hbtn" id="langB" lang="${lang==='vi'?'en':'vi'}">${lang==='vi'?'English':'Tiếng Việt'}</button>`:''}`;
if(multi)$('#langB').onclick=()=>{const u=new URL(location.href);u.searchParams.set('lang',lang==='vi'?'en':'vi');u.searchParams.set('level',level);location.replace(u.href)};
if(lang==='vi')document.querySelectorAll('[data-vi]').forEach(e=>e.textContent=e.dataset.vi);
$('#td-teams').className='side';
$('#mute').onclick=()=>{muted=!muted;$('#mute').textContent=U(muted?'Sound off':'Sound on');if(muted&&window.speechSynthesis)speechSynthesis.cancel()};
$('#motion').onclick=()=>fx.cycleMotion();
if(!SOLO){
$('#td-teams').innerHTML=`<h2>${U('Teams')}</h2><div class="list"></div><div class="row"><button class="btn ghost" id="addT">${U('+ Team')}</button><button class="btn ghost" id="rstT">${U('Reset scores')}</button></div><div class="row"><button class="btn ghost" id="podT">\u{1F3C6} ${U('Podium')}</button><button class="btn" id="sendT">${U('Send to Scoreboard')}</button></div>`;
$('#addT').onclick=()=>{if(teams.length<6){teams.push({name:U('Team')+' '+(teams.length+1),score:0});saveTeams();renderTeams()}else toast(U('Six teams is the maximum'))};
$('#rstT').onclick=()=>{teams.forEach(t=>t.score=0);saveTeams();renderTeams();toast(U('Scores reset'))};
$('#sendT').onclick=sendScores;
$('#podT').onclick=()=>fx.podium();
}
document.querySelectorAll('.lv button').forEach(b=>b.onclick=()=>setLevel(b.dataset.l));
fx.start();setLevel(level,true);if(SOLO)soloHeader();else renderTeams()}
function setLevel(l,first){if(SOLO&&!open(l))return;$('.td-res')&&$('.td-res').remove();level=l;if(SOLO){teams[0].score=0;soloStart();soloHeader()}store.set('td_level_'+cfg.id,l);fx.streakReset();document.querySelectorAll('.lv button').forEach(b=>b.classList.toggle('on',b.dataset.l===l));cfg.onLevel(l,first)}
const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const rnd=(a,b)=>Math.floor(Math.random()*(b-a+1))+a;

/* ---- Solo mode (StudentDeck): ?mode=solo. One player instead of teams: a My progress panel, rounds of up to
   cfg.soloCap answers (10 unless the game says otherwise; 0 = the game's own round, ended by sfx('win') or TD.soloEnd),
   0 to 3 stars a round (cfg.soloStars: the share of right answers for 3, 2 and 1 stars), and a level unlocks at 2 stars on
   the one below. Progress comes in ?p= from StudentDeck's Games Hub (games run sandboxed there, without storage) or from
   localStorage, and goes back to the hub: postMessage {type:'sd-xp', game, result, score, level, stars, progress}. ---- */
const SOLO=new URLSearchParams(location.search).get('mode')==='solo';
let prog={},round=null,quiet=false;
const UIS={vi:{'My progress':'Tiến bộ của em',You:'Em','This round':'Lượt này','right of':'đúng trên','Round complete!':'Hoàn thành lượt chơi!','Play again':'Chơi lại','Next level':'Mức tiếp theo',
'unlocked!':'đã mở khóa!','Get 2 stars on':'Đạt 2 sao ở mức','to unlock':'để mở khóa',Best:'Cao nhất',points:'điểm'}};
const US=s=>(UIS[lang]&&UIS[lang][s])||s,capOf=()=>cfg.soloCap===undefined?10:cfg.soloCap;
function soloLoad(){try{const q=new URLSearchParams(location.search).get('p');if(q){prog=JSON.parse(q)||{};return}}catch(e){}prog=store.get('td_solo_'+cfg.id,{})||{}}
const stars=l=>(prog[l]&&prog[l].stars)||0,starTxt=n=>'★'.repeat(n)+'☆'.repeat(3-n);
function open(l){return l==='easy'||(l==='moderate'&&stars('easy')>=2)||(l==='hard'&&stars('moderate')>=2)}
function soloStyle(){const s=document.createElement('style');s.textContent=`.td-solo #turn{visibility:hidden}.lv button small{margin-left:4px;color:var(--gold,#f5c542);font-size:.8em}.lv button:disabled{opacity:.55;cursor:not-allowed}
.td-this{grid-column:1/-1;color:var(--muted,#9fb0d8);font-size:.9rem}.td-lvl{display:grid;grid-template-columns:1fr auto;gap:2px 10px;padding:8px 10px;border-radius:10px;margin-bottom:6px;background:var(--stage,#0b1430)}
.td-lvl.on{outline:2px solid var(--gold,#f5c542)}.td-lvl span{color:var(--gold,#f5c542);letter-spacing:2px}.td-lvl i{grid-column:1/-1;font-style:normal;color:var(--muted,#9fb0d8);font-size:.85rem}
.td-res .box{max-width:480px}.td-stars{font-size:clamp(2.6rem,9vw,3.8rem);letter-spacing:8px;color:#3a4a7a;margin:10px 0}.td-stars span.on{color:var(--gold,#f5c542);text-shadow:0 0 18px rgba(245,197,66,.6)}
.td-res p{margin:6px 0;font-weight:600}.td-res .unl{color:var(--mint,#3ddbb0)}`;document.head.appendChild(s)}
function soloHeader(){document.querySelectorAll('.lv button').forEach(b=>{const l=b.dataset.l,ok=open(l),i=LV.indexOf(l);b.disabled=!ok;b.textContent=U(LN[l]);const s=document.createElement('small');s.textContent=ok?starTxt(stars(l)):'\u{1F512}';b.append(s);
b.title=ok?'':US('Get 2 stars on')+' '+U(LN[LV[i-1]])+' '+US('to unlock')})}
function soloPanel(){if(!SOLO)return;const r=round||{right:0,wrong:0,score:0},tp=$('#td-teams');tp.className='side';
tp.innerHTML=`<h2>${US('My progress')}</h2><div class="list"><div class="team act"><span class="nm"></span><span class="sc">${r.score}</span><span class="td-this"></span></div></div><div class="td-lvls"></div>`;
$('.nm',tp).textContent=US('You');$('.td-this',tp).textContent=US('This round')+': '+r.right+' '+US('right of')+' '+(r.right+r.wrong);
$('.td-lvls',tp).innerHTML=LV.map(l=>`<div class="td-lvl${l===level?' on':''}"><b>${U(LN[l])}</b><span>${open(l)?starTxt(stars(l)):'\u{1F512}'}</span><i>${open(l)&&prog[l]?US('Best')+': '+prog[l].best:''}</i></div>`).join('')}
function soloStart(){round={right:0,wrong:0,score:0,ended:false,done:false};quiet=false;soloPanel()}
function soloCount(ok){if(!SOLO||!round||round.ended||quiet)return;ok?round.right++:round.wrong++;soloPanel();const cap=capOf();if(cap&&round.right+round.wrong>=cap){round.ended=true;setTimeout(()=>soloEnd(),1000)}}
function soloEnd(given){if(!SOLO||!round||round.done)return;round.done=round.ended=true;
const n=round.right+round.wrong,cap=capOf(),th=cfg.soloStars||[.9,.7,.4],f=cap?round.right/cap:(n?round.right/n:0);
const st=given!=null?given:(n?(f>=th[0]?3:f>=th[1]?2:f>=th[2]?1:0):0),before=LV.map(open);
const p=prog[level]||{stars:0,best:0};prog[level]={stars:Math.max(p.stars,st),best:Math.max(p.best,round.score)};store.set('td_solo_'+cfg.id,prog);
try{if(parent!==window)parent.postMessage({type:'sd-xp',game:cfg.id,result:st+' stars',score:round.score,level,stars:st,progress:prog},'*')}catch(e){}
soloHeader();soloPanel();results(st,n,LV.filter((l,i)=>!before[i]&&open(l)))}
function results(st,n,newly){const o=document.createElement('div');o.className='td-pod td-res';o.setAttribute('role','dialog');o.setAttribute('aria-label',US('Round complete!'));
const nx=LV[LV.indexOf(level)+1];o.innerHTML=`<div class="box"><h2>${US('Round complete!')}</h2><div class="td-stars">${[0,1,2].map(()=>'<span>★</span>').join('')}</div>
<p>${round.right} ${US('right of')} ${n} · ${round.score} ${US('points')}</p>${newly.map(l=>`<p class="unl">\u{1F513} ${U(LN[l])} ${US('unlocked!')}</p>`).join('')}
<div class="acts"><button class="btn" data-a="again">${US('Play again')}</button>${nx&&open(nx)?`<button class="btn ghost" data-a="next">${US('Next level')}: ${U(LN[nx])}</button>`:''}</div></div>`;
o.onclick=e=>{const a=e.target.dataset&&e.target.dataset.a;if(a==='again'){o.remove();setLevel(level)}if(a==='next'){o.remove();setLevel(nx)}};document.body.appendChild(o);$('[data-a=again]',o).focus();
const ss=o.querySelectorAll('.td-stars span');ss.forEach((s,i)=>{if(i>=st)return;setTimeout(()=>{s.classList.add('on');tone(660+i*220,.18,'triangle',0,.14);if(fx.motion==='full'&&s.animate)s.animate([{transform:'scale(.2)'},{transform:'scale(1.35)'},{transform:'scale(1)'}],{duration:420,easing:'ease-out'})},fx.motion==='off'?0:350+i*380)});
if(st===3)setTimeout(()=>{fx.confetti(120)},350+3*380)}

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
return{init,toast,sfx,speak,award,nextTeam,shuffle,rnd,fx,L,num,soloEnd,soloQuiet:v=>{quiet=!!v},get solo(){return SOLO},get lang(){return lang},get level(){return level},get team(){return teams[act]},get teamIndex(){return act},get teamCount(){return teams.length}}})();

const $=s=>document.querySelector(s);
/* Body Builder. Easy: tap the body part (or what a clue points to). Moderate: tap the organ, by name or by what it does.
   Hard: which body system a part belongs to (the six systems taught in Vietnamese schools); the organs of that system
   pulse on the body. English and Vietnamese. */
const PARTS={head:['head','đầu'],neck:['neck','cổ'],shoulder:['shoulder','vai'],arm:['arm','cánh tay'],elbow:['elbow','khuỷu tay'],hand:['hand','bàn tay'],chest:['chest','ngực'],tummy:['tummy','bụng'],leg:['leg','chân'],knee:['knee','đầu gối'],foot:['foot','bàn chân']};
const HOT={head:[[120,46,30]],neck:[[120,93,11]],shoulder:[[84,110,13],[156,110,13]],arm:[[63,140,11],[177,140,11],[63,205,10],[177,205,10]],elbow:[[63,172,10],[177,172,10]],hand:[[63,238,13],[177,238,13]],
chest:[[120,138,26]],tummy:[[120,212,26]],leg:[[101,275,14],[139,275,14],[101,365,12],[139,365,12]],knee:[[101,322,12],[139,322,12]],foot:[[98,410,16],[142,410,16]]};
const EASY=Object.keys(PARTS).map(k=>[TD=>TD.L('Tap the '+PARTS[k][0],'Chạm vào '+PARTS[k][1]),k]).concat([
[T=>T.L('Where do you wear a hat?','Em đội mũ ở đâu?'),'head'],[T=>T.L('Where do you wear a scarf?','Em quàng khăn ở đâu?'),'neck'],[T=>T.L('Where do you wear shoes?','Em đi giày ở đâu?'),'foot'],
[T=>T.L('Where do you wear gloves?','Em đeo găng tay ở đâu?'),'hand'],[T=>T.L('You bend this to sit down','Em gập chỗ này để ngồi xuống'),'knee'],[T=>T.L('You bend your arm here','Em gập cánh tay ở chỗ này'),'elbow'],
[T=>T.L('A backpack strap sits here','Quai ba lô nằm ở đây'),'shoulder'],[T=>T.L('Your heart is inside this','Tim của em nằm bên trong chỗ này'),'chest'],[T=>T.L('Your lunch goes here','Bữa trưa của em đi vào đây'),'tummy']]);
const ORG={brain:['brain','não'],lungs:['lungs','phổi'],heart:['heart','tim'],liver:['liver','gan'],stomach:['stomach','dạ dày'],kidneys:['kidneys','thận'],intestines:['intestines','ruột'],bladder:['bladder','bàng quang']};
const MOD=Object.keys(ORG).map(k=>[T=>T.L('Tap the '+ORG[k][0],'Chạm vào '+ORG[k][1]),k]).concat([
[T=>T.L('It pumps blood around the body','Bơm máu đi khắp cơ thể'),'heart'],[T=>T.L('It beats about 70 times a minute','Đập khoảng 70 lần mỗi phút'),'heart'],[T=>T.L('You breathe air in and out with these','Em hít vào thở ra bằng cơ quan này'),'lungs'],
[T=>T.L('Oxygen goes into your blood here','Ô-xi đi vào máu ở đây'),'lungs'],[T=>T.L('It controls your whole body','Điều khiển toàn bộ cơ thể'),'brain'],[T=>T.L('It holds your memories','Lưu giữ trí nhớ của em'),'brain'],
[T=>T.L('Food goes here after you swallow it','Thức ăn đến đây sau khi nuốt'),'stomach'],[T=>T.L('It mixes food with acid','Trộn thức ăn với axit'),'stomach'],[T=>T.L('They clean the blood and make urine','Lọc máu và tạo ra nước tiểu'),'kidneys'],
[T=>T.L('It stores urine','Chứa nước tiểu'),'bladder'],[T=>T.L('They take in the goodness from food','Hấp thụ chất dinh dưỡng từ thức ăn'),'intestines'],[T=>T.L('It makes bile to help digest fat','Tiết ra mật giúp tiêu hóa chất béo'),'liver']]);
const SYS={circ:['Circulatory (blood)','Hệ tuần hoàn'],resp:['Respiratory (breathing)','Hệ hô hấp'],nerv:['Nervous','Hệ thần kinh'],dig:['Digestive','Hệ tiêu hóa'],excr:['Excretory (urine)','Hệ bài tiết'],move:['Movement (bones and muscles)','Hệ vận động']};
const HARD=[['Heart','Tim','circ','heart'],['Blood vessels','Mạch máu','circ'],['Lungs','Phổi','resp','lungs'],['Windpipe','Khí quản','resp'],['Nose','Mũi','resp'],['Brain','Não','nerv','brain'],['Spinal cord','Tủy sống','nerv'],
['Nerves','Dây thần kinh','nerv'],['Stomach','Dạ dày','dig','stomach'],['Intestines','Ruột','dig','intestines'],['Liver','Gan','dig','liver'],['Food pipe (oesophagus)','Thực quản','dig'],['Teeth','Răng','dig'],
['Kidneys','Thận','excr','kidneys'],['Bladder','Bàng quang','excr','bladder'],['Skull','Hộp sọ','move'],['Ribs','Xương sườn','move'],['Thigh bone','Xương đùi','move'],['Biceps muscle','Cơ bắp tay','move'],['Spine','Cột sống','move']];
const CFG={easy:{time:90,pts:1,pen:0},moderate:{time:90,pts:2,pen:1},hard:{time:90,pts:3,pen:1}};
let run=false,left,timer,right,streak,best,gain,ring,cur,lockUntil=0,deck=[];
const SV='http://www.w3.org/2000/svg';
function body(showOrgans){const o=showOrgans?`<g id="organs" opacity=".9">
<ellipse class="org" data-o="brain" cx="120" cy="44" rx="24" ry="18" fill="#f2a0b8"/><path d="M104 42q8-8 16 0t16 0" stroke="#c87090" stroke-width="2" fill="none"/>
<g class="org" data-o="lungs"><ellipse cx="100" cy="142" rx="16" ry="28" fill="#ff8f9f"/><ellipse cx="140" cy="142" rx="16" ry="28" fill="#ff8f9f"/></g>
<path class="org" data-o="heart" d="M122 162c-12-8-18-14-14-20c3-5 10-4 14 1c4-5 11-6 14-1c4 6-2 12-14 20z" fill="#e0323a"/>
<ellipse class="org" data-o="liver" cx="104" cy="188" rx="22" ry="10" fill="#9a3a2a"/><ellipse class="org" data-o="stomach" cx="141" cy="190" rx="14" ry="10" fill="#f0b07a"/>
<g class="org" data-o="kidneys"><ellipse cx="88" cy="208" rx="6" ry="10" fill="#b0405a"/><ellipse cx="152" cy="208" rx="6" ry="10" fill="#b0405a"/></g>
<ellipse class="org" data-o="intestines" cx="120" cy="222" rx="22" ry="15" fill="#f5a6a0"/><path d="M104 220q8-8 16 0t16 0M106 228q7-6 14 0t14 0" stroke="#d07a74" stroke-width="2" fill="none"/>
<ellipse class="org" data-o="bladder" cx="120" cy="246" rx="10" ry="7" fill="#f5d06a"/></g>`:'';
$('#body').innerHTML=`<g fill="#2c3a70" stroke="#9fb0d8" stroke-width="2.5"><rect x="86" y="238" width="30" height="164" rx="14"/><rect x="124" y="238" width="30" height="164" rx="14"/>
<ellipse cx="98" cy="410" rx="20" ry="9"/><ellipse cx="142" cy="410" rx="20" ry="9"/><rect x="52" y="104" width="22" height="124" rx="11"/><rect x="166" y="104" width="22" height="124" rx="11"/>
<circle cx="63" cy="238" r="12"/><circle cx="177" cy="238" r="12"/><rect x="76" y="98" width="88" height="152" rx="26"/><rect x="110" y="80" width="20" height="24"/><circle cx="120" cy="50" r="34"/></g>${o}<g id="hots"></g><g id="labels"></g>`}
function hotspots(){const g=$('#hots');g.innerHTML='';Object.entries(HOT).forEach(([k,list])=>list.forEach(([x,y,r])=>{const c=document.createElementNS(SV,'circle');c.setAttribute('cx',x);c.setAttribute('cy',y);c.setAttribute('r',r);c.setAttribute('class','hot');
c.setAttribute('fill','rgba(77,163,255,.12)');c.setAttribute('stroke','rgba(159,176,216,.55)');c.setAttribute('stroke-dasharray','3 3');c.dataset.k=k;c.onclick=()=>tap(k);g.append(c)}))}
function organHits(){document.querySelectorAll('#organs .org').forEach(e=>{e.classList.add('hot');e.onclick=()=>tap(e.dataset.o)})}
function label(x,y,text,color){const t=document.createElementNS(SV,'text');t.setAttribute('x',x);t.setAttribute('y',y);t.setAttribute('text-anchor','middle');t.setAttribute('font-family','Baloo 2,sans-serif');t.setAttribute('font-weight','800');t.setAttribute('font-size','15');
t.setAttribute('fill',color);t.setAttribute('stroke','#0b1430');t.setAttribute('stroke-width','4');t.setAttribute('paint-order','stroke');t.textContent=text;$('#labels').append(t);TD.fx.pop(t)}
function pulse(el){if(!el||TD.fx.motion==='off')return;el.style.transformBox='fill-box';el.style.transformOrigin='center';el.animate([{transform:'scale(1)'},{transform:'scale(1.25)'},{transform:'scale(1)'},{transform:'scale(1.15)'},{transform:'scale(1)'}],{duration:900})}
function reveal(k){if(TD.level==='easy'){const [x,y,r]=HOT[k][0];label(x,y-r-4,TD.L(PARTS[k][0],PARTS[k][1]),'#f5c542');document.querySelectorAll('#hots .hot').forEach(c=>{if(c.dataset.k===k){c.setAttribute('fill','rgba(245,197,66,.45)');pulse(c)}})}
else{const e=document.querySelector('#organs .org[data-o="'+k+'"]');if(!e)return;pulse(e);const b=e.getBBox();label(b.x+b.width/2,b.y-4,TD.L(ORG[k][0],ORG[k][1]),'#f5c542')}}
function ask(){const lv=TD.level;$('#labels').innerHTML='';$('#choices').innerHTML='';$('.bb').classList.toggle('solo',lv!=='hard');   // answer buttons only in Hard: one centred column otherwise
if(lv==='hard'){if(!deck.length)deck=TD.shuffle(HARD.slice());cur=deck.pop();const ans=cur[2],opts=TD.shuffle([ans,...TD.shuffle(Object.keys(SYS).filter(s=>s!==ans)).slice(0,3)]);
$('#q').textContent=TD.L('Which body system does this belong to? ','Bộ phận này thuộc hệ cơ quan nào? ')+TD.L(cur[0],cur[1]);if(cur[3]){const e=document.querySelector('#organs .org[data-o="'+cur[3]+'"]');pulse(e)}
opts.forEach(s=>{const b=document.createElement('button');b.className='ch';b.textContent=TD.L(SYS[s][0],SYS[s][1]);b.dataset.k=s;b.onclick=()=>pick(s,b);$('#choices').append(b)});TD.fx.deal($('#choices'));return}
const bank=lv==='easy'?EASY:MOD;if(!deck.length)deck=TD.shuffle(bank.slice());cur=deck.pop();$('#q').textContent=cur[0](TD)}
function tap(k){if(!run||Date.now()<lockUntil||TD.level==='hard')return;done(k===cur[1],cur[1],k)}
function pick(s,b){if(!run||Date.now()<lockUntil)return;const ok=s===cur[2];b.classList.add(ok?'yes':'no');if(!ok){const r=[...$('#choices').children].find(x=>x.dataset.k===cur[2]);if(r)r.classList.add('yes')}
HARD.filter(h=>h[2]===cur[2]&&h[3]).forEach(h=>pulse(document.querySelector('#organs .org[data-o="'+h[3]+'"]')));done(ok,null,null,TD.L(SYS[cur[2]][0],SYS[cur[2]][1]))}
function done(ok,ans,tapped,sysName){const c=CFG[TD.level];
if(ok){right++;streak++;best=Math.max(best,streak);TD.award(c.pts);gain+=c.pts;TD.sfx('ok');if(ans)reveal(ans);$('#msg').textContent=''}
else{streak=0;TD.sfx('bad');if(c.pen){TD.award(-c.pen);gain-=c.pen}if(ans){reveal(ans);const nm=TD.level==='easy'?PARTS[tapped]:ORG[tapped];$('#msg').textContent=TD.L('That was the ','Đó là ')+TD.L(nm[0],nm[1])+'.'}else $('#msg').textContent=TD.L('It was: ','Đáp án: ')+sysName+'.'}
['nr','ns','nb'].forEach((i,j)=>$('#'+i).textContent=[right,streak,best][j]);const wait=ok?1000:1900;lockUntil=Date.now()+wait;setTimeout(()=>{if(run)ask()},wait)}
function setup(){body(TD.level!=='easy');if(TD.level==='easy')hotspots();else if(TD.level==='moderate')organHits()}
function reset(){clearInterval(timer);run=false;deck=[];setup();$('#choices').innerHTML='';$('#q').textContent=TD.L('Ready?','Sẵn sàng?');$('#msg').textContent='';
$('#turn').textContent=TD.L(TD.team.name+"'s turn",'Lượt của '+TD.team.name);ring=ring||TD.fx.ring($('#time'));ring.reset();$('#time').textContent=CFG[TD.level].time+'s';$('#time').classList.remove('low');
$('#prog').textContent={easy:TD.L('Body parts','Các bộ phận cơ thể'),moderate:TD.L('Organs','Các cơ quan'),hard:TD.L('Body systems','Các hệ cơ quan')}[TD.level];
$('#ctl').innerHTML='<button class="btn" id="go">'+TD.L('Start round','Bắt đầu lượt')+'</button>';$('#go').onclick=begin;['nr','ns','nb'].forEach(i=>$('#'+i).textContent=0)}
function begin(){run=true;lockUntil=0;left=CFG[TD.level].time;right=streak=best=gain=0;deck=[];$('#ctl').innerHTML='';$('#msg').textContent='';
TD.fx.banner(TD.team.name,TD.L('Go! '+left+' seconds','Bắt đầu! '+left+' giây'));clock();timer=setInterval(()=>{left--;clock();if(left<=5&&left>0)TD.sfx('tick');if(left<=0)end()},1000);ask()}
function clock(){$('#time').textContent=left+'s';$('#time').classList.toggle('low',left<=10);ring.set(left,CFG[TD.level].time)}
function end(){clearInterval(timer);run=false;$('#choices').innerHTML='';$('#labels').innerHTML='';$('#q').textContent=TD.L('Time!','Hết giờ!');TD.sfx('win');const who=TD.team.name;
$('#msg').textContent=TD.L(who+': '+right+' right, net '+(gain>=0?'+':'')+gain+' points',who+': '+right+' câu đúng, tổng '+(gain>=0?'+':'')+gain+' điểm');TD.nextTeam();
$('#ctl').innerHTML='<button class="btn" id="go">'+TD.L('Next team: ','Đội tiếp theo: ')+TD.team.name+'</button>'+(TD.teamIndex===0?' <button class="btn ghost" id="pod">\u{1F3C6} '+TD.L('Everyone has played: podium','Tất cả đã chơi: xem bục vinh quang')+'</button>':'');
$('#go').onclick=reset;if($('#pod'))$('#pod').onclick=()=>TD.fx.podium()}

/* a clinic at night: an X-ray light box, a heartbeat line, a DNA twist slowly turning */
const ekg=y=>`<path data-fx="drift:-200:6" d="M0 ${y}h300l20 -40l20 80l20 -60l14 20h300l20 -40l20 80l20 -60l14 20h300l20 -40l20 80l20 -60l14 20h400" stroke="#3ddbb0" stroke-width="3" fill="none" opacity=".45"/>`;
let dna='';for(let i=0;i<14;i++){const y=120+i*40,dx=Math.sin(i*.7)*40;dna+=`<circle cx="${1400+dx}" cy="${y}" r="7" fill="#ff6fae"/><circle cx="${1400-dx}" cy="${y}" r="7" fill="#4da3ff"/><path d="M${1400+dx} ${y}H${1400-dx}" stroke="#9fb0d8" stroke-width="2" opacity=".5"/>`}
const CLINIC=`<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"><rect width="1600" height="900" fill="#0c1a2e"/>
<rect x="60" y="140" width="260" height="340" rx="10" fill="#1c3a50" stroke="#6fd0e0" stroke-width="4"/><g fill="none" stroke="#cfe9ff" stroke-width="5" opacity=".55"><circle cx="190" cy="210" r="34"/><path d="M190 244v150M190 280h-70M190 280h70M190 330q-30 10-30 40M190 330q30 10 30 40M160 300h60M162 312h56M164 324h52"/></g>
${ekg(620)}<g data-fx="bob:12:5" opacity=".7">${dna}</g><rect y="790" width="1600" height="110" fill="#0a1424"/></svg>`;
TD.fx.scene(CLINIC);
TD.init({id:'body-builder',title:'Body Builder',langs:['en','vi'],onLevel:()=>{setup();reset()}});
