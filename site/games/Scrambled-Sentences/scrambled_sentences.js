/* Scrambled Sentences — a built file from the TeachersDeck Game Library Kit. */
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

const S=t=>t.map(x=>Array.isArray(x)?x:[x,'']);
const BANK={
easy:S([["I like cats.","\u{1F431}"],["The sun is hot.","\u2600\uFE0F"],["She has a red bag.","\u{1F392}"],["We play in the park.","\u{1F333}"],["He can run fast.","\u{1F3C3}"],["My dog is big.","\u{1F436}"],["Tom drinks milk.","\u{1F95B}"],["The bird can fly.","\u{1F426}"],["I read a book.","\u{1F4D6}"],["They eat lunch at noon.","\u{1F371}"]]),
moderate:S(["Yesterday we walked to the library after school.","She will visit her grandmother next weekend.","My brother didn't finish his homework last night.","We are going to have a picnic if it doesn't rain.","The teacher asked us to open our books quietly.","They have lived in this city for five years.","Can you tell me where the station is?","He usually goes to bed before ten o'clock.","Our class is planning a trip to the science museum.","I was reading a book when the phone rang."]),
hard:S(["The students who finished the experiment early were allowed to help their classmates.","Although it was raining heavily, the festival continued until midnight.","If I had known about the delay, I would have taken a different train.","The book that I borrowed from the library was written by a local author.","By the time the guests arrived, we had already prepared all of the food.","Not only did he forget the tickets, but he also missed the bus.","The bridge, built over a century ago, is still used by thousands of commuters every day.","Having studied all night, she felt confident about the final examination.","Environmental protection is something that every citizen should take seriously.","She asked whether the meeting, which had been postponed twice, would finally take place."])};
const CFG={easy:{time:0,pts:1,pen:0},moderate:{time:75,pts:2,pen:1},hard:{time:60,pts:3,pen:1}};
const $=s=>document.querySelector(s);
let queue,idx,cur,placed,pool,timer,left,locked;
function tile(t,fn){const b=document.createElement('button');b.className='tile';b.textContent=TD.level==='hard'?t.w.toLowerCase():t.w;b.onclick=fn;return b}
function draw(){const a=$('#ans'),p=$('#pool');a.innerHTML='';p.innerHTML='';
placed.forEach(t=>a.append(tile(t,()=>{if(locked)return;placed=placed.filter(x=>x!==t);pool.push(t);draw()})));
pool.forEach(t=>p.append(tile(t,()=>{if(locked)return;pool=pool.filter(x=>x!==t);placed.push(t);TD.sfx('tick');draw()})));
$('#check').disabled=locked||pool.length>0}
function start(){queue=TD.shuffle(BANK[TD.level]);idx=-1;next()}
function next(){clearInterval(timer);idx++;
if(idx>=queue.length){TD.sfx('win');$('#hint').textContent='\u{1F3C6}';$('#ans').className='ans';$('#ans').innerHTML='';$('#pool').innerHTML='';
$('#prog').textContent='Round complete';$('#turn').textContent='';$('#time').textContent='';$('#msg').textContent='Great work! Check the scores, then play again.';
['check','clear','listen'].forEach(i=>$('#'+i).hidden=true);$('#nextb').hidden=false;$('#nextb').textContent='Play again';$('#nextb').onclick=()=>{$('#clear').hidden=false;$('#check').hidden=false;start()};return}
[cur,hintE]=queue[idx];const words=cur.split(' ');
do{pool=TD.shuffle(words.map((w,i)=>({w,i})))}while(words.length>1&&pool.map(t=>t.w).join(' ')===cur);
placed=[];locked=false;
$('#ans').className='ans';$('#msg').textContent='';$('#hint').textContent=hintE;
$('#prog').textContent='Sentence '+(idx+1)+' of '+queue.length;$('#turn').textContent=TD.team.name+"'s turn";
$('#nextb').hidden=true;$('#nextb').textContent='Next sentence';$('#nextb').onclick=()=>{TD.nextTeam();next()};
$('#check').hidden=false;$('#clear').hidden=false;$('#listen').hidden=TD.level!=='easy';
const c=CFG[TD.level];left=c.time;tick(true);
if(c.time)timer=setInterval(()=>{left--;tick();if(left<=0)timeUp()},1000);
draw()}
let hintE='';
function tick(first){const t=$('#time');if(!CFG[TD.level].time){t.textContent='';return}t.textContent=left+'s';t.classList.toggle('low',left<=10);if(!first&&left<=5&&left>0)TD.sfx('tick')}
function timeUp(){clearInterval(timer);locked=true;TD.sfx('bad');$('#ans').className='ans miss';$('#ans').innerHTML='';
cur.split(' ').forEach(w=>{const b=document.createElement('span');b.className='tile';b.textContent=TD.level==='hard'?w.toLowerCase():w;$('#ans').append(b)});
$('#pool').innerHTML='';$('#msg').textContent="Time's up! Here is the sentence.";$('#nextb').hidden=false;$('#check').disabled=true}
$('#check').onclick=()=>{if(locked)return;const c=CFG[TD.level];
if(placed.map(t=>t.w).join(' ').toLowerCase()===cur.toLowerCase()){clearInterval(timer);locked=true;TD.sfx('ok');TD.award(c.pts);
$('#ans').className='ans good';$('#msg').textContent='Correct! +'+c.pts+(c.pts>1?' points':' point');$('#nextb').hidden=false;$('#check').disabled=true;if(TD.level==='easy')TD.speak(cur)}
else{TD.sfx('bad');$('#ans').classList.remove('shake');void $('#ans').offsetWidth;$('#ans').classList.add('shake');
if(c.pen)TD.award(-c.pen);$('#msg').textContent='Not quite. Check the word order.'+(c.pen?' \u22121':'')}};
$('#clear').onclick=()=>{if(locked)return;pool=pool.concat(placed);placed=[];draw()};
$('#listen').onclick=()=>TD.speak(cur);
TD.init({id:'scrambled-sentences',title:'Scrambled Sentences',onLevel:()=>start()});
