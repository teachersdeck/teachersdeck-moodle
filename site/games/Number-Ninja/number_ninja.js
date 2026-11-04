/* Number Ninja — a built file from the TeachersDeck Game Library Kit. */
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
const CFG={easy:{time:90,pts:1,pen:0,opts:3},moderate:{time:60,pts:1,pen:1,opts:4},hard:{time:60,pts:2,pen:1,opts:0}};
const {rnd}=TD;
const GEN={
easy:()=>{const t=rnd(0,2);if(t===0){const a=rnd(1,10),b=rnd(1,20-a>10?10:20-a);return[a+' + '+b,a+b]}if(t===1){const a=rnd(5,20),b=rnd(1,a);return[a+' \u2212 '+b,a-b]}const a=[2,5,10][rnd(0,2)],b=rnd(1,10);return[a+' \u00D7 '+b,a*b]},
moderate:()=>{const t=rnd(0,4);if(t===0){const a=rnd(10,99),b=rnd(10,99);return[a+' + '+b,a+b]}if(t===1){const a=rnd(10,60),b=rnd(10,99);return[a+' \u2212 '+b,a-b]}
if(t===2){const a=rnd(2,12),b=rnd(2,12);return[a+' \u00D7 '+b,a*b]}if(t===3){const d=rnd(2,12),q=rnd(2,12);return[d*q+' \u00F7 '+d,q]}
const d=rnd(2,5),n=rnd(1,d-1),w=d*rnd(2,10);return[n+'/'+d+' of '+w,w/d*n]},
hard:()=>{const t=rnd(0,5);let a,b,c,d;
if(t===0){a=rnd(2,20);b=rnd(2,9);c=rnd(2,9);return[a+' + '+b+' \u00D7 '+c,a+b*c]}
if(t===1){a=rnd(2,12);b=rnd(2,12);c=rnd(2,9);return['('+a+' + '+b+') \u00D7 '+c,(a+b)*c]}
if(t===2){a=rnd(3,15);b=rnd(1,30);return[a+'\u00B2 + '+b,a*a+b]}
if(t===3){a=rnd(2,6);b=rnd(1,20);return[a+'\u00B3 \u2212 '+b,a*a*a-b]}
if(t===4){a=rnd(2,9);b=rnd(2,9);c=rnd(2,9);d=rnd(2,9);return[a+' \u00D7 '+b+' \u2212 '+c+' \u00D7 '+d,a*b-c*d]}
a=rnd(1,8);b=rnd(1,8);return['('+a+' + '+b+')\u00B2',(a+b)*(a+b)]}};
let run=false,left,timer,ans,right,streak,best,gain;
function reset(){clearInterval(timer);run=false;$('#choices').innerHTML='';$('#q').textContent='Ready?';$('#card').className='card';
$('#turn').textContent=TD.team.name+"'s turn";$('#time').textContent=CFG[TD.level].time+'s';$('#time').classList.remove('low');$('#prog').textContent=TD.level==='hard'?'Type the answer, press Enter':'Tap the answer or press 1\u20139';
$('#ctl').innerHTML='<button class="btn" id="go">Start round</button>';$('#go').onclick=begin;$('#msg').textContent='';['nr','ns','nb'].forEach(i=>$('#'+i).textContent=0)}
function begin(){run=true;left=CFG[TD.level].time;right=streak=best=gain=0;$('#ctl').innerHTML='';$('#msg').textContent='';['nr','ns','nb'].forEach(i=>$('#'+i).textContent=0);
$('#turn').textContent=TD.team.name+"'s turn";clock();timer=setInterval(()=>{left--;clock();if(left<=5&&left>0)TD.sfx('tick');if(left<=0)end()},1000);ask()}
function clock(){$('#time').textContent=left+'s';$('#time').classList.toggle('low',left<=10)}
function ask(){const g=GEN[TD.level]();ans=g[1];$('#q').textContent=g[0]+' = ?';const c=CFG[TD.level],box=$('#choices');box.innerHTML='';
if(c.opts){const s=new Set([ans]);let sp=Math.max(3,Math.round(Math.abs(ans)*.2));while(s.size<c.opts){const d=rnd(1,sp)*(rnd(0,1)?1:-1),v=ans+d;if(!(TD.level==='easy'&&v<0))s.add(v)}
TD.shuffle([...s]).forEach((v,i)=>{const b=document.createElement('button');b.className='ch';b.textContent=v;b.onclick=()=>answer(v);box.append(b)})}
else{box.innerHTML='<input id="num" type="text" inputmode="numeric" autocomplete="off" aria-label="Your answer">';const n=$('#num');n.focus();n.onkeydown=e=>{if(e.key==='Enter'&&n.value.trim()!==''){answer(Number(n.value.trim()))}}}}
function answer(v){if(!run)return;const c=CFG[TD.level],ok=v===ans,card=$('#card');
card.className='card '+(ok?'ok':'no');setTimeout(()=>{if(run)card.className='card'},250);
if(ok){right++;streak++;best=Math.max(best,streak);let p=c.pts;if(TD.level==='hard'&&streak%5===0){p++;TD.toast('Streak bonus +1')}TD.award(p);gain+=p;TD.sfx('ok')}
else{streak=0;TD.sfx('bad');if(c.pen){TD.award(-c.pen);gain-=c.pen}}
$('#nr').textContent=right;$('#ns').textContent=streak;$('#nb').textContent=best;ask()}
function end(){clearInterval(timer);run=false;$('#choices').innerHTML='';$('#q').textContent='Time!';TD.sfx('win');
const who=TD.team.name;$('#msg').textContent=who+': '+right+' right, best streak '+best+', net '+(gain>=0?'+':'')+gain+' points';
TD.nextTeam();$('#ctl').innerHTML='<button class="btn" id="go">Next team: '+TD.team.name+'</button>';$('#go').onclick=reset}
document.addEventListener('keydown',e=>{if(!run||TD.level==='hard')return;const n=Number(e.key);if(n>=1&&n<=9){const b=document.querySelectorAll('.ch')[n-1];if(b)b.click()}});
TD.init({id:'number-ninja',title:'Number Ninja',onLevel:()=>reset()});
