/* ---------------- Cloud Class (Firebase sync) ---------------- */
/* ---------------- Student activity hub + Class Activity widget (v0.15.0) ----------------
   Closes the loop on what StudentDeck already writes: students/{id}/homeworkDone and practiceDaily (readable by the
   class's teacher since backend v1.2.0), plus students/{id}.practice (streak, updatedAt) which the roster already
   carries. The hub keeps ONE pair of listeners per student no matter how many widgets are looking (Cloud Class roster
   badges and the Class Activity widget share it) and tears them all down when the last one closes.
   Boundary (spec §4.3): journal TEXT never leaves the student's device and nothing here reads or asks for it.
   practice.* / practiceDaily are self-reported by the student's device — activity information, never a score. */
const ActivityHub = (()=>{
  const data = {}, unsubs = {}, consumers = new Set();
  function emit(){ consumers.forEach(fn=>{ try{ fn(); }catch(e){} }); }
  function setRoster(ids){
    const want = new Set(ids);
    Object.keys(unsubs).forEach(id=>{ if(!want.has(id)){ try{ unsubs[id](); }catch(e){} delete unsubs[id]; delete data[id]; } });
    ids.forEach(id=>{ if(!unsubs[id]) unsubs[id] = TDCloud.subscribeStudentActivity(id, d=>{ data[id] = d; emit(); }); });
  }
  function stopAll(){ Object.keys(unsubs).forEach(id=>{ try{ unsubs[id](); }catch(e){} delete unsubs[id]; }); Object.keys(data).forEach(id=> delete data[id]); }
  function attach(fn){ consumers.add(fn); return ()=>{ consumers.delete(fn); if(!consumers.size) stopAll(); }; }
  return { setRoster, attach, get: id=> data[id] };
})();
const actDayKey = d => new Date(d).toLocaleDateString('en-CA');            // local YYYY-MM-DD — the same keys StudentDeck writes
function tsMs(v){ return v && v.toMillis ? v.toMillis() : (v && v.seconds ? v.seconds*1000 : (typeof v === 'number' ? v : null)); }
const ACT_FIELDS = ['readMin','focus','games','idioms','wordsSaved','cardsReviewed'];
function studentActivity(s){
  const a = ActivityHub.get(s.id) || { homeworkDone:{}, daily:{} };
  const ids = new Set((state.assignments||[]).map(x=> x.id));
  let hwDone = 0; Object.entries(a.homeworkDone).forEach(([id, r])=>{ if(r && r.done === true && ids.has(id)) hwDone++; });   // only assignments that still exist, so a rate can't pass 100%
  const week = {}; ACT_FIELDS.forEach(f=> week[f] = 0);
  for(let i=0;i<7;i++){ const r = a.daily[actDayKey(Date.now() - i*864e5)]; if(r) ACT_FIELDS.forEach(f=>{ week[f] += (+r[f] || 0); }); }
  const pr = s.practice || {};
  return { hwDone, hwTotal: ids.size, streak: pr.streak || 0, lastActive: Math.max(tsMs(pr.updatedAt) || 0, tsMs(s.lastActiveAt) || 0) || null, week, doneIds: a.homeworkDone };   // newest of: last practice sync, last join/resume
}
function agoText(ms){
  if(!ms) return t('ca_never');
  const d0 = new Date(); d0.setHours(0,0,0,0); const d1 = new Date(ms); d1.setHours(0,0,0,0);
  const n = Math.round((d0 - d1) / 864e5);
  return n <= 0 ? t('ca_today') : n === 1 ? t('ca_yesterday') : t('ca_days_ago', { n });
}
const isQuiet = ms => !ms || (Date.now() - ms) > 3*864e5;                  // no activity for 3+ days (or never)
const shortWhen = ms => ms ? new Date(ms).toLocaleString(undefined, { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }) : '';

/* v0.20.0 strings: Student Stats. Languages not listed fall back to English. */
Object.assign(STRINGS, {
  classactivity:   { en:'📊 Student Stats', vi:'📊 Thống kê học sinh' },
  wc_classactivity:{ en:'Full-screen class and per-student stats: XP, level, badges, status, homework.', vi:'Thống kê toàn màn hình cho lớp và từng học sinh: XP, cấp độ, huy hiệu, trạng thái, bài tập.' },
  ss_open:         { en:'Open {name}’s stats', vi:'Mở thống kê của {name}' },
  ss_back:         { en:'← All students', vi:'← Tất cả học sinh' },
  ss_no_xp:        { en:'No XP yet', vi:'Chưa có XP' },
  ss_cls_pts:      { en:'{n} class pts', vi:'{n} điểm lớp' },
  ss_overview_hint:{ en:'Lv and XP are what the student’s own StudentDeck reports; medals shown are milestone and level badges. Select a student for their full dashboard. Quiet students (3+ days) are listed first.', vi:'Cấp độ và XP do StudentDeck của học sinh báo cáo; huy hiệu hiển thị là mốc XP và cấp độ. Chọn một học sinh để xem bảng đầy đủ. Học sinh vắng 3+ ngày được xếp lên đầu.' },
  ss_foot:         { en:'Numbers are what each student’s StudentDeck reports — a guide, not a grade. Journal text and mood are never read.', vi:'Số liệu do StudentDeck của từng học sinh báo cáo — chỉ để tham khảo, không phải điểm số. Nhật ký và tâm trạng không bao giờ được đọc.' },
  ss_tile_xp:      { en:'XP earned', vi:'XP kiếm được' },
  ss_tile_hw:      { en:'Homework done', vi:'Bài tập đã xong' },
  ss_tile_read:    { en:'Reading', vi:'Đọc sách' },
  ss_games_val:    { en:'{s} started · {f} finished', vi:'{s} bắt đầu · {f} hoàn thành' },
  ss_tile_time:    { en:'Active time', vi:'Thời gian hoạt động' },
  ss_tile_cls:     { en:'Class points', vi:'Điểm lớp' },
  ss_tile_badges:  { en:'Badges', vi:'Huy hiệu' },
  ss_none:         { en:'No data yet', vi:'Chưa có dữ liệu' },
  ss_st_good:      { en:'On track', vi:'Đúng hướng' },
  ss_st_watch:     { en:'Needs monitoring', vi:'Cần theo dõi' },
  ss_st_off:       { en:'Off track', vi:'Chưa theo kịp' },
  ss_st_none:      { en:'No data yet', vi:'Chưa có dữ liệu' },
  stl_good:        { en:'On track', vi:'Đạt' },
  stl_watch:       { en:'Monitor', vi:'Theo dõi' },
  stl_bad:         { en:'Needs attention', vi:'Cần chú ý' },
  stl_how:         { en:'How are these colours worked out?', vi:'Màu sắc được tính như thế nào?' },
  stl_rule_days:   { en:'Active days this week: {g}+ is on track, {w}–{g} is worth monitoring, below {w} needs attention.', vi:'Số ngày hoạt động tuần này: từ {g} trở lên là đạt, {w}–{g} cần theo dõi, dưới {w} cần chú ý.' },
  stl_rule_share:  { en:'Share of a total (e.g. badges): {g}%+ is on track, {w}–{g}% is worth monitoring, below {w}% needs attention.', vi:'Tỷ lệ trên tổng (vd: huy hiệu): từ {g}% trở lên là đạt, {w}–{g}% cần theo dõi, dưới {w}% cần chú ý.' },
  stl_rule_trend:  { en:'Everything else (XP, activities, reading, time…) is judged against the period right before it of the same length: flat or up is on track, down to 10% is worth monitoring, down more than that needs attention.', vi:'Các chỉ số khác (XP, hoạt động, đọc sách, thời gian…) được so với cùng khoảng thời gian liền trước: giữ nguyên hoặc tăng là đạt, giảm đến 10% cần theo dõi, giảm hơn thế cần chú ý.' },
  ss_title_good:   { en:'{name} is on track', vi:'{name} đang đi đúng hướng' },
  ss_title_watch:  { en:'{name} needs monitoring', vi:'{name} cần được theo dõi' },
  ss_title_off:    { en:'{name} is off track', vi:'{name} đang chưa theo kịp' },
  ss_title_none:   { en:'Not enough data yet', vi:'Chưa đủ dữ liệu' },
  ss_sub_good:     { en:'Everything looks good over the past week or two.', vi:'Mọi thứ đều ổn trong một đến hai tuần qua.' },
  ss_sub_attn:     { en:'Worth a look: {list}', vi:'Cần chú ý: {list}' },
  ss_sub_none:     { en:'A status appears once {name}’s activity has synced.', vi:'Trạng thái sẽ hiển thị khi hoạt động của {name} được đồng bộ.' },
  ss_m_homework:   { en:'Homework', vi:'Bài tập' },
  ss_m_reading:    { en:'Reading', vi:'Đọc sách' },
  ss_m_practice:   { en:'Daily practice', vi:'Luyện tập hằng ngày' },
  ss_m_behaviour:  { en:'Behaviour', vi:'Hành vi' },
  ss_hw_val:       { en:'{done} of {total} marked done · last 4 weeks', vi:'{done}/{total} bài đã đánh dấu xong · 4 tuần qua' },
  ss_hw_none:      { en:'No homework due lately', vi:'Gần đây không có bài tập đến hạn' },
  ss_hw_hint:      { en:'{n} past due, not marked', vi:'{n} bài quá hạn, chưa đánh dấu' },
  ss_read_val:     { en:'{n} min in the last 7 days', vi:'{n} phút trong 7 ngày qua' },
  ss_read_hint:    { en:'Goal: {g} min a week', vi:'Mục tiêu: {g} phút mỗi tuần' },
  ss_prac_val:     { en:'Active {n} of the last 7 days', vi:'Hoạt động {n}/7 ngày qua' },
  ss_prac_hint:    { en:'Goal: {g}+ days a week', vi:'Mục tiêu: từ {g} ngày mỗi tuần' },
  ss_beh_good:     { en:'No notes of concern', vi:'Không có ghi chú cần lưu ý' },
  ss_beh_one:      { en:'1 note of concern or point deduction in the last 2 weeks', vi:'1 ghi chú cần lưu ý hoặc lần trừ điểm trong 2 tuần qua' },
  ss_beh_many:     { en:'{n} notes of concern or point deductions in the last 2 weeks', vi:'{n} ghi chú cần lưu ý hoặc lần trừ điểm trong 2 tuần qua' },
  ss_how:          { en:'How is this worked out?', vi:'Cách tính?' },
  ss_rule_hw:      { en:'Homework: on track at {g}%+ marked done, off track below {w}% (last 4 weeks). “Not marked” is not the same as “not done”.', vi:'Bài tập: đúng hướng khi đánh dấu xong từ {g}%, chưa theo kịp khi dưới {w}% (4 tuần qua). “Chưa đánh dấu” không có nghĩa là “chưa làm”.' },
  ss_rule_read:    { en:'Reading: on track at {g}+ minutes a week, off track below {w}.', vi:'Đọc sách: đúng hướng khi từ {g} phút mỗi tuần, chưa theo kịp khi dưới {w}.' },
  ss_rule_prac:    { en:'Daily practice: on track at {g}+ active days a week, off track below {w}.', vi:'Luyện tập: đúng hướng khi hoạt động từ {g} ngày mỗi tuần, chưa theo kịp khi dưới {w} ngày.' },
  ss_rule_beh:     { en:'Behaviour: on track with no notes of concern or point deductions in 2 weeks, needs monitoring with 1, off track with 2 or more. Same rules as ParentDeck’s Student Summary.', vi:'Hành vi: đúng hướng khi không có ghi chú cần lưu ý hay lần trừ điểm trong 2 tuần, cần theo dõi khi có 1, chưa theo kịp khi có từ 2. Cùng quy tắc với Tóm tắt học sinh của ParentDeck.' },
  ss_rule_all:     { en:'Overall: off track when two or more areas are off track; needs monitoring when one is off track or two need monitoring.', vi:'Tổng thể: chưa theo kịp khi có từ hai mục chưa theo kịp; cần theo dõi khi có một mục chưa theo kịp hoặc hai mục cần theo dõi.' },
  ss_nodata:       { en:'{name}’s StudentDeck hasn’t synced any activity yet.', vi:'StudentDeck của {name} chưa đồng bộ hoạt động nào.' },
  ss_ring_tip:     { en:'Level {n} · {p}% of the way to level {m}', vi:'Cấp {n} · đã đi {p}% tới cấp {m}' },
  ss_lv_progress:  { en:'{into} / {need} XP to level {next} · {total} XP total', vi:'{into} / {need} XP để lên cấp {next} · tổng {total} XP' },
  ss_day_one:      { en:'{n} day', vi:'{n} ngày' },
  ss_days_n:       { en:'{n} days', vi:'{n} ngày' },
  ss_streak:       { en:'streak', vi:'chuỗi ngày' },
  ss_bonus:        { en:'×{m} XP bonus', vi:'thưởng ×{m} XP' },
  ss_best_streak:  { en:'Best streak in synced history: {n} days', vi:'Chuỗi dài nhất trong lịch sử đã đồng bộ: {n} ngày' },
  ss_h_xpsrc:      { en:'XP by source', vi:'XP theo nguồn' },
  ss_h_time:       { en:'Time in each widget', vi:'Thời gian trong từng widget' },
  ss_h_xp7:        { en:'XP last 7 days', vi:'XP 7 ngày qua' },
  ss_h_games:      { en:'Game scores', vi:'Điểm trò chơi' },
  ss_h_recent:     { en:'Recent XP', vi:'XP gần đây' },
  ss_h_hw:         { en:'Homework', vi:'Bài tập' },
  ss_h_badges:     { en:'Badges', vi:'Huy hiệu' },
  ss_best:         { en:'best {n}', vi:'cao nhất {n}' },
  ss_needs_update: { en:'Appears once this student’s StudentDeck is updated.', vi:'Sẽ hiển thị khi StudentDeck của học sinh này được cập nhật.' },
  ss_badge_n:      { en:'{n} of {total} badges unlocked.', vi:'Đã mở {n}/{total} huy hiệu.' },
  ss_view_case:    { en:'View badge case →', vi:'Xem tủ huy hiệu →' },
  ss_badge_note:   { en:'StudentDeck doesn’t sync badges, so these are worked out with its own rules from the synced stats: XP total and level are exact; streaks, big days, variety, skills and habits use the last 200 days of synced activity, so an older achievement can be missing.', vi:'StudentDeck không đồng bộ huy hiệu, nên các huy hiệu này được tính bằng chính quy tắc của nó từ số liệu đã đồng bộ: tổng XP và cấp độ là chính xác; chuỗi ngày, ngày nổi bật, đa dạng, kỹ năng và thói quen dùng 200 ngày hoạt động gần nhất, nên thành tích cũ hơn có thể bị thiếu.' },
  ss_bg_xp:        { en:'Milestones', vi:'Mốc XP' },
  ss_bg_level:     { en:'Levels', vi:'Cấp độ' },
  ss_bg_streak:    { en:'Streaks', vi:'Chuỗi ngày' },
  ss_bg_day:       { en:'Big days', vi:'Ngày nổi bật' },
  ss_bg_mix:       { en:'Variety', vi:'Đa dạng' },
  ss_bg_skill:     { en:'Skills', vi:'Kỹ năng' },
  ss_bg_habit:     { en:'Habits', vi:'Thói quen' }
});

/* ---------------- Student Stats (v0.20.0) — the full-screen successor to Class Activity ----------------
   Overview: the class at a glance (animated tiles) and one card per student — level, XP (only once they have earned some), streak, homework,
   last active, status, and their top medals. Click a student for their dashboard: ParentDeck's status card (homework / reading / daily practice /
   behaviour) and the same stats ParentDeck reads — level ring, XP bar, streak, six range tiles, XP by source, time in each widget, XP last 7 days,
   game scores, recent XP — plus badges and homework. Animated the way StudentDeck's Stats & XP is (the sx-* motion in style.css).
   Boundaries: practice.* / practiceDaily are SELF-REPORTED by the student's device — a guide, never a grade. No journal text and no mood word is read.
   Badges are NOT synced by StudentDeck, so they are WORKED OUT here with StudentDeck's own rules from the synced stats (XP total and level are exact;
   streaks, big days, variety, skills and habits come from the last 200 days of synced activity, so an old achievement can be missing). */
const SS_BADGES = [
  ...[[50, '🌱', 'First sparks', 1], [100, '💯', 'Century', 1], [250, '⭐', 'Rising star', 1], [500, '🌟', 'Shining bright', 2], [1000, '🏆', 'Thousand club', 2], [2500, '👑', 'XP champion', 3], [5000, '💎', 'XP legend', 4]]
    .map(([n, icon, name, tier]) => ({ id:'xp_' + n, group:'xp', tier, icon, name, desc:`Earn ${n.toLocaleString()} XP in total`, need:n, val:c => c.total })),
  ...[[3, '🚀', 'Lift-off', 1], [5, '🎯', 'On target', 1], [8, '🎓', 'Scholar', 2], [10, '🔟', 'Double digits', 3], [15, '🧠', 'Brainiac', 3], [20, '🧙', 'Grand master', 4]]
    .map(([n, icon, name, tier]) => ({ id:'lv_' + n, group:'level', tier, icon, name, desc:`Reach level ${n}`, need:n, val:c => c.level })),
  ...[[3, '🔥', 'On a roll', 1], [7, '🗓️', 'Week warrior', 2], [14, '🌠', 'Fortnight focus', 2], [30, '🌙', 'Month master', 3], [100, '🌋', 'Unstoppable', 4]]
    .map(([n, icon, name, tier]) => ({ id:'st_' + n, group:'streak', tier, icon, name, desc:`Keep a ${n}-day streak`, need:n, val:c => c.bestStreak })),
  ...[[50, '☀️', 'Good day', 1], [100, '⚡', 'Power day', 2], [150, '🌋', 'Maximum effort', 3]]
    .map(([n, icon, name, tier]) => ({ id:'day_' + n, group:'day', tier, icon, name, desc:`Earn ${n} XP in a single day`, need:n, val:c => c.bestDay })),
  { id:'mix_4', group:'mix', tier:2, icon:'🧩', name:'All-rounder', desc:'Earn XP from 4 different things in one day', need:4, val:c => c.maxSources },
  { id:'mix_7', group:'mix', tier:3, icon:'🌈', name:'Whole toolbox', desc:'Earn XP from 7 different things in one day', need:7, val:c => c.maxSources },
  ...[['reading', '🐛', 'Bookworm', 150, 2, 'reading'], ['focus', '🔭', 'Laser focus', 150, 2, 'focus time'], ['todo', '🦸', 'Homework hero', 60, 2, 'homework'], ['game', '🎮', 'Game on', 120, 2, 'games'], ['idiom', '🗣️', 'Idiom ace', 25, 1, 'idioms'],
     ['words', '🔤', 'Word collector', 40, 1, 'saving words'], ['cards', '🃏', 'Card shark', 60, 2, 'flashcards'], ['journal', '📔', 'Dear diary', 30, 1, 'the journal'], ['notes', '🗒️', 'Note taker', 45, 1, 'the notepad'], ['docs', '📄', 'Document diver', 40, 1, 'open documents']]
    .map(([src, icon, name, n, tier, what]) => ({ id:'sk_' + src, group:'skill', tier, icon, name, desc:`Earn ${n} XP from ${what}`, need:n, val:c => c.by[src] || 0 })),
  ...[[7, '🌿', 'First week', 1], [30, '📅', 'Month of learning', 2], [100, '🏛️', '100 days', 3]]
    .map(([n, icon, name, tier]) => ({ id:'hab_' + n, group:'habit', tier, icon, name, desc:`Be active on ${n} different days`, need:n, val:c => c.activeDays }))
];
const SS_GROUPS = ['xp', 'level', 'streak', 'day', 'mix', 'skill', 'habit'];
const SS_L = {
  xs: { en:{ focus:'Focus', todo:'Homework', reading:'Reading', game:'Games', idiom:'Idioms', journal:'Journal', daily:'Daily visit', words:'Saving words', cards:'Flashcards', notes:'Notepad', docs:'Open documents' },
        vi:{ focus:'Tập trung', todo:'Bài tập', reading:'Đọc sách', game:'Trò chơi', idiom:'Thành ngữ', journal:'Nhật ký', daily:'Ghé hằng ngày', words:'Lưu từ vựng', cards:'Thẻ ghi nhớ', notes:'Sổ ghi chú', docs:'Tài liệu đã mở' } },
  w:  { en:{ timer:'Focus Timer', todo:'Homework', reading:'Reading Log', games:'Games Hub', idiom:'Idiom of the Day', stats:'Stats & XP', journey:'Journey', class:'Class', translate:'Translate', dict:'Dictionary', cards:'Flashcards', notes:'Notepad', files:'Files', docs:'Open documents' },
        vi:{ timer:'Đồng hồ tập trung', todo:'Bài tập', reading:'Nhật ký đọc', games:'Trò chơi', idiom:'Thành ngữ hằng ngày', stats:'Thống kê & XP', journey:'Hành trình', class:'Lớp học', translate:'Dịch', dict:'Từ điển', cards:'Thẻ ghi nhớ', notes:'Sổ ghi chú', files:'Tệp', docs:'Tài liệu đã mở' } }
};
const ssLabel = (g, k) => ((SS_L[g][state.lang === 'vi' ? 'vi' : 'en'] || {})[k]) || k;
const SS_RULES = { hwGood:80, hwWatch:50, readGood:70, readWatch:30, daysGood:4, daysWatch:2, behWatch:1, behOff:2, behDays:14 };   // the same thresholds as ParentDeck's STATUS_RULES
const SS_ICON = { good:'✅', watch:'👀', off:'⚠️', none:'⏳' };
// Same stoplight formula/colours as AdminDeck's School Stats and ParentDeck's Student Summary — for "My Stats & XP"'s tile grid.
// Same kinds as AdminDeck's School Stats (admindeck/js/schoolstats.js STOPLIGHT): 'days'/'share' judge an absolute number
// against a target; 'trend' (used for every raw-count tile — XP, activities, reading, etc.) judges % change vs the
// immediately-preceding period of equal length, exactly like AdminDeck's Homework/Reading/Focus/Active-time tiles —
// there's no universal "good" XP total, but "up from last time" vs "down" always means something.
const STOPLIGHT = { days:{ good:SS_RULES.daysGood, watch:SS_RULES.daysWatch, dir:'up' }, share:{ good:70, watch:40, dir:'up' }, trend:{ good:0, watch:-10, dir:'up' } };
function stoplight(kind, v){ const r = STOPLIGHT[kind]; if(!r || v == null) return null;
  const up = r.dir !== 'down';
  if(up ? v >= r.good : v <= r.good) return 'good'; if(up ? v >= r.watch : v <= r.watch) return 'watch'; return 'bad'; }
const stPct = (cur, prev) => (prev > 0 ? Math.round((cur - prev) / prev * 100) : null);   // same formula as AdminDeck's pct()
// The colour key above any stoplight-tiled grid, same shape as AdminDeck's School Stats legend.
function stoplightLegendHtml(){
  return `<div class="ss-stlegend">${['good', 'watch', 'bad'].map(k => `<span class="ss-st ss-stkey" data-st="${k}">${t('stl_' + k)}</span>`).join('')}
    <details><summary>${t('stl_how')}</summary><p>${t('stl_rule_days', { g:STOPLIGHT.days.good, w:STOPLIGHT.days.watch })}</p><p>${t('stl_rule_share', { g:STOPLIGHT.share.good, w:STOPLIGHT.share.watch })}</p><p>${t('stl_rule_trend')}</p></details></div>`;
}
const ssNum = n => Math.round(+n || 0).toLocaleString();
const ssShift = (k, n) => { const d = new Date(k + 'T12:00'); d.setDate(d.getDate() + n); return actDayKey(d); };
const ssActive = r => !!(r && ((r.xp || 0) > 0 || (r.readMin || 0) > 0 || (r.readEntries || 0) > 0 || (r.focus || 0) > 0 || (r.hw || 0) > 0 || (r.games || 0) > 0 || (r.idioms || 0) > 0));
const ssMult = n => n >= 2 ? Math.min(1.5, 1 + 0.1 * (n - 1)) : 1;
function ssStreak(P, daily){            // the synced streak is only as of the student's last visit: lapsed when their newest active day is older than yesterday
  const yest = ssShift(actDayKey(Date.now()), -1), days = Object.keys(daily).filter(k => ssActive(daily[k])).sort(), newest = days[days.length - 1] || '';
  const current = newest >= yest ? (P.streak || 0) : 0; let best = 0, run = 0, prev = null;
  days.forEach(k => { run = prev && ssShift(prev, 1) === k ? run + 1 : 1; best = Math.max(best, run); prev = k; });
  return { current, best:Math.max(best, current) };
}
function ssBadgeCtx(s, daily){
  const P = s.practice || {}, total = ssTotal(s, daily), ctx = { total, level:levelInfo(total).level, bestStreak:ssStreak(P, daily).best, bestDay:0, maxSources:0, activeDays:0, by:{} };
  Object.values(daily).forEach(r => {
    if((r.xp || 0) > 0) ctx.activeDays++;
    ctx.bestDay = Math.max(ctx.bestDay, r.xp || 0);
    let kinds = 0; Object.entries(r.xpBy || {}).forEach(([k, n]) => { ctx.by[k] = (ctx.by[k] || 0) + n; if(k !== 'daily' && n > 0) kinds++; });
    ctx.maxSources = Math.max(ctx.maxSources, kinds);
  });
  return ctx;
}
function ssTotal(s, daily){             // StudentDeck's synced XP total; an older StudentDeck doesn't send one, so fall back to the XP in the synced days
  const v = s.practice && s.practice.xpTotal; return typeof v === 'number' ? v : Object.values(daily || {}).reduce((a, r) => a + ((r && r.xp) || 0), 0);
}
function ssTopMedals(s, total){         // for the cards: only the two groups that are exact from synced data (XP total, level)
  const c = { total, level:levelInfo(total).level };
  return SS_BADGES.filter(b => (b.group === 'xp' || b.group === 'level') && b.val(c) >= b.need).sort((a, b) => b.tier - a.tier || b.need - a.need).slice(0, 4);
}
function ssStatus(s, act, notes, ledger){   // ParentDeck's Student Summary status, from what TeachersDeck can read
  const R = SS_RULES, daily = act.daily || {}, today = actDayKey(Date.now()), from = ssShift(today, -27), lvl = (v, g, w) => v >= g ? 'good' : v >= w ? 'watch' : 'off';
  const hasPractice = Object.keys(daily).length > 0 || ssTotal(s, daily) > 0, items = [];
  const rows = (state.assignments || []).filter(x => x.dueDate && x.dueDate >= from && x.dueDate <= today).map(x => ({ x, done:!!(act.homeworkDone[x.id] && act.homeworkDone[x.id].done) })).filter(r => r.x.dueDate < today || r.done);
  const done = rows.filter(r => r.done).length, open = rows.length - done;
  if(!rows.length) items.push({ key:'homework', level:'none', value:t('ss_hw_none') });
  else{ const pct = Math.round(done / rows.length * 100), level = lvl(pct, R.hwGood, R.hwWatch); items.push({ key:'homework', level, value:t('ss_hw_val', { done, total:rows.length }), hint:open && level !== 'good' ? t('ss_hw_hint', { n:open }) : '' }); }
  const keys7 = Array.from({ length:7 }, (_, i) => ssShift(today, -i)), readMin = keys7.reduce((a, k) => a + ((daily[k] && daily[k].readMin) || 0), 0), activeDays = keys7.filter(k => ssActive(daily[k])).length;
  items.push(hasPractice ? { key:'reading', level:lvl(readMin, R.readGood, R.readWatch), value:t('ss_read_val', { n:readMin }), hint:t('ss_read_hint', { g:R.readGood }) } : { key:'reading', level:'none', value:t('ss_none') });
  items.push(hasPractice ? { key:'practice', level:lvl(activeDays, R.daysGood, R.daysWatch), value:t('ss_prac_val', { n:activeDays }), hint:t('ss_prac_hint', { g:R.daysGood }) } : { key:'practice', level:'none', value:t('ss_none') });
  const since = Date.now() - R.behDays * 864e5;
  const concerns = (notes || []).filter(n => n.studentId === s.id && n.mood === 'frowny' && (tsMs(n.createdAt) || 0) >= since);
  const dem = (ledger || []).filter(e => e.studentId === s.id && (+e.delta || 0) < 0 && e.awardedBy !== 'self-redemption' && (tsMs(e.createdAt) || 0) >= since).length, nBeh = concerns.length + dem;
  items.push({ key:'behaviour', level:nBeh >= R.behOff ? 'off' : nBeh >= R.behWatch ? 'watch' : 'good', value:nBeh ? t(nBeh === 1 ? 'ss_beh_one' : 'ss_beh_many', { n:nBeh }) : t('ss_beh_good') });
  const known = items.filter(i => i.level !== 'none'), off = known.filter(i => i.level === 'off').length, watch = known.filter(i => i.level === 'watch').length;
  const overall = known.length < 2 ? 'none' : off >= 2 ? 'off' : (off === 1 || watch >= 2) ? 'watch' : 'good';
  return { items, overall, attention:known.filter(i => i.level !== 'good').map(i => t('ss_m_' + i.key)) };
}
function ssCountUp(el, delay = 0){       // 0 -> its own number, easing out (the same helper StudentDeck uses); text after the number stays put
  if(!el || sxStill()) return;
  const raw = el.dataset.raw || (el.dataset.raw = el.textContent), m = /^(\d[\d,]*(?:\.\d+)?)([\s\S]*)$/.exec(raw); if(!m) return;
  const end = +m[1].replace(/,/g, ''); if(!end) return;
  const t0 = performance.now() + delay, dur = 750; cancelAnimationFrame(el._raf);
  const step = now => { const k = Math.max(0, Math.min(1, (now - t0) / dur)), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(end * e).toLocaleString() + m[2]; if(k < 1) el._raf = requestAnimationFrame(step); else el.textContent = raw; };
  el.textContent = '0' + m[2]; el._raf = requestAnimationFrame(step);
}

function renderStudentStats(body){
  let roster = [], ledger = [], notes = [], firstLedger = true, sel = null, detail = null, oRange = 'week', dRange = 'week', fx = true, lastSig = '', tm = 0;
  const seen = new Set(), unsubs = []; let detailUnsub = null;
  const esc = escHtml, chip = (attr, val, label, on) => `<button type="button" class="sx-chip${on ? ' on' : ''}" data-${attr}="${val}">${label}</button>`;
  const stopDetail = () => { if(detailUnsub){ try{ detailUnsub(); }catch(e){} detailUnsub = null; } detail = null; };
  function stopSubs(){ unsubs.forEach(u => { try{ u(); }catch(e){} }); unsubs.length = 0; stopDetail(); if(tm){ clearTimeout(tm); tm = 0; } }
  const nameOf = id => { const s = roster.find(x => x.id === id); return s ? s.displayName : t('ca_someone'); };
  const bars = rows => { const mx = Math.max(1, ...rows.map(r => r.v)); return rows.map((r, n) => `<div class="sx-bar" style="--n:${n}"><span title="${esc(r.l)}">${esc(r.l)}</span><div><i style="width:${Math.round(r.v / mx * 100)}%"></i></div><b>${esc(r.t)}</b></div>`).join('') || `<p class="small-hint">${t('stats_none')}</p>`; };
  const card = (title, html, cls, i) => `<section class="sx-card ${cls || ''}" style="--i:${i}"><h4>${title}</h4>${html}</section>`;
  const statusChip = o => `<span class="ss-stat st-${o}">${SS_ICON[o]} ${t('ss_st_' + o)}</span>`;
  const medalMini = list => list.map(b => `<span title="${esc(b.name)}">${medalHtml(b, true)}</span>`).join('');
  const rangeKeys = r => { const today = actDayKey(Date.now()); return r === 'today' ? [today] : Array.from({ length:7 }, (_, i) => ssShift(today, -i)); };
  // The equal-length period right before oRange, for the same trend-vs-last-time stoplight AdminDeck's School Stats uses.
  const prevRangeKeys = r => { const today = actDayKey(Date.now()); return r === 'today' ? [ssShift(today, -1)] : Array.from({ length:7 }, (_, i) => ssShift(today, -(7 + i))); };
  const sumRoster = (rows, keys) => { const tot = { xp:0, hw:0 }; ACT_FIELDS.forEach(f => { tot[f] = 0; });
    rows.forEach(r => keys.forEach(k => { const d = r.act.daily[k]; if(d){ ['xp', 'hw'].concat(ACT_FIELDS).forEach(f => { tot[f] += (+d[f] || 0); }); } })); return tot; };

  /* ----- the class ----- */
  function overviewHtml(){
    const keys = rangeKeys(oRange), rows = roster.map(s => ({ s, a:studentActivity(s), act:ActivityHub.get(s.id) || { homeworkDone:{}, daily:{} } }));
    const tot = sumRoster(rows, keys), prevTot = sumRoster(rows, prevRangeKeys(oRange));
    const trendSt = (cur, prevVal) => stoplight('trend', stPct(cur, prevVal));
    const active = rows.filter(r => !isQuiet(r.a.lastActive) && (Date.now() - r.a.lastActive) <= 7 * 864e5).length;
    const activeSt = roster.length ? stoplight('share', Math.round(active / roster.length * 100)) : null;
    const tiles = [[t('ca_active'), `${active}/${roster.length}`, activeSt], [t('ss_tile_xp'), ssNum(tot.xp), trendSt(tot.xp, prevTot.xp)], [t('ss_tile_hw'), ssNum(tot.hw), trendSt(tot.hw, prevTot.hw)], [t('ca_reading'), ssNum(tot.readMin), trendSt(tot.readMin, prevTot.readMin)], [t('ca_focus'), ssNum(tot.focus), trendSt(tot.focus, prevTot.focus)], [t('ca_games'), ssNum(tot.games), trendSt(tot.games, prevTot.games)], [t('ca_idioms'), ssNum(tot.idioms), trendSt(tot.idioms, prevTot.idioms)], [t('ca_words'), ssNum(tot.wordsSaved), trendSt(tot.wordsSaved, prevTot.wordsSaved)], [t('ca_cards'), ssNum(tot.cardsReviewed), trendSt(tot.cardsReviewed, prevTot.cardsReviewed)]];
    const sorted = rows.slice().sort((x, y) => (isQuiet(y.a.lastActive) - isQuiet(x.a.lastActive)) || String(x.s.displayName).localeCompare(String(y.s.displayName)));
    const cards = sorted.map(({ s, a, act }, n) => {
      const P = s.practice || {}, total = ssTotal(s, act.daily), L = levelInfo(total), pct = Math.round(L.into / L.need * 100), st = ssStatus(s, act, notes, ledger), medals = ssTopMedals(s, total), streak = ssStreak(P, act.daily).current;
      return `<button type="button" class="ss-stu${isQuiet(a.lastActive) ? ' quiet' : ''}" data-sid="${esc(s.id)}" style="--n:${n}" aria-label="${esc(t('ss_open', { name:s.displayName || '' }))}">
        <span class="ss-stu-top"><span class="ss-lv"><small>Lv</small><b>${L.level}</b></span><span class="ss-stu-name"><b>${esc(s.displayName || '')}</b>${statusChip(st.overall)}</span></span>
        <span class="ss-stu-xp">${total > 0 ? `<b data-count>${ssNum(total)} XP</b>` : `<span class="muted">${t('ss_no_xp')}</span>`}<span class="muted">🏫 ${t('ss_cls_pts', { n:ssNum(s.xp) })}</span></span>
        ${total > 0 ? `<span class="sx-xpbar ss-minibar"><i style="width:${pct}%"></i></span>` : ''}
        <span class="ss-stu-meta"><span title="${esc(t('cc_act_tip'))}">🔥${streak}</span><span>✅${a.hwDone}/${a.hwTotal}</span><span>📖${a.week.readMin}</span><span class="ca-ago">${esc(agoText(a.lastActive))}</span></span>
        <span class="ss-medals">${medals.length ? medalMini(medals) : ''}</span></button>`;
    }).join('') || `<p class="small-hint">${t('ca_no_students')}</p>`;
    const hw = (state.assignments || []).slice().sort((x, y) => String(x.dueDate || '9999').localeCompare(String(y.dueDate || '9999')));
    const hwRows = hw.map(x => { const done = rows.filter(r => r.act.homeworkDone[x.id] && r.act.homeworkDone[x.id].done === true).length, total = roster.length || 0; return { l:x.title || '—', v:done, t:`${done}/${total}`, max:total }; });
    const hwHtml = hw.length ? hwRows.map((r, n) => `<div class="sx-bar" style="--n:${n}"><span title="${esc(r.l)}">${esc(r.l)}</span><div><i style="width:${r.max ? Math.round(r.v / r.max * 100) : 0}%"></i></div><b>${esc(r.t)}</b></div>`).join('') : `<p class="small-hint">${t('ca_hw_none')}</p>`;
    const feed = ledger.length ? ledger.slice(0, 20).map(e => { const self = e.awardedBy === 'self-redemption', d = +e.delta || 0;
      return `<div class="ca-feedrow${self ? ' redeem' : ''}"><span>${self ? '🎁' : (d >= 0 ? '🙂' : '🙁')}</span><span class="ca-name">${esc(nameOf(e.studentId))} — ${esc(e.reason || '')}</span><b>${d > 0 ? '+' : ''}${d}</b><span class="small-hint">${esc(shortWhen(tsMs(e.createdAt)))}</span></div>`; }).join('') : `<p class="small-hint">${t('ca_feed_none')}</p>`;
    return `<div class="ss-bar"><h3 class="ss-h">${t('ca_this_week')}</h3><div class="sx-range" role="group">${chip('or', 'today', t('stats_today'), oRange === 'today')}${chip('or', 'week', t('stats_week'), oRange === 'week')}</div></div>
      ${stoplightLegendHtml()}
      <div class="sx-tiles">${tiles.map(([l, v, st], n) => `<div class="sx-tile" style="--n:${n}"${st ? ` data-st="${st}"` : ''}><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>
      <h3 class="ss-h ss-h2">${t('ca_students')}</h3><p class="small-hint">${t('ss_overview_hint')}</p><div class="ss-grid">${cards}</div>
      <div class="sx-grid">${card('📚 ' + t('ca_hw_title'), hwHtml, '', 0)}${card('🏅 ' + t('ca_feed_title'), `<div class="ss-feed">${feed}</div>`, '', 1)}</div>
      <p class="small-hint ss-foot">${t('ss_foot')}</p>`;
  }

  /* ----- one student ----- */
  function detailHtml(){
    const s = roster.find(x => x.id === sel); if(!s) return null;
    const act = detail || ActivityHub.get(s.id) || { homeworkDone:{}, daily:{} }, daily = act.daily || {}, P = s.practice || { xpTotal:0, streak:0 }, today = actDayKey(Date.now()), cut = ssShift(today, -6);
    const keys = Object.keys(daily).filter(k => dRange === 'today' ? k === today : dRange === 'week' ? k >= cut : true);
    const T = { xp:0, hw:0, readEntries:0, readMin:0, focus:0, games:0, gamesStarted:0, idioms:0, wordsSaved:0, cardsReviewed:0 }, xpBy = {}, timeBy = {};
    keys.forEach(k => { const r = daily[k]; Object.keys(T).forEach(f => { T[f] += r[f] || 0; }); Object.entries(r.xpBy || {}).forEach(([a, n]) => { xpBy[a] = (xpBy[a] || 0) + n; }); Object.entries(r.timeBy || {}).forEach(([w, n]) => { timeBy[w] = (timeBy[w] || 0) + n; }); });
    const totalT = Object.values(timeBy).reduce((a, c) => a + c, 0), total = ssTotal(s, daily), L = levelInfo(total), pctL = Math.round(L.into / L.need * 100);
    const stk = ssStreak(P, daily), mult = ssMult(stk.current), st = ssStatus(s, act, notes, ledger), ctx = ssBadgeCtx(s, daily);
    const nEarned = SS_BADGES.filter(b => b.val(ctx) >= b.need).length;
    const days7 = [6, 5, 4, 3, 2, 1, 0].map(i => { const k = ssShift(today, -i); return { k, v:(daily[k] || {}).xp || 0 }; }), mx7 = Math.max(1, ...days7.map(d => d.v)), bestI = days7.reduce((b, d, i) => d.v > days7[b].v ? i : b, 0);
    const C = 188.5, none = !Object.keys(daily).length && !total;
    const xpRows = Object.keys(xpBy).map(k => ({ l:ssLabel('xs', k), v:xpBy[k], t:xpBy[k] + ' XP' })).filter(r => r.v).sort((a, c) => c.v - a.v);
    const timeRows = Object.keys(timeBy).map(k => ({ l:ssLabel('w', k), v:timeBy[k], t:fmtDur(timeBy[k]) })).filter(r => r.v).sort((a, c) => c.v - a.v);
    const games = P.gameScores ? Object.values(P.gameScores) : null, recent = (P.recentXp || []).slice(-8).reverse();
    const tiles = [['⭐', t('ss_tile_xp'), ssNum(T.xp)], ['📘', t('ss_tile_hw'), ssNum(T.hw)], ['📖', t('ss_tile_read'), `${ssNum(T.readEntries)} · ${ssNum(T.readMin)} min`], ['🎮', t('ca_games'), t('ss_games_val', { s:T.gamesStarted, f:T.games })],
      ['⏱', t('ca_focus'), ssNum(T.focus)], ['⚡', t('ss_tile_time'), fmtDur(totalT)], ['🗣️', t('ca_idioms'), ssNum(T.idioms)], ['🔤', t('ca_words'), ssNum(T.wordsSaved)], ['🃏', t('ca_cards'), ssNum(T.cardsReviewed)], ['🏫', t('ss_tile_cls'), ssNum(s.xp)], ['🏅', t('ss_tile_badges'), `${nEarned} / ${SS_BADGES.length}`]];
    const stItems = st.items.map(i => `<div class="ss-chk st-${i.level}"><b>${SS_ICON[i.level]} ${t('ss_m_' + i.key)}</b><span>${esc(i.value)}</span>${i.hint ? `<small>${esc(i.hint)}</small>` : ''}</div>`).join('');
    const headline = st.overall === 'none' ? t('ss_title_none') : t('ss_title_' + st.overall, { name:esc(s.displayName || '') });
    const sub = st.overall === 'none' ? t('ss_sub_none', { name:esc(s.displayName || '') }) : st.attention.length ? t('ss_sub_attn', { list:st.attention.join(', ') }) : t('ss_sub_good');
    const R = SS_RULES, how = `<details class="ss-how"><summary>${t('ss_how')}</summary><p>${t('ss_rule_hw', { g:R.hwGood, w:R.hwWatch })}</p><p>${t('ss_rule_read', { g:R.readGood, w:R.readWatch })}</p><p>${t('ss_rule_prac', { g:R.daysGood, w:R.daysWatch })}</p><p>${t('ss_rule_beh')}</p><p>${t('ss_rule_all')}</p></details>`;
    // The full badge gallery lives in the Badges & Rewards widget's own display case (badgeDetailHtml) — this is just a glance + a link there, not a second copy of it.
    const topMedals = ssTopMedals(s, total);
    const badgeSummary = `<p class="small-hint">${t('ss_badge_n', { n:nEarned, total:SS_BADGES.length })}</p>
      ${topMedals.length ? `<span class="ss-medals">${medalMini(topMedals)}</span>` : ''}
      <button type="button" class="wbtn" data-viewcase="${esc(s.id)}">${t('ss_view_case')}</button>`;
    const hwList = (state.assignments || []).slice().sort((x, y) => String(y.dueDate || '').localeCompare(String(x.dueDate || ''))).slice(0, 12).map(x => { const d = act.homeworkDone[x.id] && act.homeworkDone[x.id].done === true; return `<div class="srow"><span>${esc(x.title || '—')}</span><span class="muted">${esc(x.dueDate || '')}</span><b>${d ? '✅' : '·'}</b></div>`; }).join('') || `<p class="small-hint">${t('ca_hw_none')}</p>`;
    const sparkles = `<span class="ss-flame${stk.current ? '' : ' off'}" aria-hidden="true">${stk.current ? '🔥' : '💤'}</span>`;
    return `<div class="ss-bar"><button type="button" class="sx-chip" data-back>${t('ss_back')}</button><h3 class="ss-h">${esc(s.displayName || '')}</h3>${statusChip(st.overall)}
        <div class="sx-range" role="group">${[['today', 'stats_today'], ['week', 'stats_week'], ['all', 'stats_all']].map(([r, key]) => chip('dr', r, t(key), dRange === r)).join('')}</div></div>
      <section class="sx-card ss-status st-${st.overall}" style="--i:0"><h4>${SS_ICON[st.overall]} ${headline}</h4><p class="small-hint">${sub}</p><div class="ss-chks">${stItems}</div>${how}</section>
      ${none ? `<p class="small-hint">${t('ss_nodata', { name:esc(s.displayName || '') })}</p>` : ''}
      <div class="ss-hero" style="--i:1"><div class="ss-ring" title="${esc(t('ss_ring_tip', { n:L.level, p:pctL, m:L.level + 1 }))}"><svg viewBox="0 0 72 72" aria-hidden="true"><circle class="rg-bg" cx="36" cy="36" r="30"/><circle class="rg-fg" cx="36" cy="36" r="30" stroke-dasharray="${(pctL / 100 * C).toFixed(1)} ${C}" transform="rotate(-90 36 36)"/></svg><span class="ss-lv2"><small>Lv</small><b>${L.level}</b></span></div>
        <div class="ss-xpcol"><b class="ss-xptot">${total > 0 ? `<span data-count>${ssNum(total)} XP</span>` : t('ss_no_xp')}</b><div class="sx-xpbar"><i style="width:${pctL}%"></i></div><div class="small-hint">${t('ss_lv_progress', { into:ssNum(L.into), need:ssNum(L.need), next:L.level + 1, total:ssNum(total) })}</div></div>
        <div class="ss-streak">${sparkles}<div><b>${t(stk.current === 1 ? 'ss_day_one' : 'ss_days_n', { n:stk.current })}</b> <span class="muted">${t('ss_streak')}${mult > 1 ? ' · ' + t('ss_bonus', { m:mult.toFixed(1) }) : ''}</span><div class="muted">${t('ss_best_streak', { n:stk.best })}</div></div></div></div>
      <div class="sx-tiles">${tiles.map(([em, l, v], n) => `<div class="sx-tile" style="--n:${n}"><b>${esc(v)}</b><span><em>${em}</em> ${esc(l)}</span></div>`).join('')}</div>
      <div class="sx-grid">
        ${card('⚡ ' + t('ss_h_xpsrc'), bars(xpRows), '', 2)}${card('⏱ ' + t('ss_h_time'), bars(timeRows), '', 3)}
        ${card('📈 ' + t('ss_h_xp7'), `<div class="sx-cols sx-cols-lg">${days7.map((d, n) => `<div class="sx-col${n === bestI && d.v ? ' best' : ''}" style="--n:${n}" title="${d.k}: ${d.v} XP"><em>${d.v || ''}</em><i style="height:${Math.round(d.v / mx7 * 100)}%"></i><span>${new Date(d.k + 'T12:00').toLocaleDateString(state.lang || 'en', { weekday:'narrow' })}<small>${+d.k.slice(8)}</small></span></div>`).join('')}</div>`, '', 4)}
        ${card('🎮 ' + t('ss_h_games'), games ? (games.map(g => `<div class="srow"><span>${esc(g.name || '')}</span><span class="muted">${g.best !== null && g.best !== undefined ? t('ss_best', { n:g.best }) : ''}</span><b>${g.plays || 0}×</b></div>`).join('') || `<p class="small-hint">${t('stats_none')}</p>`) : `<p class="small-hint">${t('ss_needs_update')}</p>`, '', 5)}
        ${card('✨ ' + t('ss_h_recent'), recent.map(e => `<div class="srow"><span>${esc(new Date(e.t).toLocaleTimeString(state.lang || 'en', { hour:'2-digit', minute:'2-digit' }))} · ${esc(ssLabel('xs', e.s))}</span><b>+${esc(e.n)}</b></div>`).join('') || `<p class="small-hint">${t('stats_none')}</p>`, '', 6)}
        ${card('📚 ' + t('ss_h_hw'), hwList, '', 7)}
        ${card('🏅 ' + t('ss_h_badges'), badgeSummary, '', 8)}</div>
      <p class="small-hint ss-foot">${t('ss_foot')}</p>`;
  }

  /* ----- drawing (the entrance plays on opening, switching view or range — never on a live update) ----- */
  function paint(){
    const host = body.querySelector('.ss-host'); if(!host) return;
    const html = sel ? detailHtml() : overviewHtml();
    if(html === null){ sel = null; stopDetail(); fx = true; return paint(); }
    const sig = (sel || '') + '|' + oRange + dRange + html;
    if(sig === lastSig && !fx) return;
    lastSig = sig; const keep = body.scrollTop;
    host.classList.toggle('fx-in', fx); host.innerHTML = html;
    if(fx){
      host.querySelectorAll('.sx-tile b, [data-count]').forEach((el, n) => ssCountUp(el, 250 + n * 40));
      const bar = host.querySelector('.ss-hero .sx-xpbar i');
      if(bar && !sxStill()) setTimeout(() => { const r = bar.getBoundingClientRect(), h = host.getBoundingClientRect(); sxBurst(host, r.right - h.left - 4, r.top - h.top + 5, 10); }, 900);
      setTimeout(() => host.classList.remove('fx-in'), 2600); fx = false;
    }
    body.scrollTop = keep;
  }
  function schedule(){ if(!tm) tm = setTimeout(() => { tm = 0; paint(); }, 150); }
  function openStudent(id){ stopDetail(); sel = id; fx = true; paint(); detailUnsub = TDCloud.subscribeStudentActivity(id, d => { detail = d; schedule(); }, 200); }

  function draw(){
    stopSubs(); firstLedger = true; seen.clear(); sel = null; fx = true; lastSig = '';
    if(!TDCloud.isConfigured()){ body.innerHTML = notConfiguredHtml(); return; }
    if(!TDCloud.getSession() || !state.cloudClassId){ body.innerHTML = `<p class="small-hint">${t('ca_need_class')}</p>`; return; }
    body.innerHTML = '<div class="sx-wrap ss-wrap"><div class="ss-host"></div></div>';
    const wrap = body.querySelector('.ss-wrap');
    wrap.addEventListener('click', e => {
      const stu = e.target.closest('[data-sid]'); if(stu){ openStudent(stu.dataset.sid); return; }
      if(e.target.closest('[data-back]')){ stopDetail(); sel = null; fx = true; paint(); return; }
      const o = e.target.closest('[data-or]'); if(o){ oRange = o.dataset.or; fx = true; paint(); return; }
      const d = e.target.closest('[data-dr]'); if(d){ dRange = d.dataset.dr; fx = true; paint(); return; }
      const vc = e.target.closest('[data-viewcase]'); if(vc){ requestBadgeCase(vc.dataset.viewcase); }
    });
    unsubs.push(ActivityHub.attach(schedule));
    unsubs.push(TDCloud.subscribeRoster(state.cloudClassId, list => { roster = list; ActivityHub.setRoster(list.map(s => s.id)); schedule(); }));
    unsubs.push(TDCloud.subscribeNotes(state.cloudClassId, (list, err) => { notes = err ? [] : list; schedule(); }));
    unsubs.push(TDCloud.subscribeLedger(state.cloudClassId, rows => {
      ledger = rows;
      rows.forEach(e => {           // A point drop always gets a visible reason (spec §4.4): toast each NEW self-redemption — never the ones already there when this opened.
        if(!seen.has(e.id)){ seen.add(e.id); if(!firstLedger && e.awardedBy === 'self-redemption') toast(t('ca_redeem_toast', { name:nameOf(e.studentId), n:Math.abs(+e.delta || 0), reason:String(e.reason || '').replace(/^Redeemed:\s*/, '') })); }
      });
      firstLedger = false; schedule();
    }));
    paint();
  }
  const unsubAuth = TDCloud.onAuthChanged(draw);
  draw();
  return () => { stopSubs(); unsubAuth(); };
}

function renderCloudClass(body){
  const unsubs = [];
  let cloudClass = null, roster = [];

  function stopSubs(){ unsubs.forEach(u=>{ try{ u(); }catch(e){} }); unsubs.length = 0; }

  function draw(){
    if(!TDCloud.isConfigured()){
      body.innerHTML = notConfiguredHtml();
      return;
    }
    const session = TDCloud.getSession();
    if(!session){
      body.innerHTML = `
        <div class="cc-panel">
          <button class="wbtn primary" id="cc-signin">${t('cc_signin')}</button>
        </div>`;
      body.querySelector('#cc-signin').addEventListener('click', async ()=>{
        try{ await TDCloud.signIn(); draw(); }catch(e){ toastMsg(e.message||String(e)); }
      });
      return;
    }
    if(!state.cloudClassId){
      body.innerHTML = `
        <div class="cc-panel">
          <p>${t('cc_signed_in_as', { name: session.displayName || session.email })}</p>
          <div class="btn-row">
            <input type="text" id="cc-new-name" placeholder="${t('cc_class_name_ph')}" value="${escHtml(activeClass().name||'')}">
            <button class="wbtn primary" id="cc-create">${t('cc_create_class')}</button>
          </div>
          <p class="small-hint" id="cc-pick-label">${t('cc_or_pick')}</p>
          <div class="scroll-list" id="cc-pick-list"></div>
          <div class="btn-row"><button class="wbtn" id="cc-signout">${t('cc_sign_out')}</button></div>
        </div>`;
      body.querySelector('#cc-create').addEventListener('click', async ()=>{
        const name = body.querySelector('#cc-new-name').value.trim() || 'My Class';
        try{
          const res = await TDCloud.createClass(name);
          state.cloudClassId = res.classId;
          TDCloud.resetCalendarSyncCache();
          saveState();
          draw();
        }catch(e){ toastMsg(e.message||String(e)); }
      });
      body.querySelector('#cc-signout').addEventListener('click', ()=>{ TDCloud.signOut(); draw(); });
      TDCloud.myClasses().then(list=>{
        const listEl = body.querySelector('#cc-pick-list');
        if(!listEl) return;
        if(!list.length){ listEl.innerHTML = `<p class="small-hint">—</p>`; return; }
        listEl.innerHTML = list.map(c=>`<button class="wbtn cc-pick" data-id="${c.id}">${escHtml(c.className)}</button>`).join('');
        listEl.querySelectorAll('.cc-pick').forEach(btn=>{
          btn.addEventListener('click', ()=>{
            state.cloudClassId = btn.dataset.id;
            TDCloud.resetCalendarSyncCache();
            saveState();
            draw();
          });
        });
      });
      return;
    }

    // A class is linked: class header + shortcuts, join codes, the roster (where points are awarded), and a collapsed settings section.
    // (The rewards catalog moved to the Reward Points widget in v0.21.0.)
    body.innerHTML = `
      <div class="cc-panel cc-linked">
        <div class="cc-head"><b id="cc-class-name"></b></div>
        <div class="cc-links">${['rewardpoints', 'classactivity', 'noteshome', 'classbuilder'].map(id=> `<button type="button" class="wbtn" data-open="${id}">${escHtml(widgetLabel(id))}</button>`).join('')}</div>
        <div class="cc-codes" id="cc-codes"></div>
        <details class="cc-adminnotes" id="cc-adminnotes" hidden><summary>📬 <span id="cc-an-label">${t('an_title')}</span></summary><div id="cc-an-list"></div></details>
        <div class="cc-rost-head">
          <p class="field-label" id="cc-roster-label">${t('cc_roster', {n:0})}</p>
          <button class="wbtn" id="cc-sync-names">${t('cc_sync_names')}</button>
        </div>
        <div class="scroll-list" id="cc-roster"></div>
        <details class="cc-settings">
          <summary>⚙️ ${t('cc_settings')}</summary>
          <div class="field-block">
            <span class="field-label">${t('cc_ranking_visibility')}</span>
            <select id="cc-visibility">
              <option value="anonymized">anonymized</option>
              <option value="full">full names</option>
              <option value="opt_out">hidden</option>
            </select>
          </div>
          <div class="field-block">
            <span class="field-label">🏫 ${t('cc_school')}</span>
            <p class="small-hint" id="cc-school-now">${t('cc_school_none')}</p>
            <div class="btn-row"><input type="text" id="cc-school-code" placeholder="XXXX-XXXX" autocomplete="off" spellcheck="false" style="max-width:130px"><button class="wbtn" id="cc-school-join">${t('cc_school_join')}</button></div>
          </div>
          <label class="switch-row"><span>${t('cc_pulse_label')}</span><input type="checkbox" id="cc-pulse"></label>
          <p class="small-hint">${t('cc_pulse_hint')}</p>
          <div class="field-block">
            <span class="field-label">👪 ${t('cc_family_codes')}</span>
            <p class="small-hint">${t('cc_family_hint')}</p>
            <div class="btn-row"><button class="wbtn" id="cc-fam-show">${t('cc_family_show')}</button></div>
            <div id="cc-fam-list"></div>
          </div>
          <div class="btn-row"><button class="wbtn" id="cc-signout">${t('cc_sign_out')}</button></div>
        </details>
      </div>`;
    body.querySelectorAll('[data-open]').forEach(b=> b.addEventListener('click', ()=> openWidgetSmart(b.dataset.open)));

    body.querySelector('#cc-signout').addEventListener('click', ()=>{ stopSubs(); TDCloud.signOut(); draw(); });

    body.querySelector('#cc-visibility').addEventListener('change', async e=>{
      try{ await TDCloud.setRankingVisibility(state.cloudClassId, e.target.value); }
      catch(err){ toastMsg(err.message||String(err)); }
    });

    // v0.21.2: Class Pulse on/off (ParentDeck's typical-range view) and the class's family codes (backend v2.0.0).
    body.querySelector('#cc-pulse').addEventListener('change', async e=>{
      try{ await TDCloud.setClassPulse(state.cloudClassId, e.target.checked); toast(t(e.target.checked ? 'cc_pulse_on' : 'cc_pulse_off')); }
      catch(err){ e.target.checked = !e.target.checked; toastMsg(err.message||String(err)); }
    });
    async function showFamilyCodes(){
      const box = body.querySelector('#cc-fam-list');
      if(!box) return;
      box.innerHTML = `<p class="small-hint">${t('cc_family_loading')}</p>`;
      let codes;
      try{ codes = await TDCloud.getFamilyCodes(state.cloudClassId); }
      catch(err){ box.innerHTML = `<p class="small-hint">${escHtml(t('cc_family_unavailable'))}</p>`; return; }
      if(!codes.length){ box.innerHTML = `<p class="small-hint">${t('cc_family_none')}</p>`; return; }
      box.innerHTML = `<div class="cc-fam-rows">${codes.map(c=> `<div class="cc-fam-row"><span>${escHtml(c.displayName || '—')}</span><code>${escHtml(c.familyCode)}</code><button class="wbtn cc-fam-new" data-id="${escHtml(c.studentId)}" title="${escHtml(t('cc_family_new_title'))}">↻</button></div>`).join('')}</div>
        <div class="btn-row"><button class="wbtn" id="cc-fam-copy">${t('cc_family_copy')}</button></div>`;
      box.querySelector('#cc-fam-copy').addEventListener('click', ()=>{
        const text = codes.map(c=> `${c.displayName}\t${c.familyCode}`).join('\n');
        (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(()=> toast(t('cc_family_copied')), ()=> toast(t('cc_family_copy_failed')));
      });
      box.querySelectorAll('.cc-fam-new').forEach(b=> b.addEventListener('click', async ()=>{
        if(!confirm(t('cc_family_new_confirm'))) return;
        try{ await TDCloud.regenerateFamilyCode(state.cloudClassId, b.dataset.id); showFamilyCodes(); }
        catch(err){ toastMsg(err.message||String(err)); }
      }));
    }
    body.querySelector('#cc-fam-show').addEventListener('click', showFamilyCodes);

    // v0.21.3 (backend v2.1.0): join a school with the code from your school admin; notes from the school admin.
    body.querySelector('#cc-school-join').addEventListener('click', async ()=>{
      const code = body.querySelector('#cc-school-code').value.trim();
      if(!code){ toast(t('cc_school_need_code')); return; }
      try{ const r = await TDCloud.joinSchool(code); body.querySelector('#cc-school-code').value = ''; toast(t('cc_school_joined', { name: r.schoolName })); }
      catch(err){ toastMsg(err.message||String(err)); }
    });

    // Bridge to the local, per-class-pill roster (state.roster) that Name
    // Picker, Attendance, Group Maker and Hall Pass draw from. One-way
    // (cloud -> local) since local names are plain strings with no cloud
    // account behind them; additive and de-duped, never removes a local
    // name a teacher typed in that hasn't joined the cloud class.
    body.querySelector('#cc-sync-names').addEventListener('click', ()=>{
      if(!roster.length){ toast(t('cc_sync_names_empty')); return; }
      const extra = cbMatch(state.students, roster).extra.filter(s=> (s.displayName||'').trim());
      if(!extra.length){ toast(t('cc_sync_names_none')); return; }
      mutateStudents(()=>{ extra.forEach(s=> state.students.push({ id:cid(), ...splitVietnameseName(s.displayName), en:'' })); });
      const added = extra;
      document.querySelectorAll('[data-i18n-count]').forEach(el=>{ el.textContent = t('roster_count', { n: state.roster.length }); });
      toast(t('cc_sync_names_done', { n: added.length }));
    });

    stopSubs();
    if(TDCloud.subscribeMySchool) unsubs.push(TDCloud.subscribeMySchool(s=>{
      const el = body.querySelector('#cc-school-now'); if(el) el.textContent = s && s.schoolName ? t('cc_school_in', { name: s.schoolName }) : t('cc_school_none');
    }));
    if(TDCloud.subscribeAdminNotes){ let seen = null; unsubs.push(TDCloud.subscribeAdminNotes(list=>{
      const box = body.querySelector('#cc-adminnotes'); if(!box) return;
      if(!list){ box.hidden = true; return; }
      box.hidden = list.length === 0;
      const unread = list.filter(n=> !n.read);
      body.querySelector('#cc-an-label').textContent = unread.length ? t('an_title_new', { n: unread.length }) : t('an_title');
      if(seen && unread.some(n=> !seen.has(n.id))) toast(t('an_toast'));
      seen = new Set(list.map(n=> n.id));
      body.querySelector('#cc-an-list').innerHTML = list.map(n=> `<div class="an-item ${n.read ? '' : 'unread'}" data-id="${escHtml(n.id)}">
        <div class="an-top">${n.subject ? `<b>${escHtml(n.subject)}</b>` : ''}<span class="small-hint">${escHtml(n.from || '')}${n.createdAtMs ? ' · ' + new Date(n.createdAtMs).toLocaleDateString() : ''}</span></div>
        <div class="an-text">${escHtml(n.text || '')}</div>${n.read ? '' : `<button class="wbtn an-ok">${t('an_gotit')}</button>`}</div>`).join('');
      body.querySelectorAll('.an-ok').forEach(b=> b.addEventListener('click', ()=> TDCloud.markAdminNoteRead(b.closest('.an-item').dataset.id).catch(err=> toastMsg(err.message||String(err)))));
    })); }
    unsubs.push(TDCloud.subscribeClass(state.cloudClassId, cls=>{
      cloudClass = cls;
      const codesEl = body.querySelector('#cc-codes');
      const visEl = body.querySelector('#cc-visibility');
      if(!cls){
        // Either this class was deleted, or — far more likely — the
        // signed-in Google account changed (Cloud Class doesn't clear
        // state.cloudClassId on sign-out/sign-in, since it's meant to
        // survive a re-login as the SAME teacher) and the new account
        // doesn't own this class, so Firestore's rules reject the read.
        // Either way, staying on this screen just shows blank codes
        // forever, so fall back to create/pick rather than leave it silent.
        stopSubs();
        state.cloudClassId = null;
        saveState();
        toastMsg(t('cc_wrong_account'));
        draw();
        return;
      }
      const nmEl = body.querySelector('#cc-class-name'); if(nmEl) nmEl.textContent = cls.className || '';
      const pulseEl = body.querySelector('#cc-pulse');   // same default as the backend: on, unless never set and rankings are hidden
      if(pulseEl) pulseEl.checked = cls.classPulse === true || (cls.classPulse === undefined && cls.rankingVisibility !== 'opt_out');
      if(!codesEl) return;
      codesEl.innerHTML = `
        <div class="cc-code-row"><span>${t('cc_student_code')}: <b>${escHtml(cls.studentJoinCode)}</b></span>
          <span class="cc-code-btns"><button class="wbtn" data-copy="${escHtml(cls.studentJoinCode)}">${t('cc_copy')}</button>
          <button class="wbtn" data-which="student">${t('cc_regenerate')}</button></span></div>
        ${cls.parentLinking === 'class-code' ? `<div class="cc-code-row"><span>${t('cc_parent_code')}: <b>${escHtml(cls.parentJoinCode)}</b></span>
          <span class="cc-code-btns"><button class="wbtn" data-copy="${escHtml(cls.parentJoinCode)}">${t('cc_copy')}</button>
          <button class="wbtn" data-which="parent">${t('cc_regenerate')}</button></span></div>`
        : `<p class="small-hint">👪 ${t('cc_parents_family')}</p>`}`;   // v0.40.2: the class's parent code only works where the class chose class-code linking
      codesEl.querySelectorAll('[data-copy]').forEach(btn=>{
        btn.addEventListener('click', async ()=>{
          const code = btn.dataset.copy;
          if(await ccCopyText(code)) toastMsg(t('cc_copied', { code }));
          else toastMsg(t('cc_copy_fail'));
        });
      });
      codesEl.querySelectorAll('[data-which]').forEach(btn=>{
        btn.addEventListener('click', async ()=>{
          try{ await TDCloud.regenerateJoinCode(state.cloudClassId, btn.dataset.which); }
          catch(e){ toastMsg(e.message||String(e)); }
        });
      });
      if(visEl) visEl.value = cls.rankingVisibility || 'anonymized';
    }));
    unsubs.push(TDCloud.subscribeRoster(state.cloudClassId, list=>{
      roster = list.slice().sort((a,b)=> (b.xp||0)-(a.xp||0));
      ActivityHub.setRoster(roster.map(s=> s.id));
      const label = body.querySelector('#cc-roster-label');
      const rosterEl = body.querySelector('#cc-roster');
      if(label) label.textContent = t('cc_roster', { n: roster.length });
      if(!rosterEl) return;
      const reasonOptions = `
        <option value="">${t('cc_pick_reason')}</option>
        <optgroup label="${t('cc_merit_group')}">
          ${MERIT_REASONS.map(r=>`<option value="${r.key}">\ud83d\ude42 ${t('cc_reason_'+r.key)} (+${r.points})</option>`).join('')}
        </optgroup>
        <optgroup label="${t('cc_demerit_group')}">
          ${DEMERIT_REASONS.map(r=>`<option value="${r.key}">\ud83d\ude41 ${t('cc_reason_'+r.key)} (${r.points})</option>`).join('')}
        </optgroup>
        <option value="__custom">${t('cc_custom_reason')}</option>`;
      // Flag names that appear more than once in this class (trimmed,
      // case-insensitive) — the most common real-world cause is a student
      // joining twice with the class code instead of resuming with their
      // PIN. This is just a visual nudge for the teacher; it doesn't
      // prevent or auto-merge anything.
      const nameCounts = {};
      roster.forEach(s=>{ const k=(s.displayName||'').trim().toLowerCase(); if(k) nameCounts[k]=(nameCounts[k]||0)+1; });
      rosterEl.innerHTML = roster.length ? roster.map(s=>{
        const isDup = nameCounts[(s.displayName||'').trim().toLowerCase()] > 1;
        return `
        <div class="cc-roster-row cc-student-row" data-id="${s.id}">
          <div class="cc-roster-top">
            <span class="cc-roster-name"></span>${isDup ? `<span class="cc-dup-badge" title="${t('cc_dup_name_hint')}">⚠️ ${t('cc_dup_name_badge')}</span>` : ''}<b class="cc-roster-xp">${s.xp||0} ${t('cc_pts')}</b>
            <button class="sb-btn cc-roster-note" data-note="${s.id}" title="${t('cc_note_btn')}" aria-label="${t('cc_note_btn')}">✉️</button>
            <button class="sb-btn minus cc-roster-remove" data-remove="${s.id}" title="${t('cc_remove_student')}" aria-label="${t('cc_remove_student')}">🗑️</button>
          </div>
          <div class="cc-act" data-act="${s.id}" title="${t('cc_act_tip')}"></div>
          <div class="cc-roster-award">
            <select class="cc-reason-select">${reasonOptions}</select>
            <input type="text" class="cc-reason" placeholder="${t('cc_award_reason_ph')}" style="display:none">
            <button class="sb-btn minus" data-delta="-5">➖5</button>
            <button class="sb-btn plus" data-delta="5">➕5</button>
          </div>
        </div>`;
      }).join('') : `<p class="small-hint">${t('cc_no_students')}</p>`;
      const allReasons = MERIT_REASONS.concat(DEMERIT_REASONS);
      rosterEl.querySelectorAll('.cc-roster-row').forEach(row=>{
        const s = roster.find(x=>x.id===row.dataset.id);
        row.querySelector('.cc-roster-name').textContent = s ? s.displayName : '';
        const select = row.querySelector('.cc-reason-select');
        const reasonInput = row.querySelector('.cc-reason');
        const doAward = async (amount, reason)=>{
          try{ await TDCloud.awardPoints(state.cloudClassId, row.dataset.id, amount, reason); track('cloudpoints', (amount > 0 ? '+' : '') + amount + (reason ? ' · ' + reason : '')); }
          catch(e){ toastMsg(e.message||String(e)); }
        };
        select.addEventListener('change', ()=>{
          const val = select.value;
          if(val === '__custom'){
            reasonInput.style.display = '';
            reasonInput.focus();
            select.value = '';
            return;
          }
          const preset = allReasons.find(r=>r.key===val);
          if(!preset) return;
          doAward(preset.points, t('cc_reason_'+preset.key));
          select.value = '';
        });
        row.querySelectorAll('[data-delta]').forEach(btn=>{
          btn.addEventListener('click', ()=>{
            const amount = parseInt(btn.dataset.delta, 10);
            const reason = reasonInput.value.trim();
            doAward(amount, reason);
          });
        });
        const noteBtn = row.querySelector('[data-note]');
        if(noteBtn) noteBtn.addEventListener('click', ()=> requestNotesHome(row.dataset.id));
        const removeBtn = row.querySelector('[data-remove]');
        if(removeBtn) removeBtn.addEventListener('click', async ()=>{
          if(!confirm(t('cc_remove_student_confirm', { name: s ? s.displayName : '' }))) return;
          try{ await TDCloud.removeStudent(row.dataset.id, state.cloudClassId); }
          catch(e){ toastMsg(e.message||String(e)); }
        });
      });
      paintAct();
    }));
    // v0.15.0 — activity badges on the roster. (The ✉️ button on each row opens the Notes Home widget — see requestNotesHome.)
    unsubs.push(ActivityHub.attach(paintAct));
  }

  // 🔥 streak · ✅ homework done/assigned · last active — a small strip under each roster name.
  function paintAct(){
    body.querySelectorAll('.cc-act[data-act]').forEach(el=>{
      const s = roster.find(x=> x.id === el.dataset.act); if(!s) return;
      const a = studentActivity(s);
      el.textContent = `🔥${a.streak}  ·  ✅${a.hwDone}/${a.hwTotal}  ·  ${agoText(a.lastActive)}`;
      el.classList.toggle('quiet', isQuiet(a.lastActive));
    });
  }

  function toastMsg(msg){
    body.querySelector('.cc-error')?.remove();
    const p = document.createElement('p');
    p.className = 'small-hint cc-error';
    p.style.color = '#e77';
    p.textContent = msg;
    body.prepend(p);
  }

  const unsubAuth = TDCloud.onAuthChanged(draw);
  draw();
  return ()=>{ stopSubs(); unsubAuth(); };
}

/* ---------------- Notes Home (teacher → parent notes) ---------------- */
// A teacher picks one or more students, a smiley or frowny face, writes a short note and sends
// it; the parent reads it in ParentDeck, and the status here flips from Sent to Read.
// Needs a linked cloud class (Cloud Class widget) and the backend's sendNotesHome function.
// Each student gets their own private copy of the note, so read status is per child.
//
// "Sign notes as" belongs to the TEACHER, not to a class, so it has its own key rather than
// living in per-class state (same reasoning as the Pro license above).
// The ✉️ button on a Cloud Class roster row calls requestNotesHome(): it opens (or un-minimises) this
// widget with that student already ticked — one composer and one history, not two.
let nhPendingStudent = null;
function requestNotesHome(studentId){
  nhPendingStudent = studentId;
  if(!state.active.noteshome){ toggleWidget('noteshome'); return; }
  const lay = state.layout.noteshome;
  if(lay && lay.minimized) toggleMinimize('noteshome');
  document.dispatchEvent(new CustomEvent('td:noteshome-pending'));
}
const NH_SIGNAS_KEY = 'td_notes_signas_v1';
function nhLoadSignAs(){ try{ return localStorage.getItem(NH_SIGNAS_KEY) || ''; }catch(e){ return ''; } }
function nhSaveSignAs(v){ try{ localStorage.setItem(NH_SIGNAS_KEY, v); }catch(e){ /* not persisted */ } }

function renderNotesHome(body){
  /* v0.21.0: a two-pane "mail" layout. Left: the students (tick = recipient, click = open their conversation). Right: the conversation as message bubbles
     (✓ Sent / ✓✓ Read, like an instant-message app) with an email-style composer underneath (To / From / message). Narrow windows stack the panes. */
  const NH_MAX = 500;                 // mirrored by the server, which is the real limit
  const unsubs = [];
  let roster = [], notes = [], notesFailed = false;
  const selected = new Set();
  let mood = null, filterId = '', sending = false, shownClassId = null, search = '', firstThread = true;

  const stopSubs = ()=>{ unsubs.forEach(u=>{ try{ u(); }catch(e){} }); unsubs.length = 0; };
  const q = sel => body.querySelector(sel);
  const loc = ()=> LOCALE_MAP[state.lang]||'en-US';
  const fmtTime = ms => new Date(ms).toLocaleString(loc(), { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
  const fmtClock = ms => new Date(ms).toLocaleTimeString(loc(), { hour:'2-digit', minute:'2-digit' });
  const fmtDayLabel = ms => { const d0 = new Date(); d0.setHours(0,0,0,0); const d1 = new Date(ms); d1.setHours(0,0,0,0); const n = Math.round((d0 - d1) / 864e5);
    return n <= 0 ? t('ca_today') : n === 1 ? t('ca_yesterday') : new Date(ms).toLocaleDateString(loc(), { weekday:'short', month:'short', day:'numeric' }); };
  const nameOf = id => { const s = roster.find(x=> x.id === id); return s ? (s.displayName || '—') : '—'; };
  const noEmoji = s => String(s).replace(/\p{Extended_Pictographic}\uFE0F?\s*/gu, '').trim();     // the ✓ / ✓✓ ticks replace the emoji in the old status text

  function showHint(msg, isError){
    const el = q('#nh-hint'); if(!el) return;
    el.textContent = msg || '';
    el.classList.toggle('cc-error', !!isError);
  }
  function friendlyError(e){
    const msg = (e && e.message) ? String(e.message) : String(e);
    return msg === 'NOT_FOUND' ? t('nh_backend_old') : msg;        // a function that isn't deployed yet comes back as the bare word NOT_FOUND
  }

  function draw(){
    stopSubs();
    shownClassId = state.cloudClassId || null;
    if(!TDCloud.isConfigured()){ body.innerHTML = notConfiguredHtml(); return; }
    if(!TDCloud.getSession()){
      body.innerHTML = `<div class="cc-panel"><button class="wbtn primary" id="nh-signin">${t('cc_signin')}</button><p class="small-hint" id="nh-hint"></p></div>`;
      q('#nh-signin').addEventListener('click', async ()=>{
        try{ await TDCloud.signIn(); draw(); }catch(e){ showHint(friendlyError(e), true); }
      });
      return;
    }
    if(!state.cloudClassId){
      body.innerHTML = `<div class="cc-panel"><p class="small-hint">${t('nh_need_cloud')}</p><div class="btn-row"><button class="wbtn primary" id="nh-open-cc">${t('nh_open_cloudclass')}</button></div></div>`;
      q('#nh-open-cc').addEventListener('click', ()=> openWidgetSmart('cloudclass'));
      return;
    }
    drawLinked();
  }

  function drawLinked(){
    firstThread = true;
    body.innerHTML = `
      <div class="nh-wrap"><div class="nh-mail">
        <aside class="nh-side">
          <input type="search" class="nh-search" id="nh-search" placeholder="${escHtml(t('nh_search_ph'))}" aria-label="${escHtml(t('nh_search_ph'))}">
          <div class="nh-side-tools"><button class="wbtn" id="nh-all">${t('nh_all')}</button><button class="wbtn" id="nh-none">${t('nh_none')}</button><span class="small-hint" id="nh-count"></span></div>
          <div class="nh-people" id="nh-students"></div>
        </aside>
        <section class="nh-main">
          <header class="nh-thead"><b id="nh-title"></b><span class="small-hint" id="nh-unread"></span></header>
          <div class="nh-thread" id="nh-history" aria-live="polite"></div>
          <div class="nh-compose">
            <div class="nh-line"><span class="nh-lbl">${t('nh_to')}</span><div class="nh-chips" id="nh-chips"></div></div>
            <div class="nh-line"><span class="nh-lbl">${t('nh_from')}</span><input type="text" id="nh-signas" maxlength="40" placeholder="${escHtml(t('nh_sign_as_ph'))}" title="${escHtml(t('nh_sign_as_hint'))}"></div>
            <textarea id="nh-text" rows="3" maxlength="${NH_MAX}" placeholder="${escHtml(t('nh_text_ph'))}"></textarea>
            <div class="nh-foot">
              <div class="nh-moods" role="group" aria-label="${escHtml(t('nh_mood'))}">
                <button type="button" class="nh-mood" data-mood="smiley" aria-pressed="false">${t('nh_smiley')}</button>
                <button type="button" class="nh-mood" data-mood="frowny" aria-pressed="false">${t('nh_frowny')}</button>
              </div>
              <span class="small-hint" id="nh-counter">0/${NH_MAX}</span>
              <button class="wbtn primary" id="nh-send">${t('nh_send')}</button>
            </div>
            <p class="small-hint">${t('nh_privacy')}</p>
            <p class="small-hint" id="nh-hint"></p>
          </div>
        </section>
      </div></div>`;

    const signEl = q('#nh-signas');
    signEl.value = nhLoadSignAs();
    signEl.addEventListener('input', ()=> nhSaveSignAs(signEl.value.trim()));
    q('#nh-search').addEventListener('input', e=>{ search = e.target.value.trim().toLowerCase(); renderStudents(); });
    q('#nh-all').addEventListener('click', ()=>{ roster.forEach(s=> selected.add(s.id)); renderStudents(); renderChips(); });
    q('#nh-none').addEventListener('click', ()=>{ selected.clear(); renderStudents(); renderChips(); });
    body.querySelectorAll('.nh-mood').forEach(btn=> btn.addEventListener('click', ()=>{
      mood = (mood === btn.dataset.mood) ? null : btn.dataset.mood;
      paintMood(); showHint('');
    }));
    const ta = q('#nh-text');
    ta.addEventListener('input', ()=>{ q('#nh-counter').textContent = `${ta.value.length}/${NH_MAX}`; showHint(''); });
    ta.addEventListener('keydown', e=>{ if(e.key === 'Enter' && (e.ctrlKey || e.metaKey)){ e.preventDefault(); send(); } });
    q('#nh-send').addEventListener('click', send);
    q('#nh-students').addEventListener('click', e=>{
      if(e.target.closest('input[type=checkbox]')) return;          // the tick is handled by its own change event
      const row = e.target.closest('[data-thread]'); if(!row) return;
      const id = row.dataset.thread;
      filterId = id === filterId ? '' : id; firstThread = true;
      selected.clear(); if(filterId) selected.add(filterId);        // opening a conversation defaults the composer to reply to them, like a real messenger
      renderStudents(); renderChips(); renderHistory();
    });
    q('#nh-chips').addEventListener('click', e=>{
      const x = e.target.closest('[data-unpick]'); if(!x) return;
      selected.delete(x.dataset.unpick); renderStudents(); renderChips();
    });

    unsubs.push(TDCloud.subscribeRoster(state.cloudClassId, list=>{
      roster = list;
      const ids = new Set(roster.map(s=>s.id));
      [...selected].forEach(id=>{ if(!ids.has(id)) selected.delete(id); });   // a removed student can't stay ticked
      if(filterId && !ids.has(filterId)) filterId = '';
      renderStudents(); renderChips(); renderHistory(); applyPending();
    }));
    unsubs.push(TDCloud.subscribeNotes(state.cloudClassId, (list, err)=>{
      notes = list; notesFailed = !!err; renderStudents(); renderHistory();
    }));
  }

  // A ✉️ click on the roster ticks just that student, opens their conversation and puts the cursor in the message box.
  function applyPending(){
    if(!nhPendingStudent || !q('#nh-students')) return;
    if(!roster.some(s=> s.id === nhPendingStudent)) return;      // roster not loaded yet — tried again when it arrives
    selected.clear(); selected.add(nhPendingStudent); filterId = nhPendingStudent; nhPendingStudent = null; firstThread = true;
    renderStudents(); renderChips(); renderHistory();
    const ta = q('#nh-text'); if(ta){ ta.focus(); }
  }
  const onPending = ()=> applyPending();
  document.addEventListener('td:noteshome-pending', onPending);

  function paintMood(){
    body.querySelectorAll('.nh-mood').forEach(b=>{
      const on = b.dataset.mood === mood;
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function renderStudents(){
    const box = q('#nh-students'); if(!box) return;
    const sorted = roster.slice().sort((a,b)=> (a.displayName||'').localeCompare(b.displayName||'', state.lang || 'en'));
    // Two students with the same name look identical — the same ⚠️ marker the roster uses, because sending a note to the wrong family is the one mistake that matters here.
    const nameCounts = {};
    sorted.forEach(s=>{ const k=(s.displayName||'').trim().toLowerCase(); if(k) nameCounts[k]=(nameCounts[k]||0)+1; });
    const last = {}, unreadBy = {};
    notes.forEach(n=>{ if(!last[n.studentId]) last[n.studentId] = n; if(!n.read) unreadBy[n.studentId] = (unreadBy[n.studentId] || 0) + 1; });   // notes arrive newest first
    const unreadAll = notes.filter(n=>!n.read).length;
    const shown = sorted.filter(s=> !search || (s.displayName||'').toLowerCase().includes(search));
    box.innerHTML = `<div class="nh-prow nh-prow-all${filterId === '' ? ' on' : ''}" data-thread=""><span class="nh-av">✉️</span><div class="nh-pmain"><b>${t('nh_all_notes')}</b><small>${t('nh_n_sent', { n:notes.length })}</small></div>${unreadAll ? `<span class="nh-dot" title="${escHtml(t('nh_unread_count', { n:unreadAll }))}">${unreadAll}</span>` : ''}</div>`;
    if(!sorted.length) box.insertAdjacentHTML('beforeend', `<p class="small-hint">${t('nh_no_students')}</p>`);
    shown.forEach(s=>{
      const ln = last[s.id], when = ln ? tsMs(ln.createdAt) : 0, dup = nameCounts[(s.displayName||'').trim().toLowerCase()] > 1;
      const row = document.createElement('div'); row.className = 'nh-prow' + (filterId === s.id ? ' on' : ''); row.dataset.thread = s.id; row.setAttribute('role', 'button'); row.tabIndex = 0;
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.value = s.id; cb.checked = selected.has(s.id); cb.title = t('nh_send_to'); cb.setAttribute('aria-label', `${t('nh_send_to')}: ${s.displayName || ''}`);
      cb.addEventListener('change', ()=>{ if(cb.checked) selected.add(s.id); else selected.delete(s.id); updateCount(); renderChips(); });
      const main = document.createElement('div'); main.className = 'nh-pmain';
      const nm = document.createElement('b'); nm.textContent = s.displayName || '—';
      if(dup){ const d = document.createElement('span'); d.className = 'cc-dup-badge'; d.title = t('cc_dup_name_hint'); d.textContent = '⚠️'; nm.append(' ', d); }
      const sm = document.createElement('small'); sm.textContent = ln ? `${ln.mood === 'frowny' ? '🙁' : '🙂'} ${ln.text || (ln.mood === 'frowny' ? t('nh_frowny') : t('nh_smiley'))}` : t('nh_no_notes_yet');
      main.append(nm, sm);
      row.append(cb, main);
      if(when){ const w = document.createElement('span'); w.className = 'nh-pwhen'; w.textContent = fmtDayLabel(when) === t('ca_today') ? fmtClock(when) : fmtDayLabel(when); row.append(w); }
      if(unreadBy[s.id]){ const dt = document.createElement('span'); dt.className = 'nh-dot'; dt.textContent = unreadBy[s.id]; dt.title = t('nh_unread_count', { n:unreadBy[s.id] }); row.append(dt); }
      box.appendChild(row);
    });
    updateCount();
  }
  function updateCount(){ const el = q('#nh-count'); if(el) el.textContent = t('nh_selected', { n: selected.size }); }

  function renderChips(){
    const box = q('#nh-chips'); if(!box) return;
    const ids = roster.filter(s=> selected.has(s.id)).sort((a,b)=> (a.displayName||'').localeCompare(b.displayName||'', state.lang || 'en'));
    if(!ids.length){ box.innerHTML = `<span class="small-hint">${t('nh_pick_left')}</span>`; return; }
    const MAXC = 4;
    box.innerHTML = ids.slice(0, MAXC).map(s=> `<span class="nh-chip">${escHtml(s.displayName || '—')}<button type="button" data-unpick="${escHtml(s.id)}" aria-label="${escHtml(t('nh_remove_recipient'))}">×</button></span>`).join('')
      + (ids.length > MAXC ? `<span class="nh-chip nh-more" title="${escHtml(ids.slice(MAXC).map(s=> s.displayName).join(', '))}">${t('nh_more_n', { n:ids.length - MAXC })}</span>` : '');
  }

  function groupNotes(list){          // a class-wide note is one copy per child; in the all-notes view they read as ONE message (same text, mood and minute)
    const out = [], idx = new Map();
    list.forEach(n=>{
      const key = `${n.mood}|${n.text || ''}|${Math.floor((tsMs(n.createdAt) || 0) / 60000)}`;
      let g = idx.get(key); if(!g){ g = { notes:[], when:tsMs(n.createdAt) || 0, mood:n.mood, text:n.text || '' }; idx.set(key, g); out.push(g); }
      g.notes.push(n);
    });
    return out;
  }

  function renderHistory(){
    const box = q('#nh-history'); if(!box) return;
    const title = q('#nh-title'); if(title) title.textContent = filterId ? nameOf(filterId) : t('nh_all_notes');
    const unreadEl = q('#nh-unread');
    if(unreadEl){ const u = (filterId ? notes.filter(n=> n.studentId === filterId) : notes).filter(n=>!n.read).length; unreadEl.textContent = u ? t('nh_unread_count', { n:u }) : ''; }
    const near = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    box.innerHTML = '';
    const note = (key, err)=>{ const p = document.createElement('p'); p.className = 'small-hint nh-empty' + (err ? ' cc-error' : ''); p.textContent = t(key); box.appendChild(p); };
    if(notesFailed){ note('nh_load_failed', true); return; }
    const list = (filterId ? notes.filter(n=> n.studentId === filterId) : notes).slice().sort((a,b)=> (tsMs(a.createdAt) || 0) - (tsMs(b.createdAt) || 0));   // oldest first, newest at the bottom
    if(!list.length){ note('nh_none_yet'); return; }
    const items = filterId ? list.map(n=> ({ notes:[n], when:tsMs(n.createdAt) || 0, mood:n.mood, text:n.text || '' })) : groupNotes(list);
    let lastDay = '';
    items.forEach(g=>{
      const dayKey = g.when ? new Date(g.when).toDateString() : '';
      if(dayKey && dayKey !== lastDay){ lastDay = dayKey; const sep = document.createElement('div'); sep.className = 'nh-day'; sep.textContent = fmtDayLabel(g.when); box.appendChild(sep); }
      const total = g.notes.length, read = g.notes.filter(n=> n.read).length, unread = g.notes.filter(n=> !n.read);
      const msg = document.createElement('div'); msg.className = 'nh-msg' + (g.mood === 'frowny' ? ' frowny' : '');
      const head = document.createElement('div'); head.className = 'nh-msg-head';
      const face = document.createElement('span'); face.className = 'nh-face'; face.textContent = g.mood === 'frowny' ? '🙁' : '🙂';
      head.append(face);
      if(!filterId){      // "To: X" only adds information in the combined All-notes view — redundant inside a single student's own thread
        const who = document.createElement('b'); who.className = 'nh-note-name';
        who.textContent = total === 1 ? `${t('nh_to')}: ${nameOf(g.notes[0].studentId)}` : `${t('nh_to')}: ${t('nh_n_students', { n:total })}`;
        if(total > 1) who.title = g.notes.map(n=> nameOf(n.studentId)).join(', ');
        head.append(who);
      }
      msg.append(head);
      if(g.text){ const tx = document.createElement('div'); tx.className = 'nh-note-text'; tx.textContent = g.text; msg.append(tx); }
      const foot = document.createElement('div'); foot.className = 'nh-msg-foot';
      const when = document.createElement('span'); when.className = 'nh-when'; when.textContent = g.when ? fmtClock(g.when) : '';
      const status = document.createElement('span');
      if(read === total){
        const at = total === 1 ? tsMs(g.notes[0].readAt) : null;
        status.className = 'nh-status read'; status.textContent = `✓✓ ${total === 1 ? noEmoji(t('nh_status_read', { time: at ? fmtTime(at) : '' })) : t('nh_all_read')}`;
      }else{
        status.className = 'nh-status sent'; status.textContent = total === 1 ? `✓ ${noEmoji(t('nh_status_sent'))}` : `${read ? '✓✓' : '✓'} ${t('nh_read_n', { r:read, n:total })}`;
      }
      foot.append(when, status);
      if(unread.length){
        // Only an unread note can be taken back — once a parent has opened it, it stays.
        const del = document.createElement('button'); del.type = 'button'; del.className = 'nh-del'; del.textContent = '🗑️';
        del.title = t('nh_delete_tip'); del.setAttribute('aria-label', t('nh_delete_tip'));
        del.addEventListener('click', async ()=>{
          if(!confirm(t('nh_delete_confirm'))) return;
          const res = await Promise.allSettled(unread.map(n=> TDCloud.deleteNote(state.cloudClassId, n.id)));
          if(res.some(r=> r.status === 'rejected')) showHint(t('nh_delete_failed'), true);   // opened a moment ago, so no longer deletable
        });
        foot.append(del);
      }
      msg.append(foot);
      box.appendChild(msg);
    });
    if(firstThread || near){ box.scrollTop = box.scrollHeight; firstThread = false; }
  }

  async function send(){
    if(sending) return;
    const ta = q('#nh-text');
    const ids = roster.filter(s=> selected.has(s.id)).map(s=> s.id);
    const text = ta.value.trim();
    // The same rules the server enforces, checked first so the teacher gets a reason, not a failure.
    if(!ids.length){ showHint(t('nh_err_students'), true); return; }
    if(!mood){ showHint(t('nh_err_mood'), true); return; }
    if(mood === 'frowny' && !text){ showHint(t('nh_err_frowny_text'), true); return; }
    sending = true;
    const btn = q('#nh-send'); btn.disabled = true; btn.textContent = t('nh_sending'); showHint('');
    try{
      const res = await TDCloud.sendNotesHome(state.cloudClassId, ids, mood, text, nhLoadSignAs());
      track('notehome', (res.sent || 1) + ' sent', res.sent || 1);
      toast(res.sent === 1 ? t('nh_sent_one') : t('nh_sent_many', { n: res.sent }));
      selected.clear(); if(filterId) selected.add(filterId); mood = null; ta.value = '';   // re-sync with whatever thread is still open, so a second note doesn't need re-selecting
      q('#nh-counter').textContent = `0/${NH_MAX}`;
      firstThread = true; paintMood(); renderStudents(); renderChips(); renderHistory();
    }catch(e){ showHint(friendlyError(e), true); }
    finally{ sending = false; const b = q('#nh-send'); if(b){ b.disabled = false; b.textContent = t('nh_send'); } }
  }

  let drew = false;
  const unsubAuth = TDCloud.onAuthChanged(()=>{ drew = true; draw(); });
  if(!drew) draw();
  // Linking a class happens in the Cloud Class widget, which doesn't announce it — so notice it here.
  const poll = setInterval(()=>{ if((state.cloudClassId || null) !== shownClassId) draw(); }, 1500);
  return ()=>{ clearInterval(poll); stopSubs(); unsubAuth(); document.removeEventListener('td:noteshome-pending', onPending); nhPendingStudent = null; };
}

/* v0.19.0 strings: Class Builder. Languages not listed fall back to English. */
Object.assign(STRINGS, {
  classbuilder:        { en:'🏗️ Class Builder', vi:'🏗️ Class Builder' },
  wc_classbuilder:     { en:'Create classes, add students, pick and group them, go cloud.', vi:'Tạo lớp, thêm học sinh, chọn tên, chia nhóm, chuyển lên cloud.' },
  cb_tab_classes:      { en:'Classes', vi:'Lớp' },
  cb_tab_students:     { en:'Students', vi:'Học sinh' },
  cb_tab_pick:         { en:'Pick & Groups', vi:'Chọn & Chia nhóm' },
  cb_tab_cloud:        { en:'☁️ Cloud', vi:'☁️ Cloud' },
  cb_new_class:        { en:'＋ New class with students', vi:'＋ Lớp mới kèm học sinh' },
  cb_class_name:       { en:'Class name', vi:'Tên lớp' },
  cb_students_hint:    { en:'Vietnamese format: family name (Họ), middle name (Tên đệm), given name (Tên). The English name is optional. Blank rows are ignored.', vi:'Theo định dạng Việt Nam: Họ, Tên đệm, Tên. Tên tiếng Anh không bắt buộc. Dòng trống sẽ bị bỏ qua.' },
  cb_col_fam:          { en:'Family name (Họ)', vi:'Họ' },
  cb_col_mid:          { en:'Middle (Tên đệm)', vi:'Tên đệm' },
  cb_col_giv:          { en:'Given name (Tên)', vi:'Tên' },
  cb_col_en:           { en:'English name (optional)', vi:'Tên tiếng Anh (tùy chọn)' },
  cb_ph_fam:           { en:'Nguyễn', vi:'Nguyễn' },
  cb_ph_mid:           { en:'Văn', vi:'Văn' },
  cb_ph_giv:           { en:'An', vi:'An' },
  cb_ph_en:            { en:'Andy', vi:'Andy' },
  cb_remove:           { en:'Remove student', vi:'Xóa học sinh' },
  cb_add_student:      { en:'＋ Add student', vi:'＋ Thêm học sinh' },
  cb_paste_label:      { en:'Or paste a list — one per line, e.g. “Nguyễn Văn An, Andy”', vi:'Hoặc dán danh sách — mỗi dòng một em, ví dụ “Nguyễn Văn An, Andy”' },
  cb_paste_ph:         { en:'Nguyễn Văn An, Andy\nTrần Thị Bình\nLê Minh Châu (Chloe)', vi:'Nguyễn Văn An, Andy\nTrần Thị Bình\nLê Minh Châu (Chloe)' },
  cb_paste_add:        { en:'Add list', vi:'Thêm danh sách' },
  cb_n_students:       { en:'{n} students', vi:'{n} học sinh' },
  cb_added_n:          { en:'Added {n} students.', vi:'Đã thêm {n} học sinh.' },
  cb_sort:             { en:'Sort by given name', vi:'Sắp theo Tên' },
  cb_show_as:          { en:'Show names in Name Picker, Group Maker and Attendance as', vi:'Hiển thị tên trong Chọn tên, Chia nhóm và Điểm danh theo dạng' },
  cb_mode_both:        { en:'Vietnamese name (English name)', vi:'Tên Việt (tên tiếng Anh)' },
  cb_mode_en:          { en:'English name when there is one', vi:'Tên tiếng Anh nếu có' },
  cb_mode_vi:          { en:'Vietnamese name only', vi:'Chỉ tên Việt' },
  cb_preview:          { en:'Shown as', vi:'Hiển thị như' },
  cb_no_students:      { en:'No students yet — add some above.', vi:'Chưa có học sinh — hãy thêm ở trên.' },
  cb_cloud_intro:      { en:'Convert this class to a cloud class so students can join in StudentDeck and parents in ParentDeck. Sign in with Google to start.', vi:'Chuyển lớp này lên cloud để học sinh vào StudentDeck và phụ huynh vào ParentDeck. Đăng nhập Google để bắt đầu.' },
  cb_cloud_convert:    { en:'Convert to cloud class', vi:'Chuyển thành lớp cloud' },
  cb_cloud_convert_hint:{ en:'Creates a cloud class with a student code and a parent code. Students appear in the tables below once they join with the student code — type their names as shown on the join slips so they match your list.', vi:'Tạo lớp cloud với mã học sinh và mã phụ huynh. Học sinh sẽ xuất hiện trong các bảng bên dưới khi nhập mã học sinh — hãy nhập tên đúng như trên phiếu tham gia để khớp với danh sách của bạn.' },
  cb_cloud_name:       { en:'Cloud class name', vi:'Tên lớp cloud' },
  cb_converted:        { en:'This class is now a cloud class.', vi:'Lớp này đã trở thành lớp cloud.' },
  cb_linked:           { en:'cloud class', vi:'lớp cloud' },
  cb_cloud_missing:    { en:'This cloud class can’t be read — you may be signed in with a different Google account.', vi:'Không đọc được lớp cloud này — có thể bạn đang đăng nhập bằng tài khoản Google khác.' },
  cb_seg_student:      { en:'StudentDeck', vi:'StudentDeck' },
  cb_seg_parent:       { en:'ParentDeck', vi:'ParentDeck' },
  cb_seg_admin:        { en:'AdminDeck', vi:'AdminDeck' },
  cb_h_student:        { en:'Student', vi:'Học sinh' },
  cb_h_status:         { en:'Status', vi:'Trạng thái' },
  cb_h_points:         { en:'Points', vi:'Điểm' },
  cb_h_level:          { en:'Level', vi:'Cấp' },
  cb_h_streak:         { en:'Streak', vi:'Chuỗi ngày' },
  cb_h_last:           { en:'Last active', vi:'Hoạt động gần nhất' },
  cb_h_sent:           { en:'Notes sent', vi:'Ghi chú đã gửi' },
  cb_h_unread:         { en:'Unread', vi:'Chưa đọc' },
  cb_h_latest:         { en:'Latest note', vi:'Ghi chú mới nhất' },
  cb_h_item:           { en:'Item', vi:'Mục' },
  cb_h_value:          { en:'Value', vi:'Giá trị' },
  cb_joined:           { en:'Joined', vi:'Đã tham gia' },
  cb_notyet:           { en:'Not yet', vi:'Chưa' },
  cb_joined_sum:       { en:'{j} of {n} joined', vi:'{j}/{n} đã tham gia' },
  cb_student_note:     { en:'Matched by name (accents and capitals ignored).', vi:'Khớp theo tên (bỏ qua dấu và chữ hoa).' },
  cb_unmatched_title:  { en:'Joined, but not on your list', vi:'Đã tham gia nhưng chưa có trong danh sách' },
  cb_add_to_list:      { en:'Add to class list', vi:'Thêm vào danh sách lớp' },
  cb_parent_note_cc:   { en:'Parents join with the parent code {code}. Which parents have linked isn’t visible here — this shows the notes you sent them.', vi:'Phụ huynh tham gia bằng mã phụ huynh {code}. Ở đây không thấy phụ huynh nào đã liên kết — chỉ thấy các ghi chú bạn đã gửi.' },
  cb_parent_note:      { en:'Parents link with their child’s own family code: Cloud Class → Class settings → Family codes, or StudentDeck → Class. Which parents have linked isn’t visible here — this shows the notes you sent them.', vi:'Phụ huynh liên kết bằng mã gia đình riêng của con: Cloud Class → Cài đặt lớp → Mã gia đình, hoặc StudentDeck → Lớp. Ở đây không thấy phụ huynh nào đã liên kết — chỉ thấy các ghi chú bạn đã gửi.' },
  cb_admin_note:       { en:'The class record, as far as TeachersDeck can see it. Your school’s AdminDeck holds its own view.', vi:'Hồ sơ lớp theo những gì TeachersDeck thấy được. AdminDeck của trường có góc nhìn riêng.' },
  cb_a_class:          { en:'Class', vi:'Lớp' },
  cb_a_teacher:        { en:'Teacher', vi:'Giáo viên' },
  cb_a_id:             { en:'Cloud class ID', vi:'Mã lớp cloud' },
  cb_a_students:       { en:'Students on list', vi:'Học sinh trong danh sách' },
  cb_a_codes:          { en:'Student / parent code', vi:'Mã học sinh / phụ huynh' },
  cb_a_ranking:        { en:'Ranking visibility', vi:'Hiển thị bảng xếp hạng' },
  cb_a_homework:       { en:'Assignments shared', vi:'Bài tập đã chia sẻ' },
  cb_a_calendar:       { en:'Calendar events shared', vi:'Sự kiện lịch đã chia sẻ' },
  cb_a_theme:          { en:'School theme from AdminDeck', vi:'Giao diện trường từ AdminDeck' },
  cb_a_theme_yes:      { en:'Received', vi:'Đã nhận' },
  cb_a_theme_no:       { en:'None received', vi:'Chưa nhận' },
  cb_copy_table:       { en:'Copy table', vi:'Sao chép bảng' },
  cb_table_copied:     { en:'Table copied — paste it into a spreadsheet.', vi:'Đã sao chép bảng — dán vào bảng tính.' },
  cb_slips:            { en:'Print join slips', vi:'In phiếu tham gia' },
  cb_popup_blocked:    { en:'Your browser blocked the print window — allow pop-ups for this page.', vi:'Trình duyệt đã chặn cửa sổ in — hãy cho phép cửa sổ bật lên.' },
  cb_slip_student:     { en:'StudentDeck → Join with class code {code}. Type your name as: {name}', vi:'StudentDeck → Tham gia bằng mã lớp {code}. Nhập tên của em: {name}' },
  cb_slip_parent:      { en:'Parents: ParentDeck → parent code {code}', vi:'Phụ huynh: ParentDeck → mã phụ huynh {code}' },
  cb_slip_family:      { en:'Parents: ParentDeck → Link a child → family code {code}', vi:'Phụ huynh: ParentDeck → Liên kết một học sinh → mã gia đình {code}' },
  cb_slip_family_later:{ en:'Parents: once your child has joined, their family code for ParentDeck is in StudentDeck → Class.', vi:'Phụ huynh: khi con đã tham gia lớp, mã gia đình cho ParentDeck nằm trong StudentDeck → Lớp.' },
  cb_unlink:           { en:'Unlink from cloud class', vi:'Hủy liên kết lớp cloud' },
  cb_unlink_confirm:   { en:'Unlink this class from its cloud class? The cloud class and its students are not deleted.', vi:'Hủy liên kết lớp này với lớp cloud? Lớp cloud và học sinh không bị xóa.' },
  cb_settings_sum:     { en:'{name} · {n} students', vi:'{name} · {n} học sinh' },
  cb_open:             { en:'Open Class Builder…', vi:'Mở Class Builder…' },
  cb_new_menu:         { en:'＋ New class…', vi:'＋ Lớp mới…' }
});
// These pointed at a Settings → Class list that no longer exists; English and Vietnamese now point at Class Builder (other languages fall back to English).
STRINGS.att_no_roster      = { en:'Add students in Class Builder first.', vi:'Hãy thêm học sinh trong Class Builder trước.' };
STRINGS.gm_no_roster       = { en:'Add students in Class Builder first.', vi:'Hãy thêm học sinh trong Class Builder trước.' };
STRINGS.hp_no_roster       = { en:'Add students in Class Builder first.', vi:'Hãy thêm học sinh trong Class Builder trước.' };
STRINGS.add_students_prompt= { en:'Add students in Class Builder', vi:'Thêm học sinh trong Class Builder' };
STRINGS.roster_count       = { en:'{n} students in class list — edit in Class Builder', vi:'{n} học sinh trong danh sách lớp — chỉnh sửa trong Class Builder' };

