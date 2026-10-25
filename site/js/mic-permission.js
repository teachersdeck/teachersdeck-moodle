// One-time microphone permission grant for the Noise Meter.
// Chrome doesn't reliably show the microphone prompt on a page that replaces
// the New Tab page (the prompt is dismissed as the address bar takes focus),
// so the extension asks for it here, in an ordinary tab. Permission is stored
// per extension origin, so the New Tab page can use the microphone afterwards.
(function(){
  const btn = document.getElementById('go');
  const out = document.getElementById('status');
  function say(msg, cls){ out.textContent = msg; out.className = cls || ''; }
  async function ask(){
    say('');
    try{
      const s = await navigator.mediaDevices.getUserMedia({ audio:true });
      s.getTracks().forEach(tr=>tr.stop());
      say('Microphone allowed. You can close this tab and go back to the Noise Meter.', 'ok');
      btn.textContent = 'Allowed ✓';
    }catch(err){
      if(err && err.name === 'NotFoundError') say('No microphone was found on this device.', 'bad');
      else say('Microphone access was not granted. Click the lock/tune icon in the address bar, set Microphone to Allow, then click the button again.', 'bad');
    }
  }
  btn.addEventListener('click', ask);
  ask();   // a normal tab can show the prompt straight away
})();
