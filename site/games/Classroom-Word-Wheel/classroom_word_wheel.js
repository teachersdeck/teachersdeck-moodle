  // ---------------- Sound engine ----------------
  let audioCtx = null;
  let muted = false;

  function getAudioCtx(){
    if(!audioCtx){
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if(audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function playTone(freq, {duration=0.2, type='sine', gain=0.22, delay=0, freqEnd=null} = {}){
    if(muted) return;
    const ctx = getAudioCtx();
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if(freqEnd !== null){
      osc.frequency.exponentialRampToValueAtTime(freqEnd, t0 + duration);
    }
    gainNode.gain.setValueAtTime(0.0001, t0);
    gainNode.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gainNode).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.03);
  }

  function playTick(){
    if(muted) return;
    const ctx = getAudioCtx();
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1100, t0);
    gainNode.gain.setValueAtTime(0.0001, t0);
    gainNode.gain.exponentialRampToValueAtTime(0.16, t0 + 0.004);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.045);
    osc.connect(gainNode).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.06);
  }

  function playSpinTicks(totalDurationMs){
    const tickCount = 26;
    for(let i=0;i<tickCount;i++){
      const t = i / (tickCount - 1);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic: dense at start, sparse at end
      const time = eased * totalDurationMs;
      setTimeout(()=>{ playTick(); }, time);
    }
  }

  function playDing(){
    // bright two-note chime for a correct letter
    playTone(1046.5, {duration:0.22, type:'sine', gain:0.24});
    playTone(1568, {duration:0.35, type:'sine', gain:0.2, delay:0.09});
  }

  function playGong(){
    if(muted) return;
    const ctx = getAudioCtx();
    const t0 = ctx.currentTime;

    // Percussive mallet attack: quick pitch drop, clearly audible range
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(320, t0);
    osc1.frequency.exponentialRampToValueAtTime(150, t0 + 0.13);
    gain1.gain.setValueAtTime(0.0001, t0);
    gain1.gain.exponentialRampToValueAtTime(0.45, t0 + 0.008);
    gain1.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
    osc1.connect(gain1).connect(ctx.destination);
    osc1.start(t0);
    osc1.stop(t0 + 0.55);

    // Low resonant body for gong sustain
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(196, t0);
    osc2.frequency.exponentialRampToValueAtTime(112, t0 + 0.6);
    gain2.gain.setValueAtTime(0.0001, t0);
    gain2.gain.exponentialRampToValueAtTime(0.38, t0 + 0.02);
    gain2.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.65);
    osc2.connect(gain2).connect(ctx.destination);
    osc2.start(t0);
    osc2.stop(t0 + 0.7);
  }

  function playWinSound(){
    if(muted) return;
    const runNotes = [523.25, 659.25, 783.99, 1046.5, 1318.51]; // C5 E5 G5 C6 E6
    runNotes.forEach((freq, i)=>{
      playTone(freq, {duration:0.32, type:'triangle', gain:0.24, delay: i * 0.11});
    });
    // shimmering final chord
    const chordDelay = runNotes.length * 0.11 + 0.05;
    playTone(1046.5, {duration:0.7, type:'sine', gain:0.18, delay: chordDelay});
    playTone(1318.51, {duration:0.7, type:'sine', gain:0.16, delay: chordDelay});
    playTone(1567.98, {duration:0.7, type:'sine', gain:0.14, delay: chordDelay});
  }

  function isPuzzleSolved(){
    return tileRefs.length > 0 && tileRefs.every(ref => ref.data.revealed);
  }

  const muteBtn = document.getElementById('muteBtn');
  const soundOnIcon = document.getElementById('soundOnIcon');
  const soundOffIcon = document.getElementById('soundOffIcon');
  const muteLabel = document.getElementById('muteLabel');

  muteBtn.addEventListener('click', ()=>{
    muted = !muted;
    muteBtn.classList.toggle('muted', muted);
    soundOnIcon.style.display = muted ? 'none' : '';
    soundOffIcon.style.display = muted ? '' : 'none';
    muteLabel.textContent = muted ? 'Sound: Off' : 'Sound: On';
    if(!muted) getAudioCtx();
  });

  // ---------------- Puzzle state ----------------
  let puzzleWords = [];   // array of arrays of {char, isLetter, revealed}
  let tileRefs = [];      // flat list of {data, el}

  const puzzleBoard = document.getElementById('puzzleBoard');
  const categoryDisplay = document.getElementById('categoryDisplay');
  const keyboardEl = document.getElementById('keyboard');
  const hostPanel = document.getElementById('hostPanel');

  function toast(msg){
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(()=>t.classList.remove('show'), 2200);
  }

  document.getElementById('toggleHost').addEventListener('click', ()=>{
    hostPanel.classList.toggle('open');
  });
  document.getElementById('closeHost').addEventListener('click', ()=>{
    hostPanel.classList.remove('open');
  });

  function buildKeyboard(){
    keyboardEl.innerHTML = '';
    const vowels = 'AEIOU';
    for(let i=0;i<26;i++){
      const letter = String.fromCharCode(65+i);
      const btn = document.createElement('button');
      btn.className = 'key' + (vowels.includes(letter) ? ' vowel' : '');
      btn.textContent = letter;
      btn.dataset.letter = letter;
      btn.addEventListener('click', ()=>guessLetter(letter, btn));
      keyboardEl.appendChild(btn);
    }
  }

  function resetKeyboard(){
    keyboardEl.querySelectorAll('.key').forEach(btn=>{
      btn.disabled = false;
      btn.classList.remove('correct','incorrect');
    });
  }

  function guessLetter(letter, btn){
    if(btn.disabled) return;
    if(tileRefs.length === 0){ toast('Create a puzzle first.'); return; }
    let matches = 0;
    tileRefs.forEach(ref=>{
      if(ref.data.isLetter && ref.data.char === letter && !ref.data.revealed){
        ref.data.revealed = true;
        matches++;
        renderTile(ref);
      }
    });
    btn.disabled = true;
    btn.classList.add(matches > 0 ? 'correct' : 'incorrect');
    if(matches > 0){
      playDing();
      if(isPuzzleSolved()){
        setTimeout(()=>playWinSound(), 350);
      }
    } else {
      playGong();
    }
  }

  function renderTile(ref){
    ref.el.classList.remove('pop');
    if(ref.data.revealed){
      ref.el.textContent = ref.data.char;
      ref.el.classList.add('revealed');
      void ref.el.offsetWidth;
      ref.el.classList.add('pop');
    } else {
      ref.el.textContent = '';
      ref.el.classList.remove('revealed');
    }
  }

  function buildPuzzle(phrase, category){
    phrase = phrase.trim().toUpperCase();
    if(!phrase) return;
    puzzleWords = phrase.split(/\s+/).map(word =>
      Array.from(word).map(ch => ({
        char: ch,
        isLetter: /[A-Z]/.test(ch),
        revealed: !/[A-Z]/.test(ch)
      }))
    );
    categoryDisplay.textContent = category ? 'Category: ' + category : '';
    renderPuzzle();
    resetKeyboard();
    setSpinResult(null);
  }

  function renderPuzzle(){
    puzzleBoard.innerHTML = '';
    tileRefs = [];
    puzzleWords.forEach(word=>{
      const wordGroup = document.createElement('div');
      wordGroup.className = 'word-group';
      word.forEach(charData=>{
        const tile = document.createElement('div');
        tile.className = 'tile' + (charData.isLetter ? '' : ' static');
        if(!charData.isLetter){
          tile.textContent = charData.char;
        } else if(charData.revealed){
          tile.textContent = charData.char;
          tile.classList.add('revealed');
        }
        if(charData.isLetter){
          tile.addEventListener('click', ()=>{
            if(!charData.revealed){
              charData.revealed = true;
              renderTile(ref);
              playDing();
              if(isPuzzleSolved()){
                setTimeout(()=>playWinSound(), 350);
              }
            }
          });
        }
        const ref = {data: charData, el: tile};
        tileRefs.push(ref);
        wordGroup.appendChild(tile);
      });
      puzzleBoard.appendChild(wordGroup);
    });
  }

  document.getElementById('createPuzzle').addEventListener('click', ()=>{
    const wordInput = document.getElementById('wordInput');
    const categoryInput = document.getElementById('categoryInput');
    const phrase = wordInput.value;
    if(!phrase.trim()){
      toast('Type a word or phrase first.');
      return;
    }
    buildPuzzle(phrase, categoryInput.value.trim());
    wordInput.value = '';
    hostPanel.classList.remove('open');
    toast('Puzzle created.');
  });

  document.getElementById('revealAnswer').addEventListener('click', ()=>{
    if(tileRefs.length === 0){ toast('No puzzle yet.'); return; }
    tileRefs.forEach(ref=>{
      if(!ref.data.revealed){
        ref.data.revealed = true;
        renderTile(ref);
      }
    });
    hostPanel.classList.remove('open');
    playWinSound();
  });

  document.getElementById('newPuzzleBtn').addEventListener('click', ()=>{
    puzzleWords = [];
    tileRefs = [];
    puzzleBoard.innerHTML = '<div class="puzzle-empty">Tap "Host setup" to enter a word or phrase and build the puzzle.</div>';
    categoryDisplay.textContent = '';
    resetKeyboard();
    setSpinResult(null);
    hostPanel.classList.add('open');
    document.getElementById('wordInput').focus();
  });

  buildKeyboard();

  // ---------------- Wheel ----------------
  const SLICES = [
    {label:'+1', type:'points', value:1},
    {label:'+2', type:'points', value:2},
    {label:'LOSE A TURN', type:'special'},
    {label:'+4', type:'points', value:4},
    {label:'+3', type:'points', value:3},
    {label:'FREE SPIN', type:'special'},
    {label:'+5', type:'points', value:5},
    {label:'+2', type:'points', value:2},
    {label:'BANKRUPT', type:'special'},
    {label:'+3', type:'points', value:3},
    {label:'+1', type:'points', value:1},
    {label:'+4', type:'points', value:4},
  ];
  const PALETTE = ['#E8543E','#3E8FD0','#F0B429','#5EA85C','#8B5FBF','#2FA79A'];
  const DARK_TEXT_COLORS = new Set(['#F0B429']);
  const sliceAngle = 360 / SLICES.length;

  const wheelEl = document.getElementById('wheel');
  let currentRotation = 0;
  let spinning = false;
  let currentSpin = null;

  function buildWheel(){
    const stops = SLICES.map((s,i)=>{
      const color = PALETTE[i % PALETTE.length];
      return `${color} ${i*sliceAngle}deg ${(i+1)*sliceAngle}deg`;
    }).join(', ');
    wheelEl.style.background = `conic-gradient(from 0deg, ${stops})`;

    SLICES.forEach((s,i)=>{
      const mid = i*sliceAngle + sliceAngle/2;
      const color = PALETTE[i % PALETTE.length];
      const label = document.createElement('div');
      label.className = 'slice-label';
      label.style.width = '135px';
      label.style.transform = `rotate(${mid - 90}deg)`;
      const span = document.createElement('span');
      span.textContent = s.label;
      span.style.color = DARK_TEXT_COLORS.has(color) ? '#0B1220' : '#FFFFFF';
      label.appendChild(span);
      wheelEl.appendChild(label);
    });
  }
  buildWheel();

  function setSpinResult(slice){
    currentSpin = slice;
    const resultEl = document.getElementById('spinResult');
    const applyBtn = document.getElementById('applyBtn');
    if(!slice){
      resultEl.textContent = '\u00A0';
      applyBtn.disabled = true;
      return;
    }
    resultEl.textContent = 'Landed on: ' + slice.label;
    applyBtn.disabled = false;
  }

  document.getElementById('spinBtn').addEventListener('click', ()=>{
    if(spinning) return;
    spinning = true;
    setSpinResult(null);
    document.getElementById('spinBtn').disabled = true;

    const extraTurns = 5 + Math.random() * 3;
    const randomOffset = Math.random() * 360;
    currentRotation += extraTurns * 360 + randomOffset;

    wheelEl.style.transition = 'transform 4s cubic-bezier(0.15, 0.7, 0.2, 1)';
    wheelEl.style.transform = `rotate(${currentRotation}deg)`;
    playSpinTicks(4000);

    setTimeout(()=>{
      const normalized = (360 - (currentRotation % 360)) % 360;
      const index = Math.floor(normalized / sliceAngle) % SLICES.length;
      setSpinResult(SLICES[index]);
      spinning = false;
      document.getElementById('spinBtn').disabled = false;
    }, 4100);
  });

  document.getElementById('applyBtn').addEventListener('click', ()=>{
    if(!currentSpin) return;
    if(activeTeam === null){
      toast('Select the active team first.');
      return;
    }
    if(currentSpin.type === 'points'){
      teams[activeTeam].score += currentSpin.value;
    } else if(currentSpin.label === 'BANKRUPT'){
      teams[activeTeam].score = 0;
    } else {
      toast(currentSpin.label + ' — no score change to apply.');
    }
    renderTeams();
    document.getElementById('applyBtn').disabled = true;
  });

  // ---------------- Scoreboard ----------------
  let teams = [
    {name:'Team One', score:0},
    {name:'Team Two', score:0},
    {name:'Team Three', score:0},
    {name:'Team Four', score:0},
  ];
  let activeTeam = null;

  const teamsEl = document.getElementById('teams');

  function renderTeams(){
    teamsEl.innerHTML = '';
    teams.forEach((team, i)=>{
      const card = document.createElement('div');
      card.className = 'team-card' + (activeTeam === i ? ' active' : '');
      card.addEventListener('click', ()=>{
        activeTeam = i;
        renderTeams();
      });

      const nameInput = document.createElement('input');
      nameInput.className = 'team-name';
      nameInput.value = team.name;
      nameInput.maxLength = 18;
      nameInput.addEventListener('click', e=>e.stopPropagation());
      nameInput.addEventListener('input', ()=>{ team.name = nameInput.value; });
      card.appendChild(nameInput);

      const scoreDiv = document.createElement('div');
      scoreDiv.className = 'team-score';
      scoreDiv.textContent = team.score;
      card.appendChild(scoreDiv);

      const btnRow = document.createElement('div');
      btnRow.className = 'team-btns';
      const minus = document.createElement('button');
      minus.textContent = '\u22121';
      minus.addEventListener('click', e=>{ e.stopPropagation(); team.score -= 1; renderTeams(); });
      const plus = document.createElement('button');
      plus.textContent = '+1';
      plus.addEventListener('click', e=>{ e.stopPropagation(); team.score += 1; renderTeams(); });
      btnRow.appendChild(minus);
      btnRow.appendChild(plus);
      card.appendChild(btnRow);

      teamsEl.appendChild(card);
    });
  }
  renderTeams();

  document.getElementById('nextTeamBtn').addEventListener('click', ()=>{
    activeTeam = activeTeam === null ? 0 : (activeTeam + 1) % teams.length;
    renderTeams();
  });

  document.getElementById('resetScoresBtn').addEventListener('click', ()=>{
    teams.forEach(t=>t.score = 0);
    renderTeams();
  });

  document.getElementById('sendScoresBtn').addEventListener('click', ()=>{
    // Hands scores to TeachersDeck's built-in Scoreboard widget via localStorage —
    // this game and the app are served from the same origin, and the app listens
    // for this key (live, via the 'storage' event, if its tab is already open; or
    // on its next load otherwise). No separate scoreboard file needed.
    try{
      localStorage.setItem('td_scoreboard_transfer', JSON.stringify({
        teams: teams.map(team => ({ name: team.name, score: team.score })),
        from: 'Classroom Word Wheel',
        ts: Date.now()
      }));
      toast('Scores sent — check the Scoreboard widget in TeachersDeck.');
    } catch(e){
      toast("Couldn't send scores — open this game from inside TeachersDeck's Games widget.");
    }
  });

  document.getElementById('buyVowelBtn').addEventListener('click', ()=>{
    if(activeTeam === null){
      toast('Select the active team first.');
      return;
    }
    teams[activeTeam].score -= 1;
    renderTeams();
    toast('Vowel purchased — click the vowel key to reveal it.');
  });
