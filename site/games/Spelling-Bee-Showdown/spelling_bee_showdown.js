/* Spelling Bee Showdown — a built file from the TeachersDeck Game Library Kit. */
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
/* word banks — {w: correct spelling, pic: emoji|null, clue: sentence|null}
   The student hears the word and spells it out loud; the teacher clicks the letters on the
   on-screen QWERTY keyboard. So there are no multiple-choice distractors any more.
   easy: CVC words, each with a picture (the teacher can switch pictures off)
   moderate: common 6-8 letter words people actually misspell, text only
   hard: two flavours in one bank: silent-letter words (just hear the word) and homophones
   (clue: a fill-in-the-blank sentence, since audio alone can't tell "their/there/they're" apart) */
const plain=a=>a.map(w=>({w}));
const BANK={
easy:[
  {w:'cat',pic:'\u{1F431}'},{w:'dog',pic:'\u{1F436}'},{w:'sun',pic:'\u2600\uFE0F'},
  {w:'hat',pic:'\u{1F3A9}'},{w:'pig',pic:'\u{1F437}'},{w:'bed',pic:'\u{1F6CF}\uFE0F'},
  {w:'cup',pic:'\u2615'},{w:'bus',pic:'\u{1F68C}'},{w:'box',pic:'\u{1F4E6}'},
  {w:'fish',pic:'\u{1F41F}'},{w:'frog',pic:'\u{1F438}'},{w:'duck',pic:'\u{1F986}'}
],
moderate:plain(['because','friend','believe','receive','separate','sentence','beautiful','february','neighbor','surprise']),
hard:[
  ...plain(['knife','gnome','wrist','thumb','island','honest','subtle','autumn','listen','castle']),
  {w:"they're",clue:"___ going to the park."},{w:'its',clue:'The dog wagged ___ tail.'},
  {w:"you're",clue:"___ doing a great job!"},{w:'two',clue:'I have ___ apples.'},
  {w:"who's",clue:"___ coming to the party?"},{w:'here',clue:'Come sit ___.'},
  {w:'piece',clue:'Can I have a ___ of cake?'},{w:'right',clue:'Turn ___ at the corner.'},
  {w:'whether',clue:"I don't know ___ it will rain."},{w:'principle',clue:'Honesty is an important ___.'}
]};
/* Times are longer than the old tap-the-answer version: spelling aloud and clicking every
   letter takes longer than tapping one choice. */
const CFG={easy:{time:180,pts:1,pen:0},moderate:{time:150,pts:2,pen:1},hard:{time:120,pts:3,pen:1}};
const ROWS=[['q','w','e','r','t','y','u','i','o','p'],['a','s','d','f','g','h','j','k','l'],["'",'z','x','c','v','b','n','m','back']];
const PIC_KEY='td_spelling_pictures';
let queue,idx,cur,run=false,timer,left,right,streak,best,gain,typed='',locked=false,pend=0,showPics=true;
try{const v=JSON.parse(localStorage.getItem(PIC_KEY));if(v!==null)showPics=!!v}catch(e){}
const keyEl={};
function norm(s){return s.trim().toLowerCase().replace(/[\u2018\u2019]/g,"'")}

/* ---- on-screen QWERTY keyboard (the teacher clicks the letters the student spells out) ---- */
function buildKb(){const kb=$('#kb');kb.innerHTML='';
ROWS.forEach(r=>{const row=document.createElement('div');row.className='kr';
r.forEach(k=>{const b=document.createElement('button');b.type='button';b.className='key'+(k==='back'?' wide':'');b.dataset.k=k;
b.textContent=k==='back'?'\u232B':(k==="'"?"'":k.toUpperCase());
b.setAttribute('aria-label',k==='back'?'Backspace':(k==="'"?'Apostrophe':'Letter '+k.toUpperCase()));
b.onclick=()=>press(k);keyEl[k]=b;row.append(b)});kb.append(row)});
const act=document.createElement('div');act.className='kr act';
act.innerHTML='<button type="button" class="btn ghost" id="pass">Pass</button><button type="button" class="btn" id="check">Check spelling</button>';
kb.append(act);$('#pass').onclick=()=>answer(null);$('#check').onclick=submit}
function setKb(on){document.querySelectorAll('#kb button').forEach(b=>b.disabled=!on);$('#kb').classList.toggle('off',!on)}
function renderAnswer(){const a=$('#answer');a.innerHTML='';
[...typed].forEach(ch=>{const s=document.createElement('span');s.textContent=ch;a.append(s)});
if(run&&!locked){const c=document.createElement('span');c.className='caret';a.append(c)}
$('#check').disabled=!run||locked||!typed;$('#pass').disabled=!run||locked}
function press(k){if(!run||locked)return;
if(k==='back')typed=typed.slice(0,-1);else if(typed.length<24)typed+=k;
const b=keyEl[k];if(b){b.classList.add('hit');setTimeout(()=>b.classList.remove('hit'),120)}
renderAnswer()}
function submit(){if(run&&!locked&&typed)answer(typed)}

/* ---- picture option (remembered between sessions) ---- */
function syncOpt(){const b=$('#optPics'),has=BANK[TD.level].some(x=>x.pic);b.disabled=!has;b.setAttribute('aria-pressed',String(has&&showPics));
b.textContent=has?'\u{1F5BC}\uFE0F Pictures: '+(showPics?'On':'Off'):'\u{1F5BC}\uFE0F No pictures at this level'}
function renderPic(){$('#emoji').textContent=run&&cur&&cur.pic&&showPics?cur.pic:''}
$('#optPics').onclick=()=>{showPics=!showPics;try{localStorage.setItem(PIC_KEY,JSON.stringify(showPics))}catch(e){}syncOpt();renderPic()};

function reset(){clearInterval(timer);clearTimeout(pend);run=false;locked=false;typed='';cur=null;
$('#emoji').textContent='';$('#word').textContent='Ready?';$('#clue').textContent='';$('#card').className='card';$('#answer').className='answer';
$('#turn').textContent=TD.team.name+"'s turn";$('#time').textContent=CFG[TD.level].time+'s';$('#time').classList.remove('low');
$('#prog').textContent='Listen, then spell the word letter by letter \u2014 click the keys.';
$('#ctl').innerHTML='<button class="btn" id="go">Start round</button>';$('#go').onclick=begin;$('#msg').textContent='';['nr','ns','nb'].forEach(i=>$('#'+i).textContent=0);
syncOpt();setKb(false);renderAnswer()}
function begin(){run=true;locked=false;typed='';left=CFG[TD.level].time;right=streak=best=gain=0;$('#ctl').innerHTML='';$('#msg').textContent='';['nr','ns','nb'].forEach(i=>$('#'+i).textContent=0);
$('#turn').textContent=TD.team.name+"'s turn";queue=TD.shuffle(BANK[TD.level]);idx=-1;clock();setKb(true);
timer=setInterval(()=>{left--;clock();if(left<=5&&left>0)TD.sfx('tick');if(left<=0)end()},1000);ask()}
function clock(){$('#time').textContent=left+'s';$('#time').classList.toggle('low',left<=10)}
function nextWord(){idx++;if(idx>=queue.length){queue=TD.shuffle(BANK[TD.level]);idx=0}return queue[idx]}
function say(){const parts=[cur.w];if(TD.level==='hard'&&cur.clue)parts.push(cur.clue.replace('___',cur.w));TD.speak(parts.join('. '))}
function ask(){cur=nextWord();typed='';locked=false;renderPic();
$('#clue').textContent=TD.level==='hard'&&cur.clue?cur.clue:'';
$('#word').textContent=TD.level==='easy'?'Spell the word':(TD.level==='hard'&&cur.clue?'Spell the missing word':'Spell the word you hear');
$('#card').className='card';$('#answer').className='answer';renderAnswer();say()}
/* v === null means "Pass": scored exactly like a wrong spelling */
function answer(v){if(!run||locked)return;const c=CFG[TD.level],ok=v!==null&&norm(v)===norm(cur.w),card=$('#card');
locked=true;card.className='card '+(ok?'ok':'no');$('#answer').className='answer '+(ok?'ok':'no');
if(ok){right++;streak++;best=Math.max(best,streak);let p=c.pts;if(TD.level==='hard'&&streak%5===0){p++;TD.toast('Streak bonus +1')}TD.award(p);gain+=p;TD.sfx('ok')}
else{streak=0;TD.sfx('bad');if(c.pen){TD.award(-c.pen);gain-=c.pen}$('#msg').textContent='Correct spelling: '+cur.w}
$('#nr').textContent=right;$('#ns').textContent=streak;$('#nb').textContent=best;renderAnswer();
/* a short pause so the class can see the result; the longer one on a miss lets them read the correct spelling */
pend=setTimeout(()=>{if(!run)return;$('#msg').textContent='';ask()},ok?600:1700)}
function end(){clearInterval(timer);clearTimeout(pend);run=false;locked=false;typed='';cur=null;setKb(false);renderAnswer();$('#answer').className='answer';
$('#card').className='card';$('#word').textContent='Time!';$('#emoji').textContent='';$('#clue').textContent='';TD.sfx('win');
const who=TD.team.name;$('#msg').textContent=who+': '+right+' correct, best streak '+best+', net '+(gain>=0?'+':'')+gain+' points';
TD.nextTeam();$('#ctl').innerHTML='<button class="btn" id="go">Next team: '+TD.team.name+'</button>';$('#go').onclick=reset}
$('#hear').onclick=()=>{if(run&&cur)say()};
/* Mouse clicks shouldn't leave a button focused: otherwise a later physical Enter would "click" it again. */
document.addEventListener('mousedown',e=>{if(e.target.closest&&e.target.closest('button'))e.preventDefault()});
/* The physical keyboard works too (handy on a laptop), except while typing in a team name. */
document.addEventListener('keydown',e=>{if(!run||locked||e.ctrlKey||e.metaKey||e.altKey)return;
const t=e.target;if(t&&(t.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))return;
if(e.key==='Enter'){if(t&&t.tagName==='BUTTON')return;e.preventDefault();submit();return}
if(e.key==='Backspace'){e.preventDefault();press('back');return}
const k=e.key==='\u2019'?"'":e.key.toLowerCase();if(/^[a-z']$/.test(k)){e.preventDefault();press(k)}});
buildKb();
TD.init({id:'spelling-bee-showdown',title:'Spelling Bee Showdown',onLevel:()=>reset()});
