/* Food Chain Builder — a built file from the TeachersDeck Game Library Kit. */
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
const ECO=[
{name:'Grassland',prod:['grass'],energy:10000,easy:['grass','rabbit','fox'],
 o:{grass:['\u{1F331}','Grass'],hopper:['\u{1F997}','Grasshopper'],mouse:['\u{1F42D}','Mouse'],rabbit:['\u{1F407}','Rabbit'],frog:['\u{1F438}','Frog'],snake:['\u{1F40D}','Snake'],hawk:['\u{1F985}','Hawk'],fox:['\u{1F98A}','Fox']},
 e:[['grass','hopper'],['grass','mouse'],['grass','rabbit'],['hopper','frog'],['mouse','snake'],['frog','snake'],['rabbit','fox'],['rabbit','hawk'],['snake','hawk'],['mouse','hawk'],['mouse','fox']]},
{name:'Ocean',prod:['phyto'],energy:10000,easy:['phyto','krill','fish'],
 o:{phyto:['\u{1F33F}','Phytoplankton'],krill:['\u{1F990}','Krill'],fish:['\u{1F41F}','Small fish'],squid:['\u{1F991}','Squid'],seal:['\u{1F9AD}','Seal'],shark:['\u{1F988}','Shark'],orca:['\u{1F40B}','Orca']},
 e:[['phyto','krill'],['krill','fish'],['krill','squid'],['fish','squid'],['fish','seal'],['fish','shark'],['squid','seal'],['squid','shark'],['seal','orca'],['shark','orca']]},
{name:'Pond',prod:['weed'],energy:10000,easy:['weed','snail','duck'],
 o:{weed:['\u{1F33F}','Pond weed'],snail:['\u{1F40C}','Snail'],larva:['\u{1F41B}','Insect larva'],fish:['\u{1F41F}','Small fish'],frog:['\u{1F438}','Frog'],duck:['\u{1F986}','Duck'],otter:['\u{1F9A6}','Otter']},
 e:[['weed','snail'],['weed','larva'],['snail','duck'],['larva','fish'],['larva','frog'],['fish','otter'],['frog','otter'],['fish','duck']]}];
const ROLE=['Producer','Primary consumer','Secondary consumer','Tertiary consumer','Quaternary consumer'];
const CFG={easy:{pts:1,pen:0,min:3},moderate:{pts:2,pen:1,min:4},hard:{pts:2,pen:1,min:4}};
let order,idx,eco,chain,locked,stage;
function start(){order=TD.shuffle(ECO);idx=-1;next()}
function next(){idx++;
if(idx>=order.length){TD.sfx('win');$('#task').textContent='Round complete! \u{1F3C6}';$('#chain').innerHTML='';$('#tray').innerHTML='';$('#en').style.display='none';$('#prog').textContent='';$('#turn').textContent='';$('#msg').textContent='Check the scores, then play again.';
['check','clear','listen'].forEach(i=>$('#'+i).hidden=true);$('#nextb').hidden=false;$('#nextb').textContent='Play again';$('#nextb').onclick=()=>{$('#check').hidden=false;$('#clear').hidden=false;start()};return}
eco=order[idx];chain=[];locked=false;stage='chain';const L=TD.level;
$('#prog').textContent='Ecosystem '+(idx+1)+' of '+order.length;$('#turn').textContent=TD.team.name+"'s turn";
$('#task').textContent=eco.name+': build a food chain'+(L==='easy'?' with 3 links':' with at least 4 links');
$('#msg').textContent='';$('#chain').className='chain';$('#en').style.display='none';
$('#nextb').hidden=true;$('#nextb').textContent='Next ecosystem';$('#nextb').onclick=()=>{TD.nextTeam();next()};
$('#check').hidden=false;$('#check').textContent='Check chain';$('#clear').hidden=false;$('#listen').hidden=L!=='easy';
$('#sub').textContent=L==='easy'?'Start with the plant. Arrows show the direction of energy: eaten \u2192 eater':'Start with a producer and follow who eats whom. Arrows show the direction of energy.';
tray=TD.shuffle(L==='easy'?eco.easy:Object.keys(eco.o));draw()}
let tray=[];
function card(id,fn,role){const [em,nm]=eco.o[id],b=document.createElement('button');b.className='org';b.innerHTML='<span class="e">'+em+'</span><span class="n">'+nm+'</span><span class="r">'+(role||'')+'</span>';b.onclick=fn;return b}
function draw(showRoles){const c=$('#chain'),t=$('#tray');c.innerHTML='';t.innerHTML='';
chain.forEach((id,i)=>{if(i)c.insertAdjacentHTML('beforeend','<span class="arr">\u2192</span>');c.append(card(id,()=>{if(locked)return;chain=chain.slice(0,i);draw()},showRoles?ROLE[i]:''))});
tray.filter(id=>!chain.includes(id)).forEach(id=>t.append(card(id,()=>{if(locked||stage!=='chain')return;chain.push(id);TD.sfx('tick');draw()})))}
function nm(id){return eco.o[id][1]}
function validate(){const L=CFG[TD.level];if(!chain.length)return'Add some organisms first.';
if(!eco.prod.includes(chain[0]))return nm(chain[0])+' is not a producer. A food chain starts with a plant or algae.';
for(let i=1;i<chain.length;i++)if(!eco.e.some(p=>p[0]===chain[i-1]&&p[1]===chain[i]))return nm(chain[i])+' does not eat '+nm(chain[i-1])+'.';
if(chain.length<L.min)return'Add more links. You need at least '+L.min+'.';return''}
function win(){const c=CFG[TD.level];locked=true;TD.sfx('ok');TD.award(c.pts);$('#chain').className='chain good';draw(true);
$('#msg').textContent='Correct! +'+c.pts+' points'+(TD.level==='hard'?' so far':'');$('#check').hidden=true;$('#nextb').hidden=false;if(TD.level==='easy')TD.speak(chain.map(nm).join(', eaten by '))}
$('#check').onclick=()=>{if(locked)return;const c=CFG[TD.level];
if(stage==='energy'){const need=eco.energy*Math.pow(.1,chain.length-1),v=Number($('#enin').value.trim().replace(/,/g,''));if($('#enin').value.trim()==='')return;
if(Math.abs(v-need)<1e-9){TD.sfx('ok');TD.award(1);locked=true;$('#msg').textContent='Correct! Each step passes on only 10% of the energy. +1 point';$('#check').hidden=true;$('#en').style.display='none';$('#nextb').hidden=false}
else{TD.sfx('bad');if(c.pen)TD.award(-c.pen);$('#msg').textContent='Not quite. Each step keeps only 10%.'+(c.pen?' \u22121':'')}return}
const err=validate();
if(err){TD.sfx('bad');$('#chain').classList.remove('shake');void $('#chain').offsetWidth;$('#chain').classList.add('shake');if(c.pen)TD.award(-c.pen);$('#msg').textContent=err+(c.pen?' \u22121':'');return}
if(TD.level==='hard'){TD.sfx('ok');TD.award(c.pts);stage='energy';$('#chain').className='chain good';draw(true);$('#enq').textContent=nm(chain[0])+' captures '+eco.energy.toLocaleString()+' kJ. How much energy reaches the '+nm(chain[chain.length-1])+'?';$('#en').style.display='block';$('#enin').value='';$('#enin').focus();$('#check').textContent='Check energy';$('#msg').textContent='Chain correct! +'+c.pts+'. Now the energy question.';$('#clear').hidden=true}
else win()};
$('#enin').onkeydown=e=>{if(e.key==='Enter')$('#check').click()};
$('#clear').onclick=()=>{if(locked)return;chain=[];draw()};
$('#listen').onclick=()=>TD.speak(tray.map(nm).join(', '));
TD.init({id:'food-chain-builder',title:'Food Chain Builder',onLevel:()=>start()});
