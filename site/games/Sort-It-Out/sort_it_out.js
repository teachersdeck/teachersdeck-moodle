/* Sort It Out — a built file from the TeachersDeck Game Library Kit. */
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
/* Click-to-place sorting, same accessible pattern Food Chain Builder uses for its
   food-chain tray (no native HTML5 drag events, which are unreliable on touch/
   tablet — every pilot game already avoids them). Tap an item to select it, then
   tap a bin to place it there; tap a placed item to send it back to the tray. */
const SETS={
easy:{bins:['Living','Non-living'],
  items:[
    ['Dog','\u{1F436}','Living'],['Tree','\u{1F333}','Living'],['Fish','\u{1F41F}','Living'],
    ['Flower','\u{1F33A}','Living'],['Butterfly','\u{1F98B}','Living'],['Mushroom','\u{1F344}','Living'],
    ['Grass','\u{1F33F}','Living'],['Bird','\u{1F426}','Living'],
    ['Rock','\u{1FAA8}','Non-living'],['Car','\u{1F697}','Non-living'],['Chair','\u{1FA91}','Non-living'],
    ['Book','\u{1F4D6}','Non-living'],['Pencil','\u270F\uFE0F','Non-living'],['Bicycle','\u{1F6B2}','Non-living']
  ]},
moderate:{bins:['Mammal','Bird','Reptile','Amphibian','Fish'],
  items:[
    ['Dog',null,'Mammal'],['Whale',null,'Mammal'],['Bat',null,'Mammal'],
    ['Eagle',null,'Bird'],['Penguin',null,'Bird'],['Owl',null,'Bird'],
    ['Snake',null,'Reptile'],['Turtle',null,'Reptile'],['Lizard',null,'Reptile'],
    ['Frog',null,'Amphibian'],['Toad',null,'Amphibian'],['Salamander',null,'Amphibian'],
    ['Salmon',null,'Fish'],['Shark',null,'Fish'],['Eel',null,'Fish']
  ]},
hard:{bins:['Animalia','Plantae','Fungi','Protista','Bacteria (Monera)'],
  items:[
    ['Lion',null,'Animalia'],['Jellyfish',null,'Animalia'],['Human',null,'Animalia'],
    ['Oak tree',null,'Plantae'],['Fern',null,'Plantae'],['Sunflower',null,'Plantae'],
    ['Mushroom',null,'Fungi'],['Yeast',null,'Fungi'],['Mold',null,'Fungi'],
    ['Amoeba',null,'Protista'],['Paramecium',null,'Protista'],['Algae',null,'Protista'],
    ['E. coli',null,'Bacteria (Monera)'],['Streptococcus',null,'Bacteria (Monera)'],['Cyanobacteria',null,'Bacteria (Monera)']
  ]}};
const CFG={easy:{pts:1,pen:0},moderate:{pts:1,pen:1},hard:{pts:2,pen:1}};
let items,placed,sel,mistakes,locked;
function label(it){return it[1]?it[1]+' '+it[0]:it[0]}
/* Cards stop propagation so a click on a card never also bubbles up and fires the
   bin's own onclick (which would immediately try to place whatever's selected into
   that same bin right after the card's own tap/untap ran). */
function card(it,onClick,placedBin){const b=document.createElement('button');b.className='org'+(sel===it?' sel':'')+(placedBin?' placed':'');
b.textContent=label(it);b.onclick=e=>{e.stopPropagation();onClick()};return b}
function draw(){const tray=$('#tray'),bins=$('#bins');
tray.innerHTML='';items.filter(it=>!(it in placed)).forEach(it=>tray.append(card(it,()=>{if(locked)return;sel=sel===it?null:it;draw()})));
bins.innerHTML='';SETS[TD.level].bins.forEach(bin=>{
  const col=document.createElement('div');col.className='bin';
  col.innerHTML='<h3>'+bin+'</h3>';
  const list=document.createElement('div');list.className='bin-list';
  items.filter(it=>placed[it]===bin).forEach(it=>list.append(card(it,()=>{if(locked)return;delete placed[it];sel=null;draw()},true)));
  col.append(list);
  col.onclick=()=>place(bin);
  bins.append(col)});
$('#tally').textContent='Sorted '+Object.keys(placed).length+' of '+items.length}
function place(bin){if(locked||!sel)return;const it=sel,correct=it[2]===bin;
if(correct){placed[it]=bin;sel=null;TD.sfx('ok');TD.award(CFG[TD.level].pts);TD.toast('Correct!');draw();checkDone()}
else{TD.sfx('bad');const c=CFG[TD.level];if(c.pen)TD.award(-c.pen);
$('#msg').textContent=it[0]+' does not belong in '+bin+'.'+(c.pen?' \u2212'+c.pen:'');mistakes++;
document.getElementById('bins').classList.remove('shake');void document.getElementById('bins').offsetWidth;document.getElementById('bins').classList.add('shake')}}
function checkDone(){if(Object.keys(placed).length>=items.length)finish()}
function finish(){locked=true;TD.sfx('win');$('#msg').textContent='Round complete! Sorted with '+mistakes+' mistake'+(mistakes===1?'':'s')+'.';
TD.nextTeam();$('#ctl').innerHTML='<button class="btn" id="go">Next team: '+TD.team.name+'</button>';$('#go').onclick=start}
function start(){items=TD.shuffle(SETS[TD.level].items);placed={};sel=null;mistakes=0;locked=false;
$('#turn').textContent=TD.team.name+"'s turn";$('#msg').textContent='';
$('#ctl').innerHTML='';$('#instr').textContent=TD.level==='easy'?'Tap a card, then tap Living or Non-living.':'Tap a card, then tap the correct group.';
draw();if(TD.level==='easy')TD.speak('Sort each item into Living or Non-living.')}
TD.init({id:'sort-it-out',title:'Sort It Out',onLevel:()=>start()});
