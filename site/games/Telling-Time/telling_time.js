/* Telling Time — a built file from the TeachersDeck Game Library Kit. Edit games/kit/ or games/src/telling-time.js, then run games/tools/build_games.py. */
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

/* ---- teachersdeck/js/tellingtime.js (inlined by games/tools/build_games.py) ---- */
'use strict';
/* =========================================================
   Telling Time — the clock engine (phase 0, 14 Nov 2026). Scope: hq/docs/TELLING-TIME-SCOPE.md.
   ---------------------------------------------------------
   ONE ENGINE for the Telling Time tile (free, every app) and the Telling Time game (Pro, Games tile).
   teachersdeck/js/tellingtime.js is the copy to edit. Tests: node tools/test_tellingtime.js (CI runs them).

   Two halves:
   1. Words (no DOM, also runs in Node): a time as English words, British or American, both ways (clock words
      "quarter to four", digital words "three forty-five"); a strict parser that knows the common mistakes are wrong;
      wrong-answer "traps" built from those mistakes; the Vietnamese hint shown only when a student taps VI.
   2. The clock (browser only): an SVG clock drawn from a face definition, with draggable, geared hands.

   Times are always (h, m) with h 0–23, m 0–59. Style is 'uk' (default) or 'us'.

   window.TellingTime  (module.exports in Node)
     .words(h, m, opts)        opts: { style:'uk'|'us', form:'clock'|'digital', day:false|'words'|'ampm' }
                               'clock'  → "quarter to four", "seven minutes past three", "three o'clock"
                               'digital'→ "three forty-five", "three oh seven", "three"
                               day 'words' → "… in the morning" / "midnight"; 'ampm' → "… p.m."
     .parse(text)              → { h: 1–12, m, period: 'am'|'pm'|null, part: 'morning'|…|null } or null.
                               Strict: "three o'clock fifteen", "seven past three", "fifteen o'clock" are null.
                               Accepts both styles ("a quarter after", "ten of four") and "3:45".
     .matches(text, h, m)      true when text is a correct way to say h:m (a.m./p.m. or a day part, if given, must fit)
     .traps(h, m, opts)        → [{ text, kind }] wrong answers from typical mistakes, never mixing styles.
                               opts: { style, day } (day 'ampm' adds the a.m./p.m. swap). kind is a key of VI_TIPS.
     .viHint(h, m, opts)       → one Vietnamese line ("4 giờ kém 15 → quarter to four …"); opts.style
     .VI_TIPS                  Vietnamese line per trap kind, for the hint after a wrong answer
     .stepOf(m)                1 o'clock · 2 half past · 3 quarters · 4 five-minute steps · 5 any minute
     .random(step, rng)        → { h, m } at that step or below (rng defaults to Math.random)
     .FACES                    face definitions (data): basic (free) and the premium ones (pro: true)
     .clock(el, opts)          draws a clock into el. opts: { face:'basic', h, m, interactive:true, snap:1,
                               style:'uk', live:false, label }. Returns a controller:
                               { get() → {h,m}, set(h,m), setFace(id), setSnap(n), setStyle(s), live(on),
                                 showHands(on), onChange(fn) → unsubscribe, svg, destroy() }
     The tile around the clock (buttons, words, settings) is js/tellingtime-tile.js.

   Colours come from CSS variables with fallbacks, so each app's theme (and Light/Dark) can restyle the clock:
     --tt-face --tt-rim --tt-tick --tt-num --tt-min-ring --tt-hour --tt-minute --tt-second --tt-past --tt-to --tt-text
   ========================================================= */
(function (root) {

  /* ---------------- 1. Words ---------------- */

  const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven',
    'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty'];

  function num(n) {
    if (n < 20) return ONES[n];
    return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
  }
  const h12 = h => ((h % 12) + 12) % 12 || 12;
  const hourWord = h => num(h12(h));
  const norm = (h, m) => [((h % 24) + 24) % 24, ((m % 60) + 60) % 60];

  function clockWords(h, m, style) {
    const us = style === 'us', past = us ? 'after' : 'past', q = us ? 'a quarter' : 'quarter';
    const H = hourWord(h), N = hourWord(h + 1);
    if (m === 0) return `${H} o'clock`;
    if (m === 15) return `${q} ${past} ${H}`;
    if (m === 30) return `half past ${H}`;
    if (m === 45) return `${q} to ${N}`;
    const n = m < 30 ? m : 60 - m, rel = m < 30 ? `${past} ${H}` : `to ${N}`;
    return m % 5 ? `${num(n)} minute${n === 1 ? '' : 's'} ${rel}` : `${num(n)} ${rel}`;
  }

  function digitalWords(h, m) {
    const H = hourWord(h);
    if (m === 0) return H;
    return m < 10 ? `${H} oh ${ONES[m]}` : `${H} ${num(m)}`;
  }

  /* The generator's day parts; parse/matches accept a little more (see PART_FITS). */
  function dayPart(h) {
    if (h === 0 || h >= 21) return 'at night';
    if (h < 12) return 'in the morning';
    if (h < 17) return 'in the afternoon';
    return 'in the evening';
  }

  function words(h, m, opts) {
    opts = opts || {};
    [h, m] = norm(h, m);
    const style = opts.style === 'us' ? 'us' : 'uk', day = opts.day || false;
    if (day && m === 0 && h === 0) return 'midnight';
    if (day && m === 0 && h === 12) return style === 'us' ? 'noon' : 'midday';
    const w = opts.form === 'digital' ? digitalWords(h, m) : clockWords(h, m, style);
    if (day === 'ampm') return `${w} ${h < 12 ? 'a.m.' : 'p.m.'}`;
    if (day === 'words') return `${w} ${dayPart(h)}`;
    return w;
  }

  /* ---- parser ---- */
  const NUMS = {};
  ONES.forEach((w, i) => { NUMS[w] = i; });
  const TENS_N = { twenty: 20, thirty: 30, forty: 40, fifty: 50 };
  const PAST = new Set(['past', 'after']), TO = new Set(['to', 'of', 'till', 'before']);
  const PARTS = { 'in the morning': 'morning', 'in the afternoon': 'afternoon', 'in the evening': 'evening', 'at night': 'night' };

  /* Reads one number at tokens[i]: "7", "seven", "twenty-five" (already split on '-'), "twenty five". */
  function readNum(t, i) {
    const w = t[i];
    if (w === undefined) return null;
    if (/^\d{1,2}$/.test(w)) return [Number(w), i + 1];
    if (w in TENS_N) {
      const o = NUMS[t[i + 1]];
      if (o !== undefined && o >= 1 && o <= 9) return [TENS_N[w] + o, i + 2];
      return [TENS_N[w], i + 1];
    }
    if (w in NUMS) return [NUMS[w], i + 1];
    return null;
  }

  function parse(text) {
    if (typeof text !== 'string') return null;
    let s = ' ' + text.toLowerCase().replace(/[‘’`]/g, "'") + ' ';
    s = s.replace(/\ba\.\s?m\b\.?/g, ' am ').replace(/\bp\.\s?m\b\.?/g, ' pm ');
    s = s.replace(/[.,!?;]/g, ' ').replace(/-/g, ' ')
      .replace(/\bo\s?'?\s?clock\b/g, "o'clock").replace(/\s+/g, ' ').trim();
    s = s.replace(/^(it's|it is|its|the time is)\s+/, '');
    let period = null, part = null;
    const am = s.match(/\s(am|pm)$/);
    if (am) { period = am[1]; s = s.slice(0, -3).trim(); }
    for (const p in PARTS) {
      if (!period && s.endsWith(' ' + p)) { part = PARTS[p]; s = s.slice(0, -p.length - 1).trim(); break; }
    }
    if (!period && !part) {
      if (s === 'midnight') return { h: 12, m: 0, period: 'am', part: null, special: 'midnight' };
      if (s === 'noon' || s === 'midday') return { h: 12, m: 0, period: 'pm', part: null, special: 'noon' };
    }
    const out = (h, m) => (h >= 1 && h <= 12 && m >= 0 && m <= 59 ? { h, m, period, part } : null);

    const colon = s.match(/^(\d{1,2}):(\d{2})$/);
    if (colon) return out(Number(colon[1]), Number(colon[2]));

    const t = s.split(' ');
    // a quarter past / quarter to / half past
    let i = 0;
    if (t[i] === 'a' && t[i + 1] === 'quarter') i++;
    if (t[i] === 'quarter' || t[i] === 'half') {
      const what = t[i], rel = t[i + 1], H = readNum(t, i + 2);
      if (!H || H[1] !== t.length) return null;
      if (what === 'half') return PAST.has(rel) && rel === 'past' ? out(H[0], 30) : null;
      if (PAST.has(rel)) return out(H[0], 15);
      if (TO.has(rel)) return H[0] >= 1 && H[0] <= 12 ? out(H[0] === 1 ? 12 : H[0] - 1, 45) : null;
      return null;
    }
    if (i) return null; // "a" not followed by quarter

    const A = readNum(t, 0);
    if (!A) return null;
    let j = A[1];
    // H o'clock
    if (t[j] === "o'clock") return j + 1 === t.length && A[0] >= 1 ? out(A[0], 0) : null;
    // H alone
    if (j === t.length) return out(A[0], 0);
    // H oh M
    if (t[j] === 'oh' || t[j] === 'o' || t[j] === 'zero') {
      const M = readNum(t, j + 1);
      return M && M[1] === t.length && M[0] >= 1 && M[0] <= 9 ? out(A[0], M[0]) : null;
    }
    // N [minute(s)] past/to H
    let minutes = null;
    if (t[j] === 'minute' || t[j] === 'minutes') { minutes = t[j]; j++; }
    if (PAST.has(t[j]) || TO.has(t[j])) {
      const n = A[0], rel = t[j], H = readNum(t, j + 1);
      if (!H || H[1] !== t.length || n < 1 || n > 29) return null;
      if (minutes === 'minute' && n !== 1) return null;
      if (minutes === 'minutes' && n === 1) return null;
      if (!minutes && (n % 5 !== 0 || n === 15)) return null;   // "seven past three", "fifteen past three"
      if (PAST.has(rel)) return out(H[0], n);
      return H[0] >= 1 && H[0] <= 12 ? out(H[0] === 1 ? 12 : H[0] - 1, 60 - n) : null;
    }
    if (minutes) return null;
    // H M (digital, M 10–59)
    const M = readNum(t, j);
    if (M && M[1] === t.length && M[0] >= 10 && M[0] <= 59) return out(A[0], M[0]);
    return null;
  }

  const PART_FITS = {
    morning: h => h >= 1 && h < 12,
    afternoon: h => h >= 12 && h < 18,
    evening: h => h >= 17 && h < 22,
    night: h => h >= 20 || h < 4,
  };

  function matches(text, h, m) {
    [h, m] = norm(h, m);
    const p = parse(text);
    if (!p || p.h !== h12(h) || p.m !== m) return false;
    if (p.special === 'midnight') return h === 0;
    if (p.special === 'noon') return h === 12;
    if (p.period === 'am' && h >= 12) return false;
    if (p.period === 'pm' && h < 12) return false;
    if (p.part && !PART_FITS[p.part](h)) return false;
    return true;
  }

  /* ---- traps: wrong answers built from the mistakes in the scope (section 1) ---- */
  const SWAP = { 13: 30, 14: 40, 15: 50, 30: 13, 40: 14, 50: 15 };

  function traps(h, m, opts) {
    opts = opts || {};
    [h, m] = norm(h, m);
    const style = opts.style === 'us' ? 'us' : 'uk', past = style === 'us' ? 'after' : 'past';
    const H = hourWord(h), N = hourWord(h + 1), list = [];
    const add = (text, kind) => list.push({ text, kind });
    if (m > 0) add(`${H} o'clock ${num(m)}`, 'oclock');
    if (h >= 13) add(m === 0 ? `${num(h)} o'clock` : `${num(h)} ${m < 10 ? 'oh ' + ONES[m] : num(m)}`, '24h');
    if (m > 0 && m < 30 && m !== 15) add(`${num(m)}${m % 5 ? (m === 1 ? ' minute' : ' minutes') : ''} to ${H}`, 'pastto');
    if (m === 15) add(`${style === 'us' ? 'a quarter' : 'quarter'} to ${H}`, 'pastto');
    if (m > 30 && m !== 45) add(`${num(60 - m)}${m % 5 ? (m === 59 ? ' minute' : ' minutes') : ''} ${past} ${N}`, 'pastto');
    if (m === 45) add(`${style === 'us' ? 'a quarter' : 'quarter'} ${past} ${N}`, 'pastto');
    if (m > 30) add(clockWords(h - 1, m, style), 'hour');          // "quarter to three" for 3:45
    else if (m === 0) { add(clockWords(h + 1, 0, style), 'hour'); add(clockWords(h - 1, 0, style), 'hour'); }
    else add(clockWords(h + 1, m, style), 'hour');                 // "quarter past four" for 3:15
    if (m % 5) {
      const n = m < 30 ? m : 60 - m;
      add(`${num(n)} ${m < 30 ? past + ' ' + H : 'to ' + N}`, 'minutes');
    }
    if (SWAP[m]) add(`${H} ${num(SWAP[m])}`, 'fifty');
    if (opts.day === 'ampm') add(`${words(h, m, { style, form: 'digital' })} ${h < 12 ? 'p.m.' : 'a.m.'}`, 'ampm');
    const correct = words(h, m, { style, day: opts.day });
    const seen = new Set();
    return list.filter(x => {
      if (seen.has(x.text) || x.text === correct || matches(x.text, h, m)) return false;
      seen.add(x.text); return true;
    });
  }

  /* ---- Vietnamese: only ever shown after the student taps VI ---- */
  const VI_TIPS = {
    oclock: '"o\'clock" chỉ dùng khi đúng giờ: không nói "three o\'clock fifteen".',
    '24h': 'Tiếng Anh nói giờ theo 12 giờ: 15 giờ = three p.m., không nói "fifteen o\'clock".',
    pastto: 'past / after = hơn (phút 1–30); to = kém (phút 31–59).',
    hour: 'Với "to", dùng giờ sắp tới: 3:45 = quarter to four (4 giờ kém 15).',
    minutes: 'Phút lẻ (không chia hết cho 5) phải có "minutes": seven minutes past three.',
    fifty: 'Nghe trọng âm: fif-TEEN (15) và FIF-ty (50); thir-TEEN (13) và THIR-ty (30).',
    ampm: 'a.m. = từ nửa đêm đến trưa (0:00–11:59); p.m. = từ trưa đến nửa đêm (12:00–23:59).',
  };

  function viHint(h, m, opts) {
    opts = opts || {};
    [h, m] = norm(h, m);
    const hh = h12(h), next = h12(h + 1), en = clockWords(h, m, opts.style === 'us' ? 'us' : 'uk');
    const past = opts.style === 'us' ? 'after' : 'past';
    if (m === 0) return `${hh} giờ đúng → ${en}`;
    if (m === 30) return `${hh} giờ rưỡi → ${en}`;
    if (m < 30) return `${hh} giờ ${m} phút → ${en} ("${past}" = hơn)`;
    return `${next} giờ kém ${60 - m} → ${en} ("to" = kém)`;
  }

  function stepOf(m) {
    if (m === 0) return 1;
    if (m === 30) return 2;
    if (m === 15 || m === 45) return 3;
    if (m % 5 === 0) return 4;
    return 5;
  }

  function random(step, rng) {
    rng = rng || Math.random;
    const pick = a => a[Math.floor(rng() * a.length)];
    const s = Math.max(1, Math.min(6, step | 0 || 1));
    const mins = s === 1 ? [0] : s === 2 ? [0, 30] : s === 3 ? [0, 15, 30, 45]
      : s === 4 ? Array.from({ length: 12 }, (_, i) => i * 5) : Array.from({ length: 60 }, (_, i) => i);
    return { h: Math.floor(rng() * 24), m: pick(mins) };
  }

  /* ---------------- 2. Faces (data) ---------------- */
  /* kind 'analog': numbers 'all' | 'quarters' | 'none'; roman; minuteRing (5…55 outside); pastTo (tinted halves);
     grain / stars (theme decoration). kind 'digital': format '12' | '24' | 'words'; flip (cards that flip when a digit
     changes; still under prefers-reduced-motion). colors: --tt-* values for this face (they win over the app's).
     Only basic is free. A new face is a new entry here (and its name in js/tellingtime-tile.js). */
  const FACES = {
    basic:    { kind: 'analog', numbers: 'all', pro: false },
    minutes:  { kind: 'analog', numbers: 'all', minuteRing: true, pro: true },
    pastto:   { kind: 'analog', numbers: 'all', pastTo: true, pro: true },
    quarters: { kind: 'analog', numbers: 'quarters', pro: true },
    none:     { kind: 'analog', numbers: 'none', pro: true },
    roman:    { kind: 'analog', numbers: 'all', roman: true, pro: true },
    // Classroom themes (phase 2, 14 Nov 2026): the basic face's numbering in other colours. colors = the --tt-* variables.
    chalk:    { kind: 'analog', numbers: 'all', pro: true,
      colors: { face: '#2f4a3a', rim: '#8a5a2b', tick: '#e9efe6', num: '#f4f1e8', hour: '#f4f1e8', minute: '#f6c445', second: '#f39c9c' } },
    wood:     { kind: 'analog', numbers: 'all', grain: true, pro: true,
      colors: { face: '#e2b07a', rim: '#6b3f1d', tick: '#4a2c14', num: '#3b2412', hour: '#3b2412', minute: '#b03a2e', second: '#1f5f8b' } },
    space:    { kind: 'analog', numbers: 'all', stars: true, pro: true,
      colors: { face: '#141a3c', rim: '#6c63ff', tick: '#aab0ff', num: '#ffffff', hour: '#ffffff', minute: '#ff6b9a', second: '#ffd166' } },
    lcd12:    { kind: 'digital', format: '12', pro: true, colors: { face: '#0f1d24', rim: '#2b3f4a', text: '#7cffb2' } },
    h24:      { kind: 'digital', format: '24', pro: true },
    flip:     { kind: 'digital', format: '12', flip: true, pro: true },
    words:    { kind: 'digital', format: 'words', pro: true },
  };
  const ROMAN = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];

  /* ---------------- 3. The clock (browser) ---------------- */
  const NS = 'http://www.w3.org/2000/svg';
  const v = (name, fallback) => `var(--tt-${name},${fallback})`;
  const pad = n => String(n).padStart(2, '0');
  const COLOR_KEYS = ['face', 'rim', 'tick', 'num', 'min-ring', 'hour', 'minute', 'second', 'past', 'to', 'text'];

  /* The few rules the clock needs wherever it is drawn (the tile, the game): added to the page once. */
  function engineCss() {
    if (document.getElementById('tt-engine-css')) return;
    const s = document.createElement('style');
    s.id = 'tt-engine-css';
    s.textContent = '.tt-clock.tt-nohands .tt-hand{visibility:hidden}' +
      '.tt-clock .tt-flip{transform-box:fill-box;transform-origin:center;animation:tt-flip .38s ease-out}' +
      '@keyframes tt-flip{0%{transform:scaleY(1)}45%{transform:scaleY(.04)}100%{transform:scaleY(1)}}' +
      '@media (prefers-reduced-motion: reduce){.tt-clock .tt-flip{animation:none}}';
    document.head.appendChild(s);
  }

  /* Same stars every time (a seeded walk), kept off the numbers ring and away from the very centre. */
  function starPoints() {
    const pts = [];
    let s = 11;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    while (pts.length < 16) {
      const a = rnd() * Math.PI * 2, r = 18 + rnd() * 38;
      pts.push([Math.sin(a) * r, -Math.cos(a) * r, 0.6 + rnd() * 1.1]);
    }
    return pts;
  }

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function wrapWords(text, max) {
    const lines = [];
    let cur = '';
    for (const w of text.split(' ')) {
      if (cur && (cur + ' ' + w).length > max) { lines.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  function clock(host, opts) {
    opts = opts || {};
    let t = (((opts.h || 0) * 60 + (opts.m || 0)) % 1440 + 1440) % 1440;
    let faceId = FACES[opts.face] ? opts.face : 'basic';
    let snap = Math.max(1, opts.snap | 0 || 1);
    let style = opts.style === 'us' ? 'us' : 'uk';
    let liveTimer = null, sec = null;
    const interactive = opts.interactive !== false;
    const listeners = new Set();

    engineCss();
    const svg = el('svg', { viewBox: '-100 -100 200 200', class: 'tt-clock', focusable: 'false' });
    svg.style.touchAction = 'none';
    svg.style.userSelect = 'none';
    host.appendChild(svg);
    let hourHand = null, minuteHand = null, secondHand = null, digital = null;

    function drawAnalog(f) {
      el('circle', { r: 96, style: `fill:${v('face', '#fffdf7')};stroke:${v('rim', '#1f3a5f')};stroke-width:${f.grain ? 7 : 4}` }, svg);
      if (f.grain) {
        for (const [rx, ry, cy] of [[70, 18, -40], [84, 26, -8], [76, 20, 28], [60, 12, 58]]) {
          el('ellipse', { cx: 0, cy, rx, ry, style: `fill:none;stroke:${v('rim', '#6b3f1d')};stroke-width:1.2;opacity:.18` }, svg);
        }
      }
      if (f.stars) {
        for (const [x, y, r] of starPoints()) el('circle', { cx: x, cy: y, r, style: `fill:${v('tick', '#aab0ff')};opacity:.55` }, svg);
      }
      if (f.pastTo) {
        el('path', { d: 'M0,-92 A92,92 0 0 1 0,92 Z', style: `fill:${v('past', 'rgba(56,161,105,.18)')}` }, svg);
        el('path', { d: 'M0,-92 A92,92 0 0 0 0,92 Z', style: `fill:${v('to', 'rgba(221,107,32,.18)')}` }, svg);
        for (const [x, label, cls, col] of [[30, style === 'us' ? 'after' : 'past', 'tt-past', '#2f855a'], [-30, 'to', 'tt-to', '#c05621']]) {
          const tx = el('text', { x, y: 40, 'text-anchor': 'middle', class: cls,
            style: `font:700 13px Inter,system-ui,sans-serif;fill:${col}` }, svg);
          tx.textContent = label;
        }
        // arrows round the rim: past runs down the right side from 12, to runs up the left side towards 12
        const arrow = 'fill:none;stroke-width:2;opacity:.6;stroke-linecap:round;stroke-linejoin:round;stroke:';
        el('path', { d: 'M8,-50 A50,50 0 0 1 50,-8 M50,-8 l-4.5,-5 M50,-8 l4.5,-5', style: arrow + '#2f855a' }, svg);
        el('path', { d: 'M-50,-8 A50,50 0 0 1 -8,-50 M-8,-50 l-5,-4.5 M-8,-50 l-5,4.5', style: arrow + '#c05621' }, svg);
      }
      const ring = !!f.minuteRing;
      const tickOut = ring ? 79 : 90, numR = ring ? 58 : 71;
      if (ring) el('circle', { r: 81, style: `fill:none;stroke:${v('min-ring', '#2b6cb0')};stroke-width:.8;opacity:.5` }, svg);
      for (let i = 0; i < 60; i++) {
        const major = i % 5 === 0, a = i * Math.PI / 30;
        const r2 = tickOut - (major ? 9 : 4);
        el('line', { x1: Math.sin(a) * tickOut, y1: -Math.cos(a) * tickOut, x2: Math.sin(a) * r2, y2: -Math.cos(a) * r2,
          style: `stroke:${v('tick', '#1f3a5f')};stroke-width:${major ? 2.6 : 1};stroke-linecap:round` }, svg);
      }
      if (ring) {
        for (let i = 1; i <= 12; i++) {
          const a = i * Math.PI / 6;
          const tx = el('text', { x: Math.sin(a) * 88, y: -Math.cos(a) * 88 + 3.6, 'text-anchor': 'middle',
            style: `font:800 10.5px Inter,system-ui,sans-serif;fill:${v('min-ring', '#2b6cb0')}` }, svg);
          tx.textContent = i === 12 ? '0' : String(i * 5);
        }
      }
      const show = f.numbers === 'all' ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : f.numbers === 'quarters' ? [12, 3, 6, 9] : [];
      for (const n of show) {
        const a = n * Math.PI / 6;
        const tx = el('text', { x: Math.sin(a) * numR, y: -Math.cos(a) * numR + 6, 'text-anchor': 'middle',
          style: `font:700 ${f.roman ? 13 : ring ? 15 : 17}px 'Baloo 2',Inter,system-ui,sans-serif;fill:${v('num', '#1f3a5f')}` }, svg);
        tx.textContent = f.roman ? ROMAN[n % 12] : String(n);
      }
      hourHand = el('g', { class: 'tt-hand' }, svg);
      el('line', { x1: 0, y1: 10, x2: 0, y2: -46, style: `stroke:${v('hour', '#1f3a5f')};stroke-width:7;stroke-linecap:round` }, hourHand);
      minuteHand = el('g', { class: 'tt-hand' }, svg);
      el('line', { x1: 0, y1: 12, x2: 0, y2: -74, style: `stroke:${v('minute', '#e53e3e')};stroke-width:4;stroke-linecap:round` }, minuteHand);
      secondHand = el('g', { class: 'tt-hand', style: 'display:none' }, svg);
      el('line', { x1: 0, y1: 14, x2: 0, y2: -80, style: `stroke:${v('second', '#d69e2e')};stroke-width:1.5;stroke-linecap:round` }, secondHand);
      el('circle', { r: 5, class: 'tt-hand', style: `fill:${v('hour', '#1f3a5f')}` }, svg);
    }

    function drawDigital(f) {
      el('rect', { x: -96, y: -70, width: 192, height: 140, rx: 18,
        style: `fill:${v('face', '#fffdf7')};stroke:${v('rim', '#1f3a5f')};stroke-width:4` }, svg);
      digital = el('g', { class: 'tt-hand' }, svg);
      lastDigital = null;
    }

    let lastDigital = null;
    function updateDigital() {
      const f = FACES[faceId], h = Math.floor(t / 60), m = t % 60;
      const key = `${h}:${m}:${style}`;
      if (key === lastDigital) return;                 // Now mode updates every second; redraw only when the minute changes
      const prev = lastDigital ? lastDigital.split(':').map(Number) : null;
      lastDigital = key;
      digital.textContent = '';
      const txt = (x, y, s, size, weight, parent) => {
        const e = el('text', { x, y, 'text-anchor': 'middle',
          style: `font:${weight || 700} ${size}px Inter,system-ui,sans-serif;fill:${v('text', '#1f3a5f')};font-variant-numeric:tabular-nums` }, parent || digital);
        e.textContent = s;
        return e;
      };
      if (f.flip) {
        // two cards, hours and minutes; the one whose number changed flips (not on the first draw)
        [[-45, String(h12(h)), prev && prev[0] % 12 !== h % 12], [45, pad(m), prev && prev[1] !== m]].forEach(([x, s, changed]) => {
          const card = el('g', { class: changed ? 'tt-flip' : '' }, digital);
          el('rect', { x: x - 39, y: -40, width: 78, height: 66, rx: 9, style: `fill:${v('rim', '#1f3a5f')}` }, card);
          el('line', { x1: x - 39, y1: -7, x2: x + 39, y2: -7, style: `stroke:${v('face', '#fffdf7')};stroke-width:1.5;opacity:.5` }, card);
          const e = txt(x, 9, s, 46, 800, card);
          e.style.fill = v('face', '#fffdf7');
        });
        txt(0, 52, h < 12 ? 'AM' : 'PM', 14, 700);
        return;
      }
      if (f.format === 'words') {
        const lines = wrapWords(words(h, m, { style }), 14);
        lines.forEach((ln, i) => txt(0, (i - (lines.length - 1) / 2) * 26 + 8, ln, 22, 700));
      } else if (f.format === '24') {
        txt(0, 12, `${pad(h)}:${pad(m)}`, 50);
        txt(0, 46, words(h, m, { style, day: 'ampm' }), 11, 500);
      } else {
        txt(0, 12, `${h12(h)}:${pad(m)}`, 50);
        txt(0, 46, h < 12 ? 'AM' : 'PM', 16, 600);
      }
    }

    function draw() {
      svg.textContent = '';
      hourHand = minuteHand = secondHand = digital = null;
      const f = FACES[faceId];
      COLOR_KEYS.forEach(k => svg.style.removeProperty('--tt-' + k));
      if (f.colors) Object.keys(f.colors).forEach(k => svg.style.setProperty('--tt-' + k, f.colors[k]));
      if (f.kind === 'analog') drawAnalog(f); else drawDigital(f);
      svg.dataset.face = faceId;
      update(false);
    }

    function update(fire) {
      const h = Math.floor(t / 60), m = t % 60;
      if (hourHand) {
        hourHand.setAttribute('transform', `rotate(${((h % 12) * 60 + m) / 2})`);
        minuteHand.setAttribute('transform', `rotate(${m * 6})`);
        secondHand.style.display = sec === null ? 'none' : '';
        if (sec !== null) secondHand.setAttribute('transform', `rotate(${sec * 6})`);
      }
      if (digital) updateDigital();
      const said = words(h, m, { style });
      svg.setAttribute('aria-label', opts.label ? `${opts.label}: ${said}` : said);
      if (interactive) {
        svg.setAttribute('role', 'slider');
        svg.setAttribute('tabindex', '0');
        svg.setAttribute('aria-valuemin', '0');
        svg.setAttribute('aria-valuemax', '1439');
        svg.setAttribute('aria-valuenow', String(t));
        svg.setAttribute('aria-valuetext', said);
      } else svg.setAttribute('role', 'img');
      if (fire) listeners.forEach(fn => { try { fn({ h, m }); } catch (e) { console.error(e); } });
    }

    function setT(nt, fire) {
      nt = ((Math.round(nt) % 1440) + 1440) % 1440;
      const changed = nt !== t;
      t = nt;
      update(fire && changed);
    }

    /* ---- dragging (analogue faces only): the hands are geared, so the hour follows the minute hand round ---- */
    let drag = null;
    function point(ev) {
      const ctm = svg.getScreenCTM();
      if (!ctm) return null;
      const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(ctm.inverse());
      const ang = (Math.atan2(p.x, -p.y) * 180 / Math.PI + 360) % 360;
      return { ang, dist: Math.hypot(p.x, p.y) };
    }
    const angDiff = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

    function onDown(ev) {
      if (!hourHand || liveTimer) return;
      const p = point(ev);
      if (!p || p.dist > 98) return;
      const m = t % 60, hourAng = (((t / 60) % 12) * 30) % 360;
      const which = p.dist < 56 && angDiff(p.ang, hourAng) < angDiff(p.ang, m * 6) + 20 ? 'hour' : 'minute';
      drag = { which, id: ev.pointerId };
      try { svg.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
      ev.preventDefault();
      onMove(ev);
    }
    function onMove(ev) {
      if (!drag || ev.pointerId !== drag.id) return;
      const p = point(ev);
      if (!p) return;
      if (drag.which === 'minute') {
        const cur = t % 60;
        let target = Math.round(p.ang / 6 / snap) * snap % 60;
        let d = target - cur;
        if (d > 30) d -= 60; else if (d < -30) d += 60;
        if (d) setT(t + d, true);
      } else {
        const cur = t % 720;
        const target = Math.round((p.ang * 2) / snap) * snap % 720;
        let d = target - cur;
        if (d > 360) d -= 720; else if (d < -360) d += 720;
        if (d) setT(t + d, true);
      }
    }
    function onUp(ev) {
      if (!drag || ev.pointerId !== drag.id) return;
      drag = null;
      try { svg.releasePointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
    }
    function onKey(ev) {
      if (liveTimer) return;
      const step = { ArrowUp: snap, ArrowRight: snap, ArrowDown: -snap, ArrowLeft: -snap, PageUp: 60, PageDown: -60 }[ev.key];
      if (!step) return;
      ev.preventDefault();
      if (Math.abs(step) === 60 || t % snap === 0) setT(t + step, true);
      else setT(step > 0 ? Math.ceil(t / snap) * snap : Math.floor(t / snap) * snap, true);   // first land on the snap grid
    }
    if (interactive) {
      svg.addEventListener('pointerdown', onDown);
      svg.addEventListener('pointermove', onMove);
      svg.addEventListener('pointerup', onUp);
      svg.addEventListener('pointercancel', onUp);
      svg.addEventListener('keydown', onKey);
    }

    function live(on) {
      if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }
      sec = null;
      if (on) {
        const tick = () => {
          const d = new Date();
          sec = d.getSeconds();
          setT(d.getHours() * 60 + d.getMinutes(), true);
        };
        tick();
        liveTimer = setInterval(tick, 1000);
      } else update(false);
    }

    draw();
    if (opts.live) live(true);

    return {
      svg,
      get: () => ({ h: Math.floor(t / 60), m: t % 60 }),
      set(h, m) { setT(h * 60 + m, false); },
      setFace(id) { if (FACES[id] && id !== faceId) { faceId = id; draw(); } },
      setSnap(n) { snap = Math.max(1, n | 0 || 1); },
      setStyle(s) { style = s === 'us' ? 'us' : 'uk'; draw(); },
      showHands(on) { svg.classList.toggle('tt-nohands', !on); },   // Hide & reveal: hands (analogue) or the read-out (digital)
      live,
      onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      destroy() {
        live(false);
        listeners.clear();
        svg.remove();
      },
    };
  }

  const API = { words, parse, matches, traps, viHint, VI_TIPS, stepOf, random, FACES, clock, _num: num };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.TellingTime = API;
})(typeof window !== 'undefined' ? window : this);

/* @uses teachersdeck/js/tellingtime.js */
const $=s=>document.querySelector(s);
/* Telling Time (scope: hq/docs/TELLING-TIME-SCOPE.md, section 6 "Game"). Six kinds of item, mixed in a round:
   Read it (a clock -> pick the words), Set it (words -> drag the hands), Match it (digital <-> words), Hear it (listen ->
   pick the digital time; fifteen / fifty on purpose), Fix it (a sentence with a typical mistake -> pick the right one),
   Routine (a daily activity and a time -> "I have lunch at half past twelve."). The wrong choices are the typical
   mistakes from the engine (TellingTime.traps). Easy: o'clock to quarters, basic face. Moderate: 5-minute steps, the
   minutes ring and past & to faces, + Hear it and Fix it. Hard: any minute, quarters-only / no-numbers / 24-hour faces,
   + Routine and a.m. / p.m. British or American (a switch, fixed during a round). English only, except the VI button
   after a wrong answer: one Vietnamese line, shown only when tapped, never costs anything. */
const TT=window.TellingTime,{rnd}=TD,pick=a=>a[rnd(0,a.length-1)];
const CFG={easy:{time:90,pts:1,pen:0,step:3,snap:15,types:['read','read','set','match'],faces:['basic'],traps:2},
moderate:{time:90,pts:2,pen:1,step:4,snap:5,types:['read','set','match','hear','fix'],faces:['basic','minutes','pastto'],traps:3},
hard:{time:120,pts:2,pen:1,step:5,snap:1,types:['read','set','hear','fix','routine','routine','match'],faces:['quarters','none','h24','basic'],traps:3}};
const ACTS=[['⏰','get up',330,450],['\u{1F963}','have breakfast',360,480],['\u{1F3EB}','go to school',390,465],['\u{1F371}','have lunch',660,780],
['⚽','play football',930,1050],['\u{1F4DA}','do my homework',1110,1230],['\u{1F372}','have dinner',1080,1170],['\u{1F6CF}️','go to bed',1260,1350]];
const TIPS={part:'in the morning = buổi sáng, in the afternoon = buổi chiều, in the evening = buổi tối, at night = ban đêm.',
at:'Trước giờ dùng "at": at seven o\'clock (không dùng "in" hay "on").'};
const PARTS=['in the morning','in the afternoon','in the evening','at night'];
const partOf=h=>h===0||h>=21?'at night':h<12?'in the morning':h<17?'in the afternoon':'in the evening';
/* where each day part can be right (the engine's TellingTime.matches is as generous): a wrong-part choice must fit none */
const FITS={'in the morning':h=>h>=1&&h<12,'in the afternoon':h=>h>=12&&h<18,'in the evening':h=>h>=17&&h<22,'at night':h=>h>=20||h<4};
let style='uk',run=false,left,timer,right,streak,best,gain,ring,cur=null,clk=null,lockUntil=0,lastType='',lastKey='',voices=[];
try{const q=new URLSearchParams(location.search).get('style');style=q==='us'||q==='uk'?q:(localStorage.getItem('td_tt_style')==='us'?'us':'uk')}catch(e){}

const say=(h,m,o)=>TT.words(h,m,Object.assign({style},o||{}));
const dig=(h,m,ampm)=>`${h%12||12}:${String(m).padStart(2,'0')}${ampm?(h<12?' a.m.':' p.m.'):''}`;
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const loadVoices=()=>{try{voices=speechSynthesis.getVoices()}catch(e){voices=[]}};
if(window.speechSynthesis){loadVoices();speechSynthesis.addEventListener('voiceschanged',loadVoices)}
const canSpeak=()=>!!(window.speechSynthesis&&window.SpeechSynthesisUtterance);
const muted=()=>/off/i.test(($('#mute')||{}).textContent||'');
function speak(text,force){if(!canSpeak()||(muted()&&!force))return;const u=new SpeechSynthesisUtterance(text),want=style==='us'?'en-us':'en-gb',n=v=>String(v.lang||'').replace('_','-').toLowerCase();
u.voice=voices.find(v=>n(v)===want)||voices.find(v=>n(v).startsWith('en'))||null;u.lang=style==='us'?'en-US':'en-GB';u.rate=.85;speechSynthesis.cancel();speechSynthesis.speak(u)}

function time(step){let r,k,tries=0;do{r=TT.random(step);k=(r.h%12)+':'+r.m;tries++}while(k===lastKey&&tries<20);lastKey=k;return r}
/* up to n wrong answers: the typical mistakes first, then other times said the same way */
function wrongs(h,m,correct,n,form,day){const out=[],seen=new Set([correct]);
const add=(text,kind)=>{if(out.length<n&&!seen.has(text)&&!TT.matches(text,h,m)){seen.add(text);out.push({text,kind})}};
if(form==='digital'){const sw={13:30,14:40,15:50,30:13,40:14,50:15}[m];if(sw!==undefined)add(say(h,sw,{form:'digital',day}),'fifty');add(say(h+1,m,{form:'digital',day}),'hour');if(m)add(say(h,60-m,{form:'digital',day}),'pastto')}
else TD.shuffle(TT.traps(h,m,{style,day})).forEach(t=>add(t.text,t.kind));
let g=0;while(out.length<n&&g++<60){const o=TT.random(CFG[TD.level].step);add(form==='digital'?say(o.h,o.m,{form:'digital',day}):say(o.h,o.m,{day}),null)}return out}
function digWrongs(h,m,n,ampm){const out=[],seen=new Set([dig(h,m,ampm)]),add=(hh,mm,kind)=>{const t=dig(((hh%24)+24)%24,mm,ampm);if(out.length<n&&!seen.has(t)){seen.add(t);out.push({text:t,kind})}};
const sw={13:30,14:40,15:50,30:13,40:14,50:15}[m];if(sw!==undefined)add(h,sw,'fifty');if(m)add(m<30?h-1:h+1,60-m,'pastto');add(h+1,m,'hour');if(ampm)add(h+12,m,'ampm');
let g=0;while(out.length<n&&g++<60){const o=TT.random(CFG[TD.level].step);add(o.h,o.m,null)}return out}

function clockIn(el,face,h,m,interactive){if(clk){clk.destroy();clk=null}el.innerHTML='<div class="clk"></div>';
clk=TT.clock(el.firstChild,{face,h,m,style,interactive:!!interactive,snap:CFG[TD.level].snap,label:'Clock'});return clk}

/* ---- the items ---- */
function item(){const c=CFG[TD.level];let ty;do{ty=pick(c.types)}while(ty===lastType&&c.types.length>1&&Math.random()<.7);lastType=ty;
if(ty==='hear'&&!canSpeak())ty='match';
const show=$('#show'),ans=$('#ans');$('#vi').hidden=true;$('#viB').hidden=true;$('#next').hidden=true;$('#msg').textContent='';show.className='show';
let h,m,correct,opts=[],prompt,face=pick(c.faces),after,kind0=null;cur=null;
if(ty==='read'||ty==='fix'){({h,m}=time(c.step));
const digital=TT.FACES[face].kind==='digital',ampm=face==='h24';
if(digital&&face!=='h24')face='basic';
/* 24-hour: digits only (the tile's 24-hour face writes the words underneath, which would give the answer away) */
if(ampm){if(clk){clk.destroy();clk=null}show.innerHTML=`<div class="digi">${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}</div>`}else clockIn(show,face,h,m,false);
const form=!ampm&&TD.level!=='easy'&&Math.random()<.3?'digital':'clock',day=ampm?'ampm':false;
correct=form==='digital'?say(h,m,{form:'digital'}):say(h,m,{day});
opts=wrongs(h,m,correct,c.traps,form,day);
if(ty==='fix'){const bad=opts.find(o=>o.kind&&o.kind!=='hour')||opts.find(o=>o.kind);
if(!bad)ty='read';else{opts=opts.filter(o=>o!==bad);while(opts.length<2){const extra=wrongs(h,m,correct,c.traps+2,'clock',day).find(o=>o.text!==bad.text&&!opts.some(x=>x.text===o.text));if(!extra)break;opts.push(extra)}
prompt='This is wrong. Which is right?';kind0=bad.kind;
show.insertAdjacentHTML('beforeend',`<div class="sent bad">✗ It's ${esc(bad.text)}.</div>`)}}
if(ty==='read')prompt=form==='digital'?'What time is it? (say it like a digital clock)':'What time is it?'}
else if(ty==='set'){({h,m}=time(c.step));if(TT.FACES[face].kind==='digital')face='basic';
const target=TD.level==='hard'&&Math.random()<.4?say(h,m,{form:'digital'}):say(h,m);
clockIn(show,face,12,0,true);prompt='Set the clock:';correct='set';
ans.innerHTML=`<div class="target">${esc(target)}</div><button class="btn" id="check">Check ✓</button><p class="tip">Drag the hands. Arrow keys work too.</p>`;
$('#check').onclick=()=>check();cur={ty,h,m,correct:say(h,m)};$('#q').textContent=prompt;return}
else if(ty==='match'){({h,m}=time(c.step));const rev=TD.level==='hard'&&Math.random()<.5;if(clk){clk.destroy();clk=null}
if(rev){correct=dig(h,m);opts=digWrongs(h,m,c.traps);show.innerHTML=`<div class="words">${esc(say(h,m))}</div>`;prompt='Which clock shows this time?';show.classList.add('dg')}
else{correct=say(h,m);opts=wrongs(h,m,correct,c.traps,'clock',false);show.innerHTML=`<div class="digi">${dig(h,m)}</div>`;prompt='How do you say it?'}}
else if(ty==='hear'){let r=time(c.step);if(Math.random()<.55){const mm=pick([13,14,15,30,40,50]);r={h:r.h,m:mm}}({h,m}=r);if(clk){clk.destroy();clk=null}
correct=dig(h,m);opts=digWrongs(h,m,c.traps);const said="It's "+say(h,m);
show.innerHTML=`<button class="spk" id="spk" aria-label="Listen again">\u{1F50A}</button><div class="tip">Listen, then pick the time.</div>`;
$('#spk').onclick=()=>speak(said,true);after=()=>setTimeout(()=>{if(run)speak(said,true)},350);prompt='What time do you hear?'}
else{const a=pick(ACTS),slot=TD.level==='hard'?1:5;let t=a[2]+rnd(0,Math.floor((a[3]-a[2])/slot))*slot;h=Math.floor(t/60);m=t%60;
const useClock=Math.random()<.5;if(useClock){clockIn(show,'basic',h,m,false);show.insertAdjacentHTML('afterbegin',`<div class="tt-act">${a[0]}</div>`);show.insertAdjacentHTML('beforeend',`<div class="ap">${h<12?'a.m. (morning)':'p.m.'}</div>`)}
else{if(clk){clk.destroy();clk=null}show.innerHTML=`<div class="tt-act">${a[0]}</div><div class="digi">${dig(h,m,true)}</div>`}
const tw=say(h,m,{day:'words'});correct=`I ${a[1]} at ${tw}.`;const seen=new Set([correct]);const add=(text,kind)=>{if(opts.length<c.traps&&!seen.has(text)){seen.add(text);opts.push({text,kind})}};
const wp=PARTS.filter(p=>!FITS[p](h));if(wp.length&&!(m===0&&(h===0||h===12)))add(`I ${a[1]} at ${say(h,m)} ${pick(wp)}.`,'part');
add(`I ${a[1]} in ${tw}.`,'at');TD.shuffle(TT.traps(h,m,{style})).forEach(tr=>add(`I ${a[1]} at ${tr.text} ${partOf(h)}.`,tr.kind));
prompt=`What do you say? (${a[1]})`}
cur={ty,h,m,correct,kind0};
$('#q').textContent=prompt;
const all=TD.shuffle([{text:correct,ok:true},...opts]);ans.innerHTML=all.map((o,i)=>`<button class="ch" data-i="${i}">${esc(o.text)}</button>`).join('');
ans.querySelectorAll('.ch').forEach(b=>b.onclick=()=>choose(b,all[+b.dataset.i]));TD.fx.deal(ans);if(after)after()}

function vi(kind){const h=cur.h,m=cur.m,tip=kind&&(TT.VI_TIPS[kind]||TIPS[kind]);$('#vi').innerHTML=(tip?esc(tip)+'<br>':'')+esc(TT.viHint(h,m,{style}));$('#viB').hidden=false;$('#viB').onclick=()=>{$('#vi').hidden=!$('#vi').hidden;$('#viB').setAttribute('aria-pressed',String(!$('#vi').hidden))};$('#viB').setAttribute('aria-pressed','false')}
function good(){const c=CFG[TD.level];right++;streak++;best=Math.max(best,streak);TD.award(c.pts);gain+=c.pts;TD.sfx('ok')}
function miss(kind){const c=CFG[TD.level];streak=0;TD.sfx('bad');if(c.pen){TD.award(-c.pen);gain-=c.pen}vi(kind)}
function stats(){['nr','ns','nb'].forEach((i,j)=>$('#'+i).textContent=[right,streak,best][j])}
function choose(b,o){if(!run||Date.now()<lockUntil||!cur||cur.done)return;cur.done=true;const ok=!!o.ok;
$('#ans').querySelectorAll('.ch').forEach(x=>{x.disabled=true;if(x.textContent===cur.correct)x.classList.add('yes')});
if(ok){b.classList.add('yes');good();$('#msg').textContent='✓ '+o.text;if(cur.ty!=='hear')speak(cur.ty==='routine'?o.text:"It's "+say(cur.h,cur.m))}
else{b.classList.add('no');TD.fx.shake(b);miss(o.kind||cur.kind0);$('#msg').textContent=cur.ty==='hear'?`It was: "${say(cur.h,cur.m)}" (${dig(cur.h,cur.m)})`:'Right answer: '+cur.correct;speak(cur.ty==='routine'?cur.correct:"It's "+say(cur.h,cur.m))}
stats();advance(ok)}
function check(){if(!run||!cur||cur.done)return;cur.done=true;const g=clk.get(),ok=g.h%12===cur.h%12&&g.m===cur.m;$('#check').disabled=true;
if(ok){good();$('#msg').textContent="✓ It's "+cur.correct+'.';speak("It's "+cur.correct)}
else{miss(null);$('#msg').textContent=`That's ${say(g.h,g.m)}. Here is ${cur.correct}.`;clk.set(cur.h,cur.m);TD.fx.shake($('#show'));speak("It's "+cur.correct)}
stats();advance(ok)}
function advance(ok){if(ok){lockUntil=Date.now()+900;setTimeout(()=>{if(run)item()},900);return}
$('#next').hidden=false;$('#next').onclick=()=>{if(run)item()};$('#next').focus()}

/* ---- rounds ---- */
function styleBar(){$('#sty').innerHTML=['uk','us'].map(s=>`<button class="sb${s===style?' on':''}" data-s="${s}" aria-pressed="${s===style}"${run?' disabled':''}>${s==='uk'?'\u{1F1EC}\u{1F1E7} British':'\u{1F1FA}\u{1F1F8} American'}</button>`).join('');
$('#sty').querySelectorAll('.sb').forEach(b=>b.onclick=()=>{if(run)return;style=b.dataset.s;try{localStorage.setItem('td_tt_style',style)}catch(e){}reset()})}
function reset(){clearInterval(timer);run=false;cur=null;if(clk){clk.destroy();clk=null}
$('#show').className='show';$('#show').innerHTML=`<div class="clk"></div>`;clk=TT.clock($('#show .clk'),{face:CFG[TD.level].faces[0],h:10,m:10,style,interactive:false});
$('#ans').innerHTML='';$('#q').textContent='Ready?';$('#msg').textContent='';$('#vi').hidden=true;$('#viB').hidden=true;$('#next').hidden=true;
$('#turn').textContent=TD.solo?'':TD.team.name+"'s turn";ring=ring||TD.fx.ring($('#time'));ring.reset();$('#time').textContent=TD.solo?'':CFG[TD.level].time+'s';$('#time').classList.remove('low');
$('#prog').textContent={easy:"O'clock, half past, quarters",moderate:'Five-minute steps',hard:'Any minute, a.m. / p.m.'}[TD.level];
$('#ctl').innerHTML='<button class="btn" id="go">Start round</button>';$('#go').onclick=begin;right=streak=best=gain=0;stats();styleBar()}
function begin(){run=true;lockUntil=0;left=CFG[TD.level].time;right=streak=best=gain=0;lastType='';$('#ctl').innerHTML='';styleBar();
if(!TD.solo){TD.fx.banner(TD.team.name,'Go! '+left+' seconds');tick();timer=setInterval(()=>{left--;tick();if(left<=5&&left>0)TD.sfx('tick');if(left<=0)end()},1000)}item()}
function tick(){$('#time').textContent=left+'s';$('#time').classList.toggle('low',left<=10);ring.set(left,CFG[TD.level].time)}
function end(){clearInterval(timer);run=false;if(cur)cur.done=true;$('#q').textContent='Time!';$('#next').hidden=true;$('#ans').querySelectorAll('button').forEach(b=>b.disabled=true);TD.sfx('win');const who=TD.team.name;
$('#msg').textContent=`${who}: ${right} right, net ${gain>=0?'+':''}${gain} points`;TD.nextTeam();styleBar();
$('#ctl').innerHTML=`<button class="btn" id="go">Next team: ${esc(TD.team.name)}</button>`+(TD.teamIndex===0?' <button class="btn ghost" id="pod">\u{1F3C6} Everyone has played: podium</button>':'');
$('#go').onclick=reset;if($('#pod'))$('#pod').onclick=()=>TD.fx.podium()}

/* a classroom wall: a window with drifting clouds, a big clock whose hands turn slowly, a shelf of books */
const books=[['#e05d5d',22],['#4da3ff',18],['#f5c542',26],['#3ddbb0',20],['#ff6fae',16],['#9b7bff',24]].map(([c,w],i,a)=>{const x=1180+a.slice(0,i).reduce((s,b)=>s+b[1]+4,0);return `<rect x="${x}" y="${640-w*3}" width="${w}" height="${w*3}" rx="3" fill="${c}"/>`}).join('');
const WALL=`<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"><rect width="1600" height="900" fill="#1d3557"/><rect y="700" width="1600" height="200" fill="#16263f"/>
<rect x="120" y="140" width="420" height="300" rx="12" fill="#7ab8e8" stroke="#0f2238" stroke-width="14"/><g data-fx="drift:160:22"><ellipse cx="260" cy="250" rx="60" ry="22" fill="#fff" opacity=".85"/><ellipse cx="300" cy="236" rx="40" ry="20" fill="#fff" opacity=".85"/></g><g data-fx="drift:120:30"><ellipse cx="420" cy="350" rx="48" ry="16" fill="#fff" opacity=".7"/></g><path d="M330 140v300M120 290h420" stroke="#0f2238" stroke-width="10"/>
<g transform="translate(860 260)"><circle r="150" fill="#fffdf7" stroke="#0f2238" stroke-width="16" opacity=".9"/>${Array.from({length:12},(_,i)=>`<rect x="-4" y="-138" width="8" height="22" rx="3" fill="#0f2238" transform="rotate(${i*30})"/>`).join('')}
<g data-fx="spin:60"><rect x="-5" y="-110" width="10" height="120" rx="5" fill="#e53e3e"/></g><g data-fx="spin:720"><rect x="-8" y="-72" width="16" height="82" rx="8" fill="#0f2238"/></g><circle r="12" fill="#0f2238"/></g>
<rect x="1160" y="640" width="200" height="14" rx="4" fill="#8a5a2b"/>${books}</svg>`;
TD.fx.scene(WALL);
TD.init({id:'telling-time',title:'Telling Time',onLevel:()=>reset()});
