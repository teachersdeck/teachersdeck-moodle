/* Tug of War — a built file from the TeachersDeck Game Library Kit. */
const TD=(()=>{
const LV=['easy','moderate','hard'],LN={easy:'Easy',moderate:'Moderate',hard:'Hard'};
let cfg,level='easy',teams=[],act=0,muted=false,ac;
const $=(s,r=document)=>r.querySelector(s);
const store={get(k,d){try{return JSON.parse(localStorage.getItem(k))??d}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove('show'),2200)}
function tone(f,d,t='sine',at=0,v=.15){if(muted)return;ac=ac||new (window.AudioContext||window.webkitAudioContext)();const o=ac.createOscillator(),g=ac.createGain();o.type=t;o.frequency.value=f;g.gain.setValueAtTime(v,ac.currentTime+at);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+at+d);o.connect(g).connect(ac.destination);o.start(ac.currentTime+at);o.stop(ac.currentTime+at+d)}
function sfx(k){if(k==='ok'){tone(660,.12);tone(880,.18,'sine',.1)}else if(k==='bad'){tone(220,.25,'sawtooth',0,.1)}else if(k==='win'){[523,659,784,1047].forEach((f,i)=>tone(f,.25,'triangle',i*.12))}else if(k==='tick'){tone(900,.05,'square',0,.05)}}
function speak(text){if(muted||!window.speechSynthesis)return;speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='en-US';u.rate=.85;speechSynthesis.speak(u)}
function saveTeams(){store.set('td_teams_'+cfg.id,{teams,act})}
function renderTeams(){const box=$('#td-teams .list');box.innerHTML='';teams.forEach((t,i)=>{const d=document.createElement('div');d.className='team'+(i===act?' act':'');
d.innerHTML=`<span class="nm" contenteditable="true" spellcheck="false"></span><span class="sc">${t.score}</span><span class="pm"><button aria-label="minus one">\u22121</button><button aria-label="plus one">+1</button></span>`;
const nm=$('.nm',d);nm.textContent=t.name;nm.onclick=e=>e.stopPropagation();nm.oninput=()=>{t.name=nm.textContent;saveTeams()};
d.onclick=()=>{act=i;saveTeams();renderTeams()};
const b=d.querySelectorAll('.pm button');b[0].onclick=e=>{e.stopPropagation();award(-1,i)};b[1].onclick=e=>{e.stopPropagation();award(1,i)};box.appendChild(d)});}
function award(n,i=act){teams[i].score=Math.max(0,teams[i].score+n);saveTeams();renderTeams()}
function nextTeam(){act=(act+1)%teams.length;saveTeams();renderTeams()}
function init(c){cfg=c;
const q=new URLSearchParams(location.search).get('level');
level=LV.includes(q)?q:store.get('td_level_'+c.id,'easy');
const s=store.get('td_teams_'+c.id,null);teams=s?s.teams:[{name:'Team 1',score:0},{name:'Team 2',score:0}];act=s?s.act:0;
$('#td-header').className='hdr';
$('#td-header').innerHTML=`<h1>${c.title}</h1><div class="lv" role="group" aria-label="Difficulty">${LV.map(l=>`<button data-l="${l}">${LN[l]}</button>`).join('')}</div><a class="hbtn" href="instructions.html" target="_blank" rel="noopener">How to play</a><button class="hbtn" id="mute">Sound on</button>`;
$('#td-teams').className='side';
$('#td-teams').innerHTML=`<h2>Teams</h2><div class="list"></div><div class="row"><button class="btn ghost" id="addT">+ Team</button><button class="btn ghost" id="rstT">Reset scores</button></div><div class="row"><button class="btn" id="sendT">Send to Scoreboard</button></div>`;
$('#mute').onclick=()=>{muted=!muted;$('#mute').textContent=muted?'Sound off':'Sound on';if(muted&&window.speechSynthesis)speechSynthesis.cancel()};
$('#addT').onclick=()=>{if(teams.length<6){teams.push({name:'Team '+(teams.length+1),score:0});saveTeams();renderTeams()}else toast('Six teams is the maximum')};
$('#rstT').onclick=()=>{teams.forEach(t=>t.score=0);saveTeams();renderTeams();toast('Scores reset')};
$('#sendT').onclick=()=>{store.set('td_scoreboard_transfer',{teams:teams.map(t=>({name:t.name,score:t.score})),from:cfg.title,ts:Date.now()});toast('Scores sent to the Scoreboard widget')};
document.querySelectorAll('.lv button').forEach(b=>b.onclick=()=>setLevel(b.dataset.l));
setLevel(level,true);renderTeams()}
function setLevel(l,first){level=l;store.set('td_level_'+cfg.id,l);document.querySelectorAll('.lv button').forEach(b=>b.classList.toggle('on',b.dataset.l===l));cfg.onLevel(l,first)}
const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const rnd=(a,b)=>Math.floor(Math.random()*(b-a+1))+a;
return{init,toast,sfx,speak,award,nextTeam,shuffle,rnd,get level(){return level},get team(){return teams[act]}}})();

const $=s=>document.querySelector(s);
/* Tug of War is a 2-side pull, so it always races the FIRST TWO teams in the roster
   (TD's shared roster still supports up to 6 teams for the sidebar/Scoreboard, but
   only teams[0] and teams[1] hold a rope end). Turns alternate strictly 0,1,0,1...
   independent of TD's own act/nextTeam cycling, so extra teams don't break the pull. */
const CFG={
  easy:{time:20,pts:1,pen:0,opts:3},
  moderate:{time:12,pts:1,pen:1,opts:4},
  hard:{time:10,pts:2,pen:1,opts:0}
};
const POS_MIN=-3,POS_MAX=3;
const {rnd}=TD;
const GEN={
  easy:()=>{const t=[2,3,4,5][rnd(0,3)],f=rnd(1,10);return[t+' \u00D7 '+f,t*f]},
  moderate:()=>{if(rnd(0,1)===0){const f=rnd(2,12);return['12 \u00D7 '+f,12*f]}const d=rnd(2,12),q=rnd(2,12);return[(d*q)+' \u00F7 '+d,q]},
  hard:()=>{const t=rnd(0,2);
    if(t===0){const n=rnd(2,15);return[n+'\u00B2',n*n]}
    if(t===1){const n=rnd(2,15);return['\u221A'+(n*n),n]}
    const primes=[2,3,5,7,11,13];let n;do{n=rnd(20,90)}while(primes.includes(n));
    let p=primes.find(x=>n%x===0);if(!p){p=2;n=90}return['Largest factor of '+n+' (other than '+n+' itself)',n/p]}
};
let pos=0,pull=0,run=false,timer,left,rounds,winner;
/* TD's kit doesn't expose the raw teams array, only the active one (TD.team) — so
   Tug of War keeps its own tiny mirror synced from localStorage the same key the kit
   already writes to (td_teams_<id>), read once at init and again whenever the kit's
   own +1/\u22121/rename controls might have changed it (before each question). */
function store(){try{return JSON.parse(localStorage.getItem('td_teams_tug-of-war'))}catch(e){return null}}
function names(){const s=store();const t=s&&s.teams;return[t&&t[0]?t[0].name:'Team 1',t&&t[1]?t[1].name:'Team 2']}
function drawRope(){const [nameA,nameB]=names();$('#sideA').textContent=nameA;$('#sideB').textContent=nameB;
/* #track's own innerHTML gets fully rebuilt each call (notch count never changes, but this stays
   simple), so the #flag marker is rebuilt here too rather than relying on the one from the static
   HTML — that original element is gone after the first rebuild. */
const track=$('#track');track.innerHTML='';
for(let p=POS_MIN;p<=POS_MAX;p++){const n=document.createElement('span');n.className='notch'+(p===0?' mid':'');track.append(n)}
const flag=document.createElement('div');flag.id='flag';
const pct=((pos-POS_MIN)/(POS_MAX-POS_MIN))*100;flag.style.left=pct+'%';track.append(flag);
track.classList.toggle('edgeA',pos<=POS_MIN);track.classList.toggle('edgeB',pos>=POS_MAX)}
function reset(){clearInterval(timer);run=false;pos=0;pull=0;rounds=0;$('#choices').innerHTML='';$('#q').textContent='Ready?';$('#card').className='card';
drawRope();$('#turn').textContent=names()[pull]+"'s pull";$('#time').textContent=CFG[TD.level].time+'s';$('#time').classList.remove('low');
$('#prog').textContent=TD.level==='hard'?'Type the answer, press Enter':'Tap the answer or press 1\u20139';
$('#ctl').innerHTML='<button class="btn" id="go">Start tug of war</button>';$('#go').onclick=begin;$('#msg').textContent=''}
function begin(){run=true;drawRope();ask()}
function ask(){clearInterval(timer);left=CFG[TD.level].time;clock();
$('#turn').textContent=names()[pull]+"'s pull";
timer=setInterval(()=>{left--;clock();if(left<=3&&left>0)TD.sfx('tick');if(left<=0)settle(false)},1000);
const g=GEN[TD.level]();ans=g[1];$('#q').textContent=g[0]+' = ?';const c=CFG[TD.level],box=$('#choices');box.innerHTML='';
if(c.opts){const s=new Set([ans]);let sp=Math.max(3,Math.round(Math.abs(ans)*.2)||3);while(s.size<c.opts){const d=rnd(1,sp)*(rnd(0,1)?1:-1),v=ans+d;if(v>0)s.add(v)}
TD.shuffle([...s]).forEach(v=>{const b=document.createElement('button');b.className='ch';b.textContent=v;b.onclick=()=>settle(v===ans);box.append(b)})}
else{box.innerHTML='<input id="num" type="text" inputmode="numeric" autocomplete="off" aria-label="Your answer">';const n=$('#num');n.focus();
n.onkeydown=e=>{if(e.key==='Enter'&&n.value.trim()!==''){settle(Number(n.value.trim())===ans)}}}}
let ans;
function settle(correct){clearInterval(timer);const c=CFG[TD.level],card=$('#card');
card.className='card '+(correct?'ok':'no');setTimeout(()=>{card.className='card'},250);
const dir=pull===0?-1:1;
if(correct){pos=Math.max(POS_MIN,Math.min(POS_MAX,pos+dir));TD.award(c.pts,pull);TD.sfx('ok');$('#msg').textContent=names()[pull]+' pulls it their way! +'+c.pts}
else{TD.sfx('bad');if(c.pen){pos=Math.max(POS_MIN,Math.min(POS_MAX,pos-dir));TD.award(-c.pen,pull);$('#msg').textContent='Missed \u2014 the rope slips back. '+(c.pen?'\u2212'+c.pen:'')}
else $('#msg').textContent='Missed \u2014 no movement at Easy.'}
drawRope();rounds++;
if(pos<=POS_MIN||pos>=POS_MAX){winner=pos<=POS_MIN?0:1;return win()}
pull=1-pull;setTimeout(()=>{if(run){$('#msg').textContent='';ask()}},900)}
function win(){run=false;clearInterval(timer);TD.sfx('win');$('#choices').innerHTML='';$('#q').textContent=names()[winner]+' wins the tug of war! \ud83c\udfc6';
TD.award(2,winner);$('#msg').textContent=names()[winner]+' gets a +2 bonus for pulling the rope all the way.';
$('#ctl').innerHTML='<button class="btn" id="go">New round</button>';$('#go').onclick=reset}
function clock(){$('#time').textContent=left+'s';$('#time').classList.toggle('low',left<=5)}
document.addEventListener('keydown',e=>{if(!run||TD.level==='hard')return;const n=Number(e.key);if(n>=1&&n<=9){const b=document.querySelectorAll('.ch')[n-1];if(b)b.click()}});
TD.init({id:'tug-of-war',title:'Tug of War',onLevel:()=>reset()});
