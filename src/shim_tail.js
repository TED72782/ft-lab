/* captured before anything mutates S — the legacy-link tests below deliberately overwrite
   assessNo with the pre-split fallback, so reading it at the end measures the wrong thing */
const DEFAULT_ASSESS_NO = S.assessNo;
/* ⚠ A THROW USED TO LOOK LIKE A PASS. An uncaught exception anywhere below stopped the run dead:
   the checks after it simply never printed, and since the stated workflow is `grep FAIL`, a screen
   with 61 "yes" lines and no FAIL read as green while twelve checks had silently vanished. The
   exit code did go to 1, but the first stderr line is an innocuous ?board= notice, so it looked
   normal. Now a throw prints a FAIL naming the check it died after, and the run always ends with
   a count line — an absent or shrunken count is itself the signal. */
const EXPECTED_CHECKS = 119;   // raise DELIBERATELY when adding a check
let CHECKS = 0, LAST = "(none)";
const _log = console.log.bind(console);
console.log = (...a) => { const t = String(a[0] ?? "");
  if(/: *(yes|FAIL|ok)/.test(t + " " + String(a[1] ?? ""))){ CHECKS++; LAST = t.trim() }
  _log(...a); };
/* async: the optimiser yields between slices, so its guards must be able to await it. The
   try/catch/finally below is unchanged — a rejection still reports as an ABORT with the
   check it died after, and the count line still prints. */
setTimeout(async ()=>{ try{
  S.mode="split";S.A=6;S.R=4;S.start=15;S.len=8;S.assess=44;S.fastDischarge=true;S.level=1;
  PICK=new Set(CC.map(x=>x.i)); run(); buildTrace();
  /* ⚠ SWEEP THE RUN, DO NOT SAMPLE ONE MINUTE. These four read the stage at t=300 and printed
     raw counts with no pass/fail wording, so a zero read as noise rather than as a failure — and
     minute 300 is one of the ~100 minutes of 481 where the assessment area happens to be empty on
     this seed. The output said "0 figures in 6 slots" and "test badge: no" while the area peaked
     at 6/6 and the badge first drew at t=59. Which minute you land on changed with any edit, so
     the checks reported luck. Peaks over the whole run are a property of the run. */
  let peakFig=0, peakSlot=0, peakWait=0, badge=false, ghost=0;
  for(let t=0;t<=S.len*60;t++){
    PLAY.t=t; drawStage();
    const a=document.getElementById("stageA").innerHTML;
    peakFig  = Math.max(peakFig,  (a.match(/<svg/g)||[]).length);
    peakSlot = Math.max(peakSlot, (a.match(/class="slot/g)||[]).length);
    peakWait = Math.max(peakWait, (document.getElementById("stageWait").innerHTML.match(/<svg/g)||[]).length);
    if(/class="bg"/.test(a)) badge = true;
    /* an EMPTY slot must carry no figure. The old form was `/<span class="slot"><\/span>/.test(a)
       || !a.includes('class="slot">')` — dot() emits `<span class="slot" data-k="-">`, so the
       first pattern can never match and the second substring can never be present: the whole
       expression was `false || !false` for every possible stage state. This counts real ghosts. */
    ghost += (a.match(/<span class="slot"[^>]*>\s*<svg/g)||[]).length
           - (a.match(/<span class="slot [^>]*>\s*<svg/g)||[]).length;
  }
  console.log("assessment slots fill           :", peakFig>0 && peakSlot===6
    ? "yes (peak "+peakFig+" of "+peakSlot+" over the run)" : "FAIL — peak "+peakFig+"/"+peakSlot);
  console.log("test badge appears              :", badge ? "yes" : "FAIL — never drawn in 481 minutes");
  console.log("an empty slot holds no figure   :", ghost<=0 ? "yes (every minute)" : "FAIL — "+ghost+" ghosts");
  /* A jammed lane must show red figures AND a queue. The waiting-pool check lives here rather
     than above because a 6+4 lane at this volume never queues — asserting it drew a waiting
     figure on a lane with no wait is a check that can only fail for the wrong reason. */
  S.A=4;S.R=1;S.assess=30; run(); buildTrace();
  let jam=0, jamWait=0;
  for(let t=0;t<=S.len*60;t++){ PLAY.t=t; drawStage();
    jam=Math.max(jam,(document.getElementById("stageA").innerHTML.match(/fig jam/g)||[]).length);
    jamWait=Math.max(jamWait,(document.getElementById("stageWait").innerHTML.match(/<svg/g)||[]).length) }
  console.log("a jammed lane shows red figures :", jam>0 ? "yes (peak "+jam+")" : "FAIL — none in 481 minutes");
  console.log("a jammed lane shows its queue   :", jamWait>0 ? "yes (peak "+jamWait+" waiting)" : "FAIL — queue never drawn");
  /* ⚠ THE REGRESSION GUARD. A slot whose occupant has not changed must keep the SAME element
     across frames. Rebuild it every tick and the .22s arrival animation restarts from
     opacity:0 sixty times a second: the boxes change colour and the people never appear. */
  S.A=6;S.R=4;S.assess=44; run(); buildTrace();
  /* ⚠ PICK A QUIET MINUTE, DO NOT HARDCODE ONE. This sampled t=300 and t=300.4 and demanded the
     occupants be unchanged — but whether anything happens in that 0.4 min is a property of the
     trace, so any engine change can put a real departure there and the check fails for a correct
     reason. Find a minute with no event in the following fraction and test THAT. */
  let qt = 300;
  for(let t=120; t<400; t++)
    if(!PLAY.trace.some(e => e.t > t && e.t <= t+0.4)){ qt = t; break }
  PLAY.t=qt; drawStage();
  const host=document.getElementById("stageA");
  const before=host.children.map(c=>c);
  const keys=before.map(c=>c.dataset.k).join(",");
  PLAY.t=qt+0.4; drawStage();   // a fraction of a minute later, with nothing happening in between
  const after=host.children.map(c=>c);
  const same=before.filter((c,i)=>c===after[i]).length;
  console.log("occupants unchanged             :", keys===after.map(c=>c.dataset.k).join(",") ? "yes" : "FAIL — occupants changed between frames");
  console.log("slots REUSED, not rebuilt       :", same+"/"+before.length,
              same===before.length ? "ok" : "FAIL — figures will be invisible while playing");
  // and a slot whose occupant DOES change must be replaced
  let churn=0;
  for(let t=302;t<=420;t+=2){ const k0=host.children.map(c=>c.dataset.k).join(",");
    const e0=host.children.map(c=>c); PLAY.t=t; drawStage();
    host.children.forEach((c,i)=>{ if(c!==e0[i]) churn++ });
    if(k0!==host.children.map(c=>c.dataset.k).join(",")) {} }
  console.log("slots DO refresh on a new patient:", churn>0 ? "yes ("+churn+" swaps)" : "FAIL — stage frozen");

  /* ⚠ A LEGACY BOARD ROW MUST SURVIVE ITS OWN LOAD BUTTON. evaluate() and drawBoard() were
     guarded against retired modes ('zone','rooms') while the load handler wrote cfg.mode
     straight into live state — modeOf() returned undefined and every later run() died. */
  saveLocal([{who:"legacy", at: 42, cfg:{mode:"zone",A:2,R:8,cyc:76,assess:44,fastDischarge:true}}]);
  SHARED=false; drawBoard();
  let zOk=true, zMsg="";
  S.start=3; S.len=20; S.level=1;                    // park the live lane far from the saved one
  const rowScore = scoreOf(board()[0].cfg, LEVELS[S.level].pts).score;
  /* ⚠ CLICK THE REAL BUTTON. This used an inline copy commented "mirrors the shipped handler",
     and a copy that mirrors the handler cannot detect the handler drifting — while CLAUDE.md
     records "a board row must load as the lane that was ranked" as the SAME BUG TWICE. */
  try{
    /* row identity is the RENDERED POSITION now (`at` is not unique — a blank timestamp cell
       coerces to 0 in the sheet), so the guard clicks the row's own button rather than hunting
       a timestamp. One row is saved, so it is the first. */
    const btn = document.getElementById("boardBody").querySelectorAll("[data-load]")[0];
    if(!btn || typeof btn.onclick !== "function") throw new Error("no load handler on the row");
    btn.onclick();
    run(); S.A=5; run();
  }catch(err){ zOk=false; zMsg=err.message }
  console.log("legacy zone row loads       :", zOk ? "yes (as "+S.mode+")" : "FAIL — "+zMsg);
  /* ⚠ LOADING A ROW MUST GIVE BACK THE LANE THAT WAS RANKED. A row saved before the window was
     adjustable carries no start/len, and Object.assign(cfg) left whatever the current user was
     looking at in place — so the row was SCORED as the 15:00-23:00 lane and LOADED as a 20-hour
     one. sane() supplies the same defaults to both sides. */
  S.A=2; run();
  console.log("legacy load restores 15-23  :", S.start===15 && S.len===8 ? "yes"
              : "FAIL — got "+S.start+"/"+S.len);
  const live = evaluate({mode:S.mode,A:S.A,R:S.R,cyc:S.cyc,assess:S.assess,
                         fastDischarge:S.fastDischarge, cc:[...PICK].sort((a,b)=>a-b).join("."),
                         start:S.start, len:S.len, bar:S.bar, loadPct:S.loadPct, docs:S.docs},
                        LEVELS[S.level].pts).score;
  console.log("loaded lane reproduces score:", Math.abs(live-rowScore) < 1.5
              ? "yes ("+live.toFixed(1)+" vs "+rowScore.toFixed(1)+")"
              : "FAIL — "+live.toFixed(1)+" live vs "+rowScore.toFixed(1)+" on the board");

  /* ⚠ A LINK IS NOT TRUSTED INPUT. People edit them and chat clients truncate them; a NaN
     reaching new Array(S.A) in drawStageIdle threw before a single handler was wired, so Add /
     Play / Copy link were all dead on a page that otherwise looked fine. */
  let hOk = true, hMsg = "";
  for(const h of ["split,x,4,76,44,0,1,15,8", "split,-3,4,76,44,0,1,15,8", "split,,,,,,,,",
                  "split,6,4,76,44,0,1,15,", "split,6.5,4,76,44,0,1,99,999"]){
    location.hash = "#" + h;
    try{ fromHash(); drawSpaces(); drawStageIdle(); run() }
    catch(err){ hOk=false; hMsg = h + " -> " + err.message; break }
  }
  console.log("malformed links survive     :", hOk ? "yes (clamped)" : "FAIL — "+hMsg);

  /* ⚠ THE BED-FIRST INVARIANT. With nobody bed-required, "a room if free, else a chair" is
     just one pool of A+R that nobody is ever moved out of — i.e. exactly the pooled lane. If
     these two ever separate, the placement logic has grown a cost that is not the rule it is
     supposed to be modelling, and the whole "what does the exclusion list cost" reading of the
     layout is void. Seed noise between two different RNG streams is the only gap allowed. */
  /* ⚠ ENOUGH DAYS TO SEE THE INVARIANT RATHER THAN THE NOISE. The two lanes run different RNG
     streams, so the gap is Monte-Carlo error around a true zero — and adding the load stretch and
     the provider queue put two more stochastic terms in it. At 600 days the gap is 0.61 against a
     0.5 tolerance; it converges 0.61 -> 0.30 -> 0.23 -> 0.06 at 600/2400/9600/24000, which is what
     tells you it is noise. Raised the sample rather than the bound: widening the tolerance would
     have hidden a real divergence of the same size. */
  const cfgB = {cyc:76, assess:44, fastDischarge:false, start:15, len:8, bar:"today", days:9600};
  const bf0 = evaluate({...cfgB, mode:"bedfirst", A:6, R:4, bedcc:"", bedExtra:0}, LEVELS[2].pts).score;
  const pl  = evaluate({...cfgB, mode:"pooled",   A:10, R:0},             LEVELS[2].pts).score;
  console.log("bed-first at 0% == pooled   :", Math.abs(bf0-pl) < 0.5
              ? "yes ("+bf0.toFixed(1)+" vs "+pl.toFixed(1)+")"
              : "FAIL — "+bf0.toFixed(2)+" vs "+pl.toFixed(2));
  const bfHi = evaluate({...cfgB, mode:"bedfirst", A:2, R:8, bedcc:"", bedExtra:25}, LEVELS[2].pts).score;
  const bfLo = evaluate({...cfgB, mode:"bedfirst", A:8, R:2, bedcc:"", bedExtra:25}, LEVELS[2].pts).score;
  console.log("scarce rooms cost more      :", bfHi > bfLo + 1
              ? "yes (2rm "+bfHi.toFixed(1)+" vs 8rm "+bfLo.toFixed(1)+")"
              : "FAIL — 2rm "+bfHi.toFixed(1)+" vs 8rm "+bfLo.toFixed(1));
  /* The stage must replay the mode the numbers came from — a mode added to sim() but not to
     buildTrace() plays a different lane on screen from the one the cards describe. */
  S.mode="bedfirst"; S.A=6; S.R=4; S.bedExtra=25; run(); buildTrace();
  const bedStuck = PLAY.trace.filter(e=>e.ev==="stuck").length;
  const bedChair = PLAY.trace.filter(e=>e.ev==="second").length;
  console.log("stage runs the bed-first run:", bedStuck===0 && bedChair>0
              ? "yes (chairs used, nobody stuck)"
              : "FAIL — stuck="+bedStuck+" chair="+bedChair);
  /* ⚠ THE LIST IS THE CONTROL NOW. Ticking a complaint must move the share, and the share the
     panel reports must be the one the engine is handed — a list that renders but does not reach
     sim() is worse than no list, because it looks vetted. */
  /* ⚠ AND IT MUST SURVIVE ITS OWN LOAD BUTTON. BEDPICK lives outside S, so Object.assign cannot
     carry it — the row came back SCORED on its own list and SHOWING whoever else's was loaded. */
  S.bedExtra = 12; BEDPICK = new Set([0,4]);
  const bedRow = {who:"bed", at: 77, cfg:{mode:"bedfirst", A:6, R:4, cyc:76, assess:44,
    fastDischarge:false, cc:CC.map(x=>x.i).join("."), start:15, len:8,
    bedcc:[...BEDPICK].sort((a,b)=>a-b).join("."), bedExtra:S.bedExtra}};
  saveLocal([bedRow]); drawBoard();
  const bedRowScore = scoreOf(bedRow.cfg, LEVELS[S.level].pts).score;
  BEDPICK = new Set(); S.bedExtra = 0; S.mode = "split";       // wipe it, as a load would find it
  const c2 = sane(bedRow.cfg);
  Object.assign(S, c2);
  PICK = c2.cc === undefined ? new Set(CC.map(x=>x.i)) : idSet(c2.cc);
  BEDPICK = c2.bedcc === undefined ? new Set(BED_IDS) : idSet(c2.bedcc);   // mirrors the handler
  run();
  const bedBack = [...BEDPICK].sort((a,b)=>a-b).join(".");
  console.log("load restores exclusion list:", bedBack==="0.4" && S.bedExtra===12
      ? "yes" : "FAIL — list="+bedBack+" extra="+S.bedExtra);
  const liveBed = evaluate({mode:S.mode, A:S.A, R:S.R, cyc:S.cyc, assess:S.assess,
      fastDischarge:S.fastDischarge, cc:[...PICK].sort((a,b)=>a-b).join("."),
      bedcc:[...BEDPICK].sort((a,b)=>a-b).join("."), bedExtra:S.bedExtra,
      start:S.start, len:S.len, bar:S.bar,
      /* the loaded row is a LEGACY one: it carries neither field, so sane() scored it with both
         off, and the live lane must be evaluated the same way or the two legitimately differ */
      loadPct:S.loadPct, docs:S.docs}, LEVELS[S.level].pts).score;
  console.log("loaded bed lane scores same :", Math.abs(liveBed-bedRowScore) < 1.5
      ? "yes ("+liveBed.toFixed(1)+" vs "+bedRowScore.toFixed(1)+")"
      : "FAIL — "+liveBed.toFixed(1)+" vs "+bedRowScore.toFixed(1));
  saveLocal([]); BEDPICK = new Set(BED_IDS); S.bedExtra = 0; PICK = new Set(CC.map(x=>x.i)); BEDPICK = new Set(BED_IDS); run();
  const withList = liveBedShare();
  BEDPICK = new Set(); run();
  const noList = liveBedShare();
  BEDPICK = new Set(CC.map(x=>x.i)); run();
  const allList = liveBedShare();
  console.log("exclusion list drives share :",
    noList===0 && withList>0 && withList<1 && Math.abs(allList-1)<1e-9
      ? "yes (none 0% / Blake's "+(100*withList).toFixed(0)+"% / all 100%)"
      : "FAIL — none="+noList+" blake="+withList+" all="+allList);
  BEDPICK = new Set(BED_IDS); S.bedExtra = 50; run();
  console.log("residual composes with list :", Math.abs(liveBedShare() - (withList + (1-withList)*0.5)) < 1e-9
      ? "yes" : "FAIL — got "+liveBedShare());
  S.bedExtra = 0;

  /* ── the interpreter criterion ────────────────────────────────────────────
     Added 2026-08-22. It is the first term that is neither a complaint nor a flat guess, so it
     can fail in ways the list checks above cannot see. */
  BEDPICK = new Set(BED_IDS); S.bedIntp = false; run();
  const noI = liveBedShare();
  S.bedIntp = true; run();
  const yesI = liveBedShare();
  // it must ADD to the list rather than replace it, and land inside 0..1
  /* ⚠ A DIRECTION IS NOT A COMPOSITION. `yesI > noI && yesI < 1` is satisfied by the
     double-counting implementation too — applying the interpreter rate to the WHOLE selection
     instead of to whoever the ticked complaints leave behind passed it, moving the printed share
     18.20% -> 19.43%. Assert the composition itself, the way the bedExtra check already does:
     the interpreter term applies only to the residual, so nobody is counted twice. */
  const selI = CC.filter(x => PICK.has(x.i)), totI = selI.reduce((a,x)=>a+x.s, 0);
  const residualI = selI.filter(x => !BEDPICK.has(x.i))
                        .reduce((a,x) => a + x.s * x.x, 0) / (totI || 1);
  console.log("interpreter adds to the list :",
    yesI > noI && yesI < 1 && Math.abs(yesI - (noI + (1-noI)*residualI/(1-noI || 1))) < 5e-3
    || (yesI > noI && yesI < 1 && Math.abs(yesI - (noI + residualI)) < 1e-9)
    ? "yes (" + (100*noI).toFixed(1) + "% + " + (100*residualI).toFixed(1)
      + "% of whoever is left = " + (100*yesI).toFixed(1) + "%)"
    : "FAIL — off=" + noI.toFixed(4) + " on=" + yesI.toFixed(4)
      + " but the residual term is " + residualI.toFixed(4));

  /* ⚠ NOT A FLAT RATE. If someone ever replaces the per-complaint `x` with a single window-wide
     number this check is the one that notices: narrowing to a low-interpreter complaint and to a
     high one must give different shares. Laceration measures ~5% and Fever ~17%. */
  const byName = n => CC.find(x => x.n === n);
  const lac = byName("Laceration"), fev = byName("Fever");
  if(lac && fev){
    BEDPICK = new Set();                       // nothing ticked, so the term stands alone
    PICK = new Set([lac.i]); run(); const shLac = liveBedShare();
    PICK = new Set([fev.i]); run(); const shFev = liveBedShare();
    console.log("interpreter is per-complaint :", shFev > shLac + 0.02
      ? "yes (laceration " + (100*shLac).toFixed(1) + "% vs fever " + (100*shFev).toFixed(1) + "%)"
      : "FAIL — flat? laceration=" + shLac + " fever=" + shFev);
  } else console.log("interpreter is per-complaint : FAIL — complaint not found");
  PICK = new Set(CC.map(x=>x.i));

  /* A row saved before this criterion existed was scored WITHOUT it. Defaulting to true would
     silently re-rank other people's lanes under a rule they never chose. */
  const legacyBed = sane({mode:"bedfirst", A:6, R:4, cyc:76, assess:44, fastDischarge:false,
                          bedcc:[...BED_IDS].join("."), bedExtra:0});
  console.log("legacy bed row keeps its score:", legacyBed.bedIntp === false
    ? "yes (interpreter off)" : "FAIL — bedIntp=" + legacyBed.bedIntp);

  /* The genital group must be ON Blake's list, and must not have dragged the urinary complaints
     in with it — the operator's 2026-08-22 correction. */
  const gen = CC.find(x => x.k === "genital");
  console.log("genital group is on the list :", gen && BED_IDS.indexOf(gen.i) >= 0
    ? "yes (" + gen.n + ", " + (100*gen.s).toFixed(2) + "% of the lane)"
    : "FAIL — group missing from BED_IDS");
  /* ⚠ THIS WAS A TAUTOLOGY and is kept only as a reminder of the shape. It read
     `!/urinary|dysuria|hematuria/i.test(gen.n)` — testing the genital ROW'S NAME, which is
     "Genital & sensitive exam (18)" and can never contain those words — so it was true for every
     possible program state, including one with Dysuria back on the room list. The property it
     was meant to assert is now tested for real at "dysuria stays off the room list". What
     survives here is the weaker thing it actually checked: the urinary complaints still exist as
     their own rows rather than having been merged away. */
  console.log("urinary keeps its own rows  :", CC.some(x => x.n === "Dysuria")
    ? "yes (Dysuria is a row in its own right)" : "FAIL — Dysuria has been merged away");

  S.bedIntp = true; BEDPICK = new Set(BED_IDS);

  /* ── families arrive together ─────────────────────────────────────────────
     Added 2026-08-22. Three ways this can go wrong, one check each. */
  const GRP = D.grp;
  const base = {A:6, R:4, lam:D.lam, asw:D.asw, now:D.now, res:D.res, assessMin:44,
                fastDischarge:false, days:400, seeds:[11,12,13,14]};
  const runWith = g => { D.grp = g; return sim({...base, pooled:true}) };

  // 1. VOLUME IS CONSERVED. The event rate is divided by the mean group size, so grouping changes
  //    how arrivals bunch and NOT how many there are. Without that the lane silently gains ~3%.
  const withG = runWith(GRP), noG = runWith(null);
  const dArr = 100*Math.abs(withG.arrived - noG.arrived)/noG.arrived;
  console.log("grouping conserves volume  :", dArr < 2
    ? "yes (" + withG.arrived.toFixed(1) + " vs " + noG.arrived.toFixed(1) + " arrivals/evening)"
    : "FAIL — " + dArr.toFixed(1) + "% apart");

  // 2. IT IS INERT WHEN ABSENT. A page built without the sidecar must be the old engine exactly.
  D.grp = null;
  const a1 = sim({...base, pooled:true, seeds:[7,8]}), a2 = sim({...base, pooled:true, seeds:[7,8]});
  console.log("no params == old behaviour :", a1.perArrival === a2.perArrival
    ? "yes (deterministic, group draw never consulted)" : "FAIL");

  // 3. IT COSTS SOMETHING. Bunched arrivals must not be free: same volume, worse wait. If this
  //    ever reads "no change", the group draw is not reaching the queue.
  D.grp = GRP;
  /* 3. BUNCHING COSTS WAIT, and the check needs the sample size to see it. At 400 evenings the
        delta alternates sign — it is ~1 min against waits of 8-120, so a small run measures noise
        and an earlier version of this check "failed" on it. 24,000 evenings resolves it cleanly:
        +0.96 / +1.03 / +1.08 / +0.68 / +0.11 min at 3 / 5 / 6 / 8 / 12 spaces (2026-08-22).
        The cost is largest where the lane is TIGHT, which is where the layouts differ, and that
        is the whole reason this is modelled rather than assumed away. */
  const tight = {...base, A:6, R:0, pooled:true, days:3000, seeds:[11,12,13,14,15,16,17,18]};
  D.grp = null; const singleArr = sim(tight);
  D.grp = GRP;  const familyArr = sim(tight);
  const cost = familyArr.perArrival - singleArr.perArrival;
  console.log("bunching costs wait        :", cost > 0.3
    ? "yes (+" + cost.toFixed(2) + " min/patient at 6 spaces)"
    : "FAIL — " + cost.toFixed(2) + " min; grouping is not reaching the queue");

  /* ── turnover + the sibling rule ──────────────────────────────────────────
     Added 2026-08-22. */
  const tb = {...base, A:6, R:4, pooled:false, bedFirst:true, bedShare:0.19,
              days:1200, seeds:[11,12,13,14]};
  D.grp = GRP;
  const noTurn = sim({...tb, turnA:0,  turnB:0});
  const wTurn  = sim({...tb, turnA:10, turnB:1});
  console.log("turnover costs capacity    :", wTurn.perArrival > noTurn.perArrival
    ? "yes (" + noTurn.perArrival.toFixed(2) + " -> " + wTurn.perArrival.toFixed(2)
      + " min/patient at 10/1)"
    : "FAIL — free at " + wTurn.perArrival.toFixed(2) + " vs " + noTurn.perArrival.toFixed(2));
  /* ⚠ THIS COMPARED A CALL TO AN IDENTICAL CALL. `noTurn` two lines above IS
     `sim({...tb, turnA:0, turnB:0})`, so the assertion could only ever detect nondeterminism —
     charging a 5-minute turnover even at the zero setting, which moves every score on the page,
     passed it. The contract it means to state is that turnover at zero is the engine as it was
     BEFORE the feature: compare against the parameters being ABSENT, which is what a
     pre-turnover board row carries, and pin the two together. */
  const absentTurn = sim({...tb});
  const zeroTurn   = sim({...tb, turnA:0, turnB:0});
  /* ⚠ AND MEASURE THE MINUTES, NOT JUST THE ORDERING. A relative pin cannot catch a turnover
     charged at EVERY setting — shifting both sides equally leaves absent == zero and
     zero < charged both true while every score on the page moves. The gap between a patient
     leaving a space and the next one entering THAT space is what "turnover" means, so read it
     off the trace: it must equal the dial, and equal 0 when the dial is 0. Structural, so it
     does not rot when the data cut moves. */
  const gapAt = turnA => {
    const t = sim({...tb, turnA, turnB:turnA, days:1, seeds:[11], trace:true}).trace || [];
    const slotOf = new Map(); const freedAt = new Map(); let minGap = Infinity;
    for(const e of t){
      if(e.ev === "assess" || e.ev === "second"){
        const key = (e.ev === "assess" ? "A" : "B") + e.slot;
        if(freedAt.has(key)) minGap = Math.min(minGap, e.t - freedAt.get(key));
        slotOf.set(e.id, key);
      } else if(e.ev === "leave" && slotOf.has(e.id)){
        freedAt.set(slotOf.get(e.id), e.t); slotOf.delete(e.id);
      }
    }
    return minGap;
  };
  const g0 = gapAt(0), g7 = gapAt(7);
  console.log("a space reopens after exactly:",
    absentTurn.perArrival === zeroTurn.perArrival && g0 === 0 && g7 === 7
      ? "yes (0 min at the zero dial, 7 at 7; absent == zero)"
      : "FAIL — gap " + g0 + " at dial 0, " + g7 + " at dial 7; absent "
        + absentTurn.perArrival.toFixed(3) + " vs zero " + zeroTurn.perArrival.toFixed(3));

  /* The sibling rule must send families to ROOMS, so it can only cost when rooms are the scarce
     side. Checked on a room-poor lane, where it has somewhere to bite. */
  const rp = {...tb, A:3, R:7};
  const noSib = sim({...rp, turnA:10, turnB:1, bedGrp:false});
  const wSib  = sim({...rp, turnA:10, turnB:1, bedGrp:true});
  console.log("sibling rule needs a room  :", wSib.perArrival > noSib.perArrival
    ? "yes (" + noSib.perArrival.toFixed(2) + " -> " + wSib.perArrival.toFixed(2)
      + " min/patient at 3 rooms)"
    : "FAIL — no cost: " + wSib.perArrival.toFixed(2) + " vs " + noSib.perArrival.toFixed(2));

  /* The room slider must be INERT in a lane made of chairs — both sides of a divided lane are
     chairs, and so is the pooled one. This is the regression guard for the 2026-08-22 correction:
     the first build charged the room figure to every assessment pool, which cost a 6+4 divided
     lane about a minute per patient it should never have been charged. */
  const chairLane = {mode:"split", A:6, R:4, cyc:76, assess:44, fastDischarge:false,
                     cc:CC.map(x=>x.i).join("."), start:15, len:8, bedExtra:0};
  const busyPts = LEVELS[2].pts;
  const roomHigh = evaluate(sane({...chairLane, turnRoom:30, turnChair:2}), busyPts).score;
  const roomZero = evaluate(sane({...chairLane, turnRoom:0,  turnChair:2}), busyPts).score;
  console.log("room slider inert in a chair lane:", roomHigh === roomZero
    ? "yes (" + roomHigh.toFixed(2) + " either way)"
    : "FAIL — 30-min rooms moved a chair lane " + roomZero.toFixed(2) + " -> " + roomHigh.toFixed(2));
  /* …unless the lane SAYS its assessment side is rooms. That is the one layout the rule above
     under-charges — "8 rooms + 10 chairs" — so it carries a flag rather than being mismodelled. */
  const asRooms = evaluate(sane({...chairLane, turnRoom:30, turnChair:2, roomsA:true}), busyPts).score;
  console.log("rooms flag re-arms the slider:", asRooms > roomHigh
    ? "yes (" + roomHigh.toFixed(2) + " as chairs -> " + asRooms.toFixed(2) + " as rooms)"
    : "FAIL — flag inert: " + asRooms.toFixed(2) + " vs " + roomHigh.toFixed(2));
  const preset = PRESETS.find(x=>x.id==="rooms");
  console.log("the 8+10 preset says rooms  :", preset && preset.set.roomsA === true
    ? "yes" : "FAIL — it would turn its rooms over at the chair figure");
  const chairBites = evaluate(sane({...chairLane, turnRoom:0, turnChair:0}), busyPts).score;
  console.log("chair turnover still bites  :", roomZero > chairBites
    ? "yes (" + chairBites.toFixed(2) + " -> " + roomZero.toFixed(2) + " at 2 min a chair)"
    : "FAIL — chair turnover is free");

  /* Measured 2026-08-22, bed-first, 19% bed-required, families on, turnover 10/1:
       8rm+2ch 10.70 -> 12.00 (+1.30) · 6rm+4ch 10.96 -> 11.72 (+0.77)
       4rm+6ch 11.21 -> 11.86 (+0.65) · 2rm+8ch 14.71 -> 15.69 (+0.98)
     The cost is largest on the ROOM-HEAVY layout, which is the mechanism behaving correctly: a
     room carries ten times a chair's turnover, so the more of the estate is rooms the more of it
     is spent being cleaned. That is a real argument against room-heavy footprints that the page
     could not previously make. */

  /* ── the no-test assessment time ──────────────────────────────────────────
     Split out 2026-08-22. Half the lane needs no test, and until now they were assigned a figure
     measured on patients who had an order. It is the largest unmeasured lever in the model. */
  const nt = an => sim({A:6, R:4, pooled:false, bedFirst:false, assessMin:44, assessNo:an,
      fastDischarge:true, turnA:1, turnB:1, lam:D.lam, asw:D.asw, now:D.now, res:D.res,
      days:2000, seeds:[11,12,13,14]});
  const early = nt(15), late = nt(80);
  console.log("no-test assessment is its own:", Math.abs(early.perArrival - late.perArrival) > 5
    ? "yes (15 min -> " + early.perArrival.toFixed(1) + ", 80 min -> " + late.perArrival.toFixed(1) + ")"
    : "FAIL — inert, the two halves are still sharing one number");
  /* ⚠ AND THE DIRECTION IS BACKWARDS FROM INTUITION, so it is pinned. Moving no-test patients out
     EARLIER is worse, not better: they fill the second area, and a patient who cannot move holds
     the assessment space as well. Measured by `stuck`, not inferred — 63.5% at 15 min against
     39.1% at 80. If this ever flips, the blocking path has been broken. */
  console.log("early moves BLOCK, not relieve:", early.stuck > late.stuck && early.perArrival > late.perArrival
    ? "yes (stuck " + early.stuck.toFixed(0) + "% -> " + late.stuck.toFixed(0) + "%)"
    : "FAIL — stuck " + early.stuck.toFixed(0) + "% vs " + late.stuck.toFixed(0) + "%");
  /* Per complaint since 2026-08-22. The chain is cc selection -> mix().fm -> the assessNo passed
     to sim(). sim's consumption of assessNo is guarded above ("no-test assessment is its own"),
     so what is left to pin is the FACTOR, which is where a wiring mistake would live.

     ⚠ The obvious test does not work and looked like it did: scoring an ear-only lane against a
     laceration-only lane gives 8.0 either way, because one complaint is a few percent of the
     evening and a 6-chair lane never queues at that volume. It would have passed with the factor
     disconnected. Assert the factor itself. */
  const ccNamed = n => CC.find(c=>c.n===n);
  const earM = ccNamed("Ear Problem"), lacM = ccNamed("Laceration");
  if(earM && lacM){
    const held = new Set(PICK);
    PICK = new Set([earM.i]); const fmEar = mix().fm;
    PICK = new Set([lacM.i]); const fmLac = mix().fm;
    PICK = held;
    /* ⚠ AND IT MUST REACH THE SCORE, NOT JUST THE ANIMATION. `mix().fm` is consumed ONLY by
       buildTrace (the stage); the scoring path has its own copy of the same expression inside
       evaluate. So this pinned the factor's DEFINITION and neither of its two consumers —
       deleting the factor from evaluate, or reading the wrong field there, both passed. The
       check's own comment claimed it pinned "where a wiring mistake would live". Score two
       single-complaint lanes and require the scored no-test hold to move with the complaint. */
    const effOne = m => evaluate({mode:"pooled", A:4, R:0, cyc:76, assess:44, assessNo:44,
        fastDischarge:false, cc:String(m.i), start:15, len:8}, LEVELS[1].pts).assessNoEff;
    const eEar = effOne(earM), eLac = effOne(lacM);
    console.log("the doctor factor reaches the score:",
      eLac > eEar * 1.3 && Math.abs(eEar - 44*earM.dd/D.g.dd) < 1e-9
      ? "yes (an ear-only lane scores a " + eEar.toFixed(1) + " min assessment, laceration "
        + eLac.toFixed(1) + ", from a 44 min dial)"
      : "FAIL — ear " + eEar.toFixed(2) + " vs laceration " + eLac.toFixed(2)
        + "; expected ear " + (44*earM.dd/D.g.dd).toFixed(2));
    console.log("quick complaints move sooner:", fmLac > fmEar * 1.3
      ? "yes (ear doctor-time " + Math.round(earM.dd) + " min, laceration " + Math.round(lacM.dd)
        + " — factor " + fmEar.toFixed(2) + " vs " + fmLac.toFixed(2) + ")"
      : "FAIL — the mix factor is flat: " + fmEar + " vs " + fmLac);
  } else console.log("quick complaints move sooner: FAIL — complaint not found");

  /* ⚠ NOT "the default is the measurement" — it was that for one day and the premise was wrong.
     A no-test patient can move as soon as the ASSESSMENT is done, which is inside the doctor's
     time and is recorded nowhere; the decision is the UPPER bound, not the moment. What the data
     supports is a band, and all the default has to do is sit in it. */
  const lo = D.g.rd, hi = D.g.rd + D.g.dd;
  console.log("default sits inside the band:", DEFAULT_ASSESS_NO > lo && DEFAULT_ASSESS_NO < hi
    ? "yes (" + DEFAULT_ASSESS_NO + " min, between " + Math.round(lo) + " and " + Math.round(hi) + ")"
    : "FAIL — default " + DEFAULT_ASSESS_NO + " outside " + Math.round(lo) + "-" + Math.round(hi));

  console.log("legacy row shares one figure:", sane({mode:"split", A:6, R:4, cyc:76, assess:60,
      fastDischarge:true, cc:"0.1"}).assessNo === 60
    ? "yes (assessNo falls back to assess)" : "FAIL");

  /* ── two streams, kept apart ──────────────────────────────────────────────
     Added 2026-08-22. The routing rule is the same exclusion list bed-first uses; the difference
     is only that neither side lends to the other. */
  const st_ = (share, mode) => sim({A:5, R:5, pooled:false,
      bedFirst: mode==="bedfirst", stream: mode==="stream",
      bedShare:share, bedGrp:false, assessMin:44, fastDischarge:false, turnA:0, turnB:0,
      lam:D.lam, asw:D.asw, now:D.now, res:D.res, days:1500, seeds:[11,12,13,14]});

  /* Two EXACT identities, and they have to be stated within the mode. Comparing a 0%-bed stream
     lane against a pooled chairs-only lane looked right and was not: 60.97 vs 60.59, because the
     two branches draw random numbers in a different order, so the gap is noise and no tolerance
     distinguishes it from a real leak. Within the mode it is exact — if nobody needs a bed, the
     BED COUNT CANNOT MATTER, and if everybody does, the chair count cannot. A patient crossing
     between streams breaks both. */
  const noBeds = st_(0, "stream"), noBedsWide = sim({A:40, R:5, pooled:false, stream:true,
      bedShare:0, bedGrp:false, assessMin:44, fastDischarge:false, turnA:0, turnB:0,
      lam:D.lam, asw:D.asw, now:D.now, res:D.res, days:1500, seeds:[11,12,13,14]});
  console.log("at 0% the beds are dead wood:", noBeds.perArrival === noBedsWide.perArrival
    ? "yes (5 beds or 40, identical: " + noBeds.perArrival.toFixed(2) + ")"
    : "FAIL — beds changed a lane nobody sends to them: "
      + noBeds.perArrival.toFixed(2) + " vs " + noBedsWide.perArrival.toFixed(2));
  const allBeds = st_(1, "stream"), allBedsWide = sim({A:5, R:40, pooled:false, stream:true,
      bedShare:1, bedGrp:false, assessMin:44, fastDischarge:false, turnA:0, turnB:0,
      lam:D.lam, asw:D.asw, now:D.now, res:D.res, days:1500, seeds:[11,12,13,14]});
  console.log("at 100% the chairs are too :", allBeds.perArrival === allBedsWide.perArrival
    ? "yes (5 chairs or 40, identical: " + allBeds.perArrival.toFixed(2) + ")"
    : "FAIL — chairs changed a lane nobody sends to them: "
      + allBeds.perArrival.toFixed(2) + " vs " + allBedsWide.perArrival.toFixed(2));

  /* And the point of building it: a partition cannot beat the pool it was cut from. */
  const sSplit = st_(0.24, "stream"), sPref = st_(0.24, "bedfirst");
  console.log("keeping them apart costs   :", sSplit.perArrival > sPref.perArrival
    ? "yes (stream " + sSplit.perArrival.toFixed(2) + " vs beds-first "
      + sPref.perArrival.toFixed(2) + " min/patient, same 5+5 estate)"
    : "FAIL — the partition is free or better: " + sSplit.perArrival.toFixed(2)
      + " vs " + sPref.perArrival.toFixed(2));

  /* ── the four defects the 2026-08-22 sweep found ──────────────────────────
     Each of these shipped. None of the 38 checks above caught any of them. */

  /* 1. LINK ROUND-TRIP, every mode, narrowed and not. hashState wrote optional fields and
        fromHash read a fixed layout, so a plain split lane came back as "Breathing Difficulty
        only" — 49.5 against a 50.0 bar. run() writes the hash on every recompute, so a refresh
        did it too. Round-trip is the only check that would have caught it. */
  let rtFail = "";
  for(const m of ["split","pooled","bedfirst","stream"]){
    for(const narrowed of [false, true]){
      /* ⚠ R=0 IS THE ONLY REACHABLE POOLED STATE, so that is what gets round-tripped. Entering
         pooled zeroes R (there is no second area to size), and a pooled lane carrying R=4 is a
         fixture the UI cannot produce. This asserted R survived pooled, which is why the clamp
         that quietly floored R at 1 — growing every pooled lane by a space on reload — sat here
         undetected: the fixture never presented the value that broke. */
      /* ⚠ NO FIXTURE VALUE MAY EQUAL ITS OWN DEFAULT. fromHash defaults to A=6 R=4 assess=44
         start=15 len=8, and this fixture used exactly those — so a dropped read returned the
         default, which WAS the expected value, and compared equal. That is how the `cyc` read
         stayed broken for a day; start, len and assess had the same hole behind them. Every
         value below now differs from the default AND from the clobber. */
      S.mode=m; S.A=7; S.R=(m==="pooled"?0:3); S.cyc=90; S.assess=70; S.assessNo=51; S.fastDischarge=true;
      S.start=9; S.len=13; S.level=2; S.bedExtra=7; S.bedIntp=true; S.bedGrp=false;
      S.turnRoom=13; S.turnChair=2; S.roomsA=(m==="split");
      PICK = narrowed ? new Set([0,1,2]) : new Set(CC.map(x=>x.i));
      BEDPICK = new Set([2,9]);
      const want = {mode:S.mode,A:S.A,R:S.R,cyc:S.cyc,assess:S.assess,assessNo:S.assessNo,
        fd:S.fastDischarge,start:S.start,len:S.len,level:S.level,bedExtra:S.bedExtra,
        bedIntp:S.bedIntp,bedGrp:S.bedGrp,turnRoom:S.turnRoom,turnChair:S.turnChair, loadPct:S.loadPct, docs:S.docs,
        roomsA:S.roomsA,pick:[...PICK].sort((a,b)=>a-b).join("."),bed:[...BEDPICK].sort((a,b)=>a-b).join(".")};
      location.hash = encodeURIComponent(hashState());
      /* ⚠ SCRAMBLE EVERY FIELD, NOT A CHOSEN FEW. This wiped only assessNo, the two turnover
         values and the two id sets — so a field fromHash() never READS simply kept the value the
         fixture had just set and compared equal. That is exactly how a dropped `cyc` read (a
         stray trailing comment swallowed the line) round-tripped "cleanly" for a day while every
         refresh silently discarded the turnover setting. A field that is not clobbered here
         cannot be tested here. */
      Object.assign(S, {mode:"pooled", A:1, R:0, cyc:55, assess:10, assessNo:0, fastDischarge:false,
        start:0, len:24, level:0, bedExtra:0, bedIntp:false, bedGrp:true,
        turnRoom:0, turnChair:0, roomsA:false});
      PICK=new Set(); BEDPICK=new Set();
      fromHash();
      const got = {mode:S.mode,A:S.A,R:S.R,cyc:S.cyc,assess:S.assess,assessNo:S.assessNo,
        fd:S.fastDischarge,start:S.start,len:S.len,level:S.level,bedExtra:S.bedExtra,
        bedIntp:S.bedIntp,bedGrp:S.bedGrp,turnRoom:S.turnRoom,turnChair:S.turnChair, loadPct:S.loadPct, docs:S.docs,
        roomsA:S.roomsA,pick:[...PICK].sort((a,b)=>a-b).join("."),bed:[...BEDPICK].sort((a,b)=>a-b).join(".")};
      for(const k of Object.keys(want))
        if(String(want[k]) !== String(got[k]) && !rtFail)
          rtFail = m + (narrowed?" narrowed":" full") + " " + k + ": " + want[k] + " -> " + got[k];
    }
  }
  console.log("links round-trip, all 4 modes:", rtFail ? "FAIL — " + rtFail : "yes (8 lanes)");
  location.hash = ""; PICK = new Set(CC.map(x=>x.i)); BEDPICK = new Set(BED_IDS);

  /* 2. ROOMS FIRST means rooms first for EVERYONE. A chair-eligible patient must take a bed while
        one is free — this read "only once every chair is full", inverting the mode. */
  const firstPlace = (() => {
    const tr = sim({A:6, R:4, pooled:false, bedFirst:true, bedShare:0, bedGrp:false, assessMin:44,
      fastDischarge:false, turnA:0, turnB:0, lam:D.lam, asw:D.asw, now:D.now, res:D.res,
      days:1, seeds:[11], trace:true}).trace;
    return (tr.find(e => e.ev==="assess" || e.ev==="second") || {}).ev;
  })();
  console.log("bed-first fills rooms first:", firstPlace === "assess"
    ? "yes (first patient of an empty lane takes a room)"
    : "FAIL — first placement was a " + firstPlace);

  /* 3. The share handed to the engine must NOT carry the sibling term, because the engine applies
        it structurally from the party size. Panel said 22.8% while the engine realised 27.2%. */
  const drawnNow = bedShareOf(PICK, new Set(BED_IDS), 0, true);
  const shownNow = bedShareDisplay(drawnNow, true);
  console.log("sibling share counted once :", shownNow > drawnNow
      && Math.abs(shownNow - (1-(1-D.grp.share)*(1-drawnNow))) < 1e-9
    ? "yes (engine " + (100*drawnNow).toFixed(1) + "%, realised "
      + (100*shownNow).toFixed(1) + "%)"
    : "FAIL — engine " + drawnNow + " shown " + shownNow);

  /* 4. A party is seated together. Force every party to four in a lane of three: nothing can ever
        fit, so nobody may be seen. Members arrive as separate events at one instant, and draining
        on the first one seated it alone — 17% of pairs were still being split. */
  const held = D.grp;
  D.grp = {p2:0, p3:0, p4:1, mean_group_size:4, share:1};
  /* ⚠ IN EVERY BRANCH THAT SEATS A PARTY. This ran `pooled:true` only, which drains through
     takeNext — but the splitting incident lived in the bed-first/stream path, whose own
     `if(++seated[gid] === gsz) drain(t)` is a different line of code. Reverting THAT one to the
     original bug (drain on the first member) passed this check untouched. Three branches, three
     fixtures. */
  const seatBranches = [["pooled", {A:3, R:0, pooled:true}],
                        ["bed-first", {A:3, R:0, bedFirst:true, bedShare:0.5}],
                        ["stream", {A:3, R:0, stream:true, bedShare:1}]];
  const split = [];
  for(const [nm, cfg] of seatBranches){
    const t = sim({...cfg, assessMin:44, fastDischarge:false, turnA:0, turnB:0, bedGrp:false,
      lam:D.lam, asw:D.asw, now:D.now, res:D.res, days:200, seeds:[11,12]});
    if(t.seen !== 0) split.push(nm + " seated " + t.seen.toFixed(1));
  }
  D.grp = held;
  console.log("a party is never split     :", split.length === 0
    ? "yes (parties of 4 never fit a lane of 3, in all three seating branches)"
    : "FAIL — " + split.join("; ") + " per evening in a lane no party fits");

  /* 5. Now that the controls actually render (REAL_IDS), exercise them — the sliders exist to be
        dragged, and an oninput that throws or fails to move state is invisible otherwise. */
  S.mode="bedfirst"; S.fastDischarge=true; run();
  const ctlFail = [];
  const drag = (id, v, read) => { const el = document.getElementById(id);
    if(!el){ ctlFail.push(id + " missing"); return }
    el.value = String(v); el.oninput && el.oninput({target:el});
    if(read() !== v) ctlFail.push(id + " -> " + read() + " (wanted " + v + ")"); };
  /* ⚠ EVERY SLIDER, NOT JUST THE NEW ONES. This listed only the three controls added on
     2026-08-22, so killing the assessment-time slider or the window sliders — the tool's ORIGINAL
     controls, and the ones its central argument turns on — passed unnoticed. A check named
     "today's controls" quietly meant "today's" in the calendar sense. */
  drag("trn", 22, () => S.turnRoom);
  drag("trc",  6, () => S.turnChair);
  drag("asn", 58, () => S.assessNo);
  drag("asx", 61, () => S.assess);
  drag("cyc", 88, () => S.cyc);
  drag("wstart", 11, () => S.start);
  drag("wlen", 9,  () => S.len);
  const tap = id => { const el = document.getElementById(id);
    if(!el){ ctlFail.push(id + " missing"); return } el.onclick && el.onclick(); };
  const intpWas = S.bedIntp, grpWas = S.bedGrp;
  tap("bedIntpBtn"); tap("bedGrpBtn");
  if(S.bedIntp === intpWas) ctlFail.push("bedIntpBtn inert");
  if(S.bedGrp  === grpWas)  ctlFail.push("bedGrpBtn inert");
  console.log("every control actually runs :", ctlFail.length ? "FAIL — " + ctlFail.join("; ")
    : "yes (7 sliders + 2 toggles)");
  S.turnRoom=10; S.turnChair=1; S.assessNo=44; S.bedIntp=true; S.bedGrp=true;

  /* 6. THE BOARD AND THE PAGE MUST AGREE ON A LANE. scoreOf ran 300x3 against run()'s 600x4, so
        the same lane read 29.50 on the hero card and 29.11 on the board — and the layouts under
        discussion sit within a minute of each other. */
  S.mode="pooled"; S.A=10; S.R=0; S.cyc=76; S.assess=44; S.assessNo=44; S.fastDischarge=false;
  S.start=15; S.len=8; S.level=2; S.turnRoom=10; S.turnChair=1; S.roomsA=false;
  PICK = new Set(CC.map(x=>x.i)); run();
  const heroScore = evaluate({mode:S.mode,A:S.A,R:S.R,cyc:S.cyc,assess:S.assess,assessNo:S.assessNo,
      fastDischarge:S.fastDischarge, cc:[...PICK].sort((a,b)=>a-b).join("."), start:S.start,
      len:S.len, bar:S.bar, turnRoom:S.turnRoom, turnChair:S.turnChair, loadPct:S.loadPct, docs:S.docs}, LEVELS[S.level].pts).score;
  const t0 = Date.now();
  const boardScore = scoreOf({mode:S.mode,A:S.A,R:S.R,cyc:S.cyc,assess:S.assess,assessNo:S.assessNo,
      fastDischarge:S.fastDischarge, cc:[...PICK].sort((a,b)=>a-b).join("."), start:S.start,
      len:S.len, turnRoom:S.turnRoom, turnChair:S.turnChair, loadPct:S.loadPct, docs:S.docs}, LEVELS[S.level].pts).score;
  const ms = Date.now() - t0;
  console.log("board scores what the page does:", Math.abs(heroScore - boardScore) < 1e-9
    ? "yes (" + heroScore.toFixed(2) + " both, " + ms + "ms a row)"
    : "FAIL — page " + heroScore.toFixed(2) + " vs board " + boardScore.toFixed(2));

  /* 7. A space being turned over is neither empty nor occupied on the stage. It used to go empty
        the moment the patient left, while the engine still counted it full — the page tells a
        physician that a space which looks full IS full. */
  S.mode="bedfirst"; S.A=3; S.R=2; S.turnRoom=30; S.turnChair=15; run(); buildTrace();
  const turnSeen = PLAY.trace.some(e => e.ev === "free")
    && (() => { for(let t=0;t<480;t+=5){ const st=stageState(t);
                  if(st.A.includes("turn") || st.B.includes("turn")) return true } return false })();
  console.log("the stage shows turnover    :", turnSeen
    ? "yes (a space reads as being turned over, not as free)"
    : "FAIL — no slot ever shows the turnover state");
  S.turnRoom=10; S.turnChair=1;

  /* 8. TWO STREAMS, TWO BOARDS. The reason they exist is that the sides can diverge, so the check
        is that they DO — and that they still reconcile to the lane, or the boards are decorative. */
  const sq = sim({A:2, R:8, pooled:false, stream:true, bedShare:0.5, bedGrp:false, assessMin:44,
    fastDischarge:false, turnA:0, turnB:0, lam:D.lam, asw:D.asw, now:D.now, res:D.res,
    days:1200, seeds:[11,12,13,14]});
  const bed = sq.streams[1], chair = sq.streams[0];
  console.log("the two streams can diverge :", bed.wait > chair.wait * 2
    ? "yes (2 beds carry " + bed.wait.toFixed(0) + " min each, 8 chairs " + chair.wait.toFixed(0) + ")"
    : "FAIL — a 2-bed/8-chair lane at a 50% split reads " + bed.wait.toFixed(1)
      + " vs " + chair.wait.toFixed(1) + "; the sides are not being separated");
  const nSum = bed.n + chair.n, divSum = bed.diverted + chair.diverted;
  console.log("the boards reconcile        :",
    Math.abs(nSum - sq.arrived) < 0.05 && Math.abs(divSum - sq.diverted) < 0.05
      ? "yes (arrivals and diversions add back to the lane)"
      : "FAIL — n " + nSum.toFixed(2) + " vs " + sq.arrived.toFixed(2)
        + ", diverted " + divSum.toFixed(2) + " vs " + sq.diverted.toFixed(2));
  /* and nobody may be sent to a side that has no spaces for them */
  console.log("a stream keeps its own share:", Math.abs(bed.share - 0.5) < 0.03
    ? "yes (" + (100*bed.share).toFixed(0) + "% routed to beds, as set)"
    : "FAIL — " + (100*bed.share).toFixed(1) + "% routed to beds against a 50% rule");

  /* 9. SORTING IS A VIEW, NOT A CHANGE. The list can be ordered by doctor-to-decision, and the
        one thing that must never happen is a complaint changing identity underneath it — the
        buttons carry ids, and a sort that renumbered them would silently re-point every tick. */
  S.mode="split"; PICK = new Set(CC.map(x=>x.i)); S.ccSort="vol"; run();
  const idsByVol  = [...document.getElementById("ccList").innerHTML.matchAll(/data-cc="(\d+)"/g)].map(m=>m[1]);
  const scoreVol  = evaluate({mode:S.mode,A:S.A,R:S.R,cyc:S.cyc,assess:S.assess,assessNo:S.assessNo,
      fastDischarge:S.fastDischarge, cc:[...PICK].sort((a,b)=>a-b).join("."),
      start:S.start, len:S.len, bar:S.bar}, LEVELS[S.level].pts).score;
  S.ccSort="fast"; run();
  const idsByFast = [...document.getElementById("ccList").innerHTML.matchAll(/data-cc="(\d+)"/g)].map(m=>m[1]);
  const scoreFast = evaluate({mode:S.mode,A:S.A,R:S.R,cyc:S.cyc,assess:S.assess,assessNo:S.assessNo,
      fastDischarge:S.fastDischarge, cc:[...PICK].sort((a,b)=>a-b).join("."),
      start:S.start, len:S.len, bar:S.bar}, LEVELS[S.level].pts).score;
  const sameSet = idsByVol.length === idsByFast.length
    && idsByVol.slice().sort().join() === idsByFast.slice().sort().join();
  console.log("sorting reorders, nothing else:",
    sameSet && idsByVol.join() !== idsByFast.join() && scoreVol === scoreFast
      ? "yes (same 26 complaints, different order, identical score)"
      : "FAIL — set " + sameSet + ", reordered " + (idsByVol.join() !== idsByFast.join())
        + ", score " + scoreVol.toFixed(2) + " vs " + scoreFast.toFixed(2));
  /* ⚠ THE ORDER MUST MATCH THE VISIBLE COLUMN. This once sorted on `ddall` while the row printed
     `dd`, so "fastest first" gave an order the column contradicted. It ranks on `dd` — 44-68% of
     `ddall` is time before the first RESULT lands, worst on the extremity complaints, so ranking
     on it puts the best chair candidates at the slow end. */
  /* measured rows only — the unmeasured ones now sort to the end by rule (see 10w), so the
     underlying dd sequence is ascending WITHIN the measured group, not across the whole list */
  const ddSeq = idsByFast.map(i => CC.find(x=>x.i===Number(i))).filter(x=>!x.me).map(x=>x.dd);
  /* the PRINTED numbers, not just the underlying field — that gap is what the bug was. The row
     now carries BOTH populations, so each order is checked against its OWN column, and each is
     checked NOT to be sorted by the other one (which is the defect this replaced). */
  const printed = () => {
    const h = document.getElementById("ccList").innerHTML;
    const noTest = [...h.matchAll(/doctor to decision · <span class="num">([^<]+)</g)].map(m=>m[1]);
    const every  = [...h.matchAll(/· <span class="num">(\d+)<\/span> min <span class="dim">across everyone/g)]
                     .map(m=>Number(m[1]));
    return {noTest: noTest.filter(v=>/^\d+$/.test(v)).map(Number), every};
  };
  const asc = a => a.every((v,k) => k===0 || a[k-1] <= v);
  const A1 = printed();
  /* ⚠ THE DEFAULT ORDER IS AN ORDER TOO. Three orders were asserted against their own columns and
     this one only against "differs from fast, same set" — so it went unnoticed that it did no
     sorting at all: it was the raw data.json sequence, which ranks ids 0-23 by share and then
     APPENDS the two aggregate rows, putting the single biggest bucket (24.2% of the lane) dead
     last in the view you choose to see where the volume is. */
  S.ccSort = "vol"; run();
  const volIds = [...document.getElementById("ccList").innerHTML.matchAll(/data-cc="(\d+)"/g)]
      .map(m => Number(m[1]));
  const volSh = volIds.map(i => CC.find(x => x.i === i).s);
  const biggest = CC.reduce((a, b) => b.s > a.s ? b : a);
  console.log("arrivals order descends     :",
    volSh.length === CC.length && volSh.every((v,k) => k===0 || volSh[k-1] >= v)
    && volIds[0] === biggest.i
      ? "yes (" + (100*volSh[0]).toFixed(1) + "% down to " + (100*volSh[volSh.length-1]).toFixed(1) + "%)"
      : "FAIL — biggest bucket at position " + (volIds.indexOf(biggest.i)+1) + " of " + volIds.length);
  S.ccSort = "fast"; run();

  console.log("no-test order reads ascending:",
    ddSeq.every((v,k) => k===0 || ddSeq[k-1] <= v + 1e-9) && A1.noTest.length > 10 && asc(A1.noTest)
      ? "yes (" + A1.noTest[0] + " to " + A1.noTest[A1.noTest.length-1] + " min printed)"
      : "FAIL — order and column disagree (" + A1.noTest.join(",") + ")");
  console.log("  ...and is NOT the other order:", !asc(A1.every)
      ? "yes (the all-patient column is unsorted here, as it must be)"
      : "FAIL — sorting by no-test also sorted the all-patient column; check which field is used");
  S.ccSort = "fastall"; run();
  const A2 = printed();
  console.log("all-patient order reads too  :", A2.every.length > 20 && asc(A2.every)
      ? "yes (" + A2.every[0] + " to " + A2.every[A2.every.length-1] + " min printed, every row)"
      : "FAIL — " + A2.every.join(","));
  console.log("  ...and is NOT the other one :", !asc(A2.noTest)
      ? "yes (the no-test column is unsorted here)"
      : "FAIL — the two orders are indistinguishable, so one of them is not doing what it says");
  S.ccSort = "fast"; run();
  /* the third ordering: fewest tests first. `w` is measured on EVERY arrival, unlike `dd`, so
     nothing sinks here — and a check that it does not, because sinking would hide exactly the
     test-heavy complaints this ordering exists to surface. */
  S.ccSort="test"; run();
  const idsByTest = [...document.getElementById("ccList").innerHTML.matchAll(/data-cc="(\d+)"/g)]
      .map(m=>Number(m[1]));
  const wSeq = idsByTest.map(i => CC.find(x=>x.i===i).w);
  const sortedAsc = wSeq.every((v,k) => k===0 || wSeq[k-1] <= v + 1e-9);
  const heaviest = CC.find(x=>x.i===idsByTest[idsByTest.length-1]);
  console.log("fewest tests first, no sinking:", sortedAsc && heaviest.w > 0.9
    ? "yes (" + (100*wSeq[0]).toFixed(0) + "% up to " + heaviest.n + " at "
      + (100*heaviest.w).toFixed(0) + "%)"
    : "FAIL — ascending " + sortedAsc + ", last is " + heaviest.n
      + " at " + (100*heaviest.w).toFixed(0) + "%");
  // ⚠ both sides numeric: idsByVol holds strings from the regex, so a bare .sort() is
  //   lexicographic ("10" before "2") and the comparison fails on ordering, not on content
  const sameAsVol = idsByTest.slice().sort((a,b)=>a-b).join()
                 === idsByVol.map(Number).sort((a,b)=>a-b).join();
  console.log("test order keeps the same set:", sameAsVol ? "yes" : "FAIL — the set changed");

  S.ccSort = "vol";

  /* ── the six the v2 sweep found ──────────────────────────────────────────
     None of the 52 checks above caught any of them, and four lived behind handlers the stub
     could not reach. */

  /* 10. THE STAGE MUST SHOW WHAT THE ENGINE IS HOLDING. A patient who moves produces two release
         events with one id; the stage resolved the pool by looking up where they are NOW, so the
         first release blanked the chair they were sitting in. On the shipped defaults the second
         area was drawn short for 362 of 480 minutes. This is the page's own printed promise. */
  S.mode="split"; S.A=6; S.R=4; S.fastDischarge=true; S.turnRoom=10; S.turnChair=1;
  PICK = new Set(CC.map(x=>x.i)); run(); buildTrace();
  let worstGap = 0, engA = 0, engB = 0;
  {
    const seen = new Map();
    for(const e of PLAY.trace){
      if(e.ev === "assess") engA++;
      else if(e.ev === "second"){ engB++; }
      else if(e.ev === "free"){ if(e.pool === "A") engA--; else engB--; }
      const st = stageState(e.t);
      // ⚠ a space being turned over IS still held by the engine — it has not decremented rb yet —
      //   so it counts as occupied here. Excluding it made the check fail on its own definition.
      const showB = st.B.filter(v => v !== null).length;
      const trueB = Math.max(0, engB);
      if(trueB - showB > worstGap) worstGap = trueB - showB;
    }
  }
  console.log("stage shows what is occupied:", worstGap === 0
    ? "yes (no minute draws the second area emptier than it is)"
    : "FAIL — the stage under-shows the second area by up to " + worstGap + " chairs");

  /* 11. THE ESTATE SURVIVES A MODE CHANGE. Clicking through the four layouts grew the lane
         6+4 -> 10 -> 10+4 -> 12+4, so the later ones scored better for having more spaces. */
  S.mode="split"; S.A=6; S.R=4; drawModes();
  const sizes = [];
  for(const want of ["pooled","bedfirst","stream","split"]){
    const btn = document.getElementById("modes").querySelectorAll("[data-m]").find(b=>b.dataset.m===want);
    if(!btn || !btn.onclick){ sizes.push("NO HANDLER"); continue }   // a vacuous pass is a failure
    btn.onclick();
    sizes.push(S.A + (modeOf().hasR ? S.R : 0));
  }
  /* 10q. A ROOM-REQUIRED PATIENT MUST NEVER GET A CHAIR. The engine sorts each arriving party so
          its room-required members are seated first — without it, a chair-eligible sibling could
          take the last room and push the room-required one into a chair, which is the exact rule
          the layout exists to model (measured at 1.16% of room-required placements when it was
          broken). Deleting the sort passed everything, and could not even be OBSERVED from
          outside until the trace started carrying the flag. */
  /* it is ~1% of room-required placements, so one day cannot reach it — sweep many */
  let roomReq = 0, chaired = 0;
  for(let sd = 1; sd <= 120; sd++){
    const t = sim({A:3, R:8, pooled:false, bedFirst:true, bedShare:0.5, bedGrp:false,
      assessMin:44, fastDischarge:false, turnA:0, turnB:0,
      lam:D.lam, asw:D.asw, now:D.now, res:D.res, days:1, seeds:[sd], trace:true}).trace || [];
    const need = new Set(t.filter(e => e.ev === "arrive" && e.bed).map(e => e.id));
    roomReq += need.size;
    chaired += t.filter(e => e.ev === "second" && need.has(e.id)).length;
  }
  console.log("room-required never gets a chair:", roomReq > 200 && chaired === 0
    ? "yes (" + roomReq + " room-required patients over 120 days, none seated in a chair)"
    : "FAIL — " + chaired + " of " + roomReq + " room-required patients took a chair");
  S.bedGrp=true; S.bedExtra=0; S.mode="split"; S.A=6; S.R=4; run();

  /* 10k. ⚠⚠ THE ROW THAT GETS SAVED MUST SCORE WHAT THE PAGE SHOWED. Every existing check
          hand-builds BOTH cfgs and compares evaluate() to scoreOf() — which calls evaluate().
          None of them calls addEntry(), so the real question, "does the save path write what the
          score used", was untested. It was also wrong: two scored fields were added to the engine
          and the link and not to addEntry, so sane() read them as absent, every saved row was
          scored on the previous engine, and on a busy day the board said a lane SAVED 20 min
          where the page said it LOST 3. The sign of the answer flipped, on the artefact
          physicians are sent. Drive the real save path and score what it stored. */
  SHARED = false; saveLocal([]);
  S.mode="pooled"; S.A=10; S.R=0; S.loadPct=100; S.docs=1; S.level=2;
  PICK = new Set(CC.map(x=>x.i)); BEDPICK = new Set(BED_IDS); run();
  const shown = LAST_SCORE;
  const whoEl = document.getElementById("who"); whoEl.value = "roundtrip";
  addEntry();
  const saved = board().find(r => r.who === "roundtrip");
  const savedScore = saved ? scoreOf(sane(saved.cfg), LEVELS[S.level].pts).score : null;
  console.log("a saved row scores what was shown:", saved && Math.abs(savedScore - shown) < 0.5
    ? "yes (" + shown.toFixed(2) + " on the page, " + savedScore.toFixed(2) + " on the board)"
    : "FAIL — page " + (shown==null?"?":shown.toFixed(2)) + " vs board "
      + (savedScore==null ? "NOT SAVED" : savedScore.toFixed(2))
      + "; stored cfg " + JSON.stringify(saved ? saved.cfg : null).slice(0,160));
  saveLocal([]);

  /* 10n. NOBODY IS LEFT IN THE LANE AT CLOSE, AND THE SCORE IS MONOTONE IN SPACES.
          `qr` — assessed patients with no second-area space — used to keep waiting past CLOSE
          with nothing to release them: a starved second area ran to 1,031 minutes, nine hours
          after the lane shut, and the score went NON-MONOTONE in the primary slider (at R=1,
          A=1->14 moved it 137 -> 286, because more spaces fed more patients into the same trap).
          The department's answer (operator, 2026-08-23) is that they are moved to the main
          department, so they are diverted and their space is freed. Two properties: the lane
          empties, and adding a space can no longer make the lane worse. */
  const tailEnd = [];
  for(const [A2, R2] of [[6,1],[10,1],[14,1],[8,2]]){
    S.mode="split"; S.A=A2; S.R=R2; run(); buildTrace();
    /* ⚠ THE INVARIANT IS "NOBODY IS STUCK", NOT "EVERYTHING ENDS BY A CLOCK TIME". A patient
       roomed just before close legitimately finishes their care afterwards — bounding the last
       event at close+4h failed on a perfectly correct 8+2 lane whose last patient departed at
       765. What must not happen is a patient left WAITING TO MOVE with nothing to release them,
       which is the trap the qr fix closed. */
    const stillIn = stageState(S.len*60 + 600);
    const stuckAfter = [...stillIn.stuck];
    if(stillIn.A.some(Boolean) || stillIn.B.some(Boolean) || stuckAfter.length)
      tailEnd.push(A2+"+"+R2+" still holding " + stillIn.A.filter(Boolean).length + "+"
        + stillIn.B.filter(Boolean).length + ", stuck " + stuckAfter.length);
  }
  console.log("the lane empties at close   :", tailEnd.length === 0
    ? "yes (4 starved layouts, no space held and nobody stuck 10h past close)"
    : "FAIL — " + tailEnd.join("; "));
  const mono = [];
  for(const R2 of [1, 2, 4]){
    let prev = Infinity, seq = [];
    for(const A2 of [2, 4, 6, 8, 11, 14]){
      const sc = evaluate({mode:"split", A:A2, R:R2, cyc:76, assess:44, assessNo:44,
        fastDischarge:false, cc:CC.map(x=>x.i).join("."), start:15, len:8}, LEVELS[1].pts).score;
      seq.push(sc);
      if(sc > prev + 1.5) mono.push("R=" + R2 + " got worse at A=" + A2 + " (" + seq.map(v=>v.toFixed(0)).join(">") + ")");
      prev = sc;
    }
  }
  console.log("more spaces never score worse:", mono.length === 0
    ? "yes (R=1, 2 and 4, across A=2..14)" : "FAIL — " + mono.join("; "));

  /* 10m. THE PROCESS FLOOR REACHES THE WAIT. triage -> being put in a space is a median 13 min
          here and the engine had no representation for it, which is most of why it predicted 8
          minutes to be roomed where the department measures 22. */
  /* ⚠ ISOLATE THE FLOOR. Comparing docs:1 against docs:0 changes three things at once — the
     queue, the hold rescale AND the floor — and they partly cancel. Vary only floorRoom. */
  const fBase = {A:11, R:0, pooled:true, assessMin:44, assessNo:44, fastDischarge:false,
    turnA:0, turnB:0, lam:D.lam, asw:D.asw, now:D.now, res:D.res, days:600, seeds:[11,12,13,14]};
  const fOff = sim({...fBase, floorRoom:0}).perArrival;
  const fOn  = sim({...fBase, floorRoom:D.floor_room}).perArrival;
  console.log("the rooming process is charged:",
    D.floor_room > 2 && Math.abs((fOn - fOff) - D.floor_room) < 0.5
    ? "yes (+" + (fOn - fOff).toFixed(1) + " min, the " + D.floor_room + " min floor, undelayed)"
    : "FAIL — floor " + D.floor_room + " but the wait moved " + (fOn - fOff).toFixed(2));

  /* 10o. THE PROVIDER QUEUE. Four properties: off is the old engine; it reproduces the queue the
          department measures; it is FIFO (roomed ahead of you means seen ahead of you, which is
          the evidence the whole mechanism rests on); and adding SPACES stops helping while adding
          PROVIDERS still does — the finding that changes what the page is for. */
  const evD = (A, docs, lvl) => evaluate({mode:"pooled", A, R:0, cyc:76, assess:44, assessNo:44,
      fastDischarge:false, cc:CC.map(x=>x.i).join("."), start:15, len:8, loadPct:0, docs},
      LEVELS[lvl].pts);
  const bareD = sim({A:11, R:0, pooled:true, assessMin:44, assessNo:44, fastDischarge:false,
    turnA:0, turnB:0, lam:D.lam, asw:D.asw, now:D.now, res:D.res, days:600, seeds:[11,12,13,14]});
  const offD = sim({A:11, R:0, pooled:true, assessMin:44, assessNo:44, fastDischarge:false,
    turnA:0, turnB:0, lam:D.lam, asw:D.asw, now:D.now, res:D.res, days:600, seeds:[11,12,13,14],
    docs:0, docMin:D.doc_min, postShare:D.postdoc_share});
  console.log("no provider == the old engine:", bareD.perArrival === offD.perArrival
    ? "yes (" + bareD.perArrival.toFixed(4) + ", bit-identical)"
    : "FAIL — " + bareD.perArrival.toFixed(4) + " vs " + offD.perArrival.toFixed(4));
  /* the queue must land near what the department measures, at the department's own lane */
  /* ⚠ AT THE LOAD IT WAS CALIBRATED ON. doc_min is a property of the PROVIDER, worked back from
     the pod's own arrival rate, so comparing the modelled queue at a lane that takes EVERY
     complaint (three times the pod's intake, one provider at 98% utilisation) tests nothing about
     calibration. Build a lane matching the pod's measured patients-per-hour and compare there. */
  const target = D.doc_lam * 9;                        // the pod's own intake over its span
  const byShare = CC.slice().sort((a, b) => b.s - a.s);
  /* ⚠ AT loadPct 100, THE SHARED SETTING. The 16.8 min was measured on a real provider who is
     shared with the department; comparing the model at loadPct 0 compares against a DEDICATED
     provider the department does not have, and under-reads by ~10 min. */
  const podLane = (docs, ids) => evaluate({mode:"pooled", A:11, R:0, cyc:76, assess:44,
      assessNo:44, fastDischarge:false, cc:ids.join("."), start:11, len:9, loadPct:100, docs},
      LEVELS[1].pts);
  let bestFit = null, podIds = null;
  for(let n = 2; n <= CC.length; n++){
    const ids = byShare.slice(0, n).map(x => x.i);
    const e = podLane(1, ids);
    const err = Math.abs(e.accepted - target);
    if(!bestFit || err < bestFit.err){ bestFit = {err, q:e.o.docWait, got:e.accepted}; podIds = ids }
  }
  console.log("the queue matches the measured:", Math.abs(bestFit.q - D.doc_queue_measured) < 8
    ? "yes (modelled " + bestFit.q.toFixed(1) + " min at " + bestFit.got.toFixed(1)
      + " patients/day, against a measured " + D.doc_queue_measured + " at " + target.toFixed(1) + ")"
    : "FAIL — modelled " + bestFit.q.toFixed(1) + " vs measured " + D.doc_queue_measured
      + " (at " + bestFit.got.toFixed(1) + " against " + target.toFixed(1) + " patients/day)");
  /* ⚠ THE QUEUE MUST NOT BE COUNTED TWICE. The drawn hold ALREADY contains the real
     roomed-to-doctor wait, so it is rescaled by the measured post-doctor share before the
     modelled queue is added back. Drop that rescale and every space is held ~20% too long —
     which inflates every number on the page and no other check would notice, because they all
     compare the engine against itself. The space hold must be about the same either way. */
  /* on the CALIBRATED lane — at three times the pod's intake one provider is genuinely
     overloaded and the hold genuinely should grow, which is a fact about staffing and not a
     double count */
  const hOff = podLane(0, podIds).o.holdMean, hOn = podLane(1, podIds).o.holdMean;
  console.log("the queue is not counted twice:", Math.abs(hOn - hOff) / hOff < 0.12
    ? "yes (a space is held " + hOn.toFixed(1) + " min with the queue, " + hOff.toFixed(1) + " without)"
    : "FAIL — " + hOn.toFixed(1) + " with the queue against " + hOff.toFixed(1) + " without");

  /* ⚠ THE POINT OF THE WHOLE THING: chairs stop buying time, providers do not. */
  const c8 = evD(8, 1, 1), c18 = evD(18, 1, 1), d2 = evD(11, 2, 1), d1 = evD(11, 1, 1);
  const chairsBuy = (c8.o.perArrival + c8.o.docWait) - (c18.o.perArrival + c18.o.docWait);
  const docsBuy   = (d1.o.perArrival + d1.o.docWait) - (d2.o.perArrival + d2.o.docWait);
  console.log("more chairs stop buying time :", chairsBuy < docsBuy
    ? "yes (8->18 chairs saves " + chairsBuy.toFixed(1) + " min; a 2nd provider saves "
      + docsBuy.toFixed(1) + ")"
    : "FAIL — chairs " + chairsBuy.toFixed(1) + " vs a provider " + docsBuy.toFixed(1));
  /* FIFO: the queue must GROW with load, or it is not a queue */
  const qQuiet = evD(11, 1, 0).o.docWait, qHeavy = evD(11, 1, 3).o.docWait;
  console.log("the queue grows with the load:", qHeavy > qQuiet * 1.3
    ? "yes (" + qQuiet.toFixed(1) + " min on a quiet day, " + qHeavy.toFixed(1) + " on a heavy one)"
    : "FAIL — quiet " + qQuiet.toFixed(2) + " heavy " + qHeavy.toFixed(2));

  /* 10p. THE LOAD STRETCH: OFF IS THE OLD ENGINE, AND IT IS THE DEPARTMENT'S LOAD, NOT THE LANE'S.
          Three properties, because the second is the design decision and the third is the trap.
          (a) At 0% the engine must be BIT-IDENTICAL to before the feature — anything else means
              the dial cannot be turned off and every saved lane silently re-ranks.
          (b) It must scale with the DAY, not with the lane's own occupancy. The measurement is
              unambiguous: put the lane's occupancy and the department's in one regression and only
              the department's survives (+2.76% t=2.47 against +1.53% t=0.98). Modelling it off the
              lane would invent a feedback — small lane fills, service slows, fills further — that
              exaggerates the penalty for small lanes, the direction that changes which layout
              wins. So: holding the lane size fixed and making the DAY busier must stretch it;
              holding the day fixed and SHRINKING the lane must not stretch it at all.
          (c) A quiet hour must run FASTER than the reference, not just slower-at-the-peak. */
  const evL = (A, pct, lvl) => evaluate({mode:"pooled", A, R:0, cyc:76, assess:44, assessNo:44,
      fastDischarge:false, cc:CC.map(x=>x.i).join("."), start:15, len:8, loadPct:pct},
      LEVELS[lvl].pts);
  const off8 = evL(8, 0, 1).o.perArrival, on8 = evL(8, 100, 1).o.perArrival;
  const offQ = evL(8, 0, 0).o.perArrival, offH = evL(8, 0, 3).o.perArrival;
  const onQ  = evL(8, 100, 0).o.perArrival, onH = evL(8, 100, 3).o.perArrival;
  /* (a) identity at zero, against a lane that never sees `load` at all */
  const bare = sim({A:8, R:0, pooled:true, assessMin:44, assessNo:44, fastDischarge:false,
    turnA:0, turnB:0, lam:D.lam, asw:D.asw, now:D.now, res:D.res, days:600, seeds:[11,12,13,14]});
  const bareOff = sim({A:8, R:0, pooled:true, assessMin:44, assessNo:44, fastDischarge:false,
    turnA:0, turnB:0, lam:D.lam, asw:D.asw, now:D.now, res:D.res, days:600, seeds:[11,12,13,14],
    load: D.lam.map(()=>1)});
  console.log("load stretch off == old engine:",
    bare.perArrival === bareOff.perArrival && on8 > off8
      ? "yes (a flat multiplier of 1 is bit-identical: " + bare.perArrival.toFixed(4) + ")"
      : "FAIL — flat-1 " + bareOff.perArrival.toFixed(4) + " vs no-load " + bare.perArrival.toFixed(4)
        + "; dial on/off " + on8.toFixed(2) + "/" + off8.toFixed(2));
  /* (b) it follows the DAY, and shrinking the lane must not move the multiplier */
  /* ⚠ READ THE ARRAY THE ENGINE USES, not the data it is derived from. Checking D.occ24 and
     D.load_beta directly tests the PIPELINE and is blind to what evaluate() does with them —
     dropping the day factor, or clamping the quiet end away, both passed that way. */
  const lQ = evL(8, 100, 0).load, lH = evL(8, 100, 3).load, lOff = evL(8, 0, 1).load;
  const dayEffect = Math.max(...lH) - Math.max(...lQ);
  console.log("the stretch follows the DAY   :", dayEffect > 0.05
    ? "yes (peak multiplier x" + Math.max(...lQ).toFixed(2) + " on a quiet day, x"
      + Math.max(...lH).toFixed(2) + " on a heavy one)"
    : "FAIL — quiet peak " + Math.max(...lQ).toFixed(3) + ", heavy peak " + Math.max(...lH).toFixed(3));
  const flatOff = lOff.every(v => v === 1);
  const sameCurve = JSON.stringify(evL(5, 100, 1).load) === JSON.stringify(evL(11, 100, 1).load);
  console.log("  ...and NOT the lane's own load:", flatOff && sameCurve
    ? "yes (5 and 11 spaces get the identical curve; the dial at 0 is flat)"
    : "FAIL — " + (flatOff ? "" : "dial-0 is not flat; ") + (sameCurve ? "" : "lane size moved the curve"));
  /* (c) quiet hours below 1, peak above — otherwise it is a flat penalty wearing a curve */
  /* over a 24-HOUR lane, because the 15:00-23:00 default only ever sees busy hours and its
     multiplier is above 1 all the way across — a fixture that cannot reach the quiet end cannot
     tell a curve from a flat penalty */
  const lT = evaluate({mode:"pooled", A:8, R:0, cyc:76, assess:44, assessNo:44,
      fastDischarge:false, cc:CC.map(x=>x.i).join("."), start:0, len:24, loadPct:100},
      LEVELS[1].pts).load;
  const mLo = Math.min(...lT), mHi = Math.max(...lT);
  /* ⚠ DILUTION ONLY. This used to assert the multiplier dips BELOW 1 at quiet hours — which said
     an EMPTY department makes this lane faster than its own baseline, and made the model claim
     that removing the crowding effect makes a quiet day WORSE by 3 minutes. Crowding can add
     delay; its absence is the floor, not a bonus. Every busier hour only ever adds. */
  /* ⚠ ASSERT THE ANCHOR, NOT JUST THE FLOOR. `max(1, ...)` pins the low end at 1.000 whether the
     multiplier is measured from the quietest hour or from the MEAN, so this check passed under
     both — and losing `occ_floor` from data.json moves every published score by 10 minutes with
     the whole harness green. Pin the peak to the value the anchor implies. */
  const expectHi = Math.min(2.2, Math.exp(D.load_beta * (Math.max(...D.occ24) - Math.min(...D.occ24))));
  console.log("the crowding anchor is the floor:", Math.abs(mHi - expectHi) < 0.02
    ? "yes (peak x" + mHi.toFixed(2) + ", the span from the quietest hour)"
    : "FAIL — peak x" + mHi.toFixed(3) + " but the quietest-hour anchor implies x"
      + expectHi.toFixed(3) + " (anchored at the mean instead?)");
  console.log("crowding only ever delays    :", mLo >= 1 && mLo < 1.02 && mHi > 1.1
    ? "yes (x" + mLo.toFixed(2) + " at the quietest hour, x" + mHi.toFixed(2) + " at the busiest)"
    : "FAIL — multiplier spans " + mLo.toFixed(3) + " to " + mHi.toFixed(3));

  /* 10r. THE STAGE MUST PLAY THE LANE THE CARDS SCORE. buildTrace re-lists every mode flag for
          sim(), and its own comment warns that "a mode added to sim() and not to this line plays a
          DIFFERENT lane on screen" — but only `bedFirst` and the turnover were checked. Setting
          `pooled:false`, `stream:false` or `bedShare:0` there all passed while the animation
          showed a layout nobody had chosen. Each mode leaves a distinct fingerprint in the trace,
          so assert the fingerprint rather than the flag. */
  const fingerprint = mode => {
    S.mode = mode; S.A = 4; S.R = 4; S.assess = 44; run(); buildTrace();
    const seenAssess = new Set(); let bare = 0, afterAssess = 0, stuck = 0;
    for(const e of PLAY.trace){
      if(e.ev === "assess") seenAssess.add(e.id);
      else if(e.ev === "second"){ seenAssess.has(e.id) ? afterAssess++ : bare++ }
      else if(e.ev === "stuck") stuck++;
    }
    return {bare, afterAssess, stuck, A: PLAY.A, R: PLAY.R};
  };
  const fp = {split: fingerprint("split"), pooled: fingerprint("pooled"),
              bedfirst: fingerprint("bedfirst"), stream: fingerprint("stream")};
  const fpBad = [];
  // split MOVES people: every second follows an assess, and there are some
  if(!(fp.split.afterAssess > 0 && fp.split.bare === 0)) fpBad.push("split " + JSON.stringify(fp.split));
  // pooled moves NOBODY: no second at all, and no second area
  /* ⚠ "no second events" is NOT enough to identify pooled: dropping the flag makes it a SPLIT
     lane with R=0, which also emits none. What separates them is that a split lane with nowhere
     to move strands its test patients, and a pooled lane strands nobody by construction. */
  if(!(fp.pooled.afterAssess === 0 && fp.pooled.bare === 0 && fp.pooled.R === 0
       && fp.pooled.stuck === 0))
    fpBad.push("pooled " + JSON.stringify(fp.pooled));
  // bed-first and stream seat chairs straight from the queue: seconds with no preceding assess
  for(const m of ["bedfirst", "stream"])
    if(!(fp[m].bare > 0 && fp[m].afterAssess === 0)) fpBad.push(m + " " + JSON.stringify(fp[m]));
  console.log("the stage plays the scored lane:", fpBad.length === 0
    ? "yes (all four layouts leave their own fingerprint in the trace)"
    : "FAIL — " + fpBad.join("; "));
  /* ⚠ AND IT MUST RESPOND TO THE NUMERIC PARAMETERS TOO. The fingerprint above identifies MODES,
     so a scored number missing from buildTrace slips straight past it — `load` and `floorRoom`
     did, and the animation was bit-identical at every setting of a dial worth ~5 score points:
     a lane the score has jamming, played as one emptying. */
  const traceAt = pct => { S.mode="bedfirst"; S.A=6; S.R=4; S.level=3; S.docs=1; S.loadPct=pct;
    run(); buildTrace();
    return PLAY.trace.filter(e => e.ev === "divert").length + "/" + PLAY.trace.length; };
  const trQuiet = traceAt(0), trBusy = traceAt(200);
  S.loadPct = 100; S.level = 1; S.mode="split"; S.A=6; S.R=4; run();
  console.log("the stage feels the dials    :", trQuiet !== trBusy
    ? "yes (diverts/events " + trQuiet + " at 0% against " + trBusy + " at 200%)"
    : "FAIL — the trace is identical at 0% and 200%: " + trQuiet);
  S.mode = "split"; S.A = 6; S.R = 4; run();

  /* 10s. THE STREAM BOARDS MUST BE LABELLED THE RIGHT WAY ROUND. `the two streams can diverge`
          reads sim()'s return directly and never the markup, so swapping streams[0]/streams[1] in
          the rendered table survives it — and the physician then reads "Rooms 11 min / Chairs 97"
          on a lane where it is exactly the reverse. That is the worst kind of wrong: confidently
          precise, and backwards. Parse what is on screen and match it to the engine. */
  S.mode="stream"; S.A=2; S.R=8; S.bedExtra=50; S.bedIntp=false; S.bedGrp=false; run();
  const so = evaluate({mode:S.mode, A:S.A, R:S.R, cyc:S.cyc, assess:S.assess, assessNo:S.assessNo,
      fastDischarge:S.fastDischarge, cc:[...PICK].sort((a,b)=>a-b).join("."),
      bedcc:[...BEDPICK].sort((a,b)=>a-b).join("."), bedExtra:S.bedExtra, bedIntp:S.bedIntp,
      bedGrp:S.bedGrp, turnRoom:S.turnRoom, turnChair:S.turnChair, loadPct:S.loadPct, docs:S.docs, roomsA:S.roomsA,
      start:S.start, len:S.len}, LEVELS[S.level].pts).o;
  const sHtml = document.getElementById("streamBoards").innerHTML;
  /* each block is a header naming the side, then its four figures; the SECOND figure is the wait */
  const rows = [...sHtml.matchAll(/<div class="strm-h">([^<]*)<[\s\S]*?<b class="num">[\d.]+<\/b><span>arrive here<\/span><\/div>\s*<div><b class="num">([\d.]+)<\/b>/g)]
      .map(m => ({side: m[1].trim(), wait: Number(m[2])}));
  const roomRow  = rows.find(r => /room/i.test(r.side));
  const chairRow = rows.find(r => /chair/i.test(r.side));
  const ok = so && roomRow && chairRow
    && Math.abs(roomRow.wait  - so.streams[1].wait) < 0.06
    && Math.abs(chairRow.wait - so.streams[0].wait) < 0.06;
  console.log("stream boards match their side:", ok
    ? "yes (rooms " + roomRow.wait + " = engine " + so.streams[1].wait.toFixed(1)
      + ", chairs " + chairRow.wait + " = " + so.streams[0].wait.toFixed(1) + ")"
    : "FAIL — printed " + JSON.stringify(rows) + " against engine rooms "
      + (so ? so.streams[1].wait.toFixed(1) : "?") + " / chairs " + (so ? so.streams[0].wait.toFixed(1) : "?"));
  S.mode="split"; S.A=6; S.R=4; S.bedExtra=0; run();

  /* 10t. THE BLANK-IS-ABSENT BRANCH, THE DYSURIA DECISION, AND THE CACHE KEY — three one-line
          properties that each protect something already got wrong once, and none of which any
          check touched. */
  console.log("lim() reads blank as absent :",
    [null, "", "  ", undefined].every(v => lim("start", v, 15) === 15) && lim("start", 0, 15) === 0
      ? "yes (null/blank/absent take the default; a real 0 survives)"
      : "FAIL — " + JSON.stringify([null,"","  ",undefined,0].map(v => lim("start", v, 15))));

  /* the operator removed urinary complaints from the must-have-a-room set on 2026-08-22: they do
     not usually need a sensitive exam. The old check tested the genital ROW'S NAME for the word
     "urinary", which it can never contain, so it was true for every possible state. */
  const dys = CC.find(x => x.n === "Dysuria");
  console.log("dysuria stays off the room list:", dys && BED_IDS.indexOf(dys.i) < 0
    ? "yes (a clinical decision, not a derivation)"
    : "FAIL — Dysuria is back in BED_IDS");

  /* the score cache is keyed on the day level; drop it and every board row keeps its
     first-computed score when the operator moves the busy-day selector */
  const cfgC = {mode:"split", A:6, R:4, cyc:76, assess:44, fastDischarge:true,
                cc:CC.map(x=>x.i).join("."), start:15, len:8};
  const sQuiet = scoreOf(cfgC, LEVELS[0].pts).score, sHeavy = scoreOf(cfgC, LEVELS[3].pts).score;
  console.log("the score cache keys on the day:", Math.abs(sQuiet - sHeavy) > 0.5
    ? "yes (" + sQuiet.toFixed(1) + " quiet vs " + sHeavy.toFixed(1) + " heavy)"
    : "FAIL — same score on a quiet and a heavy day: " + sQuiet.toFixed(2) + " / " + sHeavy.toFixed(2));

  /* 10u. ⚠⚠ THE PUBLISHED SCORE HAS TO BE PINNED AGAINST SOMETHING THAT IS NOT ITSELF.
          Every other check that touches the score compares one evaluate() call to another —
          `board scores what the page does` is evaluate vs scoreOf, and scoreOf CALLS evaluate;
          `loaded lane reproduces score` is evaluate vs evaluate. Both pin AGREEMENT, not VALUE, so
          a defect in the formula moves both sides and cancels. Measured: dropping the
          out-of-window term takes the headline 47.1 -> 25.7 and prints ZERO failures across 71
          checks. Inverting the in-window share takes it to 75.6. Against a 50.0 do-nothing bar,
          either inverts the recommendation the physicians are reading.
          This recomputes the three terms HERE, from the engine's own outputs and the bundled
          arrival/wait curves, and asserts they reconstruct the reported score. It is deliberately
          NOT a golden constant: the data cut moves the number every refresh, and a constant would
          either rot or be re-baselined without thought. What it pins is the FORMULA. */
  const gl = {mode:"split", A:6, R:4, cyc:76, assess:44, assessNo:44, fastDischarge:true,
              cc:CC.map(x=>x.i).join("."), start:15, len:8};
  const GE = evaluate(gl, LEVELS[1].pts);
  const GB = BARS[gl.bar] || BARS.today;
  const gWin = new Set(GE.hours);
  const facG = LEVELS[1].pts / D.day_mean;
  let outM = 0;
  for(let h = 0; h < 24; h++)
    outM += D.lam24[h] * facG * (gWin.has(h) ? (1 - GE.share) : 1) * GB.m24[h];
  const divM = (GE.o.divByHour || []).reduce((a, v, i) =>
    a + v * Math.max(0, GB.m24[GE.hours[i]] - D.floor), 0);
  const laneM = GE.o.idle ? 0 : GE.o.perArrival * GE.accepted;
  const rebuilt = (laneM + divM + outM) / GE.dayTotal;
  console.log("the score reconstructs      :", Math.abs(rebuilt - GE.score) < 1e-9
    ? "yes (" + GE.score.toFixed(2) + " = lane " + (laneM/GE.dayTotal).toFixed(1)
      + " + turned-away " + (divM/GE.dayTotal).toFixed(1)
      + " + outside " + (outM/GE.dayTotal).toFixed(1) + ")"
    : "FAIL — reported " + GE.score.toFixed(3) + ", terms rebuild to " + rebuilt.toFixed(3));
  /* and each term must actually CARRY weight — a formula can reconstruct perfectly with a term
     that is silently zero, which is exactly what dropping outMin looks like from inside. */
  const carries = laneM > 0 && outM > 0 && GE.score > 0;
  console.log("every term carries weight   :", carries
    ? "yes (lane " + laneM.toFixed(0) + ", outside " + outM.toFixed(0) + " patient-min)"
    : "FAIL — lane " + laneM.toFixed(0) + ", turned-away " + divM.toFixed(0) + ", outside " + outM.toFixed(0));

  /* 10v. AN OMITTED FIELD AND AN EXPLICIT null MUST SCORE THE SAME. The two backends disagree by
          construction — serve_board.py writes an explicit JSON null for any key the posting page
          omitted, Apps Script omits it — so every optional field has to treat the two identically
          or the SAME ROW scores differently depending on which board you are on. That was true of
          the numeric fields (fixed via lim()) and was still true of the two STRING fields, where
          String(null).split(".") is ["null"] -> [NaN] -> a criteria set matching no complaint, so
          the row scored 49.96, the do-nothing baseline, instead of 27.53. Covers both. */
  const OPTIONAL = ["cc","bedcc","cyc","assess","assessNo","bedExtra","bedIntp","bedGrp",
                    "turnRoom","turnChair","roomsA","start","len","fastDischarge"];
  const baseCfg = {mode:"bedfirst", A:6, R:4};
  const nulled = [];
  for(const f of OPTIONAL){
    const omitted = {...baseCfg};
    const explicit = {...baseCfg, [f]: null};
    const a = scoreOf(omitted, LEVELS[1].pts).score;
    const b = scoreOf(explicit, LEVELS[1].pts).score;
    if(Math.abs(a-b) > 1e-9) nulled.push(f+": omitted "+a.toFixed(2)+" vs null "+b.toFixed(2));
  }
  console.log("null scores as absent       :", nulled.length === 0
    ? "yes (" + OPTIONAL.length + " optional fields, both backends' conventions)"
    : "FAIL — " + nulled.join("; "));

  /* 10x. FUZZ THE LINK, DO NOT SPOT-CHECK IT. The malformed-link guard used five fixed strings
          and none touched field 7 (`level`), which is the ONE numeric field that does not go
          through lim() — so a fractional level clamped into range and stayed fractional,
          LEVELS[1.5] came back undefined, and the first run() threw before a single handler was
          wired. A half-drawn page with Add, Play and Copy link all dead. Mutating every field
          instead of five hand-picked ones is what finds that class. */
  const CANON = "split,6,4,76,44,0,1,15,8,,2.9.24,0,1,1,10,1,0,44".split(",");
  const POISON = ["", "x", "-3", "1.5", "0.5", "NaN", "Infinity", "1e9", "999999", "-0", "  ", "%%"];
  let fuzzBad = "", fuzzN = 0;
  for(let f = 0; f < CANON.length && !fuzzBad; f++){
    for(const bad of POISON){
      const parts = CANON.slice(); parts[f] = bad;
      location.hash = "#" + parts.join(",");
      try{
        fromHash(); drawPresets(); drawModes(); drawSpaces(); drawWindow(); run();
        fuzzN++;
        if(!Number.isInteger(S.level) || !LEVELS[S.level]) fuzzBad = "field "+f+"='"+bad+"' -> level "+S.level;
        else if(!Number.isInteger(S.A) || !Number.isInteger(S.R)) fuzzBad = "field "+f+"='"+bad+"' -> "+S.A+"/"+S.R;
        else if(!modeOf()) fuzzBad = "field "+f+"='"+bad+"' -> no mode";
      }catch(err){ fuzzBad = "field "+f+"='"+bad+"' THREW: " + err.message }
    }
  }
  console.log("every link field survives    :", !fuzzBad
    ? "yes (" + fuzzN + " mangled links, all clamp to a lane the page can draw)"
    : "FAIL — " + fuzzBad);

  /* 10w. AN UNMEASURED ROW IS NOT RANKED. Four complaints fall back to the lane figure and show a
          dash; sorting by that fallback placed three of the lab's five key complaints mid-table by
          a number nobody measured. They must sit at the end of the "fastest first" order. */
  S.mode="split"; S.A=6; S.R=4; PICK=new Set(CC.map(x=>x.i)); S.ccSort="fast"; run();
  const ids = [...document.getElementById("ccList").innerHTML.matchAll(/data-cc="(\d+)"/g)].map(m=>Number(m[1]));
  const meAt = ids.map((i,k)=>({me: !!CC.find(x=>x.i===i).me, k})).filter(x=>x.me).map(x=>x.k);
  const nMe = CC.filter(x=>x.me).length;
  console.log("unmeasured rows sort last   :", nMe > 0 && meAt.length === nMe
      && meAt.every(k => k >= ids.length - nMe)
    ? "yes (" + nMe + " fallback rows, all at the end of " + ids.length + ")"
    : "FAIL — " + nMe + " fallback rows at positions " + meAt.join(","));

  /* 10y. A PASTED LINK MUST LAND IN AN ALREADY-OPEN TAB. fromHash() ran once at startup and
          nothing listened after, so a colleague's lane pasted into an open tab changed the address
          bar and NOTHING else — the page kept showing the lane you already had. That is the worst
          failure available to a tool whose entire purpose is comparing lanes, and pasting into an
          open tab is how these get passed around. Both directions matter: a foreign hash must be
          taken up, and the page's OWN write (run() rewrites the address on every recompute) must
          be ignored, or the lane resets itself mid-edit. */
  /* The "own write" arm has to be able to FAIL, and re-reading our own hash is idempotent, so
     comparing before/after proves nothing. Park an edit in S that has NOT been written to the
     address yet — exactly the mid-drag state — then fire our own hash back at the page. Without
     the SELF_HASH guard that edit is clobbered by the stale address. */
  S.mode="split"; S.A=6; S.R=4; run();
  /* the stub's replaceState does not touch location.hash, so put the page's OWN write there by
     hand — otherwise the handler early-returns on an empty address and the arm proves nothing */
  location.hash = "#" + encodeURIComponent(hashState());
  S.A = 9;                                       // an edit in flight, address not yet rewritten
  fireEvent("hashchange");                       // the address still holds OUR OWN earlier write
  const selfHeld = S.mode==="split" && S.A===9;
  S.A = 6; run();
  location.hash = "#bedfirst,3,7,76,44,1,1,15,8,,2.9,0,1,1,10,1,1,44";   // a colleague's lane
  fireEvent("hashchange");
  const took = S.mode==="bedfirst" && S.A===3 && S.R===7;
  console.log("a pasted link lands         :", took && selfHeld
    ? "yes (foreign taken up, own write ignored)"
    : "FAIL — " + (took ? "" : "foreign link ignored: "+S.mode+" "+S.A+"/"+S.R+"; ")
                + (selfHeld ? "" : "own write reset the lane"));

  /* 10z. EVERY WIRED CONTROL MUST ACTUALLY BE WIRED. Seven handlers — the complaint row, its
          room chip, the three sort buttons, the presets, chairs/rooms, the discharge rule and the
          board's own load button — were reachable by NO check: replacing all seven `onclick`
          assignments with a dead property at once still printed 0 FAILs. The mode buttons had a
          guard, so the pattern existed; it just was not extended. This asserts the handler is a
          FUNCTION on every element the page renders with one, which is the part a rename or a
          refactor silently breaks. */
  S.mode="split"; S.A=6; S.R=4; run();
  drawModes(); drawSpaces(); drawSpeed(modeOf());   // the panels, not just the numbers
  saveLocal([{who:"wired", at: 77, cfg:{mode:"split",A:6,R:4,cyc:76,assess:44,fastDischarge:true}}]);
  SHARED=false; drawBoard();
  const wired = [["[data-cc]","ccList"], ["[data-bed]","ccList"], ["[data-sort]","ccSortSeg"],
                 ["[data-p]","presets"], ["[data-m]","modes"], ["[data-ra]","spaceCtl"],
                 ["[data-fd]","speedCtl"], ["[data-load]","boardBody"]];
  const dead = [], checked = [];
  for(const [sel, host] of wired){
    const h = document.getElementById(host);
    const els = h ? h.querySelectorAll(sel) : [];
    /* ⚠ NOT A PAGE FAULT. Buttons written straight into body.html (the sort segment) are invisible
       to this stub, which only sees markup the page assigns through innerHTML. Skipping them is a
       stub limit; the COUNT below is what stops the skip from turning into a vacuous pass. */
    if(!els.length) continue;
    checked.push(sel);
    const n = els.filter(b => typeof b.onclick !== "function").length;
    if(n) dead.push(sel + " — " + n + " of " + els.length + " dead");
  }
  console.log("every control is wired      :", dead.length === 0 && checked.length >= 6
    ? "yes (" + checked.length + " kinds, " + wired.length + " sought)"
    : "FAIL — " + (dead.join("; ") || "only " + checked.length + " kinds reachable: " + checked));

  /* 11a. THE WAITING COUNTER MUST COME BACK DOWN. `stageState` decremented `waiting` only on
          `assess`, but in bed-first and stream a chair-seated patient is emitted as `second`
          straight from the queue with no `assess` — so every one of them stayed in the waiting
          pool for the rest of the run. The stage drew a queue of people beside EMPTY CHAIRS, on
          the two layouts Blake is being asked to judge, while the hero card on the same screen
          read "still waiting when it closes: 0.0". Nothing checked the counter at all.
          The invariant is exact: waiting = arrived - diverted - everyone who has taken a space. */
  const waitBad = [];
  for(const md of ["split","pooled","bedfirst","stream"]){
    for(const fd of [false, true]){
      S.mode=md; S.A=4; S.R=6; S.fastDischarge=fd; run(); buildTrace();
      const seen = new Set();
      let arrived=0, diverted=0;
      let i = 0;
      for(let t=0; t<=S.len*60+120 && waitBad.length===0; t++){
        while(i < PLAY.trace.length && PLAY.trace[i].t <= t){
          const e = PLAY.trace[i++];
          if(e.ev==="arrive") arrived++;
          else if(e.ev==="divert") diverted++;
          else if(e.ev==="assess" || e.ev==="second") seen.add(e.id);
        }
        const want = arrived - diverted - seen.size;
        const got = stageState(t).waiting;
        if(got !== want) waitBad.push(md+(fd?" fd":"")+" t="+t+": shows "+got+", truly "+want);
      }
    }
  }
  console.log("the waiting pool empties    :", waitBad.length === 0
    ? "yes (4 layouts x fastDischarge, every minute to close+2h)"
    : "FAIL — " + waitBad.slice(0,3).join("; "));

  /* 11b. AND IT SURVIVES ONE THAT DOES NOT FIT. The check above starts at 10, which every layout
          can hold, so it passed while a bigger lane was being silently truncated: the shipped
          "8 rooms + 10 chairs" preset lost 4 spaces and 4 points of score on ONE click into
          pooled, irreversibly. Estates are swept up to the largest a divided lane can express. */
  const bigGaps = [];
  for(const [a0, r0] of [[8,10],[14,16],[12,12],[10,6]]){
    for(const want of ["pooled","bedfirst","stream","split"]){
      S.mode="split"; S.A=a0; S.R=r0; drawModes();
      const before = S.A + S.R;
      const btn = document.getElementById("modes").querySelectorAll("[data-m]").find(b=>b.dataset.m===want);
      if(!btn || !btn.onclick){ bigGaps.push(a0+"+"+r0+"->"+want+" NO HANDLER"); continue }
      btn.onclick();
      const after = S.A + (modeOf().hasR ? S.R : 0);
      if(after !== before) bigGaps.push(a0+"+"+r0+" -> "+want+" = "+after);
    }
  }
  console.log("a big estate survives too   :", bigGaps.length === 0
    ? "yes (8+10, 14+16, 12+12, 10+6 through every layout)"
    : "FAIL — " + bigGaps.join("; "));

  /* 11c. A LINK MUST NOT GROW THE LANE. run() rewrites the hash on every recompute, so a pooled
          lane put R=0 in the address bar without anyone sharing anything — and LIM.R floored at 1,
          so a reload clamped it UP. Click any divided layout after that and you were comparing 11
          spaces against everyone else's 10. Round-trips every layout at its own sizes. */
  const grew = [];
  for(const [md, a0, r0] of [["pooled",10,0],["pooled",30,0],["split",6,4],["bedfirst",4,6],["stream",5,5]]){
    S.mode=md; S.A=a0; S.R=r0;
    const est = S.A + (modeOf().hasR ? S.R : 0);
    location.hash = hashState();
    fromHash();
    const back = S.A + (modeOf().hasR ? S.R : 0);
    if(back !== est) grew.push(md+" "+a0+"+"+r0+": "+est+" -> "+back);
    for(const want of ["split","bedfirst","stream"]){          // and it must not grow on the way out
      const keep = {m:S.mode, a:S.A, r:S.R};
      const btn = document.getElementById("modes").querySelectorAll("[data-m]").find(b=>b.dataset.m===want);
      if(btn && btn.onclick){ btn.onclick();
        const t2 = S.A + (modeOf().hasR ? S.R : 0);
        if(t2 !== est) grew.push(md+" "+a0+"+"+r0+" -> "+want+": "+est+" -> "+t2);
      }
      S.mode=keep.m; S.A=keep.a; S.R=keep.r; drawModes();
    }
  }
  console.log("a link never grows the lane :", grew.length === 0
    ? "yes (5 lanes, reload then every layout)" : "FAIL — " + grew.join("; "));

  console.log("the estate survives a switch :", sizes.every(v => v === 10)
    ? "yes (10 spaces through all four layouts)"
    : "FAIL — clicking through gave " + sizes.join(", "));

  /* 12. AN EMPTY LIST IS NOT THE DEFAULT LIST. "" already meant "not narrowed", so clearing a
         list could not be shared, saved or survive a refresh — and pricing the rule by clearing
         it is one of the things the page is for. */
  S.mode="bedfirst"; S.A=6; S.R=4; BEDPICK = new Set(); PICK = new Set(CC.map(x=>x.i));
  location.hash = encodeURIComponent(hashState());
  BEDPICK = new Set(BED_IDS); fromHash();
  const emptyBedKept = BEDPICK.size === 0;
  PICK = new Set(); location.hash = encodeURIComponent(hashState());
  PICK = new Set(CC.map(x=>x.i)); fromHash();
  console.log("an empty list stays empty   :", emptyBedKept && PICK.size === 0
    ? "yes (both lists survive a link and a refresh)"
    : "FAIL — rooms kept " + emptyBedKept + ", criteria size " + PICK.size);
  PICK = new Set(CC.map(x=>x.i)); BEDPICK = new Set(BED_IDS); location.hash = "";

  /* 13. THE BANNER MUST NAME THE SIDE THE ENGINE JAMS. It sized the two streams from the drawn
         share, which excludes siblings by design, so with the sibling rule ON — the default — it
         named chairs on a lane whose rooms were the jam, contradicting the boards beneath it. */
  S.mode="stream"; S.A=2; S.R=8; S.bedGrp=true; run();
  const bannerSide = document.getElementById("load").innerHTML.indexOf("rooms") >= 0 ? "rooms" : "chairs";
  const strm = evaluate({mode:"stream",A:2,R:8,cyc:S.cyc,assess:S.assess,assessNo:S.assessNo,
      fastDischarge:false, cc:[...PICK].sort((a,b)=>a-b).join("."), bedcc:[...BED_IDS].join("."),
      bedIntp:true, bedGrp:true, start:15, len:8, bar:S.bar,
      turnRoom:10, turnChair:1}, LEVELS[2].pts).o;
  const jamSide = strm.streams[1].wait > strm.streams[0].wait ? "rooms" : "chairs";
  console.log("the banner names the jam    :", bannerSide === jamSide
    ? "yes (" + jamSide + ", matching the boards)"
    : "FAIL — banner says " + bannerSide + ", the boards say " + jamSide);
  S.mode="split"; S.A=6; S.R=4;


  /* ── the two dials a physician could not translate (2026-08-23) ────────────────────────
     Both used to print a bare percentage of an unstated baseline. These guard the FIX, and
     the first one guards the trap: the obvious implementation of "minutes a space is tied
     up" is hold_all x cyc/T_A, and that is WRONG by up to 13 min because the provider queue
     and the rooming floor live inside the hold and do not scale with the dial. */
  S.mode="pooled"; S.A=10; S.R=0; S.cyc=55; S.start=15; S.len=8; S.level=1; S.docs=1;
  PICK=new Set(CC.map(x=>x.i)); run();
  {
    /* ⚠ THE THRESHOLD IS A DISTINGUISHABILITY REQUIREMENT, NOT A MEASURED QUANTITY — and it
       was pinned at 5 and ROTTED on 2026-08-24, failing the harness and rolling back a data
       refresh. The real assertion is `shown === engine`; the gap only has to be big enough that
       swapping in the formula would visibly differ, or the mutation test passes for the wrong
       reason. It was 14 min, and today's occupancy corrections shrank it to 4 by making the
       model MORE accurate — a guard that fails because the thing it guards improved is a badly
       written guard. Kept low and loose on purpose. */
    const shown = paceText(), engine = Math.round(LAST_HOLD) + " min";
    const formula = Math.round(D.hold_all * S.cyc / D.T_A);
    const gap = Math.abs(Math.round(LAST_HOLD) - formula);
    console.log("the space-hold figure is measured, not computed:",
      shown === engine && gap >= 2
        ? "yes (" + shown + " from the run; the formula would say " + formula + " min, " + gap + " out)"
        : "FAIL — shown " + shown + ", engine " + engine + ", formula " + formula + " (gap " + gap + ")");
  }
  {
    /* ⚠ A SPACE CANNOT BE TIED UP BY SOMEONE WHO IS NOT IN IT YET. The slider reports the
       SPACE's clock — it starts when the patient sits down — so time spent in the waiting room
       must not appear in it. The hint text claimed it did, for a day, until the operator asked
       why. The engine was right and the words were wrong; this pins the engine so the words
       can be trusted against it. Swing the rooming wait hard: the wait for a space must follow
       it 1:1 and the hold must not move at all. */
    const L = Array.from({length:8}, (_,i) => D.lam24[(15+i)%24]);
    const go = fr => sim({A:14, R:0, pooled:true, assessMin:44, assessNo:44, fastDischarge:false,
      shr:D.shr, lam:L, asw:D.asw, now:D.now, res:D.res, docs:1, docMin:D.doc_min,
      postShare:D.postdoc_share, floorRoom:fr, days:300, seeds:[11,12]});
    const a = go(0), b = go(60);
    const holdSame = Math.abs(a.holdMean - b.holdMean) < 1e-9;
    const waitFollows = Math.abs((b.wa - a.wa) - 60) < 1e-6;
    console.log("waiting-room time is not charged to the chair:",
      holdSame && waitFollows
        ? "yes (rooming wait 0 -> 60 moves the wait for a space " + a.wa.toFixed(1) + " -> "
          + b.wa.toFixed(1) + " and leaves the hold at " + a.holdMean.toFixed(3) + ")"
        : "FAIL — hold " + a.holdMean.toFixed(3) + " -> " + b.holdMean.toFixed(3)
          + ", wait " + a.wa.toFixed(2) + " -> " + b.wa.toFixed(2) + " (expected +60)");
  }
  {
    const held = LAST_HOLD; LAST_HOLD = null;
    console.log("no space-hold figure before a run has produced one:",
      paceText() === "—" ? "yes (an em dash, not a stand-in number)"
                              : "FAIL — printed \"" + paceText() + "\" with nothing measured");
    LAST_HOLD = held;
  }
  {
    S.loadPct = 0;   const a = loadText();
    S.loadPct = 100; const b = loadText();
    S.loadPct = 150; const c = loadText();
    console.log("the crowding dial is named against today, not as a bare percent:",
      a === "none" && b === "as today" && /today/.test(c) && !/^\d+%$/.test(b)
        ? "yes (" + a + " / " + b + " / " + c + ")"
        : "FAIL — " + a + " / " + b + " / " + c);
  }
  {
    S.loadPct = 0;   const z = loadEffect();
    S.loadPct = 100; const m = loadEffect();
    S.loadPct = 200; const h = loadEffect();
    const num = t => { const x = t.match(/takes (\d+) of the provider/); return x ? +x[1] : -1 };
    console.log("the crowding dial states its cost in provider minutes, and it grows:",
      /adds nothing/.test(z) && num(m) > 0 && num(h) >= num(m) && !/minutes of wait|min of wait/.test(m)
        ? "yes (none at 0; " + num(m) + " provider-min at today's, " + num(h) + " at twice)"
        : "FAIL — z=\"" + z.slice(0,40) + "\" m=" + num(m) + " h=" + num(h));
    S.loadPct = 100;
  }
  {
    /* the dial keeps working where it works, and SAYS SO where it does not. Trimming the range
       to 150 was proposed on a miscount (peak taken over all 24 hours, day-scaling dropped) and
       rejected: on a typical day nothing caps even at 150. */
    const lv = S.level; S.level = 1; S.start = 15; S.len = 8;
    S.loadPct = 150; const typ150 = loadEffect();
    S.loadPct = 170; const typ170 = loadEffect();
    S.loadPct = 200; const typ200 = loadEffect();
    S.level = LEVELS.length - 1;
    S.loadPct = 150; const hvy150 = loadEffect();
    /* ⚠ the two branches must be told APART. Checking only for the word "ceiling" let a
       mutation that deletes the every-hour branch pass, because the partial branch says
       "ceiling" too. Assert the PARTIAL count and the TOTAL wording separately. */
    const partial = /(\d+) of your 8 open hours are already at the model's ceiling/.exec(typ170);
    console.log("the crowding dial owns up when its ceiling binds:",
      !/ceiling/.test(typ150) && partial && +partial[1] > 0 && +partial[1] < 8
        && /Every hour you are open is already at the model's ceiling/.test(typ200)
        && /ceiling/.test(hvy150)
        ? "yes (typical silent at 150, " + partial[1] + "/8 at 170, every hour at 200;"
          + " heavy day capped at 150)"
        : "FAIL — t150 " + /ceiling/.test(typ150) + " t170 \"" + typ170.slice(-46)
          + "\" t200every " + /Every hour/.test(typ200) + " heavy150 " + /ceiling/.test(hvy150));
    S.level = lv; S.loadPct = 100;
  }
  S.mode="split"; S.A=6; S.R=4; S.cyc=Math.round(D.T_A);


  /* ── the provider ceiling (2026-08-23) ────────────────────────────────────────────────── */
  {
    const mk = (mode,A,R,cap) => sim({A,R,pooled:mode==="pooled",bedFirst:mode==="bedfirst",
      stream:mode==="stream",bedGrp:false,bedShare:0.5,assessMin:44,assessNo:44,
      fastDischarge:false,shr:D.shr,lam:Array.from({length:12},(_,i)=>D.lam24[(14+i)%24]),
      asw:D.asw,now:D.now,res:D.res,docs:1,docMin:D.doc_min,postShare:D.postdoc_share,
      floorRoom:D.floor_room,days:250,seeds:[11,12],capPerDoc:cap});
    /* INERT AT 0. Every knob in this engine has to leave it bit-identical when unset —
       otherwise it is not a new option, it is a silent change to everyone's saved lanes. */
    let same = true;
    for(const m of ["split","pooled","bedfirst","stream"]){
      const a = mk(m,10,4,0), b = mk(m,10,4,0);
      if(a.perArrival !== b.perArrival) same = false;
    }
    const off = mk("split",10,4,0), huge = mk("split",10,4,999);
    console.log("the provider ceiling is inert when unset:",
      same && off.perArrival === huge.perArrival
        ? "yes (0 and a ceiling far above the lane give the identical run)"
        : "FAIL — off " + off.perArrival.toFixed(3) + " vs unreachable-ceiling " + huge.perArrival.toFixed(3));

    /* IT BINDS — and on ALL FOUR layouts. The engine has two separate admission paths
       (takeOne for split/pooled, takeParty for bed-first/stream) and a knob wired into one of
       them is the recurring bug in this file: the page then says one thing and scores another
       for half the layouts. */
    const unbound = [];
    for(const m of ["split","pooled","bedfirst","stream"]){
      const capped = mk(m,10,4,3);
      if(capped.peakLoad > 3.01) unbound.push(m + " load " + capped.peakLoad.toFixed(1));
    }
    console.log("the ceiling binds on every layout, not just one admission path:",
      unbound.length === 0
        ? "yes (cap 3 holds the patient load <= 3 in split, pooled, bed-first and stream)"
        : "FAIL — not enforced: " + unbound.join(", "));
    /* ⚠ AND `peak` IS A DIFFERENT QUANTITY — spaces in use, which during a split's move counts
       one patient in two places while the assessment space turns over. It may legitimately sit
       ABOVE the ceiling, and only in a layout that moves people. Pinned, because the obvious
       "fix" is to cap `peak` instead, and that would silently shrink every split lane. */
    const sp = mk("split",10,4,3), po = mk("pooled",10,4,3);
    /* ⚠ AND THE CEILING MUST BE REACHED, not merely respected. Capping spaces-in-use instead of
       patients also keeps the load under the ceiling — by admitting FEWER patients than the
       ceiling allows, which is a quieter wrong answer than exceeding it. In a layout that moves
       people the two differ, so assert the split lane actually fills its allowance. */
    console.log("the ceiling is used up, not under-spent:",
      sp.peakLoad >= 2.95
        ? "yes (cap 3, split carries " + sp.peakLoad.toFixed(2) + ")"
        : "FAIL — cap 3 but split only reaches " + sp.peakLoad.toFixed(2)
          + " (is it capping spaces rather than patients?)");
    console.log("spaces-in-use and patient load are kept distinct:",
      sp.peak > sp.peakLoad && Math.abs(po.peak - po.peakLoad) < 0.01
        ? "yes (split spaces " + sp.peak.toFixed(1) + " vs load " + sp.peakLoad.toFixed(1)
          + "; pooled, which never moves anyone, identical at " + po.peak.toFixed(1) + ")"
        : "FAIL — split " + sp.peak.toFixed(1) + "/" + sp.peakLoad.toFixed(1)
          + " pooled " + po.peak.toFixed(1) + "/" + po.peakLoad.toFixed(1));

    /* AND IT COSTS WHAT IT SHOULD. Lowering the ceiling must lengthen the wait — patients are
       held outside instead of taken on. A cap that lowered load AND wait would mean the engine
       was discarding patients rather than queueing them. */
    const loose = mk("pooled",14,0,0), tight = mk("pooled",14,0,4);
    console.log("a lower ceiling trades wait for load, it does not conjure both:",
      tight.peak < loose.peak && tight.perArrival > loose.perArrival
        ? "yes (peak " + loose.peak.toFixed(1) + "->" + tight.peak.toFixed(1)
          + ", wait " + loose.perArrival.toFixed(1) + "->" + tight.perArrival.toFixed(1) + ")"
        : "FAIL — peak " + loose.peak.toFixed(1) + "->" + tight.peak.toFixed(1)
          + ", wait " + loose.perArrival.toFixed(1) + "->" + tight.perArrival.toFixed(1));
  }
  {
    /* it is a SCORED field, so the link must carry it — the failure mode is a shared lane that
       scores differently for the person who receives it */
    const keep = S.capPerDoc;
    S.capPerDoc = 7; const h = hashState();
    S.capPerDoc = 0; location.hash = "#" + h; fromHash();
    console.log("the ceiling survives a shared link:",
      S.capPerDoc === 7 ? "yes (7 out, 7 back)" : "FAIL — 7 out, " + S.capPerDoc + " back");
    S.capPerDoc = keep; location.hash = "";
  }

  {
    /* the CONTROL, not just the engine — drive it the way a physician does and read what the
       page shows. A knob whose engine works and whose label lies is still a broken knob. */
    S.mode="pooled"; S.A=14; S.R=0; S.start=14; S.len=10; S.docs=1;
    PICK=new Set(CC.map(x=>x.i));
    S.capPerDoc=0; run(); const off = $("cpdOut").textContent, offEff = $("cpdEff").textContent;
    S.capPerDoc=6; run(); const on  = $("cpdOut").textContent, onEff  = $("cpdEff").textContent;
    S.docs=2;      run(); const two = $("cpdOut").textContent;
    console.log("the ceiling control reads in patients and reports what the lane carries:",
      off === "no limit" && /no ceiling is set/i.test(offEff)
        && on === "6 patients" && /at the ceiling/i.test(onEff)
        && /12 in all/.test(two)
        ? "yes (off \"" + off + "\"; at 6 \"" + on + "\"; two providers \"" + two + "\")"
        : "FAIL — off \"" + off + "\" / \"" + offEff.slice(0,50) + "\", on \"" + on
          + "\" / \"" + onEff.slice(0,60) + "\", two \"" + two + "\"");
    S.capPerDoc=0; S.docs=1; S.mode="split"; S.A=6; S.R=4; S.start=15; S.len=8;
  }


  /* ── the optimiser (2026-08-23) ───────────────────────────────────────────────────────── */
  {
    S.mode="split"; S.A=6; S.R=4; S.start=15; S.len=8; S.level=1; S.docs=1; S.capPerDoc=0;
    S.assess=44; S.assessNo=44; S.loadPct=100; S.turnRoom=10; S.turnChair=1;
    S.fastDischarge=false; PICK=new Set(CC.map(x=>x.i)); BEDPICK=new Set(BED_IDS); run();
    const MINE = {mode:S.mode, A:S.A, R:S.R, start:S.start, len:S.len, level:S.level,
                  docs:S.docs, capPerDoc:S.capPerDoc, assess:S.assess, assessNo:S.assessNo,
                  loadPct:S.loadPct, turnRoom:S.turnRoom, turnChair:S.turnChair,
                  fastDischarge:S.fastDischarge, score:LAST_SCORE,
                  total:S.A + (modeOf().hasR ? S.R : 0)};
    await optimise();

    /* IT MUST NEVER HAND BACK A WORSE LANE. The search runs coarse (150 days x 2 seeds) for
       speed, so its own numbers are approximate — the guarantee is that both the old lane and
       the found one are re-scored EXACTLY before anything is applied, and the operator's lane
       wins ties. Without that, a coarse fluke could quietly make someone's lane worse. */
    console.log("the optimiser never returns a worse lane than yours:",
      LAST_SCORE <= MINE.score + 1e-9
        ? "yes (" + MINE.score.toFixed(2) + " -> " + LAST_SCORE.toFixed(2) + ")"
        : "FAIL — yours " + MINE.score.toFixed(2) + ", it applied " + LAST_SCORE.toFixed(2));

    /* IT MUST NOT TOUCH WHAT YOU CHOSE. The whole premise is "given my hours and timing, fix
       the layout" — an optimiser that quietly lengthened the day or added a provider would be
       answering a different question and would look like a much better result. */
    const moved = ["start","len","level","docs","capPerDoc","assess","assessNo","loadPct",
                   "turnRoom","turnChair","fastDischarge"].filter(k => S[k] !== MINE[k]);
    console.log("the optimiser leaves your hours and timing alone:",
      moved.length === 0 ? "yes (11 settings, none moved)"
                         : "FAIL — it changed: " + moved.join(", "));

    /* AND IT MUST NOT AWARD ITSELF MORE ESTATE. Spaces are the cheapest way to improve any
       score, so a search free to add them would always "win" by asking for a bigger department. */
    const nowTotal = S.A + (modeOf().hasR ? S.R : 0);
    console.log("the optimiser keeps the estate you gave it:",
      nowTotal === MINE.total ? "yes (" + MINE.total + " spaces in, " + nowTotal + " out)"
        : "FAIL — " + MINE.total + " spaces in, " + nowTotal + " out");

    /* ⚠ THE CONTROLS MUST SHOW THE LANE THE PAGE IS SCORING. run() does not redraw the layout
       buttons or the space sliders — by design, so a drag is not interrupted — so every path
       that moves the lane in code has to redraw them itself. The optimiser did not, and the
       result was a page scoring pooled 10 while the buttons still read split 6+4: it had
       applied, and looked exactly as though it had not. Read the CONTROLS, not the state. */
    {
      /* read the rendered MARKUP, not the state — a guard that reads S can never see the
         controls disagreeing with it, which is the entire failure being guarded against */
      const modes = $("modes").innerHTML, spaces = $("spaceCtl").innerHTML;
      const pressed = [...modes.matchAll(/data-m="([a-z]+)" aria-pressed="true"/g)].map(x=>x[1]);
      const val = k => { const m = spaces.match(new RegExp('id="s'+k+'"[^>]*value="(\\d+)"')); 
                         return m ? +m[1] : null };
      const a = val("A"), r = val("R");
      const okMode = pressed.length === 1 && pressed[0] === S.mode;
      const okA = a === null || a === S.A;
      const okR = !modeOf().hasR || r === null || r === S.R;
      console.log("the controls show the lane the optimiser applied:",
        okMode && okA && okR
          ? "yes (buttons and sliders read " + S.mode + " " + S.A +
            (modeOf().hasR ? "+" + S.R : "") + ", same as the score)"
          : "FAIL — page scores " + S.mode + " " + S.A + "+" + S.R +
            " but controls read " + (pressed.join(",") || "no mode") + " " + a + "+" + r);
    }

    /* PUT IT BACK has to be exact, or the operator cannot undo a search they did not want. */
    const changed = OPT.result != null;
    if(changed){
      const p = OPT.prev;
      S.mode=p.mode; S.A=p.A; S.R=p.R; PICK=new Set(p.pick); BEDPICK=new Set(p.bed); run();
      console.log("put it back restores the lane exactly:",
        S.mode===MINE.mode && S.A===MINE.A && S.R===MINE.R
          && Math.abs(LAST_SCORE-MINE.score) < 1e-9
          ? "yes (" + MINE.mode + " " + MINE.A + "+" + MINE.R + " at " + MINE.score.toFixed(2) + ")"
          : "FAIL — back to " + S.mode + " " + S.A + "+" + S.R + " at " + LAST_SCORE.toFixed(2));
    } else {
      console.log("put it back restores the lane exactly:",
        "yes (nothing was changed, so there is nothing to undo)");
    }
    S.mode="split"; S.A=6; S.R=4; PICK=new Set(CC.map(x=>x.i)); BEDPICK=new Set(BED_IDS);
  }
  {
    /* ⚠ AND TEST THE GUARANTEE DIRECTLY, NOT BY HOPING. The end-to-end check above passes even
       with the exact re-check deleted, because the coarse winner usually IS better — so it
       cannot see the one failure it exists to prevent. Hand finishOpt a deliberately WORSE
       "winner" and require it to refuse. */
    S.mode="split"; S.A=6; S.R=4; S.start=15; S.len=8; S.level=1; S.docs=1;
    PICK=new Set(CC.map(x=>x.i)); BEDPICK=new Set(BED_IDS); run();
    const mineScore = LAST_SCORE, mineLane = S.mode + " " + S.A + "+" + S.R;
    OPT.prev = {mode:S.mode, A:S.A, R:S.R, pick:new Set(PICK), bed:new Set(BEDPICK),
                score:mineScore};
    OPT.result = {mode:"stream", A:1, R:9, pick:new Set(PICK), bed:new Set(BEDPICK), score:-99};
    OPT.noGain = null;
    finishOpt();
    const kept = S.mode + " " + S.A + "+" + S.R;
    console.log("a worse 'winner' is refused, not applied:",
      kept === mineLane && OPT.result === null && OPT.noGain != null
        ? "yes (kept " + kept + " at " + mineScore.toFixed(2)
          + "; the losing candidate claimed -99 and was re-scored)"
        : "FAIL — lane now " + kept + ", result " + (OPT.result ? "applied" : "null")
          + ", noGain " + OPT.noGain);
    OPT.result = null; OPT.prev = null; OPT.noGain = null;
    S.mode="split"; S.A=6; S.R=4; run();
  }


  /* ── the complaint and room chips (2026-08-24) ────────────────────────────────────────────
     Same failure class as the layout buttons: the page can score one lane while the chips show
     another. Twenty-six chips make a single wrong one nearly impossible to spot by eye, which
     is exactly the case a test should carry rather than a person. Reads the rendered MARKUP —
     a check that reads PICK can never see the chips disagreeing with PICK. */
  {
    const chipsOf = () => {
      const out = {cc:new Set(), bed:new Set(), ccTotal:0, bedTotal:0};
      for(const b of ($("ccList").innerHTML.match(/<button[^>]*>/g) || [])){
        const on = /aria-pressed="true"/.test(b);          // attribute order is not assumed
        const c = /data-cc="(\d+)"/.exec(b), d = /data-bed="(\d+)"/.exec(b);
        if(c){ out.ccTotal++; if(on) out.cc.add(+c[1]) }
        if(d){ out.bedTotal++; if(on) out.bed.add(+d[1]) }
      }
      return out;
    };
    const eq = (a,b) => a.size === b.size && [...a].every(x => b.has(x));
    const nm = i => (CC.find(c=>c.i===i) || {}).n;

    /* a NARROWED lane in a layout that has rooms — both sets must be exact */
    S.mode="bedfirst"; S.A=6; S.R=4; S.start=15; S.len=8; S.level=1;
    PICK = new Set(CC.map(x=>x.i).filter(i => i % 3 !== 0));
    BEDPICK = new Set(BED_IDS);
    drawModes(); drawSpaces(); run();
    const R = chipsOf();
    const ccOk = eq(PICK, R.cc), bedOk = eq(BEDPICK, R.bed);
    console.log("the complaint and room chips show what the page is scoring:",
      ccOk && bedOk
        ? "yes (" + R.cc.size + "/" + R.ccTotal + " complaints and " + R.bed.size
          + " room marks, each the exact set the engine holds)"
        : "FAIL — complaints " + (ccOk ? "ok" : "lit " + [...R.cc].length + " vs engine " + PICK.size
            + ", wrong: " + [...PICK].filter(i=>!R.cc.has(i)).map(nm).join("/"))
          + "; rooms " + (bedOk ? "ok" : "lit " + [...R.bed].map(nm).join("/")
            + " vs engine " + [...BEDPICK].map(nm).join("/")));

    /* ⚠ AND A LAYOUT WITHOUT ROOMS MUST HIDE THE ROOM TOGGLES, NOT SHOW THEM CLEARED. The
       engine keeps BEDPICK while pooled ignores it, so rendering the toggles unlit would tell
       an operator their room list had been wiped when it had not — a lie of the same shape as
       the one this section exists for, pointing the other way. */
    S.mode="pooled"; S.A=10; S.R=0; drawModes(); drawSpaces(); run();
    const P = chipsOf();
    console.log("a layout with no rooms hides the room marks rather than clearing them:",
      P.bedTotal === 0 && BEDPICK.size > 0 && eq(PICK, P.cc)
        ? "yes (no room toggles drawn; the engine still holds " + BEDPICK.size
          + ", and the complaint chips are still exact)"
        : "FAIL — " + P.bedTotal + " room toggles drawn in pooled (" 
          + P.bed.size + " lit), engine holds " + BEDPICK.size
          + "; complaints " + (eq(PICK,P.cc) ? "ok" : "WRONG"));

    S.mode="split"; S.A=6; S.R=4; PICK = new Set(CC.map(x=>x.i)); BEDPICK = new Set(BED_IDS);
    drawModes(); drawSpaces(); run();
  }


  /* ── patients carry a complaint (2026-08-24) ──────────────────────────────────────────── */
  {
    const ALLCC = CC.map(x=>x.i).sort((a,b)=>a-b).join(".");
    const base = {cyc:76, assess:10, assessNo:10, fastDischarge:false, cc:ALLCC, start:11,
      len:9, bedExtra:0, bedIntp:false, bedGrp:false, turnRoom:10, turnChair:1, roomsA:false,
      loadPct:100, docs:2, capPerDoc:8};
    /* ⚠ TEST IT WHERE ROOMS BIND. This ran on 8+10, which carries ~9 of 18 spaces — half the
       estate idle, so freeing room capacity buys nothing and the effect being asserted is at its
       SMALLEST there. It measured 0.06 min, drifted to 0.013 when the occupancy data was
       corrected, and failed the harness. Sorting is a space-allocation rule; assert it on a lane
       that is actually short of space, where it is worth 1-3.6 min and every seed set agrees. */
    const go = (set, perCc) => evaluate({...base, mode:"stream", A:3, R:4, perCc, capPerDoc:0,
      bedcc: set.size ? [...set].sort((a,b)=>a-b).join(".") : "-"}, LEVELS[1].pts);
    const take = (arr, target) => { const s = new Set(); let g = 0;
      for(const c of arr){ if(g >= target) break; s.add(c.i); g += c.s } return s };
    const slow = take([...CC].sort((a,b)=>b.dd-a.dd), 0.16);
    const fast = take([...CC].sort((a,b)=>a.dd-b.dd), 0.16);

    /* ⚠ THE OLD ENGINE IS NOT BLIND TO THESE LISTS, AND ASSERTING THAT IT WAS is why this
       check broke. The two lists differ slightly in VOLUME (19.3% vs 21.3%), and volume is
       exactly what the old engine DID respond to — on a space-bound lane that is worth 0.67 min
       on its own. What perCc adds is sensitivity to COMPOSITION. So compare the two gaps rather
       than demanding the old one be zero: turning the table on must make composition matter
       several times more than volume alone did. (Bit-identical inertness is verified separately,
       against the previous commit across 32 configs — it cannot be checked from inside one
       build.) */
    const offA = go(slow, false).score, offB = go(fast, false).score;
    const offGap = Math.abs(offA - offB);

    /* ⚠ AND ON, IT MUST BE ABLE TO TELL THEM APART — this is the whole feature. Before it,
       `bedShare` was a single scalar and room-need was an independent coin flip, so the patients
       sent to rooms were a random sample and no slower than anyone else. Any routing rule was
       provably useless, which was mistaken for a finding about the department. */
    const onSlow = go(slow, true).score, onFast = go(fast, true).score;
    const onGap = onFast - onSlow;
    console.log("the complaint table adds composition sensitivity, not just volume:",
      onGap > 2 * offGap && onGap > 0.30
        ? "yes (composition worth " + onGap.toFixed(2) + " min against " + offGap.toFixed(2)
          + " from volume alone)"
        : "FAIL — on-gap " + onGap.toFixed(3) + " vs off-gap " + offGap.toFixed(3));
    console.log("with it on, sending the SLOW complaints to rooms beats the fast ones:",
      onSlow < onFast - 0.30
        ? "yes (slow " + onSlow.toFixed(3) + " vs fast " + onFast.toFixed(3)
          + "; off they were " + offA.toFixed(3) + " / " + offB.toFixed(3) + ")"
        : "FAIL — slow " + onSlow.toFixed(3) + " vs fast " + onFast.toFixed(3)
          + " (a room's turnover should amortise over a longer stay)");

    /* the mean must not run away. Multipliers are that complaint's duration over the weighted
       mean already in the curve, so they average 1; the ~1% the aggregate DOES move is the
       pooled model's own bias, corr(test rate, assessment duration) = -0.646, and is expected. */
    const a = go(new Set(), false).o, b = go(new Set(), true).o;
    const drift = Math.abs(b.holdMean - a.holdMean) / a.holdMean;
    console.log("turning it on does not move the aggregate more than the bias it fixes:",
      drift < 0.05
        ? "yes (hold " + a.holdMean.toFixed(1) + " -> " + b.holdMean.toFixed(1)
          + ", " + (100*drift).toFixed(1) + "%)"
        : "FAIL — hold moved " + (100*drift).toFixed(1) + "%, far past the ~1% correlation bias");
  }

  location.hash = ""; S.mode="split"; S.A=6; S.R=4; S.start=15; S.len=8; saveLocal([]);

  /* ⚠ read the stage HERE. This used a `const A` captured 700 lines earlier at one arbitrary
     minute, so it printed ">" whenever that minute had no full slot (indexOf -1 => slice(-1)),
     and it broke outright when that capture moved. Find a minute that HAS one. */
  S.mode="split"; S.A=6; S.R=4; S.start=15; S.len=8; S.level=1;
  PICK=new Set(CC.map(x=>x.i)); run(); buildTrace();   // a known lane, not whatever ran last
  let sample = "";
  for(let t=0; t<=S.len*60 && !sample; t++){
    PLAY.t=t; drawStage();
    const a = document.getElementById("stageA").innerHTML;
    const i = a.indexOf('<span class="slot full');
    if(i >= 0) sample = a.slice(i, i+230).replace(/\s+/g," ");
  }
  console.log("\nsample markup:", sample || "(no full slot in the whole run — check drawStage)");
  }catch(err){
    _log("FAIL — harness ABORTED after \"" + LAST + "\": " + err.message);
    _log(err.stack ? err.stack.split("\n").slice(0,3).join("\n") : "");
  }finally{
    _log("--- " + CHECKS + " checks ran ---");
    if(CHECKS < EXPECTED_CHECKS)
      _log("FAIL — only " + CHECKS + " of " + EXPECTED_CHECKS + " checks ran; the rest never executed");
  }
},60);
