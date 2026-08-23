/* captured before anything mutates S — the legacy-link tests below deliberately overwrite
   assessNo with the pre-split fallback, so reading it at the end measures the wrong thing */
const DEFAULT_ASSESS_NO = S.assessNo;
setTimeout(()=>{
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
  PLAY.t=300; drawStage();
  const host=document.getElementById("stageA");
  const before=host.children.map(c=>c);
  const keys=before.map(c=>c.dataset.k).join(",");
  PLAY.t=300.4; drawStage();   // a fraction of a minute later — same occupants
  const after=host.children.map(c=>c);
  const same=before.filter((c,i)=>c===after[i]).length;
  console.log("occupants unchanged             :", keys===after.map(c=>c.dataset.k).join(",") ? "yes" : "no");
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
    const btn = document.getElementById("boardBody").querySelectorAll("[data-load]")
                  .find(b => b.dataset.load === "42");
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
                         start:S.start, len:S.len, bar:S.bar}, LEVELS[S.level].pts).score;
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
  const cfgB = {cyc:76, assess:44, fastDischarge:false, start:15, len:8, bar:"today"};
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
      start:S.start, len:S.len, bar:S.bar}, LEVELS[S.level].pts).score;
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
  console.log("interpreter adds to the list :", yesI > noI && yesI < 1
    ? "yes (" + (100*noI).toFixed(0) + "% -> " + (100*yesI).toFixed(0) + "%)"
    : "FAIL — off=" + noI + " on=" + yesI);

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
  console.log("urinary stayed out of it     :", gen && !/urinary|dysuria|hematuria/i.test(gen.n)
    && CC.some(x => x.n === "Dysuria") ? "yes (Dysuria is still its own row)" : "FAIL");

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
  console.log("zero turnover == old engine:", sim({...tb, turnA:0, turnB:0}).perArrival === noTurn.perArrival
    ? "yes (deterministic)" : "FAIL");

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
      S.mode=m; S.A=6; S.R=(m==="pooled"?0:4); S.cyc=76; S.assess=44; S.assessNo=51; S.fastDischarge=true;
      S.start=15; S.len=8; S.level=2; S.bedExtra=7; S.bedIntp=true; S.bedGrp=false;
      S.turnRoom=13; S.turnChair=2; S.roomsA=(m==="split");
      PICK = narrowed ? new Set([0,1,2]) : new Set(CC.map(x=>x.i));
      BEDPICK = new Set([2,9]);
      const want = {mode:S.mode,A:S.A,R:S.R,cyc:S.cyc,assess:S.assess,assessNo:S.assessNo,
        fd:S.fastDischarge,start:S.start,len:S.len,level:S.level,bedExtra:S.bedExtra,
        bedIntp:S.bedIntp,bedGrp:S.bedGrp,turnRoom:S.turnRoom,turnChair:S.turnChair,
        roomsA:S.roomsA,pick:[...PICK].sort((a,b)=>a-b).join("."),bed:[...BEDPICK].sort((a,b)=>a-b).join(".")};
      location.hash = encodeURIComponent(hashState());
      S.assessNo=0; S.turnRoom=0; S.turnChair=0; PICK=new Set(); BEDPICK=new Set();
      fromHash();
      const got = {mode:S.mode,A:S.A,R:S.R,cyc:S.cyc,assess:S.assess,assessNo:S.assessNo,
        fd:S.fastDischarge,start:S.start,len:S.len,level:S.level,bedExtra:S.bedExtra,
        bedIntp:S.bedIntp,bedGrp:S.bedGrp,turnRoom:S.turnRoom,turnChair:S.turnChair,
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
  const tooBig = sim({A:3, R:0, pooled:true, assessMin:44, fastDischarge:false, turnA:0, turnB:0,
    lam:D.lam, asw:D.asw, now:D.now, res:D.res, days:200, seeds:[11,12]});
  D.grp = held;
  console.log("a party is never split     :", tooBig.seen === 0
    ? "yes (parties of 4 never fit a lane of 3, and none is seen)"
    : "FAIL — " + tooBig.seen.toFixed(1) + " seen per evening in a lane no party fits");

  /* 5. Now that the controls actually render (REAL_IDS), exercise them — the sliders exist to be
        dragged, and an oninput that throws or fails to move state is invisible otherwise. */
  S.mode="bedfirst"; S.fastDischarge=true; run();
  const ctlFail = [];
  const drag = (id, v, read) => { const el = document.getElementById(id);
    if(!el){ ctlFail.push(id + " missing"); return }
    el.value = String(v); el.oninput && el.oninput({target:el});
    if(read() !== v) ctlFail.push(id + " -> " + read() + " (wanted " + v + ")"); };
  drag("trn", 22, () => S.turnRoom);
  drag("trc",  6, () => S.turnChair);
  drag("asn", 58, () => S.assessNo);
  const tap = id => { const el = document.getElementById(id);
    if(!el){ ctlFail.push(id + " missing"); return } el.onclick && el.onclick(); };
  const intpWas = S.bedIntp, grpWas = S.bedGrp;
  tap("bedIntpBtn"); tap("bedGrpBtn");
  if(S.bedIntp === intpWas) ctlFail.push("bedIntpBtn inert");
  if(S.bedGrp  === grpWas)  ctlFail.push("bedGrpBtn inert");
  console.log("today's controls actually run:", ctlFail.length ? "FAIL — " + ctlFail.join("; ")
    : "yes (turnover x2, no-test assessment, interpreter, sibling)");
  S.turnRoom=10; S.turnChair=1; S.assessNo=44; S.bedIntp=true; S.bedGrp=true;

  /* 6. THE BOARD AND THE PAGE MUST AGREE ON A LANE. scoreOf ran 300x3 against run()'s 600x4, so
        the same lane read 29.50 on the hero card and 29.11 on the board — and the layouts under
        discussion sit within a minute of each other. */
  S.mode="pooled"; S.A=10; S.R=0; S.cyc=76; S.assess=44; S.assessNo=44; S.fastDischarge=false;
  S.start=15; S.len=8; S.level=2; S.turnRoom=10; S.turnChair=1; S.roomsA=false;
  PICK = new Set(CC.map(x=>x.i)); run();
  const heroScore = evaluate({mode:S.mode,A:S.A,R:S.R,cyc:S.cyc,assess:S.assess,assessNo:S.assessNo,
      fastDischarge:S.fastDischarge, cc:[...PICK].sort((a,b)=>a-b).join("."), start:S.start,
      len:S.len, bar:S.bar, turnRoom:S.turnRoom, turnChair:S.turnChair}, LEVELS[S.level].pts).score;
  const t0 = Date.now();
  const boardScore = scoreOf({mode:S.mode,A:S.A,R:S.R,cyc:S.cyc,assess:S.assess,assessNo:S.assessNo,
      fastDischarge:S.fastDischarge, cc:[...PICK].sort((a,b)=>a-b).join("."), start:S.start,
      len:S.len, turnRoom:S.turnRoom, turnChair:S.turnChair}, LEVELS[S.level].pts).score;
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
  const ddSeq = idsByFast.map(i => CC.find(x=>x.i===Number(i)).dd);
  // the PRINTED numbers, not just the underlying field — that gap is what the bug was.
  const shown = [...document.getElementById("ccList").innerHTML
      .matchAll(/doctor to decision, no test <span class="num">([^<]+)</g)]
      .map(m => m[1]).filter(v => /^\d+$/.test(v)).map(Number);
  console.log("fast order matches the column:",
    ddSeq.every((v,k) => k===0 || ddSeq[k-1] <= v + 1e-9)
    && shown.length > 10 && shown.every((v,k) => k===0 || shown[k-1] <= v)
      ? "yes (" + shown[0] + " to " + shown[shown.length-1] + " min printed, no-test)"
      : "FAIL — order and column disagree (" + shown.join(",") + ")");
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
},60);
