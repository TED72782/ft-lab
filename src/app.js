<script>
const D = __DATA__;

/* ── engine: a port of tandem()/pooled() from the deck builder ───────────── */
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const pick=(r,p)=>p[(r()*p.length)|0];
const expo=(r,rate)=>-Math.log(1-r())/rate;
function cmp(x,y){return x[0]-y[0]||x[1]-y[1]||x[2]-y[2]}
function Heap(){this.a=[]}
Heap.prototype.push=function(v){const a=this.a;a.push(v);let i=a.length-1;while(i>0){const p=(i-1)>>1;if(cmp(a[i],a[p])<0){const t=a[i];a[i]=a[p];a[p]=t;i=p}else break}};
Heap.prototype.pop=function(){const a=this.a,top=a[0],last=a.pop();if(a.length){a[0]=last;let i=0;for(;;){const l=2*i+1,rr=l+1;let m=i;
  if(l<a.length&&cmp(a[l],a[m])<0)m=l; if(rr<a.length&&cmp(a[rr],a[m])<0)m=rr; if(m===i)break; const t=a[i];a[i]=a[m];a[m]=t;i=m}}return top};

/* ── the lane, simulated ──────────────────────────────────────────────────────
   Two shapes, and only two:

     POOLED   one group of spaces; a patient takes one on arrival and keeps it until they leave.
     MOVING   A assessment spaces + R in a second area. Everyone leaves the assessment space at
              `assessMin` — the point a physician calls the assessment done — and spends the rest
              of their measured visit in the second area, whether that is waiting on a result or
              waiting to be discharged. The second area is hard-capped: a patient with nowhere to
              go keeps the assessment space, which is the failure a split is meant to avoid and
              the reason the second area's size matters.

   `fastDischarge=false` is the exception the data forces us to offer. A patient who needs no test
   has no order to time from, and may simply not be movable; then they hold the assessment space
   for their whole visit — D.g.now measured, LONGER than the D.g.asw - D.pom measured to a test patient's
   first order (72 with the assumed 25 after it).

   People waiting to be seen queue in the main waiting room, not in either area, so a queue can
   never occupy the space a finishing patient needs to vacate one. The lane closes at CLOSE and
   anyone still WAITING TO BE SEEN (`qa`) goes to the main department.

   ⚠ THAT IS NOT TRUE OF `qr`, AND THE DIFFERENCE IS VISIBLE IN THE SCORE. `qr` holds patients who
   have been assessed and are waiting for a second-area space. They keep waiting past CLOSE, and
   with a starved second area the wait is unbounded: on split 14+1 over an 8-hour lane, 20 patients
   are still blocked and the recorded evening runs to 1,031 minutes — nine hours after the lane
   shut. It also makes the score NON-MONOTONE in the primary slider, because more assessment
   spaces feed more patients into the same bottleneck: at R=1, going A=1 -> 14 moves the score
   137.6 -> 285.8, so adding a space appears to cost up to +38.6 min.
   Benign at R>=4 (the R=4 row is flat at 46-50 across every A), so this is confined to layouts
   with a starved second area — which the sliders do reach, since R floors at 1.
   NOT CHANGED, deliberately: whether a mid-care patient is diverted at closing or finishes where
   they are is a modelling decision about the real department, not a coding one, and either choice
   moves every published comparison between the layouts. It needs an operator's answer first. */
function sim(cfg){
  let qSum = 0, qN = 0, hSum = 0, hN = 0;   // provider-queue and space-hold accumulators
  const {A, R, lam, asw, now, res, load, docs = 0, docMin = 18, postShare, floorRoom = 0, pooled, bedFirst, bedShare=0, assessMin, fastDischarge,
         bedGrp=false, stream=false, turnA=0, turnB=0, assessNo,  // assessNo: the no-test half
         shr=D.shr, floor=D.floor, days=600, seeds=[11,12,13,14], trace} = cfg;
  // `trace` records one evening, patient by patient, so the animation plays the SAME run the
  // numbers come from rather than a decorative loop of its own. Slots are tracked only here —
  // the maths never needs to know which chair, only how many are free.
  const T = trace ? [] : null;
  const freeA = [], freeB = [];
  if(T){ for(let i=A-1;i>=0;i--) freeA.push(i); for(let i=R-1;i>=0;i--) freeB.push(i) }
  const H = lam.length, CLOSE = H*60;
  let wa=0, waN=0, wr=0, wrN=0, blocked=0, nw=0, seen=0, arrN=0, divN=0, divWait=0, peakSum=0;
  /* ⚠ TWO STREAMS NEED TWO SETS OF NUMBERS. In `stream` the pools never lend to each other, so a
     single average hides the whole point — a jammed chair side and an idle bed side average to
     something that describes neither. Accumulated for every bed-shaped layout, reported only
     where the split is real. Keyed on bedReq, which IS the routing decision. */
  const BY = [{n:0, wait:0, seen:0, div:0, peak:0},    // 0 = chair side
              {n:0, wait:0, seen:0, div:0, peak:0}];   // 1 = bed side
  const hs=new Float64Array(H), hn=new Float64Array(H), divH=new Float64Array(H);

  for(const sd of seeds){
    const r = mulberry32(sd);
    for(let d=0; d<days; d++){
      /* ── FAMILIES ARRIVE TOGETHER ──────────────────────────────────────────────────────
         Measured in the vault (pipelines/analyze_family_groups.py, the only analysis that needs
         patient_name): 5.6% of ESI 4/5 evening arrivals come with a sibling — 358 pairs, 45
         triples and under 11 larger groups over 592 evenings. Reshuffling the arrival times among
         the same surnames puts the coincidence rate at 0.05%, so essentially all of that is real.

         ⚠ The RATE is divided by the mean group size, so the same number of CHILDREN arrive as
         before — this changes how they are bunched, not how many there are. Without that the lane
         would quietly get 3% more volume and every layout would look worse.

         ⚠ Matching on the arrival MINUTE would have found a quarter of this: registration cannot
         stamp two patients in the same minute, so a family walking in together is recorded minutes
         apart (1.08% at 0 min against 4.20% at 5). They are modelled arriving at one instant,
         because the spacing is a recording artefact and not a real gap.

         Absent params -> every group is size 1 -> bit-identical to before this existed. */
      const G = D.grp, gmean = G ? G.mean_group_size : 1;
      const gsize = () => { if(!G) return 1; const u = r();
        if(u < G.p4) return 4; if(u < G.p4+G.p3) return 3; if(u < G.p4+G.p3+G.p2) return 2; return 1 };
      const arr=[], gid=[], gsz=[];
      let gnext=0;
      for(let h=0;h<H;h++){ let t=h*60;
        for(;;){ t+=expo(r,(lam[h]/gmean)/60); if(t>=(h+1)*60) break;
                 const g=gsize(), id=gnext++;
                 for(let k=0;k<g;k++){ arr.push(t); gid.push(id); gsz.push(g) } } }
      // sort arrivals while keeping each patient with its own group id
      const ord = arr.map((_,i)=>i).sort((x,y)=> arr[x]-arr[y] || gid[x]-gid[y]);
      const arrS = ord.map(i=>arr[i]), gidS = ord.map(i=>gid[i]), gszS = ord.map(i=>gsz[i]);
      arr.length=0; gid.length=0; gsz.length=0;
      for(let i=0;i<arrS.length;i++){ arr.push(arrS[i]); gid.push(gidS[i]); gsz.push(gszS[i]) }
      arrN += arr.length;
      const ev=new Heap(); for(let i=0;i<arr.length;i++) ev.push([arr[i],0,i]);
      ev.push([CLOSE,-1,-1]);
      const qa=[], qr=[], second=new Float64Array(arr.length);
      // BED-FIRST only: set at arrival, because it is a triage decision — this patient cannot be
      // put in a chair for their initial evaluation, whatever the queue looks like.
      const bedReq = (bedFirst || stream) ? new Uint8Array(arr.length) : null;
      const slotA = T ? new Int16Array(arr.length).fill(-1) : null;
      const slotB = T ? new Int16Array(arr.length).fill(-1) : null;
      let ab=0, rb=0, peak=0, pkA=0, pkB=0;
      const seated = new Int32Array(gnext);      // members of each party that have arrived
      /* ab+rb is every patient occupying a space — including one stuck in assessment with
         nowhere to move to. That total IS the physician's concurrent load. Capacity is A+R;
         the peak is what the lane actually reached, which is the honest number to show. */
      const hb = t => Math.min(H-1, (t/60)|0);
      /* ── THE PROVIDER QUEUE ────────────────────────────────────────────────────────────────
         A space is not care. Taking a chair puts a patient in line for a PERSON, and that line is
         what the department's wait is actually made of: 0 of 746 patients in the current pod era
         were seated with every chair full, yet the median one waited 22 min for a space and 8 more
         to be seen. What predicts being seen late is how many were roomed AHEAD of you (+9.9% per
         patient in the previous 30 min, t=3.5); the standing lane occupancy does nothing (+1.7%,
         t=0.48); and patients roomed AFTER you carry -8.6% (t=-2.8), so being early in a burst
         gets you seen sooner. That is FIFO for a server.
         ⚠ ONE SERVER, NO PREEMPTION, and that is measured rather than assumed: patients roomed in
         the 30 min after you were seen do NOT slow your ongoing care (+1.4%, t=0.88, bounded below
         ~5%/patient). The contention is at the front door of care, not during it — so there is no
         shared-attention penalty here, and adding one would be inventing a mechanism.
         The drawn hold already CONTAINS the real queue, so it is scaled by the measured
         post-doctor share before the modelled queue is added back; otherwise the wait is counted
         twice. `docs = 0` skips all of it and the engine is exactly as it was. */
      const docFree = new Array(docs).fill(0);
      const docQueue = t => {
        if(!docs) return 0;
        let i = 0; for(let j = 1; j < docFree.length; j++) if(docFree[j] < docFree[i]) i = j;
        const start = Math.max(t, docFree[i]);
        /* ⚠ VARIABLE, NOT FIXED. docMin is inverted from the observed queue by M/M/1, which
           assumes exponential service — implement it as a CONSTANT and you get M/D/1, whose wait
           is exactly HALF for the same mean. The guard caught precisely that factor of two (8.4
           modelled against 16.8 measured). Physician time per patient is variable anyway; a fixed
           number was the modelling error, not the inversion. */
        docFree[i] = start + expo(r, 1/(docMin * (load ? load[hb(t)] : 1)));
        qSum += start - t; qN++;
        return start - t; };
      const holdOf = (t, w, raw) => {
        const v = docs ? docQueue(t) + raw * ((postShare && postShare[w ? 1 : 0]) ?? 0.8) : raw;
        hSum += v; hN++;                 // exposed so the no-double-count property is testable
        return v; };
      /* ⚠ THE PROCESS FLOOR IS TWO PARTS. `floor` is arrival -> triage; `floorRoom` is triage ->
         actually being put in a space, a median 13 min here that the engine had no
         representation for at all — which is most of why it predicted 8 minutes to be roomed
         where the department measures 22. It is process and not queueing: not one pod patient in
         746 was seated with every chair full, so none of it is waiting for a chair. It is
         anchored undelayed and scaled by the crowding multiplier because it demonstrably responds
         to how full the department is (8 min at 0-9 patients present, 12 at 10-19, 18.5 at
         20-29) — a different interval from the queue that multiplier already lengthens, so the
         two do not overlap. */
      const rec = (tag,w,dv) => { const tt=w+floor+floorRoom*(load ? load[hb(arr[tag])] : 1); if(!dv){wa+=tt;waN++} hs[hb(arr[tag])]+=tt; hn[hb(arr[tag])]++;
        if(bedReq){ const b=BY[bedReq[tag]]; b.wait+=tt; b.n++; if(dv) b.div++; else b.seen++ } };

      const startA = (t,tag) => { ab++;
        if(T){ const s=freeA.pop(); slotA[tag]=s; T.push({t, id:tag, ev:"assess", slot:s}) }
        const w = r()<shr;
        if(T) for(let i=T.length-1;i>=0;i--) if(T[i].id===tag && T[i].ev==="arrive"){ T[i].test=w; break }
        /* ⚠ THE CROWDING MULTIPLIER DELAYS THE START OF CARE, NOT CARE ITSELF — corrected
           once the queue above existed, and the correction is the operator's question answered.
           It was first fitted on the WHOLE space hold and applied here. But the whole hold
           CONTAINS the roomed-to-doctor queue, and split apart the effect is entirely the queue:
           whole hold +3.68% (t=4.6), queue +15.4% (t=10.6), post-doctor hold +0.49% (t=0.50).
           Department load does not slow CARE at all; it slowed the thing the engine now models
           explicitly, so scaling here was double-counting. It moved to docMin above. */
        const total = holdOf(t, w, w ? pick(r,asw)+pick(r,res) : pick(r,now));
        if(pooled){ second[tag]=0; ev.push([t+total,1,tag]); return }
        if(!w && !fastDischarge){ second[tag]=0; ev.push([t+total,1,tag]); return }
        /* ⚠ THE TWO HALVES ARE ASSESSED SEPARATELY. `assessMin` is measured on patients who HAD
           an order — it is their roomed-to-first-order time — and applying it to a patient who
           never has one was an assumption, not a measurement. Nothing in the record marks the end
           of an assessment for someone with no order, so the no-test half is its own control.
           Measured 2026-08-22 on a 6+4 lane: the score runs 70.0 -> 21.0 across the range, which is
           an order of magnitude more than the gaps between the layouts this page compares. */
        /* the assessment point is no longer scaled by department load either: that multiplier
           moved onto the provider, where the data puts it */
        const a = Math.min((w ? assessMin : (assessNo ?? assessMin)) ?? D.g.asw, total-1);
        second[tag] = Math.max(1, total-a);
        ev.push([t+a,1,tag]) };
      const startB = (t,tag) => { rb++;
        if(T){ const s=freeB.pop(); slotB[tag]=s; T.push({t, id:tag, ev:"second", slot:s}) }
        ev.push([t+second[tag],2,tag]) };
      /* ⚠ TURNOVER. Cleaning and turning a space takes time, and the lane cannot use it in the
         meantime. Freeing the counter at departure — which is what this did until 2026-08-22 —
         quietly gives the lane back capacity it does not have, and the error compounds with
         throughput: a fast lane turns its spaces over more often, so the faster the layout the
         more capacity it was being handed. Release is scheduled instead. Set both to 0 and the
         engine is exactly as it was. */
      const releaseA = (t,tag) => ev.push([t+turnA,3,tag]);
      const releaseB = (t,tag) => ev.push([t+turnB,4,tag]);
      /* ⚠ THE POOL HAS TO TRAVEL WITH THE EVENT. In a divided lane a patient who moves produces
         TWO releases — the assessment space `turnA` later, and the second-area space when they
         finally leave — with the same id. The stage resolved the pool by looking up where the
         patient IS, which by then is the second area, so the first release blanked the chair they
         were still sitting in and deleted them from the map, making the real departure a no-op.
         On the shipped defaults that drew the second area short for 362 of 480 minutes, and all
         four chairs empty while all four were occupied. The page promises the opposite in two
         places: a space that looks full IS full. */
      const freeEv = (t,tag,pool) => { if(T) T.push({t, id:tag, ev:"free", pool}) };
      /* ⚠ the ANIMATION has to see the release too. It used to free the slot on "leave", so a
         space the engine was still holding for turnover showed as empty next to a queue — the
         page claims a space that looks full IS full, and for 296 of 481 minutes on a tight lane
         it was not. "free" is when the space is usable again; between the two it is being
         turned over, and the stage now draws that. */
      /* A family is seated as one party or not at all — operator, 2026-08-22: they walk out
         together. Splitting one sibling into a chair and leaving the other outside with the parent
         is not a thing the department does, and modelling it that way would let a lane look like
         it absorbed a family it only half-took. The scan is NON-blocking: a party that does not
         fit is passed over rather than holding the queue, so a single behind it is still seated.
         With every group size 1 this reduces exactly to the old shift(). */
      const partySize = g => { let n=0; for(const q of qa) if(gid[q[1]]===g) n++; return n };
      const seatParty = (t, g, start) => { for(let j=qa.length-1;j>=0;j--) if(gid[qa[j][1]]===g){
          const q=qa.splice(j,1)[0]; rec(q[1], t-q[0]); start(t,q[1]) } };
      const takeOne = t => { if(!qa.length || ab>=A) return false;
        const free = A-ab;
        const i = qa.findIndex(q => partySize(gid[q[1]]) <= free);
        if(i<0) return false;
        seatParty(t, gid[qa[i][1]], startA); return true };
      const takeNext = t => { for(;;){ if(!takeOne(t)) break } };

      /* ── BED-FIRST ────────────────────────────────────────────────────────────────────────
         A third shape, and it is neither of the other two. A room is the DEFAULT, not a stage:
         a patient takes one if one is free and keeps it until they leave. Chairs are overflow —
         reached only when every room is full — and a share of patients cannot use one at all,
         because their evaluation needs a door. Nobody is ever moved, which is the point: the
         proposal is explicitly about not shuffling patients for the sake of process.

         So the two pools are not a sequence, they are a preference with an eligibility rule,
         and that is the whole of the difference. Set the bed-required share to zero and this
         collapses onto the pooled lane with A+R spaces — which is the right sanity
         check, and also the honest statement of what the constraint costs. */
      /* ⚠ THE LOAD STRETCH APPLIES IN BOTH ARRIVAL BRANCHES. It went into the split/pooled one
         first and not here, and the bed-first-at-0%-equals-pooled invariant caught it immediately
         (29.71 against 34.08) — the two branches are meant to be the same lane under a rule that
         is inert at zero, so anything applied to one and not the other separates them. */
      const draw = (tag, t) => { const w = r()<shr;
        if(T) for(let i=T.length-1;i>=0;i--) if(T[i].id===tag && T[i].ev==="arrive"){ T[i].test=w; break }
        return holdOf(t, w, w ? pick(r,asw)+pick(r,res) : pick(r,now)) };
      const startBed = (t,tag) => { ab++;
        if(T){ const s=freeA.pop(); slotA[tag]=s; T.push({t, id:tag, ev:"assess", slot:s}) }
        second[tag]=0; ev.push([t+draw(tag,t),1,tag]) };
      const startChair = (t,tag) => { rb++;
        if(T){ const s=freeB.pop(); slotB[tag]=s; T.push({t, id:tag, ev:"second", slot:s}) }
        ev.push([t+draw(tag,t),2,tag]) };
      /* Same one-party rule as the split lane. A party needs room for ALL of it before any of it
         is placed: enough doors for its bed-required members, and any space at all for the rest. */
      const party = g => { const out=[]; for(let j=0;j<qa.length;j++) if(gid[qa[j][1]]===g) out.push(j); return out };
      /* ── TWO SHAPES, ONE PLACEMENT ────────────────────────────────────────────────────────
         bed-first: a bed is the DEFAULT and chairs are overflow, so a chair patient takes a bed
         whenever one is free. "Rooms first" falls out of the order rather than needing a threshold.

         stream: the two sides are kept APART. A chair patient never takes a bed, even with beds
         standing empty, and a bed patient never takes a chair. That is the whole difference — the
         routing rule (who needs a bed) is identical, and is the exclusion list either way.

         ⚠ Splitting a fixed estate into two pools that cannot help each other costs something, and
         this page already carries that in a guarded form: bed-first at 0% bed-required is
         statistically identical to a pooled lane over the same spaces (it cannot be exactly identical: the bed-required roll consumes an RNG draw the pooled path does not, so the two run different realisations of the same seed — measured -0.12/-0.03/+0.07 at 200/1000/5000 days, non-shrinking and sign-flipping, i.e. noise around a true 0). Expect stream to score worse than
         bed-first at the same footprint. That IS the measurement — a department may stream because
         of how nursing is assigned, and this prices it. */
      /* ⚠ ROOMS FIRST FOR EVERYONE in bed-first — that is what the layout IS. It once read
         `ab<A && (bedReq || rb>=R)`, sending a chair-eligible patient to a room only once every
         chair was full: the preference inverted, against the mode's own title, stage label and
         hint. It made Blake's rule look cheaper than it is — at 2 rooms + 8 chairs, 15.6
         min/patient against a true 22.3.

         ⚠ AND ROOMS GO TO THE PATIENTS WHO NEED THEM FIRST. Walking the party in queue order
         handed a room to whoever it reached while one was free, so in a MIXED party a
         chair-eligible sibling could take the last room and push the room-required one into a
         chair — the exact rule the layout exists to model. 1.16% of room-required placements on a
         room-poor lane with the sibling rule off; unreachable with it on, and impossible in
         stream, but it is a user-facing toggle. */
      const seatBedParty = (t, idx) => {
        const rows = idx.map(j => qa[j]);
        rows.sort((x, y) => (bedReq[y[1]] ? 1 : 0) - (bedReq[x[1]] ? 1 : 0));
        for(let j=idx.length-1;j>=0;j--) qa.splice(idx[j], 1);
        for(const q of rows){ rec(q[1], t-q[0]);
          const toBed = stream ? bedReq[q[1]] : (ab < A);
          if(toBed) startBed(t,q[1]); else startChair(t,q[1]) } };
      const takeParty = t => {
        for(let i=0;i<qa.length;i++){
          const idx = party(gid[qa[i][1]]);
          let needBed=0; for(const j of idx) if(bedReq[qa[j][1]]) needBed++;
          const rest = idx.length-needBed, fa = A-ab, fr = R-rb;
          const fits = stream ? (needBed <= fa && rest <= fr)          // each side on its own
                              : (needBed <= fa && rest <= (fa-needBed) + fr);
          if(fits){ seatBedParty(t, idx); return true }
        }
        return false };
      /* Rooms first, every time. takeBed only fires while a room is free, so by the time
         takeChair is reached the rooms ARE full — the "chairs only at zero room capacity" rule
         falls out of the order rather than needing a threshold of its own. */
      const drain = t => { for(;;){ if(!takeParty(t)) break } };

      while(ev.a.length){
        const e=ev.pop(), t=e[0], kind=e[1], tag=e[2];
        if(kind===-1){ for(const q of qa){ divN++; divWait += CLOSE-q[0]+floor; divH[hb(arr[q[1]])]++;
                                           rec(q[1], CLOSE-q[0], true);
                                           if(T) T.push({t, id:q[1], ev:"divert"}) }
                       qa.length=0;
                       /* ⚠ AND THE PATIENTS STUCK MID-LANE GO TOO (operator, 2026-08-23). `qr`
                          holds patients who have been assessed and are waiting for a second-area
                          space. They used to keep waiting past CLOSE with nothing to release
                          them, so a starved second area ran to 1,031 minutes — nine hours after
                          the lane shut — and the score went NON-MONOTONE in the primary slider:
                          at R=1, adding assessment spaces made it worse, 137 -> 286, because more
                          spaces fed more patients into the same trap. The department's answer is
                          that they are moved to the main department, so they are charged the same
                          divert as anyone still in the waiting room, and their space is freed. */
                       /* ⚠ NO SECOND rec() FLOOR. These patients were already charged
                          floor + floorRoom by rec() when they were SEATED, so charging it again
                          double-counts the door-to-triage time for everyone diverted mid-lane —
                          and puts two samples per patient into the by-hour chart. divWait keeps
                          its own +floor because that term is the divert's own accounting. */
                       for(const q of qr){ divN++; divWait += CLOSE-q[0]+floor; divH[hb(arr[q[1]])]++;
                                           if(T) T.push({t, id:q[1], ev:"divert"});
                                           releaseA(t, q[1]) }
                       qr.length=0;
                       if(T) T.push({t, ev:"close"}); continue }
        if(bedFirst || stream){
          if(kind===0){ /* A family needs a door: siblings go in one room together rather than
                           into separate chairs across the lane, so arriving with a sibling is a
                           bed-required rule in its own right and not a share to be added. The
                           draw is kept for everyone else. */
                        bedReq[tag] = (bedGrp && gsz[tag] > 1) || r() < bedShare ? 1 : 0;
                        /* ⚠ the flag rides along AFTER it is drawn — pushed before, it recorded
                           the previous patient's value. It exists so the seating rule is
                           observable from outside: a room-required patient must never end up in
                           a chair, and nothing could see that at all before. */
                        if(T) T.push({t, id:tag, ev:"arrive", test: null, bed: !!bedReq[tag]});
                        qa.push([t,tag]);
                        /* ⚠ WAIT FOR THE WHOLE PARTY. Each member is its own arrival event at the
                           same instant, so draining on the first one seated it alone and the
                           whole-party rule almost never bit — 17% of pairs and a third of triples
                           were still split. Drain once the last member has arrived. */
                        if(++seated[gid[tag]] === gsz[tag]) drain(t) }
          else if(kind===1 || kind===2){ seen++;
                 if(T) T.push({t, id:tag, ev:"leave"});
                 if(kind===1) releaseA(t,tag); else releaseB(t,tag) }
          else { // the space is turned over and usable again
                 if(kind===3){ ab--; if(T){ freeA.push(slotA[tag]); freeEv(t,tag,"A") } }
                 else        { rb--; if(T){ freeB.push(slotB[tag]); freeEv(t,tag,"B") } }
                 drain(t) }
          if(ab+rb > peak) peak = ab+rb;
          if(ab > pkA) pkA = ab;
          if(rb > pkB) pkB = rb;
          continue;
        }
        if(kind===0){ if(T) T.push({t, id:tag, ev:"arrive", test: null});
                      qa.push([t,tag]);
                      if(++seated[gid[tag]] === gsz[tag]) takeNext(t) }   // whole party, see above
        else if(kind===1){
          seen++;
          // ⚠ the assessment space is released on a MOVE too, not only on a departure — it still
          // has to be turned over before the next patient can use it either way
          if(!second[tag]){ if(T) T.push({t, id:tag, ev:"leave"});
            releaseA(t,tag); continue }                             // never moved on
          nw++;
          if(rb<R){ wrN++; startB(t,tag); releaseA(t,tag) }
          else { qr.push([t,tag]); blocked++;
                 if(T) T.push({t, id:tag, ev:"stuck"}) }             // nowhere to move to
        } else if(kind===2){
          if(T) T.push({t, id:tag, ev:"leave"});
          releaseB(t,tag);
        } else if(kind===3){                                        // assessment space turned over
          ab--; if(T){ freeA.push(slotA[tag]); freeEv(t,tag,"A") }
          takeNext(t);
        } else {                                                    // second-area space turned over
          rb--; if(T){ freeB.push(slotB[tag]); freeEv(t,tag,"B") }
          if(qr.length){ const q=qr.shift(); wr += t-q[0]; wrN++;
                         startB(t,q[1]); releaseA(t,q[1]) }
          else takeNext(t);
        }
        if(ab+rb > peak) peak = ab+rb;
      }
      peakSum += peak; BY[1].peak += pkA; BY[0].peak += pkB;
    }
  }
  if(T) return {trace:T, A, R};
  const runs = days*seeds.length;
  if(!arrN) return {wa:0, perArrival:0, wr:0, stuck:0, byHour:new Array(H).fill(0), worst:0,
                    worstIdx:0, seen:0, arrived:0, diverted:0, divByHour:new Array(H).fill(0),
                    divPct:0, saturated:false, idle:true, peak:0};
  const byHour=[]; for(let h=0;h<H;h++) byHour.push(hn[h] ? hs[h]/hn[h] : 0);
  const worst = Math.max.apply(null, byHour);
  return {docWait: qN ? qSum/qN : 0, holdMean: hN ? hSum/hN : 0, wa: waN ? wa/waN : 0, perArrival: (wa+wr+divWait)/arrN, wr: nw?wr/nw:0, stuck: nw?100*blocked/nw:0,
          byHour, worst, worstIdx: byHour.indexOf(worst),
          seen: seen/runs, arrived: arrN/runs, diverted: divN/runs,
          divByHour: [...divH].map(v=>v/runs),
          divPct: 100*divN/arrN, saturated: divN/arrN > 0.02,
          peak: peakSum/runs,
          /* one entry per stream: chairs then beds. `wait` is per patient routed to that side,
             INCLUDING the ones it never seated — same convention as the lane-wide figure. */
          streams: BY.map(b => ({share: arrN ? b.n/arrN : 0, n: b.n/runs,
                                 wait: b.n ? b.wait/b.n : 0,
                                 seen: b.seen/runs, diverted: b.div/runs, peak: b.peak/runs}))};
}

/* ── playing one evening ──────────────────────────────────────────────────────
   The same simulation, one seed, one day, replayed on a clock. Nothing here is decorative: the
   dots move when that patient actually moved in the run the numbers come from, and a space that
   looks full IS full. Watching it is the fastest way to see why a layout fails — a jammed second
   area shows up as assessment spaces that stop turning over, which no summary figure conveys. */
const PLAY = {on:false, t:0, speed:60, raf:0, trace:null, A:0, R:0, last:0,
              runs:null, pick:0, n:0, expect:0};

/* ⚠ THE SEED IS CHOSEN, NOT HASHED. An arbitrary seed gives an arbitrary evening, and evenings
   vary enormously: across 40 seeds at the default settings the arrival count runs 13 to 47 around
   a mean of 26.5. The first hash tried here landed on 42 arrivals — the third busiest of forty —
   so the very first thing anyone saw was a jam the headline numbers do not predict.

   So: sample a handful of candidate evenings and play the one whose arrival count is closest to
   what the settings imply, and say on screen how busy it was. "Another evening" steps through the
   rest, because the spread is real and worth seeing — it just should not be what you meet first. */
function buildTrace(){
  const m = modeOf(), lvl = LEVELS[S.level], mx = mix();
  const f = NOMOVE.has(m.id) ? S.cyc/D.T_A : 1;
  const hours = winHours(), fac = lvl.pts/D.day_mean;
  const lam = hours.map(h => D.lam24[h]*fac*mx.share);
  const expect = lam.reduce((a,b)=>a+b, 0);
  /* ⚠ THE STAGE MUST RUN THE SAME MODEL AS THE NUMBERS. Everything the engine branches on has
     to be listed here — a mode added to sim() and not to this line plays a DIFFERENT lane on
     screen from the one the cards describe, which is worse than showing no lane at all. */
  const base = {A:S.A, R:m.hasR?S.R:0, pooled:m.id==="pooled", bedGrp:S.bedGrp, ...turnFor(S),
                bedFirst:m.id==="bedfirst", stream:m.id==="stream", bedShare:liveBedShare(), assessMin:S.assess,
                /* ⚠ EVERY SCORED PARAMETER, OR THE STAGE PLAYS A DIFFERENT LANE. `load` and
                   `floorRoom` were added to evaluate() and not here, so the animation was
                   bit-identical at every setting of a dial worth ~5 score points — a lane the
                   score has jamming played as one emptying. The fingerprint guard could not see
                   it: it identifies MODES, and these are numeric parameters. */
                docs:S.docs, docMin:D.doc_min ?? 18, postShare:D.postdoc_share,
                floorRoom: S.docs ? (D.floor_room ?? 0) : 0,
                load: (D.occ24 && D.load_beta)
                  ? Array.from({length:S.len}, (_,i) => Math.max(1, Math.min(2.2,
                      Math.exp((S.loadPct/100) * D.load_beta *
                        (D.occ24[(S.start+i) % 24] * (LEVELS[S.level].pts / D.day_mean)
                         - (D.occ_floor ?? D.occ_ref))))))
                  : null,
                assessNo:S.assessNo * mx.fm,
                fastDischarge:S.fastDischarge, shr:mx.shr, lam,
                asw:scale(D.asw, f*mx.fa), now:scale(D.now, f*mx.fo), res:scale(D.res, f*mx.fr),
                days:1, trace:true};

  const runs = [];
  for(let i=0;i<9;i++){
    const out = sim({...base, seeds:[41+i*13]});
    runs.push({out, n: out.trace.filter(e=>e.ev==="arrive").length});
  }
  runs.sort((a,b)=>Math.abs(a.n-expect)-Math.abs(b.n-expect));   // typical first, then outwards
  PLAY.runs = runs; PLAY.pick = PLAY.pick % runs.length;
  const chosen = runs[PLAY.pick];
  PLAY.trace = chosen.out.trace; PLAY.A = chosen.out.A; PLAY.R = chosen.out.R;
  PLAY.n = chosen.n; PLAY.expect = expect; PLAY.t = 0;
  drawStage();
}

function stageState(t){
  const A = new Array(PLAY.A).fill(null), B = new Array(PLAY.R).fill(null);
  const where = new Map(), test = new Map();
  let waiting = 0, gone = 0, sent = 0, stuck = new Set(), turning = new Map();
  for(const e of PLAY.trace){
    if(e.t > t) break;
    if(e.ev === "arrive"){ waiting++; test.set(e.id, e.test) }
    else if(e.ev === "assess"){ waiting--; A[e.slot] = e.id; where.set(e.id, ["A", e.slot]); stuck.delete(e.id) }
    else if(e.ev === "second"){ const w = where.get(e.id);
                                /* ⚠ A CHAIR PATIENT MAY NEVER HAVE BEEN ASSESSED IN A SPACE. In
                                   bed-first and stream, startChair() emits `second` straight from
                                   the queue with no preceding `assess`, and only `assess` used to
                                   decrement — so every chair-seated patient stayed in the waiting
                                   pool for the rest of the run. The stage drew a queue of people
                                   beside EMPTY CHAIRS, on the two layouts the page exists to
                                   compare, while the hero card on the same screen read 0 waiting. */
                                if(!w) waiting--;
                                /* the assessment space is not free yet — it is being turned over,
                                   exactly as it is after a departure */
                                if(w && w[0]==="A"){ A[w[1]] = "turn"; turning.set(e.id, w[1]) }
                                B[e.slot] = e.id; where.set(e.id, ["B", e.slot]); stuck.delete(e.id) }
    else if(e.ev === "stuck"){ stuck.add(e.id) }
    else if(e.ev === "leave"){ const w = where.get(e.id);
                               /* the patient is gone but the SPACE is not free yet — it is being
                                  turned over, and the engine is still counting it occupied */
                               if(w) (w[0]==="A"?A:B)[w[1]] = "turn";
                               gone++ }
    else if(e.ev === "free"){  if(e.pool === "A" && turning.has(e.id)){   // the space they left behind
                                 A[turning.get(e.id)] = null; turning.delete(e.id); }
                               else { const w = where.get(e.id);
                                      if(w && (!e.pool || w[0] === e.pool)){ (w[0]==="A"?A:B)[w[1]] = null;
                                                                             where.delete(e.id) } } }
    else if(e.ev === "divert"){
      /* ⚠ TWO KINDS OF DIVERT SINCE 2026-08-23. Someone still in the WAITING ROOM at close leaves
         the waiting pool. Someone stuck MID-LANE — assessed, with no second-area space, now moved
         to the main department — was taken out of `waiting` when they were seated, so decrementing
         again drove it negative and `new Array(negative)` killed the stage outright. They vacate a
         SPACE instead, which is what the eye should see. */
      const w = where.get(e.id);
      if(w){ (w[0]==="A"?A:B)[w[1]] = null; where.delete(e.id); stuck.delete(e.id) }
      else waiting--;
      sent++ }
  }
  return {A, B, waiting, gone, sent, stuck, test};
}

/* One patient. A head and shoulders reads as a person at 18px where a stick figure turns to mush;
   the badge on the shoulder marks the half who need a test, so the distinction survives being
   printed, projected, or seen by someone who cannot separate the two colours. */
function person(cls, test){
  return `<svg class="fig ${cls}" viewBox="0 0 18 21" aria-hidden="true">
    <circle class="hd" cx="9" cy="4.6" r="3.5"/>
    <path class="bd" d="M9 9.4c-3.4 0-5.6 2.1-5.6 4.9V20h11.2v-5.7c0-2.8-2.2-4.9-5.6-4.9z"/>
    ${test ? `<circle class="bg" cx="14.4" cy="13.6" r="3"/><circle class="bgd" cx="14.4" cy="13.6" r="1.25"/>` : ``}
  </svg>`;
}

/* ⚠ A slot is only rebuilt when its OCCUPANT changes, never on every frame. Rebuilding the whole
   lane each tick gave every figure a fresh element, which restarted the .22s arrival animation
   from opacity:0 sixty times a second — the boxes changed colour and the people were invisible
   until you paused. Keep the key in sync with anything `dot` renders. */
function slotKey(id, st){
  if(id === null) return "-";
  if(id === "turn") return "x";        // occupied by nobody, and not available either
  return (st.stuck.has(id) ? "j" : "i") + (st.test.get(id) ? "t" : "n") + id;
}
function dot(id, st){
  const k = slotKey(id, st);
  if(id === null) return `<span class="slot" data-k="-"></span>`;
  /* being turned over: the patient has gone, the space is not usable yet, and the engine is
     still counting it occupied. Drawn as neither empty nor full, because it is neither. */
  if(id === "turn") return `<span class="slot turn" data-k="x" title="being turned over"></span>`;
  const jam = st.stuck.has(id);
  return `<span class="slot full${jam?" jam":""}" data-k="${k}">${person(jam?"jam":"in", st.test.get(id))}</span>`;
}
function paintSlots(host, ids, st){
  if(host.childElementCount !== ids.length){
    host.innerHTML = ids.map(id => dot(id, st)).join("");
    return;
  }
  ids.forEach((id, i) => {
    const el = host.children[i];
    if(el.dataset.k !== slotKey(id, st)) el.outerHTML = dot(id, st);
  });
}

/* The two zones mean different things in each layout, and an unlabelled "second area" holding
   overflow chairs reads as the results area it is not. */
function labelStage(m){
  const ah = $("stageAH"), bh = $("stageBH");
  if(ah) ah.textContent = m.id==="bedfirst" || m.id==="stream" ? "In a room"
                        : m.id==="pooled" ? "In a space" : "Being assessed";
  if(bh) bh.textContent = m.id==="bedfirst" ? "In an overflow chair"
                        : m.id==="stream" ? "In a chair" : "Second area — results & discharge";
  /* ⚠ "outlined in red" only exists where a patient can be BLOCKED mid-visit, which needs a
     second area to be blocked out of. In the two layouts where nobody is ever moved it can
     never fire, and promising it sent people hunting for a state the run cannot reach. */
  const ft = $("stageFoot");
  if(ft) ft.innerHTML = `Each figure is a patient; the dot on the shoulder marks the half who
    need a test.` + (m.id==="split"
      ? ` A space outlined in red holds someone with nowhere to move on to.`
      : m.id==="bedfirst"
        ? ` Rooms fill first — a chair is only ever taken once every room is full, and the
            patients who must have a room wait for one rather than take a chair.`
        : ` Nobody is moved in this layout, so a space is held for the whole visit.`);
}

function drawStageIdle(){
  const m = modeOf();
  labelStage(m);
  $("stageClock").textContent = "--:--";
  $("stageWait").innerHTML = ""; $("stageWaitN").textContent = "0";
  $("stageA").innerHTML = new Array(S.A).fill(`<span class="slot"></span>`).join("");
  $("stageB").innerHTML = m.hasR ? new Array(S.R).fill(`<span class="slot"></span>`).join("")
    : `<span class="none">nobody moves in this layout</span>`;
  $("stageGone").textContent = "0"; $("stageSent").textContent = "0";
  $("stageBar").style.width = "0%";
}

function drawStage(){
  if(!PLAY.trace) return;
  const st = stageState(PLAY.t);
  const clock = (h => `${String((S.start + Math.floor(h/60)) % 24).padStart(2,"0")}:${String(Math.floor(h%60)).padStart(2,"0")}`)(PLAY.t);
  const m = modeOf();
  $("stageClock").textContent = clock;
  $("stageWait").innerHTML = new Array(Math.min(st.waiting, 22)).fill(person("wait", false)).join("")
    + (st.waiting > 22 ? `<span class="more">+${st.waiting-22}</span>` : "");
  $("stageWaitN").textContent = st.waiting;
  labelStage(m);
  paintSlots($("stageA"), st.A, st);
  if(m.hasR) paintSlots($("stageB"), st.B, st);
  else $("stageB").innerHTML = `<span class="none">nobody moves in this layout</span>`;
  $("stageGone").textContent = st.gone;
  $("stageSent").textContent = st.sent;
  $("stageBar").style.width = (100*PLAY.t/(S.len*60)).toFixed(1) + "%";
  const busy = PLAY.n > PLAY.expect*1.15 ? "a busy one" : PLAY.n < PLAY.expect*0.85 ? "a quiet one" : "a typical one";
  $("stageHint").innerHTML = `This run brought <b class="num">${PLAY.n}</b> patients into the lane
    against a typical <b class="num">${PLAY.expect.toFixed(1)}</b> — ${busy}.` + (m.id==="split"
      ? ` A space outlined in red holds a patient with nowhere to move on to.`
      : m.id==="bedfirst"
        ? ` Watch the rooms fill before a single chair is used.`
        : ``);
}

function tick(ts){
  if(!PLAY.on) return;
  const dt = PLAY.last ? (ts - PLAY.last)/1000 : 0;
  PLAY.last = ts;
  PLAY.t += dt * PLAY.speed;
  if(PLAY.t >= S.len*60){ PLAY.t = S.len*60; playPause(false); drawStage(); return }
  drawStage();
  PLAY.raf = requestAnimationFrame(tick);
}

function playPause(on){
  PLAY.on = on === undefined ? !PLAY.on : on;
  if(PLAY.on){
    if(!PLAY.trace || PLAY.t >= S.len*60){ buildTrace(); PLAY.t = 0 }
    PLAY.last = 0; PLAY.raf = requestAnimationFrame(tick);
  } else cancelAnimationFrame(PLAY.raf);
  $("playBtn").textContent = PLAY.on ? "Pause" : (PLAY.t>0 ? "Resume" : "Play the day");
  $("reroll").hidden = !PLAY.trace;
}

/* ── the operating window ────────────────────────────────────────────────────
   The lane used to be nailed to 15:00-23:00. It is now a start hour and a length, because
   WHERE you put the window turns out to matter more than how you split the chairs — and the
   arrival curve and today's wait curve disagree about where the need is. Arrivals peak at
   19:00-20:00 (3.9/hr) with a second bump at 11:00; today's wait peaks later still, 109 min at
   23:00 and 107 at 22:00, and is lowest at 08:00 (16 min). A window over the busiest ARRIVAL
   hours is not automatically the one that removes the most waiting.

   The day is the denominator now. Patients arriving outside the lane's hours are charged the
   main department exactly like patients its criteria exclude — they are equally not served by
   it, and a score that ignored them would reward a lane open for one quiet hour. */
const HOURS = D.lam24.map((_,h)=>h);
const winHours = () => Array.from({length:S.len}, (_,i)=>(S.start+i)%24);
const dayFactor = () => LEVELS[S.level].pts / D.day_mean;
// arrivals per hour inside the window, scaled to the day's volume
const winLam = () => winHours().map(h => D.lam24[h] * dayFactor());

/* ── who the lane accepts ────────────────────────────────────────────────────
   Selecting complaints changes three things at once, and the third is the one people miss:
     1. how many patients the lane sees   — the selected share of the evening
     2. how often a test is needed        — Ear Problem 10%, Ankle Injury 99%
     3. how long a space is held          — each complaint's own measured means
   Service-time SHAPES are department-wide; only their means are per-complaint, so a selection
   scales the pools rather than resampling them. Stated on the page, because it is an
   approximation and a reader should know which part is measured per complaint and which is not. */
const CC = D.cc.map((x,i)=>({...x, i}));
let PICK = new Set(CC.map(x=>x.i));                 // everyone, until someone narrows it

/* ── the composite ───────────────────────────────────────────────────────────
   Every other number here can be improved by taking fewer patients: narrow the criteria, or let
   the queue spill past 23:00, and the average among those you served looks better while the
   evening is unchanged. This charges the patients a lane does NOT serve what they actually get
   instead — today's wait for a room in the main department, by hour: 32 min at 15:00 rising to
   107 at 22:00, day mean 50.0.

   So the score is minutes of delay per ESI 4/5 patient ARRIVING THAT DAY — the whole day, not
   the lane's hours; the denominator is dayTotal — whoever ends up treating them. Accept nobody
   and you score exactly the status quo; there is no way to win by shrinking. LOWER IS BETTER,
   and 50.0 is the number to beat.

   ⚠ It assumes the main department's wait is unaffected by the lane. Taking work out of it
   should improve it, so if anything this UNDERSTATES what excluding people costs. */
/* ⚠ WHAT THE BAR ACTUALLY IS. This was labelled "no lane at all" and that was wrong: it is
   measured on TODAY, and today already has a fast track. The Orca pod takes the podlo-podhi %
   quoted in the prose (live build tokens — deliberately NOT restated here: the copy that used
   to sit in this comment had already rotted a cut behind the data it described) — and the whole
   hourly escalation in the pooled curve is that pod closing. Orca patients wait the flat band at
   every hour including 22:00; everyone else climbs across the otherlo-otherhi range. So the curve
   is the STATUS QUO, not a lane-free counterfactual, and the two differ by a lot: 58.1 vs 80.5.

   Which is the right bar depends on something no model settles — whether the proposed lane is
   ADDED to today's pod or REPLACES it. So it is a control, not a constant.

   Both curves charge a patient who walked out the time they spent before leaving. Dropping them
   would condition the bar on not having walked out, and they cluster at 22:00 — 179 of 613 —
   exactly where it matters most. */
/* ⚠ THERE IS ONLY ONE BAR, AND THAT IS DELIBERATE.
   A second one — "a day with no fast track" — was offered here and has been removed, because it
   did not measure what its name claimed. It was built by excluding patients whose care area was
   the Orca pod (today's fast track, visibly: ~0% of ESI 4/5 overnight, the majority through
   the hours the ftspan token names, tailing off to almost nothing by 23:00). Two things sank it:

     - 59% of the walkouts in those hours have NO care area recorded at all. A patient who leaves
       before being placed cannot be labelled Orca, so every one of them fell into the
       "no fast track" group by construction rather than by outcome. Removing walkouts closes most
       of the gap: 59.2 -> 52.7 against 46.0 for everyone.
     - What remains is not a counterfactual anyway. It is the patients Orca did not take WHILE IT
       WAS OPEN — the overflow, which is concentrated at the moments it was full.

   The department has run a fast track throughout the measured period, so no lane-free day exists
   to compare against. Today's arrangement is the honest bar: it is what actually happens now,
   which is the thing any change has to beat. */
const BARS = {today: {m24:D.main24, mean:D.main_mean, n:"today's arrangement"}};
const bar = () => BARS[S.bar] || BARS.today;

function mix(){
  const sel = CC.filter(x=>PICK.has(x.i));
  const s = sel.reduce((a,x)=>a+x.s, 0);
  if(!s) return {share:0, shr:D.shr, fa:1, fr:1, fo:1, fm:1, n:0};
  const wsum = k => sel.reduce((a,x)=>a+x.s*x[k], 0)/s;
  return {share:s, n:sel.length,
          shr: wsum("w"),
          fa: wsum("a")/D.g.asw,                    // scale factors onto the shared shapes
          fr: wsum("r")/D.g.res,
          fo: wsum("o")/D.g.now,
          fm: D.g.dd ? wsum("dd")/D.g.dd : 1};  // how long this mix's no-test patients hold a doctor
}
const scale  = (pool,f) => pool.map(x => x*f);

/* Which turnover applies to which pool. The chair figure applies ANYWHERE A CHAIR IS USED, which
   is both sides of a divided lane — assessment and results/discharge pending are chairs alike —
   and the whole of the pooled lane. Only the bed-first lane has rooms, and only its first pool.

   ⚠ Corrected 2026-08-22 (operator). This first charged the ROOM figure to every assessment pool,
   on the reasoning that a patient is examined there. That is wrong for this lab: the assessment
   side of a chair lane is chairs, so a 6+4 divided lane was being charged ten minutes to turn over
   a chair and came out ~1 min/patient worse than it should have been. The lane is named for what
   it is. The one layout where the assessment side really is rooms — "8 rooms + 10 chairs" — is now
   the case that under-charges — so it says so: `roomsA` marks a divided lane whose assessment side
   is rooms, set by that preset and by the control under Spaces. The second area is chairs either
   way; nobody has proposed a layout whose results-pending side is rooms. */
/* ⚠ roomsA IS A DIVIDED-LANE SETTING AND MUST NOT REACH POOLED. The chairs/rooms control is
   rendered only in the split layout, but this charged room turnover on `cfg.roomsA` unscoped —
   so setting it in split and then switching to pooled left a pooled lane paying room turnover
   with no control on screen to explain it (+5.0 min at 5 spaces), and field 16 of the hash
   carried the invisible charge into every shared link. Both comments nearby already said the
   pooled lane is chairs. */
const turnFor = cfg => ({
  turnA: (cfg.mode === "bedfirst" || cfg.mode === "stream"
          || (cfg.roomsA && cfg.mode !== "pooled"))
           ? (cfg.turnRoom ?? 0) : (cfg.turnChair ?? 0),
  turnB: cfg.turnChair ?? 0});

/* One lane, evaluated. `cfg` is everything a saved board entry carries, so the live page and
   the leaderboard cannot drift apart — they call this same function. */
function evaluate(cfg, dayTotal){
  /* a board row saved in the four-mode era ('zone', 'rooms') must not crash the page for
     everyone sharing the board — fall back to split, the nearest surviving semantics */
  const m = MODES.find(x=>x.id===cfg.mode) || MODES[0];
  const f = NOMOVE.has(cfg.mode) ? cfg.cyc/D.T_A : 1;
  const hours = Array.from({length:cfg.len}, (_,i)=>(cfg.start+i)%24);
  const fac   = dayTotal / D.day_mean;

  const keep = cfg.cc === "-" ? new Set()
             : cfg.cc === undefined ? new Set(CC.map(x=>x.i))
             : new Set(String(cfg.cc).split(".").filter(v=>v!=="").map(Number));
  const sel = CC.filter(x=>keep.has(x.i)), share = sel.reduce((a,x)=>a+x.s,0);
  const w = k => share ? sel.reduce((a,x)=>a+x.s*x[k],0)/share : 1;

  const lam = hours.map(h => D.lam24[h] * fac * share);      // what the lane actually sees
  const accepted = lam.reduce((a,b)=>a+b, 0);
  /* Hoisted and returned so the WIRING can be asserted. `mix().fm` is the same expression, but it
     is consumed only by buildTrace (the stage) — this copy, the one the SCORE runs on, had no
     check at all: deleting it, or reading the wrong field here, both passed the harness while
     narrowing the complaint list silently stopped moving the scored assessment time. */
  const assessNoEff = (cfg.assessNo ?? cfg.assess ?? 44) * (D.g.dd ? w("dd")/D.g.dd : 1);
  /* The department's own occupancy curve, scaled by how busy the chosen day is, turned into a
     per-hour service-time multiplier. `loadK` is the reader's dial: 0 reproduces the engine
     exactly as it was, 1 is the effect as measured. Clamped because the exponential runs away on
     a heavy day at the peak hour and no measurement supports extrapolating that far. */
  const loadK = (cfg.loadPct ?? 100) / 100;
  /* ⚠ DELAY ONLY — IT FLOORS AT 1. Measured from the QUIETEST hour, not the average: centred on
     the mean it dipped below 1, which would say an empty department makes the lane FASTER than
     its own baseline. Crowding can add delay; its absence is the floor, not a bonus.
     ⚠ AND IT IS NOT THE PROVIDER. The lane has a DEDICATED doctor 11:00-21:00 (operator,
     2026-08-23) and inside those hours the effect is undiminished: +8.1% per patient (t=3.87)
     with the lane's own load controlled at 30 min, at 2 h, and by its standing occupancy. So the
     shared resource is something else — nursing and room preparation are the candidates, and a
     documentation-timing artefact cannot be excluded. It is applied to the service time because
     that is the only lever the engine has on the time-to-be-seen; the LABEL must not claim it is
     the doctor. doc_min is rebased to the undelayed floor in the pipeline, so the fit at average
     crowding — the conditions it was inverted from — is unchanged. */
  const load = (D.occ24 && D.load_beta)
    ? hours.map(h => Math.max(1, Math.min(2.2,
        Math.exp(loadK * D.load_beta * (D.occ24[h % 24] * fac - (D.occ_floor ?? D.occ_ref))))))
    : null;

  const o = accepted < 0.05 ? {idle:true, docWait:0, perArrival:0, wa:0, wr:0, stuck:0, worst:0, worstIdx:0,
                               byHour:hours.map(()=>0), diverted:0, divByHour:hours.map(()=>0),
                               arrived:0, seen:0, divPct:0}
    : sim({A:cfg.A, R:m.hasR?cfg.R:0, pooled:cfg.mode==="pooled", bedGrp:cfg.bedGrp, ...turnFor(cfg),
           bedFirst:cfg.mode==="bedfirst", stream:cfg.mode==="stream",
           // a row saved during the brief flat-share build carries one number and no list
           bedShare: cfg.bedcc === undefined && cfg.bedShare !== undefined
             ? Math.min(1, Math.max(0, (+cfg.bedShare || 0) / 100))
             : bedShareOf(keep, cfg.bedcc === "-" ? new Set()
                                 : cfg.bedcc === undefined ? new Set(BED_IDS) : idSet(cfg.bedcc),
                          cfg.bedExtra, cfg.bedIntp),
           assessMin:cfg.assess, fastDischarge:cfg.fastDischarge, shr:w("w"), lam,
           /* Scaled by the mix, exactly as the service pools are. A lane that takes only quick
              complaints gets a shorter no-test assessment automatically, because those patients
              really are done sooner — measured 34 min for an arm injury against 98 for a
              constipation. Narrowing the criteria therefore moves this without anyone touching
              the slider, which is the point: the slider sets the AVERAGE patient. */
           /* ⚠ resolve the legacy fallback BEFORE scaling. sim() used to take `assessNo ??
              assessMin`, so a cfg without the field worked; multiplying an undefined by the mix
              factor gives NaN, and a NaN reaches the board as a blank score. */
           assessNo: assessNoEff,
           load, floorRoom: (cfg.docs ?? 1) ? (D.floor_room ?? 0) : 0, docs: cfg.docs ?? 1, docMin: D.doc_min ?? 18, postShare: D.postdoc_share,
           asw:scale(D.asw, f*w("a")/D.g.asw), now:scale(D.now, f*w("o")/D.g.now),
           res:scale(D.res, f*w("r")/D.g.res), days:cfg.days||600, seeds:cfg.seeds||[11,12,13,14]});

  // Everyone the lane does not serve is charged the main department for THEIR arrival hour:
  // the whole of every hour outside the window, and the criteria-excluded share of every hour
  // inside it. Out-of-hours and out-of-criteria are the same thing from the patient's side.
  const B = BARS[cfg.bar] || BARS.today;
  const inWin = new Set(hours);
  let outMin = 0;
  for(let h=0; h<24; h++){
    const arr = D.lam24[h] * fac;
    outMin += arr * (inWin.has(h) ? (1-share) : 1) * B.m24[h];
  }
  const divMin = (o.divByHour||[]).reduce((a,v,i)=>a + v*Math.max(0, B.m24[hours[i]] - D.floor), 0);
  const laneMin = o.idle ? 0 : o.perArrival * accepted;
  const score = dayTotal ? (laneMin + divMin + outMin) / dayTotal : B.mean;

  return {o, m, hours, accepted, share, dayTotal, score, assessNoEff, load, base:B.mean, delta:B.mean-score,
          cover: dayTotal ? accepted/dayTotal : 0};
}

/* ── state ───────────────────────────────────────────────────────────────── */
/* layouts in which a patient keeps one space for the whole visit — no second stage, so they share
   the pace dial and the whole-visit service shape rather than the assess/results split */
const NOMOVE = new Set(["pooled", "bedfirst", "stream"]);
/* layouts that HAVE beds, so a complaint can be marked as needing one */
const BEDMODE = new Set(["bedfirst", "stream"]);
const MODES = [
  {id:"split",  t:"Assessment spaces + a second area",
                s:"Assessed in one space, then moved to a second area to wait for results or to be discharged.",
                hasR:true},
  {id:"pooled", t:"One group, patient stays put",
                s:"A patient takes a space on arrival and keeps it until they leave. Nobody moves.",
                hasR:false},
  /* Proposed by Blake. Rooms are the default and chairs are the overflow, with a class of
     patient who cannot be put in a chair at all. See the bed-first block in sim(). */
  {id:"bedfirst", t:"Rooms first, chairs only when rooms are full",
                s:"A room if one is free, a chair only when they are all taken — and some patients need a room either way. Nobody moves.",
                hasR:true},
  {id:"stream",   t:"Two streams, kept apart",
                s:"Sorted at the door: some patients go to rooms, everyone else to chairs, and neither side lends to the other. Nobody moves.",
                hasR:true}
];
/* ⚠ WHAT THE CHIEF-COMPLAINT FIELD CAN AND CANNOT SEE. Blake's bed-required list is a clinical
   rule, not a data field: "abdominal/pelvic pain", "full body exams (rashes)" and "exams of
   sensitive areas" have complaints behind them, while "sensitive histories" and "families that
   are highly anxious/demanding/angry" are a triage judgement nothing in the record marks.

   ⚠ TWO DIFFERENT KINDS OF MISSING, AND ONLY ONE IS PERMANENT. Two of the reasons a patient
   needs a door are recorded somewhere and merely absent from THIS extract:
     - GU concerns are recorded at triage, but this build breaks out only Dysuria; the rest
       (genital, scrotal, testicular, vaginal, hematuria, frequency) are swallowed by the
       209-complaint bucket, a quarter of the volume and so useless as a proxy.
     - Preferred language / interpreter need is a REGISTRATION field, taken at the desk rather
       than judged at the bedside. Nothing about it is soft; it just was not extracted.
   Both are pipeline limits, fixable in the next cut, and both would turn slider guesses into
   measurements. A sensitive history and an angry family are not fixable by any cut. The page
   says which is which, because one kind is somebody's next job and the other never will be.

   ⚠ TWO OF BLAKE'S REASONS ARE NOT MISSING, THEY ARE OUT OF SCOPE — child abuse and mental
   health. Every encounter behind this page is ESI 4/5 and neither is triaged there: a child-abuse
   concern is usually coded as Well Child (so it looks present and is not) and is triaged up when
   recognised, and mental-health presentations do not reach ESI 4/5 at all (confirmed by the
   physicians, 2026-08-22). Neither may be added to the share — doing so charges the lane for
   people it never sees. The Well Child rows that ARE here are ordinary low-acuity visits.

   So the ticked default is the FLOOR of the share, and the rest is a control. Derived from the
   data rather than written down, so it moves with each cut instead of rotting. */
/* ⚠ DYSURIA WAS HERE AND IS NOT ANY MORE — operator, 2026-08-22, closing the question this file
   raised when the genital group was split out. It was on Blake's original list as the
   sensitive-exam entry; the physicians have since said a urinary complaint does not usually need
   one, which is why urinary sits outside the genital group. Leaving it ticked would have kept the
   rule under a rationale its own authors had withdrawn. It is still a complaint anyone can tick. */
const BED_CC = ["Abdominal Pain", "Rash"];
/* The genital group joins by KEY, not by name: its label carries a member count that moves with
   the data, so a name match would silently un-tick Blake's list the first time a new genital
   complaint appeared. ⚠ Urinary complaints are deliberately NOT in that group — operator,
   2026-08-22: a urinary complaint does not usually need a sensitive exam, which is the reason
   the group exists. Dysuria therefore stands on its own above, unchanged from Blake's list. */
const BED_IDS = D.cc.map((x,i)=>i)
  .filter(i => BED_CC.indexOf(D.cc[i].n) >= 0 || D.cc[i].k === "genital");
let BEDPICK = new Set(BED_IDS);            // which complaints must have a room

/* The share of the patients THIS LANE ACCEPTS who cannot be put in a chair. Two parts, because
   the exclusion list has two kinds of entry: the ones a chief complaint can carry, whose volume
   is measured, and the ones it cannot, which only a human can put a number on. They compose —
   the extra applies to whoever is left after the ticked complaints are taken out.

   Computed from a cfg rather than from live state, so a board row scores on ITS OWN list. */
function bedShareOf(keep, bedKeep, extra, intp){
  const sel = CC.filter(x=>keep.has(x.i)), tot = sel.reduce((a,x)=>a+x.s, 0);
  if(!tot) return 0;
  const ccPart = sel.filter(x=>bedKeep.has(x.i)).reduce((a,x)=>a+x.s, 0) / tot;
  /* Interpreter need is a per-PATIENT attribute, not a complaint, so it cannot be a row in the
     list — it is measured per complaint (`x`) and applied to whoever the ticked complaints leave
     behind. Composing on the window-wide 11.4% instead would double-count: the complaints Blake
     ticks are themselves more non-English than average (15.3% vs 11.1% on the current ticked set;
     the 14.6% here predated Dysuria coming off). ⚠ Crosschecked 2026-08-22: this is a marginal
     rate applied to a residual population, and siblings are enriched among non-English arrivals
     (8.4% vs 5.3%), so the composed share OVER-states by ~0.2 pp — 23.1% against a measured 22.9%.
     Left as is: correcting it needs a joint distribution the page does not carry, for a fifth of a
     point. And a flat rate would be
     wrong the moment anyone narrows the criteria — the per-complaint share runs 4.2% to 24.1%. */
  const intpPart = intp
    ? sel.filter(x=>!bedKeep.has(x.i)).reduce((a,x)=>a + x.s * (x.x!=null ? x.x : D.g.interp), 0) / tot
    : 0;
  /* Siblings compose the same way and for the same reason: a child arriving with a sibling needs
     a door whatever the complaint, so it applies to whoever the earlier two rules leave behind
     rather than adding to them. The share is measured (D.grp.share), not drawn. */
  /* ⚠ NO SIBLING TERM HERE. sim() forces every member of a party into a bed structurally, from
     the group size it already knows, so folding the measured sibling share in as well charged
     siblings twice AND drew everyone else at an inflated rate: the panel said 22.8% while the
     engine realised 27.2%. It cost chair-heavy lanes most — 2rm+8ch read 23.5 min/patient against
     a true 20.2. This returns the share the ENGINE needs; `bedShareDisplay` composes the figure a
     reader sees, which includes siblings because the lane really does put them in beds. */
  const placed = Math.min(1, ccPart + intpPart);
  return Math.min(1, placed + (1-placed) * (extra||0)/100);
}
const idSet = v => new Set(String(v).split(".").filter(x=>x!=="").map(Number));
// the same figure for the lane on screen
const liveBedShare = () => bedShareOf(PICK, BEDPICK, S.bedExtra, S.bedIntp);
/* What a reader sees: the share the engine actually realises. sim() marks a patient bed-required
   if their party is bigger than one OR the draw succeeds, so the two compose as 1-(1-g)(1-b). */
const bedShareDisplay = (drawn, grp) => {
  const g = grp ? (D.grp && D.grp.share) || 0 : 0;
  return 1 - (1 - g) * (1 - drawn);
};

// Named layouts the group has put forward. Each is a full setting, not a hint.
let ACTIVE_PRESET = null;   // which named layout is loaded, so the row can show it
const PRESETS = [
  {id:"mikelong", n:"The Mike Long Play",
   set:{mode:"split", A:2, R:8, assess:44, fastDischarge:true},
   d:"2 assessment chairs; the other 8 are one combined fast-track waiting and results-pending zone."},
  {id:"park", n:"The Park Attack",
   set:{mode:"split", A:3, R:2, budget:5},
   d:"5 spaces in total, split between assessment and results-pending however you like — move one and the other follows."},
  {id:"rooms", n:"8 rooms + 10 chairs",
   set:{mode:"split", A:8, R:10, fastDischarge:true, roomsA:true},
   d:"The bigger footprint: assessment in a room, then a second area of 10 chairs."},
  /* Blake's proposal, on the SAME ten spaces as the 6+4 split and the 10 pooled, so the only
     thing that differs between the three is the rule for who goes where. */
  {id:"blake", n:"The Blake",
   // ⚠ carries bedIntp explicitly: a preset is a FULL setting, and arriving on a pre-2026-08-22
   // link leaves the criterion off, so without this "The Blake" would silently be his layout
   // without his rule. The exclusion list itself is restored by the preset handler below.
   set:{mode:"bedfirst", A:6, R:4, bedIntp:true},
   d:"6 rooms, 4 overflow chairs. A room is the default; chairs are used only once the rooms are full, and the patients who must have a room never get a chair."},
  {id:"sorted", n:"Sorted at the door",
   set:{mode:"stream", A:3, R:7, bedIntp:true, bedGrp:true},
   d:"3 rooms and 7 chairs, kept apart: a patient is sent to one side at the door and neither side lends to the other."},
  {id:"six", n:"Group consensus — 6, split",
   set:{mode:"split", A:4, R:2, budget:6},
   d:"6 spaces, divided. Which split is best depends entirely on the assessment time — move that slider and watch the best split move with it."}
];
// whole DAYS now, not evenings — the window can sit anywhere, so the day is the only
// denominator that does not change meaning when you move it
const LEVELS = [
  {n:"A quiet day",   pts:D.day["10"], d:"1 day in 10 is quieter"},
  {n:"A typical day", pts:D.day["50"], d:"half of days are quieter"},
  {n:"A busy day",    pts:D.day["75"], d:"1 day in 4 is busier"},
  {n:"A heavy day",   pts:D.day["90"], d:"1 day in 10 is busier"}
];
// ⚠ NO TARGET, DELIBERATELY. This carried a 15-minute pass/fail bar, inherited from the scoping
// deck, and there is nothing behind it — no measurement here says a patient cannot wait 30
// minutes or an hour. A bar drawn at an arbitrary number turns every comparison into a verdict
// against it. The page reports how long people wait and how many are turned away; what counts
// as acceptable is a judgement for the room, not a line in a chart.
const S = {mode:"split", A:6, R:4, budget:0, cyc:Math.round(D.T_A), assess:44,
           fastDischarge:false, level:1, bar:"today", start:15, len:8, bedExtra:0, bedIntp:true,
           bedGrp:true, turnRoom:10, turnChair:1, roomsA:false, loadPct:100, docs:1, ccSort:"vol",
           /* ⚠ AN ASSUMPTION, AND IT HAS TO BE. It was briefly set to 67 — roomed -> DECISION —
              on the reading that a no-test patient can only leave the assessment space once the
              call is made. Operator, 2026-08-22: they can move as soon as the ASSESSMENT is done,
              which is somewhere inside the doctor's time and is recorded nowhere. What the data
              bounds is a BAND: no earlier than the doctor arriving (~20 min after rooming), no
              later than the decision (~61). 44 sits inside it. The band is shown on screen; this
              number is the operator's to set, not the data's. */
           assessNo: 44};

/* ⚠ EVERY NUMBER THAT REACHES THE ENGINE IS CLAMPED ON THE WAY IN. Two of them arrive from
   outside this page and neither can be trusted: the '#' link (people edit them, and chat
   clients truncate them — a link cut mid-field gives A = NaN) and a shared board row (a Google
   Sheet anyone in the room can retype). A bad number there is not a wrong answer, it is a dead
   page: drawStageIdle() does `new Array(S.A)`, and new Array(NaN) — or (-3), or (6.5) — throws
   RangeError, which happened before a single button was wired, so Add / Play / Copy link were
   all inert. Limits mirror the sliders, so a clamped link lands somewhere the UI can show. */
const LIM = {A:[1,30], R:[0,16], cyc:[55,115], assess:[10,90], assessNo:[10,120],
             start:[0,23], len:[2,24], bedExtra:[0,40], turnRoom:[0,30], turnChair:[0,15], loadPct:[0,200], docs:[0,4]};
/* ⚠ ONE PLACE DECIDES WHAT A LAYOUT CAN HOLD. A divided lane splits across two sliders (14+16)
   while a pooled one has a single slider, so the same estate is not representable the same way —
   and the mode switch used to resolve that by DISCARDING the difference. It refits instead: the
   estate is the invariant, the split is not. `S.R` is 0 in a pooled lane and that is a real value,
   not a missing one, which is why LIM.R now floors at 0 (clamping it up to 1 handed a pooled lane
   an extra space every time it went through a link). */
const A_MAX = m => m && m.hasR ? 14 : LIM.A[1];
/* Every way a lane can ARRIVE — a link, a board row, a preset — goes through here, so a lane the
   sliders could not show cannot exist. Without it a hand-typed or older link lands on a layout
   whose slider caps below its own value, and the readout and the engine disagree. */
function fitLane(mode, A, R){
  const m = MODES.find(x=>x.id===mode) || MODES[0];
  if(!m.hasR) return [Math.min(A_MAX(m), Math.max(1, A)), 0];
  if(A > A_MAX(m) || R < 1) return fitEstate(m, Math.max(2, A + Math.max(0, R)));
  return [A, R];
}
function fitEstate(m, held){
  if(!m.hasR) return [Math.min(A_MAX(m), held), 0];
  const a = Math.max(LIM.A[0], Math.min(A_MAX(m), held - Math.round(held * 0.4)));
  return [a, Math.max(1, Math.min(LIM.R[1], held - a))];
}
function lim(k, v, dflt){
  /* ⚠ BLANK IS ABSENT, NOT ZERO. `+null` and `+""` are 0 — finite — so an omitted field skipped
     the default and clamped to the slider MINIMUM instead. serve_board.py stores an omitted key
     as an explicit null while Apps Script omits it, so the SAME legacy row scored 32.65 through
     one backend and 49.96 through the other, with the window collapsed to 2h. Two backends
     disagreeing about one row is the "the page and the board cannot disagree about a lane"
     promise failing at its own seam. */
  if(v === null || v === undefined || String(v).trim() === "") return dflt;
  const n = Math.round(+v);
  if(!Number.isFinite(n)) return dflt;
  return Math.min(LIM[k][1], Math.max(LIM[k][0], n));
}
// Measured: mean roomed-to-first-order is D.g.asw - D.pom (~47 on the 2026-08 cut). In the
// combined-zone layouts the patient leaves the assessment chair at that point instead of
// keeping it, so this is the natural starting value — and it is the number that decides
// whether those layouts work, which is why it is a control and not a constant.

/* ── render ──────────────────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);

function modeOf(){ return MODES.find(m=>m.id===S.mode) }

function drawModes(){
  $("modes").innerHTML = MODES.map(m=>
    `<button type="button" data-m="${m.id}" aria-pressed="${m.id===S.mode}">
       <span class="t">${m.t}</span><br><span class="s">${m.s}</span></button>`).join("");
  $("modes").querySelectorAll("button").forEach(b=>b.onclick=()=>{
    /* ⚠ THE ESTATE IS PRESERVED ACROSS A LAYOUT CHANGE. This folded R into A on the way into
       pooled and never cleared R, so clicking through the four layouts ratcheted the lane
       upward — 6+4 became 10, then 10+4, then 12+4 — and the later ones scored better simply for
       having more spaces. The whole page is "the same ten spaces, different rule"; a physician
       comparing by clicking the buttons was comparing 10 against 14. */
    ACTIVE_PRESET = null;                 // a hand-picked layout is no longer a named one
    const held = S.A + (modeOf().hasR ? S.R : 0);
    S.mode=b.dataset.m; S.budget=0; const m=modeOf();
    /* ⚠ AND IT IS PRESERVED ABOVE 14 TOO. `Math.min(LIM.A[1], held)` silently DISCARDED every
       space over 14 on the way into a pooled layout, and the reset below threw the layout away
       outright — one click from the shipped '8 rooms + 10 chairs' preset lost 4 spaces and 4
       points of score, irreversibly, which is the exact ratchet the comment above forbids in the
       other direction. A pooled layout that cannot hold the estate keeps the remainder in the
       second area rather than dropping it on the floor. */
    if(!m.hasR || !S.R) [S.A, S.R] = fitEstate(m, held);
    drawModes();drawSpaces();drawPresets();run();
  });
}

/* Text-only companion to drawSpaces, safe on every pointer move. */
function syncSpaces(){
  const m=modeOf();
  const oa=$("oA"); if(oa) oa.textContent = S.A;
  const or=$("oR"); if(or) or.textContent = S.R;
  const sa=$("sA"); if(sa && +sa.value !== S.A) sa.value = S.A;
  const sr=$("sR"); if(sr && +sr.value !== S.R) sr.value = S.R;
  const tot=$("spaceTot");
  if(tot) tot.innerHTML = `${S.A + (m.hasR?S.R:0)}${S.budget?" of "+S.budget:""}`;
}

function drawSpaces(){
  /* a named layout stops being loaded the moment the lane is edited by hand */
  const m=modeOf(), rows=[];
  rows.push(ctl("A", m.id==="pooled" ? "Spaces in the group"
                  : m.id==="bedfirst" ? "ED rooms the lane can use"
                  : m.id==="stream"   ? "Rooms — for the patients sorted to them" : "Assessment spaces",
                S.A, 1, A_MAX(m)));
  if(m.hasR) rows.push(ctl("R", m.id==="bedfirst" ? "Chairs — overflow only"
                             : m.id==="stream"   ? "Chairs — for everyone else"
                             : "Second area — results &amp; discharge pending",
                            S.R, 1, 16));
  const tot = S.A + (m.hasR?S.R:0);
  rows.push(`<div class="total"><span>Spaces in use</span><b class="num" id="spaceTot">${tot}${S.budget?" of "+S.budget:""}</b></div>`);
  /* Only a DIVIDED lane has to be asked: the rooms-first layout is rooms by definition and the
     pooled lane is chairs. It decides which turnover figure the assessment side is charged. */
  if(m.id === "split") rows.push(`<div class="seg" id="roomsASeg">
      <div class="seg-l">The assessment spaces are</div>
      <button type="button" data-ra="0" aria-pressed="${!S.roomsA}">chairs</button>
      <button type="button" data-ra="1" aria-pressed="${S.roomsA}">rooms</button></div>`);
  $("spaceCtl").innerHTML = rows.join("");
  $("spaceCtl").querySelectorAll("[data-ra]").forEach(b=>b.onclick=()=>{
    S.roomsA = b.dataset.ra === "1"; drawSpaces(); run() });
  $("spaceCtl").querySelectorAll("input").forEach(i=>{
    i.oninput=()=>{
      ACTIVE_PRESET = null;
      const k=i.dataset.k, v=+i.value;
      if(S.budget && m.hasR){                       // spend from a fixed pot: one goes up, the other down
        const other = k==="A" ? "R" : "A";
        S[k] = Math.min(v, S.budget-1);
        S[other] = S.budget - S[k];
      } else S[k]=v;
      /* ⚠ was drawSpaces() here — rebuilding the panel replaced the slider under the mouse and
         ended the drag after one step. Update the readouts in place instead; the panel is only
         rebuilt when the CONTROLS change (mode, preset, budget). */
      syncSpaces();
      requestRun();
    };
  });
  if(S.budget) $("spaceCtl").insertAdjacentHTML("beforeend",
    `<div class="hint" style="margin-top:8px">Fixed at ${S.budget} spaces — moving one takes from the
     other. <a href="#" id="unlock">Unlock the total</a> to add more.</div>`);
  const un=$("unlock"); if(un) un.onclick=e=>{e.preventDefault();S.budget=0;drawSpaces();run()};
  function ctl(k,label,val,min,max){
    return `<div class="ctl"><div class="ctl-top"><label for="s${k}">${label}</label>
      <output class="num" id="o${k}">${val}</output></div>
      <input type="range" id="s${k}" data-k="${k}" min="${min}" max="${max}" step="1" value="${val}">
</div>`;
  }
}

/* A patient needing no test occupies the assessment space for their whole visit (D.g.now measured)
   while a patient needing one leaves it after 72 — so the people who need NOTHING are 55% of the
   assessment load. Whether they can be moved on once seen is therefore a real lever, but it is
   CONDITIONAL ON SOMEWHERE TO MOVE THEM: on a typical day at assess 44, 6+4 scores 32.4 keeping
   the space against 46.7 moving them (they flood a second area that cannot hold them), while
   6+10 goes 27.0 -> 25.6. Sign-stable across seed blocks — the SIGNS are the finding, the
   figures move with every data cut.
   An earlier version of this comment claimed it was worth 11 min unconditionally — that was
   measured when such patients simply left the model. It barely touches a pooled lane, where the
   patient keeps one space either way, so the control is hidden there rather than offered as a
   lever that cannot move. */
function fdControl(){
  return `<div class="ctl"><div class="ctl-top"><label>A patient who needs no test</label></div>
    <div class="seg" role="group">
      <button type="button" data-fd="0" aria-pressed="${!S.fastDischarge}">keeps the space until they leave</button>
      <button type="button" data-fd="1" aria-pressed="${S.fastDischarge}">moves on once seen</button>
    </div>
    <div class="hint">Half of these patients get no test, so nothing in the record marks when they
      are finished being assessed. Keeping the space is what we measure today — ${D.g.now.toFixed(0)}
      minutes, longer than a test patient's ${(D.g.asw-D.pom).toFixed(0)} measured to first order
      (${D.g.asw.toFixed(0)} with the assumed ${D.pom} after it).</div></div>`;
  /* ⚠ There used to be a second slider here, "They move on after". It wrote the SAME S.assess
     as the one above — one number with two handles, and two different ranges (12-86 against
     10-90), so the controls disagreed about their own limits. The engine has a single
     assessMin, applied to test and no-test patients alike once this toggle is on. */
}

/* ⚠ BUILT ONCE PER SHAPE, THEN ONLY THE READOUTS CHANGE — same rule as drawWindow. run()
   calls this on every input, and rebuilding innerHTML replaces the very <input> the user has
   under the mouse, which ends the drag after one step. Rebuild only when the CONTROLS change
   (mode, or the no-test toggle that adds a second slider), never on a value change. */
let speedKey = null;
/* ⚠ BUILT ONCE. Same rule as every other slider on this page: re-rendering an <input> inside its
   own oninput replaces the element under the pointer and kills the drag after one step. */
let turnBuilt = false, bedxBuilt = false;
function drawTurn(){
  const host = $("turnCtl");
  if(!host) return;
  /* ⚠ a FLAG, not a DOM probe. `if(!$("trn"))` reads as "build it once", and in a browser it is —
     but the headless harness creates an element on first lookup, so the probe was always false,
     the markup was never written and the handler never wired. The sliders shipped untested for
     that reason. Same pattern as winBuilt below. */
  if(!turnBuilt){
    turnBuilt = true;
    host.innerHTML =
      `<div class="ctl"><div class="ctl-top">
         <label for="trn">Turning over a room</label><output class="num" id="trnOut"></output></div>
       <input type="range" id="trn" min="0" max="30" step="1" value="${S.turnRoom}"></div>
       <div class="ctl"><div class="ctl-top">
         <label for="trc">Turning over a chair</label><output class="num" id="trcOut"></output></div>
       <input type="range" id="trc" min="0" max="15" step="1" value="${S.turnChair}"></div>
       <div class="ctl"><div class="ctl-top">
         <label for="ldk">How much a busy department delays being seen</label>
         <output class="num" id="ldkOut"></output></div>
       <input type="range" id="ldk" min="0" max="200" step="10" value="${S.loadPct}"></div>
       <div class="ctl"><div class="ctl-top">
         <label for="dcs">Providers covering the lane</label>
         <output class="num" id="dcsOut"></output></div>
       <input type="range" id="dcs" min="0" max="4" step="1" value="${S.docs}"></div>
       <div class="hint"><b>A space is not care.</b> Taking a chair puts a patient in line for a
         person, and that line is most of what they wait: in the current pod <b>not one patient in
         746</b> was seated with every chair full, yet the middle one still waited
         <b>{{docqm}} minutes</b> to be seen. What predicts being seen late is how many were roomed
         <i>ahead</i> of you; how full the lane is predicts nothing. Each provider is modelled at
         <b>{{docmin}} minutes</b> a patient, worked back from that queue rather than assumed.
         <b>0 removes the queue</b> and scores spaces alone, as this page did before.</div>
       <div class="hint">When the rest of the department is full, patients here wait longer to be
         <b>seen</b> &mdash; and only to be seen. Split the wait apart and the whole effect sits
         before the doctor arrives (+15% per extra patient in the building); the time from the
         doctor arriving to the patient leaving moves <b>+0.5%, which is nothing</b>. Crowding does
         not slow care, it delays its start.
         <b>&#9888; It is not the doctor being pulled away.</b> This lane has a dedicated provider
         from 11:00 to 21:00, and inside those hours the effect is undiminished (+8% per patient,
         even after allowing for how busy the lane itself is). So something else shared with the
         department &mdash; nursing and room preparation are the obvious candidates, and
         documentation timing cannot be ruled out &mdash; is what actually delays the start. This
         dial reproduces that delay; it does not explain it. 100% is what today measures, 0 removes
         it.</div>`;
    $("trn").oninput = e => { S.turnRoom  = +e.target.value; syncTurn(); requestRun() };
    $("trc").oninput = e => { S.turnChair = +e.target.value; syncTurn(); requestRun() };
    $("ldk").oninput = e => { S.loadPct   = +e.target.value; syncTurn(); requestRun() };
    $("dcs").oninput = e => { S.docs      = +e.target.value; syncTurn(); requestRun() };
  }
  syncTurn();
}
function syncTurn(){
  const a=$("trnOut"), b=$("trcOut");
  if(a) a.textContent = S.turnRoom + " min";
  if(b) b.textContent = S.turnChair + " min";
  const x=$("trn"); if(x && +x.value !== S.turnRoom) x.value = S.turnRoom;
  const y=$("trc"); if(y && +y.value !== S.turnChair) y.value = S.turnChair;
  const c=$("ldkOut"); if(c) c.textContent = S.loadPct + "%";
  const z=$("ldk"); if(z && +z.value !== S.loadPct) z.value = S.loadPct;
  const d=$("dcsOut"); if(d) d.textContent = S.docs === 0 ? "none — spaces only"
    : S.docs + (S.docs === 1 ? " provider" : " providers");
  const q=$("dcs"); if(q && +q.value !== S.docs) q.value = S.docs;
}

function drawSpeed(m){
  const host = $("speedCtl");
  const key = m.id + "|" + (S.fastDischarge ? 1 : 0);   // the no-test slider exists only when on
  if(key === speedKey) return syncSpeed(m);
  speedKey = key;
  /* Bed-first holds one space for the whole visit, exactly as pooled does, so it gets the same
     pace dial. There is no assessment-move control, because nobody moves — and the one control
     the proposal really turns on, who cannot use a chair, is a LIST rather than a number, so it
     has its own panel further down beside the complaints it is built from. */
  if(m.id==="bedfirst" || m.id==="stream"){
    host.innerHTML = `<div class="ctl"><div class="ctl-top">
        <label for="cyc">How fast a space turns over</label>
        <output class="num" id="cycOut"></output></div>
      <input type="range" id="cyc" min="55" max="115" step="1" value="${S.cyc}">
      <div class="hint">Nobody is moved in this layout, so one space &mdash; room or chair &mdash;
        carries the whole visit, ${Math.round(D.hold_all)} min on average today. A pace, not a
        duration. Who needs a room is set on the complaint list below &mdash; tap <b>room</b> on a
      row &mdash; and in <b>Who needs a room</b> beneath it.</div></div>`;
    $("cyc").oninput = e => { S.cyc = +e.target.value; syncSpeed(m); requestRun() };
    return syncSpeed(m);
  }
  if(m.id==="pooled"){
/* ⚠ This dial is a PACE, not a duration. It scales the measured service times by
       cyc/T_A; the space is actually held for the whole visit, which is ~D.hold_all at
       today's pace, not S.cyc. Labelling it "time a space is tied up: 76 min" was wrong by
       about 50 minutes and steered one of the three layouts the room is choosing between. */
    const pct = Math.round(100 - 100*S.cyc/D.T_A);
    host.innerHTML = `<div class="ctl"><div class="ctl-top">
        <label for="cyc">How fast a space turns over</label>
        <output class="num" id="cycOut"></output></div>
      <input type="range" id="cyc" min="55" max="115" step="1" value="${S.cyc}">
      <div class="hint">Nobody moves in this layout, so one space carries the whole visit &mdash;
        ${Math.round(D.hold_all)} min on average today. This dial runs that faster or slower; it is
        a pace, not a duration.</div></div>`;
    $("cyc").oninput = e => { S.cyc = +e.target.value; syncSpeed(m); requestRun() };
    return syncSpeed(m);
  }
  host.innerHTML = `<div class="ctl"><div class="ctl-top">
      <label for="asx">Assessment &mdash; a patient needing a test</label>
      <output class="num" id="asxOut"></output></div>
    <input type="range" id="asx" min="10" max="90" step="1" value="${S.assess}">
    <div class="hint">How long a patient keeps an assessment space before moving to the second
      area. Measured today, a test patient's first order lands
      ${(D.g.asw-D.pom).toFixed(0)} min after rooming; the ${D.g.asw.toFixed(0)}-min reference
      adds an <b>assumed</b> ${D.pom} min after the order. Neither is a decision anyone made, and
      neither exists at all for the half who need no test. It is the number to argue about: the
      best split follows it.
      <span id="asxBoth"></span></div></div>`
    /* The no-test half is its own control, and only where it can bite: it does nothing unless
       patients actually move on, so it is drawn under the fastDischarge toggle rather than beside
       the slider it looks like. Half the lane is no-test, and on a 6+4 lane this number moves the
       score further than any layout choice does — 70.0 at 5 min to 21.0 if they never move. */
    + fdControl()
    + (S.fastDischarge ? `<div class="ctl"><div class="ctl-top">
        <label for="asn">Assessment &mdash; a patient needing none</label>
        <output class="num" id="asnOut"></output></div>
      <input type="range" id="asn" min="10" max="120" step="1" value="${S.assessNo}">
      <div class="hint">Nothing records this one, but the data brackets it. A patient who needs no
        test waits <b>${Math.round(D.g.rd)} min</b> for a doctor, and the call is made
        <b>${Math.round(D.g.dd)} min</b> after that. Their assessment is finished somewhere in
        between &mdash; they can move to another area from that moment, well before the decision
        &mdash; so this dial belongs in the band
        <b>${Math.round(D.g.rd)}&ndash;${Math.round(D.g.rd + D.g.dd)} min</b>. It follows the
        complaints you accept, whose doctor-time runs
        ${Math.round(Math.min(...CC.filter(x=>!x.me).map(x=>x.dd)))}&ndash;${Math.round(Math.max(...CC.filter(x=>!x.me).map(x=>x.dd)))}
        min, so it sets the AVERAGE patient. <b>They are ${Math.round(100*(1-D.shr))}% of the
        lane.</b> Moving them out early is not free: they fill the second area, and a patient who
        cannot move stays in the assessment space, holding both.</div></div>` : ``);
  $("asx").oninput = e => { S.assess = +e.target.value; syncSpeed(m); requestRun() };
  if($("asn")) $("asn").oninput = e => { S.assessNo = +e.target.value; syncSpeed(m); requestRun() };
  syncSpeed(m);
}

/* The cheap half: text only, safe to call on every pointer move. */
function syncSpeed(m){
  const an=$("asnOut"); if(an) an.textContent = S.assessNo + " min";
  const ai=$("asn"); if(ai && +ai.value !== S.assessNo) ai.value = S.assessNo;
  if(m.id==="bedfirst" || m.id==="stream"){
    const pct = Math.round(100 - 100*S.cyc/D.T_A);
    const o = $("cycOut");
    if(o) o.textContent = pct===0 ? "today's pace" : (pct>0 ? pct+"% faster" : (-pct)+"% slower");
    const c = $("cyc"); if(c && +c.value !== S.cyc) c.value = S.cyc;
    return;
  }
  if(m.id==="pooled"){
    const pct = Math.round(100 - 100*S.cyc/D.T_A);
    const o = $("cycOut");
    if(o) o.textContent = pct===0 ? "today's pace" : (pct>0 ? pct+"% faster" : (-pct)+"% slower");
    const s = $("cyc"); if(s && +s.value !== S.cyc) s.value = S.cyc;   // a loaded row moved it, not a drag
    return;
  }
  const o = $("asxOut"); if(o) o.textContent = S.assess + " min";
  const s1 = $("asx");  if(s1 && +s1.value !== S.assess) s1.value = S.assess;
  const both = $("asxBoth");
  if(both) both.textContent = S.fastDischarge
    ? " The half who need no test have their own dial below."
    : "";
}

function drawPresets(){
  $("presets").innerHTML = PRESETS.map(p=>
    `<button type="button" data-p="${p.id}" aria-pressed="${ACTIVE_PRESET === p.id}"
       ><span class="t">${p.n}</span><br>
       <span class="s">${p.d}</span></button>`).join("");
  $("presets").querySelectorAll("[data-p]").forEach(btn=>btn.onclick=()=>{
    const p=PRESETS.find(x=>x.id===btn.dataset.p); ACTIVE_PRESET = p.id;
    S.budget=0; Object.assign(S,p.set);
    // BEDPICK lives outside S, so Object.assign cannot carry it — the same class of bug the
    // board-row loader has hit twice. A preset is a full setting, so it resets the list too.
    if(p.set.mode === "bedfirst" || p.set.mode === "stream") BEDPICK = new Set(BED_IDS);
    if(p.set.roomsA === undefined) S.roomsA = false;   // a preset is a FULL setting
    drawModes(); drawSpaces(); run();
  });
}

/* ── leaderboard ─────────────────────────────────────────────────────────────
   Two stores, same interface. If a shared board answers at /board on this origin — i.e. the
   page is being served by serve_board.py on someone's machine — every entry goes there and
   everyone in the room sees one list. Otherwise it falls back to this browser's own storage,
   so the GitHub Pages copy still works exactly as before. The page never blocks on the
   network: a shared board that stops answering degrades to the local one rather than hanging. */
const LB_KEY  = "chairlab.board.v1";
const API_KEY = "chairlab.endpoint.v1";
let SHARED = false, cache = [], API = null;

/* ⚠ GUARD THE SHAPE, NOT JUST THE PARSE. The try/catch caught bad JSON but not bad CONTENT, and
   drawBoard runs inside run() — so a single `[null]` row threw on every recompute and, because it
   is stored, survived reload: the page stayed dead until site data was cleared by hand. */
const localBoard = () => { try{
    const b = JSON.parse(localStorage.getItem(LB_KEY) || "[]");
    return wellFormed(b);
  }catch(e){ return [] } };
const saveLocal  = b => { try{ localStorage.setItem(LB_KEY, JSON.stringify(b.slice(-40))) }catch(e){} };
/* ⚠ THE SHAPE FILTER GUARDS BOTH STORES. It was added to localBoard() only, leaving the SHARED
   path — the more exposed one, since one bad row reaches every reader and drawBoard runs inside
   run() — taking whatever `cache` held. Neither shipped backend can produce a malformed row, but
   a hand-edited board.json or any third-party Apps Script accepted by the ?board= regex can. */
const wellFormed = b => Array.isArray(b)
  ? b.filter(r => r && typeof r === "object" && r.cfg && typeof r.cfg === "object") : [];
const board      = () => wellFormed(SHARED ? cache : localBoard());

// The endpoint can arrive three ways, in this order: a ?board= link (so only ONE person ever
// sets it up and everyone else just follows their link), whatever was saved here before, or a
// same-origin /board when the page is being served by serve_board.py on the local network.
/* The group's shared board, baked in so the plain URL works — no ?board= to paste or lose.
   It is a bearer address, not a credential: it already travels in every link anyone forwards,
   and it reaches staff names + chair layouts only, never patient data. ?board= still wins, so
   a second group can run its own board off the same page. */
const DEFAULT_BOARD = "https://script.google.com/macros/s/AKfycbx91tZp5wYvxwMoGJhMV2fnHUrV7P6uCo-TrIU8orxauPGErNzqYkKV6fwLWXM6auKC/exec";
/* ⚠ EVERY BOARD-SUPPLIED STRING GOES THROUGH HERE. Rows are typed by other people and rendered
   into innerHTML; nothing escaped them, and `<img src=x onerror=...>` is 28 characters, which is
   exactly the name cap the Apps Script enforces — so it survives intact and runs for everyone who
   opens the leaderboard. The board URL gets forwarded around a department, so one row reaches
   every reader and can rewrite the scores they are deciding on. */
/* ⚠ A HUNG REQUEST IS THE LIKELIEST FAILURE, AND IT WAS THE ONE NOT HANDLED. Both fetches
   degrade carefully on a COMPLETED failure — probe falls back to the local board, a failed push
   keeps the lane in this browser and says so. Neither had a timeout, so an Apps Script cold
   start, a sleeping LAN host or a captive portal completes never: the shared-board tag stays
   blank so nobody is told which board they are on, and Add appears to do nothing, for ever, with
   no message and no fallback — while the code to say exactly that sits one line away. */
const timeout = ms => { const a = new AbortController(); setTimeout(() => a.abort(), ms); return a.signal };

const esc = v => String(v ?? "").replace(/[&<>"']/g, c =>
  ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

function endpointFromEnv(){
  const q = new URLSearchParams(location.search).get("board");
  /* ⚠ AN ENDPOINT FROM A QUERY STRING IS UNTRUSTED. This adopted whatever ?board= carried, so a
     forwarded link could point the board at any host — or at a javascript:/data: URL. It must be
     an https Apps Script exec address; anything else is ignored and the default stands. */
  if(q && /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(q)) return q;
  if(q) console.warn("ignored a ?board= address that is not an Apps Script exec URL");
  try{
    const s = localStorage.getItem(API_KEY);
    // Anyone who opened the pre-2026-08-21 link had the address auto-persisted, which now reads
    // as a deliberate choice and would outlive a future redeploy. A stored copy of the CURRENT
    // default carries no information — drop it, so those browsers follow the page again.
    if(s === DEFAULT_BOARD){ localStorage.removeItem(API_KEY); return DEFAULT_BOARD }
    if(s) return s;                                                     // typed in the setup row
  }catch(e){}
  // ⚠ ONLY PROBE SOMEWHERE A BOARD COULD ACTUALLY BE. The README tells people they can open
  // index.html straight off disk with no server — and on file:// the relative "board" fetch is
  // blocked by the URL scheme, so that reader got a red console error and a leaderboard that
  // announced itself "unreachable" when there was nothing to reach. No endpoint is the honest
  // state there: this browser only.
  return location.protocol === "https:" ? DEFAULT_BOARD
       : location.protocol === "http:"  ? "board"
       : null;
}

async function probeShared(explicit){
  API = explicit === undefined ? endpointFromEnv() : (explicit || null);
  if(!API) return markShared();
  try{
    const r = await fetch(API, {cache:"no-store", redirect:"follow", signal: timeout(8000)});
    if(!r.ok) throw 0;
    const d = await r.json();
    if(!Array.isArray(d)) throw 0;
    cache = d; SHARED = true; drawBoard();
  }catch(e){ SHARED = false; }
  markShared();
}

function markShared(){
  const n=$("sharedTag"); if(!n) return;
  n.textContent = SHARED ? "shared board — everyone using this link sees the same list"
                : API ? "shared board unreachable — using this browser only"
                      : "saved in this browser only";
}

async function pushShared(entry){
  try{
    // text/plain deliberately: a JSON content-type makes the browser send a CORS preflight,
    // which an Apps Script web app cannot answer, and the POST would fail before arriving.
    const r = await fetch(API, {signal: timeout(12000),
      method:"POST", headers:{"Content-Type":"text/plain;charset=utf-8"},
                                body: JSON.stringify(entry), redirect:"follow"});
    if(!r.ok) return false;
    const d = await r.json();
    if(!Array.isArray(d)) return false;
    cache = d; return true;
  }catch(e){ return false }
}

function setEndpoint(url){
  url = (url||"").trim();
  try{ url ? localStorage.setItem(API_KEY, url) : localStorage.removeItem(API_KEY) }catch(e){}
  // Drop ?board= from the address bar too. Without this, clearing the endpoint looks broken:
  // the next probe reads the parameter still sitting in the URL and rejoins the board.
  if(!url && new URLSearchParams(location.search).has("board")){
    const u = new URL(location.href); u.searchParams.delete("board");
    history.replaceState(null, "", u.pathname + u.search + u.hash);
  }
  SHARED = false; cache = []; probeShared(url);
  drawBoard();
}

/* One board row, read back into a lane this page can actually run. ⚠ SCORING AND LOADING MUST
   READ A ROW THE SAME WAY. The load button used to Object.assign(cfg) straight into S, which
   left S.start/S.len untouched for a pre-window row — so the row was RANKED as the original
   15:00-23:00 lane and LOADED as whatever window you happened to be looking at. Both go through
   here now. Numbers are clamped for the reason at LIM: a row is a spreadsheet cell someone in
   the room can retype, and a blank or a typo must not reach the engine as NaN. */
function sane(cfg){
  const m = MODES.some(x=>x.id===cfg.mode) ? cfg.mode : MODES[0].id;   // 'zone'/'rooms' retired
  const [fA, fR] = fitLane(m, lim("A",cfg.A,6), lim("R",cfg.R,4));  // same rule as the link path
  return {mode:m, A:fA, R:fR,
          cyc:lim("cyc",cfg.cyc,Math.round(D.T_A)), assess:lim("assess",cfg.assess,44),
          fastDischarge: cfg.fastDischarge===true,
          /* A row saved before bed-first existed has neither, and was not that layout anyway.
             `bedcc` undefined means "Blake's list as the data can see it", which is what
             evaluate() assumes for it too — the same contract cc has. */
          /* ⚠ null IS ABSENT HERE TOO. The lim() fix closed this for every NUMERIC field, but cc
             and bedcc are strings and never go through lim() — and they carry the same
             `undefined` = "the default" contract. serve_board.py writes an explicit JSON null for
             any key the posting page omitted while Apps Script omits it, so the same legacy row
             read `null`, and String(null).split(".") is ["null"] -> [NaN] -> a criteria set that
             matches NO complaint. The row then scores as a lane that takes nobody: 49.96, the
             do-nothing baseline, against a true 27.53. bedcc is worse because it is silent —
             29.38 against 29.87, and the load button hands back an empty room list. */
          /* ⚠ a row saved BEFORE this existed was scored without the stretch, so it must keep
             being scored without it — defaulting to 100 would silently re-rank other people's
             lanes under an effect they never chose. New rows always carry the field. */
          loadPct: lim("loadPct", cfg.loadPct, 0),
          /* a row saved before the provider queue existed was scored without it — same rule */
          docs: lim("docs", cfg.docs, 0),
          bedcc: cfg.bedcc ?? undefined, bedExtra: lim("bedExtra", cfg.bedExtra, 0),
          /* A row saved before the interpreter criterion existed was scored without it, so it
             must keep being scored without it — defaulting to true would silently re-rank other
             people's lanes under a rule they never chose. New rows always carry the field. */
          bedIntp: cfg.bedIntp === undefined ? false : cfg.bedIntp === true,
          /* Same rule as bedIntp: a row saved before these existed was scored without them, so it
             keeps being scored without them. Turnover defaults to ZERO here and 10/1 in live
             state — those are not in conflict, they are the two different questions "what did
             this row mean when it was saved" and "what should a new lane start at". */
          bedGrp: cfg.bedGrp === true, roomsA: cfg.roomsA === true,
          // a row saved before the split existed was scored with ONE assessment time for both
          assessNo: lim("assessNo", cfg.assessNo, lim("assess", cfg.assess, 44)),
          turnRoom: lim("turnRoom", cfg.turnRoom, 0), turnChair: lim("turnChair", cfg.turnChair, 0),
          bedShare: cfg.bedcc === undefined ? cfg.bedShare : undefined,
          // entries saved before the window was adjustable ran the original 15:00-23:00 lane
          start:lim("start",cfg.start,15), len:lim("len",cfg.len,8), cc:cfg.cc ?? undefined};
}
/* ⚠ A ROW IS ONLY RE-SCORED WHEN ITS ANSWER CAN HAVE CHANGED. Each call simulates 600 days x 4 seeds
   (~13 ms), and drawBoard() re-runs EVERY row — a board that has collected a hundred lanes over
   a few sessions froze the page for over a second each time the day or the bar moved. Only the
   row, the day and the bar are inputs, so the result keys on exactly those. */
const scoreCache = new Map();
function scoreOf(cfg, pts){
  /* ⚠ THE SAME EVENINGS THE PAGE USES. This ran 300x3 while run() ran 600x4, so one lane had two
     numbers — 29.50 on the hero card and 29.11 on the board — and since the layouts under
     discussion sit within a minute of each other, the board could rank two lanes in the opposite
     order to the page that produced them. A leaderboard whose order disagrees with the page is
     worse than a slow one. Cached per distinct lane, so a board of N rows costs N scorings once. */
  const c = {...sane(cfg), bar: S.bar, days:600, seeds:[11,12,13,14]};
  const ck = pts + "|" + S.bar + "|" + JSON.stringify(c);
  if(scoreCache.has(ck)) return scoreCache.get(ck);
  const E = evaluate(c, pts);
  const out = {cfg:c, score:E.score, lane:E.o.perArrival, div:E.o.diverted, divPct:E.o.divPct,
          worst:E.o.worst, cover:E.cover, empty:E.o.idle, spaces: c.A + (E.m.hasR?c.R:0), len: c.len,
          // a 24h lane wraps to "00-00", which reads as a zero-length window
          win: c.len>=24 ? "all day"
             : `${String(c.start).padStart(2,"0")}-${String((c.start+c.len)%24).padStart(2,"0")}`};
  scoreCache.set(ck, out);
  return out;
}

async function addEntry(){
  const who = ($("who").value||"").trim().slice(0,28);
  if(!who){ $("who").focus(); return }
  const cfg = {mode:S.mode, A:S.A, R:S.R, cyc:S.cyc, assess:S.assess, fastDischarge:S.fastDischarge,
               bedcc: BEDPICK.size ? [...BEDPICK].sort((a,b)=>a-b).join(".") : "-", bedExtra:S.bedExtra, bedIntp:S.bedIntp,
               bedGrp:S.bedGrp, turnRoom:S.turnRoom, turnChair:S.turnChair, roomsA:S.roomsA,
               /* ⚠ EVERY FIELD THE SCORE USES MUST BE WRITTEN HERE. These two were added to the
                  ENGINE and to the link and not to the board, so sane() read them as absent —
                  i.e. legacy — and every saved row was scored by the pre-provider-queue model.
                  On a busy day that made the board say a pooled-10 lane SAVES 20.4 min where the
                  page's own engine says it LOSES 3.2: the sign of the answer flipped, on the
                  artefact physicians are sent. A comment three lines below claimed "new rows
                  always carry the field"; nothing wrote it. */
               loadPct:S.loadPct, docs:S.docs,
               /* ⚠ NO bedShare HERE, DELIBERATELY. A sweep flagged that the board scores on
                  `cfg.bedShare` while addEntry never wrote it. But evaluate() honours that field
                  ONLY when `cfg.bedcc === undefined` (line ~650), i.e. for rows saved before the
                  per-complaint list existed — every new row carries bedcc, so writing it here is
                  inert. It is also a trap: that path divides by 100, and liveBedShare() already
                  returns a fraction, so a future change making it live would be 100x wrong.
                  The legacy-row discrepancy is real but confined to rows nobody can create now. */
               assessNo:S.assessNo,
               cc: PICK.size ? [...PICK].sort((a,b)=>a-b).join(".") : "-", start:S.start, len:S.len};
  const entry = {who, cfg, at: Date.now()};
  if(SHARED){
    const ok = await pushShared(entry);
    if(!ok){ SHARED=false; markShared(); }        // shared board went away — keep playing locally
  }
  if(!SHARED){
    const b = localBoard().filter(e => !(e.who===who && JSON.stringify(e.cfg)===JSON.stringify(cfg)));
    b.push(entry); saveLocal(b);
  }
  $("who").value=""; drawBoard();
}

function drawBoard(){
  const pts = LEVELS[S.level].pts;
  // the largest layout anyone has actually proposed — a lane above it is claiming new estate
  const most = Math.max(...PRESETS.map(p => (p.set.A||0) + (p.set.R||0)));
  /* ⚠ The score prices patients, not real estate: a lane can always improve by claiming
     more spaces, and the sliders reach far past anything on offer. Rather than invent a cap
     (the layouts under discussion run 5, 6, 10 and 18 spaces — there is no single estate to
     cap at), spaces gets its own column and breaks ties, so a bigger lane is never free. */
  const rows = board().map(e => ({...e, ...scoreOf(e.cfg, pts)}))
                      .sort((x,y)=> x.score-y.score || x.spaces-y.spaces || x.len-y.len);
  $("boardBody").innerHTML = rows.length ? rows.map((r,i)=>{
    // r.cfg is the SANITISED cfg scoreOf ran — a legacy 'zone' row must not print a shape its
    // own score was never computed from
    const shape = r.cfg.mode==="pooled" ? `${r.cfg.A} pooled`
                : r.cfg.mode==="bedfirst" ? `${r.cfg.A} rooms + ${r.cfg.R} chairs`
                : r.cfg.mode==="stream" ? `${r.cfg.A} rooms + ${r.cfg.R} chairs, apart`
                : `${r.cfg.A}+${r.cfg.R}`;
    const big = r.spaces > most;
    return `<tr><td class="num">${i+1}</td><td>${esc(r.who)}</td>
      <td>${shape}</td>
      <td class="num${big?" warn":""}">${r.spaces}</td>
      <td class="num">${r.win}<span class="sub"> · ${r.len}h</span></td>
      <td class="num"><b>${r.score.toFixed(1)}</b></td>
      <!-- ⚠ threshold matches the hero card. It was <0.999, which flagged every lane that did
           not run 24 hours: the scoped 15-23 lane tops out at 49% by construction, so the
           colour fired on every realistic row and carried no information. -->
      <td class="num${r.cover<0.2?" warn":""}">${Math.round(100*r.cover)}%</td>
      <td class="num">${r.empty?"—":r.worst.toFixed(0)}</td>
      <td class="num${r.divPct>2?" warn":""}">${r.div.toFixed(1)}</td>
      <td><button type="button" class="mini" data-load="${i}">load</button></td></tr>`;
  }).join("") : `<tr><td colspan="10" class="empty">Nothing saved yet. Build a lane you like, put your
                 name in and add it — the board ranks on delay per arriving patient.</td></tr>`;
  /* ⚠ ROW IDENTITY IS THE RENDERED POSITION, NOT `at`. `at` is not unique by construction —
     shared-board.gs does `Number(r[7]) || 0`, so every blank or retyped timestamp cell collapses
     to 0 — and this looked the row up with `.find(x => x.at === ...)`, which returns the FIRST
     match. Click the second row sharing a timestamp and you silently loaded the first one's lane,
     with the shape column above still reading the lane you asked for. `rows` is the array this
     same render just drew, so the index cannot point anywhere else. */
  $("boardBody").querySelectorAll("[data-load]").forEach(btn=>btn.onclick=()=>{
    const e = rows[Number(btn.dataset.load)]; if(!e) return;
    /* ⚠ sane() IS THE ONLY READING OF A ROW. It clamps, it falls back to split for a legacy
       'zone'/'rooms' row (modeOf() returning undefined killed drawSpaces and then every
       subsequent run() until reload), and it supplies the 15:00-23:00 window a pre-window row
       was scored with. This handler used to do none of that on its own. */
    const c = sane(e.cfg);
    S.budget=0; Object.assign(S, c);
    /* ⚠ The criteria live in PICK, not in S, so Object.assign cannot carry them — loading a row
       used to keep whichever complaints the CURRENT user had selected, and the lane you got back
       was not the lane that was scored. An entry with no cc at all is a pre-criteria row: it ran
       on everyone, which is what `evaluate` assumes for it too. An entry with cc:"" is NOT that
       row — it is a lane that was deliberately given no complaints, and evaluate scores it as
       taking nobody. Reading "" as everyone here handed back a different lane than the one
       ranked above it. */
    PICK = c.cc === "-" ? new Set()
         : c.cc === undefined ? new Set(CC.map(x=>x.i))
         : new Set(String(c.cc).split(".").filter(v=>v!=="").map(Number));
    /* ⚠ AND THE EXCLUSION LIST, for exactly the same reason — it lives in BEDPICK, not in S, so
       Object.assign cannot carry it either. Without this the row came back scored on its own
       list but DISPLAYING whichever list you happened to have, which is the same class of bug
       the criteria had. Undefined means a row from before the list existed: Blake's default,
       which is what evaluate() assumes for it too. */
    BEDPICK = c.bedcc === "-" ? new Set() : c.bedcc === undefined ? new Set(BED_IDS) : idSet(c.bedcc);
    S.bedIntp = c.bedIntp === true; S.bedGrp = c.bedGrp === true; S.roomsA = c.roomsA === true;
    drawModes(); drawSpaces(); drawWindow(); run();
  });
  $("boardNote").innerHTML = `Scored on ${LEVELS[S.level].n.toLowerCase()} — ${pts} patients. `
    + `<b>Lowest score wins</b>: it is minutes of delay, so the best lane is the one that adds `
    + `the fewest. Changing nothing scores `
    + `<b class="num">${(BARS[S.bar]||BARS.today).mean.toFixed(1)}</b>. `
    + `The score charges for patients, not for space or for open hours — a lane wins by `
    + `serving more of the day, so compare lanes at the same spaces and the same window. `
    + `Anything above ${most} spaces is asking for more room than any option on the table.`;
}

/* ── shareable setup ─────────────────────────────────────────────────────── */
/* ⚠ THE CRITERIA TRAVEL TOO. The hash carried nine numbers and not PICK, so 'Copy link to
   this setup' delivered a narrowed lane as an everyone-lane — same layout, different numbers —
   and a plain refresh after narrowing quietly reset the criteria. Field 10 is the complaint ids
   joined by '.', appended only when narrowed so untouched links keep their old shape. */
function hashState(){
  const c = [S.mode,S.A,S.R,S.cyc,S.assess,S.fastDischarge?1:0,S.level,S.start,S.len];
  /* Field 10 is the criteria and field 11 the bed-required share. The share only rides along in
     the layout that has one, and an empty field 10 holds its place when nothing was narrowed —
     so a link from any other layout keeps the shape it has always had. */
  // fields 10-12: criteria, the bed-required list, the residual share. Only the layout that has
  // an exclusion list carries one, and an empty field holds its place so older links still parse.
  /* ⚠ FIXED WIDTH FROM 2026-08-22. Fields 9-13 used to be written ONLY when they applied — the
     criteria only when narrowed, the bed block only in a bed layout — so a plain split lane wrote
     13 fields and the reader, which assumed 14, took field 9 (the turnover minutes) as the
     CRITERIA LIST. A default lane came back as "Breathing Difficulty only", scoring 49.5 against
     a 50.0 bar: the page told a physician the fast track was worthless. And run() writes the hash
     on every recompute, so a plain refresh did it, not just a shared link.
     Every field is written now, empty where it does not apply, and the reader indexes a known
     layout. Cheap in characters, and there is no arithmetic left to get wrong. */
  /* ⚠ "-" IS "NONE", "" IS "THE DEFAULT". An empty Set joins to "", which the reader already
     treats as "not narrowed" — so clearing the criteria, or clearing the room list, could not be
     shared, saved or even survive a refresh: run() rewrites the hash on every recompute, and the
     lane silently reverted to everyone. Pricing Blake's rule by clearing the list is one of the
     things this page is FOR. */
  c.push(PICK.size === 0 ? "-" : PICK.size < CC.length ? [...PICK].sort((x,y)=>x-y).join(".") : "");
  c.push(BEDPICK.size === 0 ? "-" : [...BEDPICK].sort((x,y)=>x-y).join("."));   // 10 room list
  c.push(String(S.bedExtra));                                                  // 11
  c.push(S.bedIntp ? "1" : "0");                                               // 12
  c.push(S.bedGrp ? "1" : "0");                                                // 13
  c.push(String(S.turnRoom));                                                  // 14
  c.push(String(S.turnChair));                                                 // 15
  c.push(S.roomsA ? "1" : "0");                                                // 16
  c.push(String(S.assessNo));                                                  // 17
  c.push(String(S.loadPct));                                                   // 18
  c.push(String(S.docs));                                                      // 19
  return c.join(",");
}
function toHash(){
  const c = hashState();
  // carry the shared board along, so a colleague opening this link is joined to it automatically
  const q = API && API!=="board" && API!==DEFAULT_BOARD ? "?board="+encodeURIComponent(API) : "";
  return location.origin + location.pathname + q + "#" + encodeURIComponent(c);
}
function fromHash(){
  /* ⚠ decodeURIComponent THROWS on a stray '%'. The hash is percent-encoded, so a chat client
     that truncates a long link mid-escape hands back exactly that — and an uncaught throw here
     kills the page before any handler is wired. Fall back to the raw text: a lane that parses
     wrong then clamps is recoverable, a page that never loads is not. */
  let h;
  try{ h = decodeURIComponent(location.hash.slice(1)) }
  catch(e){ h = location.hash.slice(1) }
  if(!h) return;
  const p = h.split(","); if(p.length<7) return;
  if(!MODES.some(m=>m.id===p[0])) return;
  /* ⚠ 8-field links from the retired-target era are [mode..fd, TARGET, level] — the old
     15-minute target sits where level now lives, and LEVELS[15] killed the page on load.
     The guard for this existed once and was dropped in the window rewrite; its comment
     outlived it. Clamp regardless: a garbage level from ANY malformed link must not brick
     a page whose first run() happens before a single handler is wired. */
  const rawLvl = p.length===8 ? +p[7] : +p[6];
  /* ⚠ ROUND, not just clamp. `level` is the one numeric field that does not go through lim(), and
     lim() is what rounds — so #...,1.5,... clamped cleanly into range and stayed FRACTIONAL.
     LEVELS[1.5] is undefined and there are 12 unguarded LEVELS[S.level] reads, so the first run()
     threw before a single handler was wired: a half-drawn page with Add, Play and Copy link all
     dead and no visible error. Exactly the failure the comment above commemorates — that guard
     caught the out-of-RANGE case and not the wrong-TYPE one. */
  const lvl = Number.isFinite(rawLvl) ? Math.max(0, Math.min(LEVELS.length-1, Math.round(rawLvl))) : 1;
  /* ⚠ NO TRAILING COMMENTS IN THIS LITERAL. A `// refit below` note appended to the R line
     joined onto the next one and commented out the `cyc` read — silently, for a day. It was the
     only one of 16 fields dropped, so a plain REFRESH (run() rewrites the hash constantly)
     discarded the turnover setting and rescored the lane: a tight stream lane read 47.1 min per
     arrival, and 32.9 after a reload. The refit note now lives on its own line below. */
  Object.assign(S, {mode:p[0], A:lim("A",p[1],6), R:lim("R",p[2],4),
                    cyc:lim("cyc",p[3],Math.round(D.T_A)),
                    assess:lim("assess",p[4],44), fastDischarge:p[5]==="1", level:lvl, budget:0,
                    start: p.length>=9 ? lim("start",p[7],15) : 15,
                    len:   p.length>=9 ? lim("len",p[8],8)    : 8});
  [S.A, S.R] = fitLane(S.mode, S.A, S.R);   // a lane the sliders cannot show must not exist
  /* Fixed layout since 2026-08-22 (see hashState). A link written before a field existed is
     SHORTER, and each default below is what that lane MEANT when it was written — no turnover,
     no interpreter or sibling rule, one assessment time for both halves. Read by index; the
     old read-from-the-end rule mis-parsed any link whose optional blocks were absent. */
  const at = (i, dflt) => p.length > i && p[i] !== "" ? p[i] : dflt;
  /* a link written before the load stretch existed was scored without it — see sane() */
  S.loadPct = lim("loadPct", at(18, 0), 0);
  S.docs    = lim("docs",    at(19, 0), 0);
  /* ⚠ an empty criteria field means EVERY complaint, so it must RESET PICK, not leave it. A link
     is a full setting, like a preset — landing on an unnarrowed link while narrowed kept the old
     narrowing and scored a lane the link did not describe. */
  PICK = at(9, "") === "-" ? new Set()
       : at(9, "") !== ""   ? new Set(String(p[9]).split(".").filter(v=>v!=="").map(Number))
                            : new Set(CC.map(x=>x.i));
  BEDPICK    = at(10, "") === "-" ? new Set() : at(10, "") !== "" ? idSet(p[10]) : new Set(BED_IDS);
  S.bedExtra = lim("bedExtra",  at(11, 0), 0);
  S.bedIntp  = at(12, "0") === "1";
  S.bedGrp   = at(13, "0") === "1";
  S.turnRoom  = lim("turnRoom",  at(14, 0), 0);
  S.turnChair = lim("turnChair", at(15, 0), 0);
  S.roomsA    = at(16, "0") === "1";
  /* ⚠ lim() must not be handed a null: +null is 0, which is finite, so it clamps to the FLOOR
     rather than reaching the default — every link, old or new, came back with a 10-minute no-test
     assessment instead of 44. */
  S.assessNo  = lim("assessNo", at(17, S.assess), S.assess);
}

/* ⚠ BUILT ONCE, THEN ONLY THE READOUTS CHANGE. These sliders sit next to the chart they drive,
   so they are dragged rather than clicked — and re-rendering the input inside its own oninput
   handler destroys the element mid-drag, which stops the drag dead after one step. run() calls
   syncWindow(), never drawWindow(). */
let winBuilt = false;
function drawWindow(){
  if(winBuilt) return;
  $("winCtl").innerHTML = `
    <div class="wctl">
      <div class="ctl"><div class="ctl-top"><label for="wstart">Opens at</label>
        <output class="num" id="wstartOut"></output></div>
        <input type="range" id="wstart" min="0" max="23" step="1" value="${S.start}"></div>
      <div class="ctl"><div class="ctl-top"><label for="wlen">Open for</label>
        <output class="num" id="wlenOut"></output></div>
        <input type="range" id="wlen" min="2" max="24" step="1" value="${S.len}"></div>
    </div>`;
  $("wstart").oninput = e => { S.start = +e.target.value; syncWindow(); requestRun() };
  $("wlen").oninput   = e => { S.len   = +e.target.value; syncWindow(); requestRun() };
  winBuilt = true;
}

function syncWindow(){
  const end = (S.start + S.len) % 24;
  $("wstartOut").textContent = String(S.start).padStart(2,"0") + ":00";
  $("wlenOut").innerHTML = `${S.len} h &nbsp;&rarr;&nbsp; ${String(end).padStart(2,"0")}:00`;
  const a=$("wstart"), b=$("wlen");
  if(a && +a.value !== S.start) a.value = S.start;      // a preset or a link moved it, not a drag
  if(b && +b.value !== S.len)   b.value = S.len;
}

// The arrival curve for the whole day with the lane's hours picked out. This is the chart the
// window control exists for: it shows at a glance that a window can be long and still miss the
// need, or short and sit right on it.
function drawArrivals(E){
  const fac = LEVELS[S.level].pts / D.day_mean;
  const arr = D.lam24.map(v=>v*fac);
  const top = Math.max(...arr) * 1.18;
  const inWin = new Set(E.hours);
  const B = BARS[S.bar] || BARS.today;
  $("arrBars").innerHTML = arr.map((v,h)=>
    `<div class="abar${inWin.has(h)?" on":""}" title="${h}:00 — ${v.toFixed(1)} arrivals, ${B.m24[h].toFixed(0)} min wait today">
       <div class="afill" style="height:${Math.max(1,100*v/top)}%"></div></div>`).join("");
  $("arrHours").innerHTML = arr.map((_,h)=>
    `<span class="${inWin.has(h)?"on":""}">${h%3===0?h:""}</span>`).join("");
  $("arrNote").innerHTML = `The lane is open <b>${String(S.start).padStart(2,"0")}:00</b> to
    <b>${String((S.start+S.len)%24).padStart(2,"0")}:00</b> and sees
    <b class="num">${E.hours.reduce((a,h)=>a+arr[h],0).toFixed(1)}</b> of the day's
    <b class="num">${LEVELS[S.level].pts}</b> ESI 4/5 arrivals before criteria.`;
}

/* ⚠ BLAKE'S EXCLUSION LIST, AS A LIST. It was a hard-coded array of three complaints behind a
   single "8%", which is precisely the thing his proposal says must NOT be implicit: the MD group
   has to establish and sign off on explicit chief-complaint exclusions, and you cannot sign off
   on a number. So the complaints are tickable, the four reasons no complaint can carry are
   written out beside them, and the total the simulation actually uses is shown above both. */
function drawBedList(){
  const panel = $("bedPanel");
  if(!panel) return;
  const on = S.mode === "bedfirst" || S.mode === "stream";   // the list routes both layouts
  panel.hidden = !on;
  if(!on) return;

  const fac = LEVELS[S.level].pts / D.day_mean;
  const pts = winHours().reduce((a,h)=>a + D.lam24[h]*fac, 0);
  const sel = CC.filter(x=>PICK.has(x.i)), tot = sel.reduce((a,x)=>a+x.s,0);


  const ccPart = tot ? sel.filter(x=>BEDPICK.has(x.i)).reduce((a,x)=>a+x.s,0)/tot : 0;
  const drawn = liveBedShare(), eff = bedShareDisplay(drawn, S.bedGrp);
  // count only the ticked complaints the lane ACTUALLY takes — the share already excludes the
  // others, so the sentence could read "3 complaints" while none of them was accepted
  const bedTicked = CC.filter(x => BEDPICK.has(x.i) && PICK.has(x.i)).length;
  // the interpreter term, stated on its own so the three parts can be read against each other
  const intpPart = tot && S.bedIntp
    ? sel.filter(x=>!BEDPICK.has(x.i)).reduce((a,x)=>a + x.s*(x.x!=null?x.x:D.g.interp), 0)/tot : 0;
  $("bedSum").innerHTML = `<b class="num">${Math.round(100*eff)}%</b> of the patients this lane
    accepts must have a room &mdash; <b class="num">${Math.round(100*ccPart)}%</b> from the
    ${bedTicked === 1 ? "one" : bedTicked} complaint${bedTicked===1?"":"s"} marked on the list${S.bedIntp
      ? `, <b class="num">${Math.round(100*intpPart)}%</b> needing an interpreter` : ``}${S.bedGrp
      ? `, <b class="num">${Math.round(100*(eff-drawn))}%</b> arriving with a sibling` : ``}, plus
    <b class="num">${S.bedExtra}%</b> of everyone else.
    ${S.bedExtra===0 ? `<span class="dim">Nothing is allowed yet for the reasons no complaint can
      carry &mdash; a sensitive history, a family who needs a door &mdash; so this is a floor.</span>` : ``}`;

  /* Interpreter need is not a complaint, so it is not a row in the list above — it is a
     per-patient attribute measured per complaint and applied to whoever that list leaves behind.
     Built every draw like the list itself (it is a button, not a dragged input, so rebuilding it
     is safe — the no-rebuild rule protects sliders under the pointer). */
  const intpBtn = $("bedIntpCtl");
  if(intpBtn){
    intpBtn.innerHTML = `<button type="button" class="cc${S.bedIntp?" on":""}" id="bedIntpBtn"
        aria-pressed="${S.bedIntp}">
      <span class="cc-n">Needs an interpreter</span>
      <span class="cc-m">${S.bedIntp
        ? `<b class="num">${(pts*intpPart).toFixed(1)}</b> arrive while you are open`
        : `<span class="dim">not counted &mdash; <b class="num">${Math.round(100*(tot
             ? sel.filter(x=>!BEDPICK.has(x.i)).reduce((a,x)=>a+x.s*(x.x!=null?x.x:D.g.interp),0)/tot
             : 0))}%</b> of the rest if ticked</span>`}</span></button>`;
    $("bedIntpBtn").onclick = () => { S.bedIntp = !S.bedIntp; run() };
    const gShare = (D.grp && D.grp.share) || 0;
    intpBtn.insertAdjacentHTML("beforeend",
      `<button type="button" class="cc${S.bedGrp?" on":""}" id="bedGrpBtn"
          aria-pressed="${S.bedGrp}">
        <span class="cc-n">Arrives with a sibling</span>
        <span class="cc-m">${S.bedGrp
          ? `<b class="num">${(pts*(1-Math.min(1,ccPart+intpPart))*gShare).toFixed(1)}</b> arrive while you are open`
          : `<span class="dim">not counted &mdash; <b class="num">${Math.round(100*gShare)}%</b> of the rest if ticked</span>`}</span></button>`);
    $("bedGrpBtn").onclick = () => { S.bedGrp = !S.bedGrp; run() };
  }

  /* ⚠ built once, like every other slider on this page — rebuilding it inside its own oninput
     replaces the element under the pointer and kills the drag after one step */
  if(!bedxBuilt){
    bedxBuilt = true;
    $("bedExtraCtl").innerHTML = `<div class="ctl"><div class="ctl-top">
        <label for="bedx">Plus this share of everyone else</label>
        <output class="num" id="bedxOut"></output></div>
      <input type="range" id="bedx" min="0" max="40" step="1" value="${S.bedExtra}"></div>`;
    $("bedx").oninput = e => { S.bedExtra = +e.target.value; syncBed(); requestRun() };
  }
  syncBed();
}
function syncBed(){
  const o=$("bedxOut"); if(o) o.textContent = S.bedExtra + "% of the rest";
  const b=$("bedx"); if(b && +b.value !== S.bedExtra) b.value = S.bedExtra;
}

function drawCriteria(){
  const mx = mix();
  const fac = LEVELS[S.level].pts / D.day_mean;
  const pts = winHours().reduce((a,h)=>a + D.lam24[h]*fac, 0);   // arrivals inside the hours
  /* The counts are per-day AND per-window, so both need saying once — a reader seeing "4.4"
     beside Fever cannot otherwise tell whether that is a day, a shift, or a year. */
  const hint = $("ccHint");
  if(hint) hint.innerHTML = `Counts are patients arriving between
    <b class="num">${String(S.start).padStart(2,"0")}:00</b> and
    <b class="num">${String((S.start+S.len)%24).padStart(2,"0")}:00</b>
    on ${LEVELS[S.level].n.toLowerCase()} — <b class="num">${pts.toFixed(1)}</b> in total.
    Tap a complaint to take it or leave it${BEDMODE.has(S.mode)
      ? `, and <b>room</b> to say it needs one rather than a chair` : ``}.
    <span class="dim">&ldquo;Doctor to decision&rdquo; is how long from the doctor arriving to the
    call being made, and it is shown <b>twice, for two different groups of patients</b>.
    <b>Without a test</b> (${Math.round(D.g.dd)} min on average) is the clean chair case &mdash; but
    it is a minority of the higher-volume complaints and the majority of several others &mdash;
    the test rate on each row tells you which &mdash; and which patients skip a test differs by
    complaint, so it flatters some more than others. <b>Across everyone</b> (${Math.round(D.g.ddall)} min) covers
    every patient with that complaint, but roughly half of it is time spent waiting on a result
    rather than on the doctor. Neither is the whole answer; they are side by side so you can see
    where they disagree. The long ones either way are where something is DONE &mdash; a repair, a
    wound, a treatment and a re-check. <b>Neither is the moment they can move</b>: a patient can go
    somewhere else once the assessment itself is finished, which happens inside this interval and
    is recorded nowhere. A dash means too few patients skipped a test to measure that
    complaint.</span>`;
  /* ⚠ ONE LIST, TWO DECISIONS. There were two complaint panels — take-or-leave, and
     needs-a-bed — over the same 26 rows, so in a bed layout you tapped the same complaint in two
     places to say two different things, and the two lists could silently disagree (the exclusion
     list happily showed complaints the lane did not even accept). The row carries both now: the
     row itself is take-or-leave, the chip is bed-or-chair, and the chip only exists in the
     layouts that HAVE beds. PICK and BEDPICK are untouched underneath, so the link, the board
     schema and every guard are unchanged — this is a rendering change, not a data one. */
  const bedMode = BEDMODE.has(S.mode);
  /* ⚠ ORDER ONLY. Sorting is a way of LOOKING at the list, so it touches nothing that identifies a
     complaint: the ids, PICK, BEDPICK, the link and the board are all untouched, and two people
     sorting differently are still comparing the same lane. It is deliberately NOT in the link
     either — a view preference is not part of a lane.

     ⚠ SORT ON WHAT THE ROW SHOWS. This sorted on `ddall` (every patient) while the row displayed
     `dd` (no-test only), so "fastest first" produced an order the visible column contradicted.
     Both are `dd` now, and `dd` is the right one to rank chair candidates on: 44-68% of `ddall`
     elapses before the first RESULT lands — 66-68% for finger, ankle, arm and musculoskeletal —
     so ranking on it puts the extremity complaints at the slow end and invites excluding exactly
     the patients a chair suits. `dd` is a minority of most complaints, though the majority of several, which is why the row names
     its population; the fix for two populations side by side is to label them, not to swap in a
     number that measures waiting for radiology. Rows with too few no-test patients fall back to
     the lane figure and show a dash. */
  /* ⚠ A ROW WITH NO MEASUREMENT IS NOT RANKED. Four complaints have too few no-test patients and
     fall back to the lane figure (41 min) — Ankle, Foot, Musculoskeletal and Dysuria, i.e. three
     of the five complaints this whole lab is about. Sorting them by that fallback placed them at
     ranks 11, 13 and 14 of 26, dead centre, by a number nobody measured; the row shows a dash
     while the ORDER quietly asserted a value. They now sort to the end, where the dash means
     what it says. */
  const rank = (a, b) => (a.me ? 1 : 0) - (b.me ? 1 : 0) || a.dd - b.dd;
  /* TWO POPULATIONS, TWO ORDERS, NEITHER PROMOTED. The row carries both figures because neither
     is the honest single answer, and choosing one silently went wrong twice:
       · `dd` is the doctor's time over the patients who needed NO test — the clean chair case,
         but a selected minority, and the discount against their own complaint's test patients
         runs 1.7x to 3.6x, so ranking by it partly ranks by selection intensity.
       · `ddall` has a real value for every row, but pools both populations and roughly half of
         it is time before the first result lands.
     An earlier version showed one and sorted by the other, which was simply a defect. The fix for
     two populations side by side is to name them and let the reader pick the order. */
  const order = S.ccSort === "fast"
      ? CC.slice().sort(rank)
    : S.ccSort === "fastall"
      ? CC.slice().sort((p, q) => p.ddall - q.ddall)
    : S.ccSort === "test"
      ? CC.slice().sort((p, q) => p.w - q.w || rank(p, q))
    /* ⚠ THIS ORDER USED TO BE A BARE `CC` — i.e. no sort at all, just the order data.json happens
       to carry, which ranks ids 0-23 by share and then APPENDS the two aggregate rows. So
       "Everything else (209 complaints)" at 24.2% of the lane, larger than the row at the top,
       rendered dead last. This is the order you pick to see which complaints carry the volume,
       and scanning down until the numbers get small skipped the biggest bucket on the page. */
    : CC.slice().sort((p, q) => q.s - p.s);
  $("ccList").innerHTML = order.map(x=>{
    const on = PICK.has(x.i), bed = BEDPICK.has(x.i);
    return `<div class="cc-row${on?" on":""}${bed&&bedMode?" bed":""}">
      <button type="button" class="cc" data-cc="${x.i}" aria-pressed="${on}">
        <span class="cc-n">${x.n}</span>
        <span class="cc-m"><b class="num">${(pts*x.s).toFixed(1)}</b> arrive while you are open
          · <span class="num">${Math.round(100*x.w)}%</span> need a test
          <br>doctor to decision · <span class="num">${x.me ? "&mdash;" : Math.round(x.dd)}</span>${
            x.me ? `<span class="dim"> without a test (too few to measure)</span>`
                 : ` min <span class="dim">without a test</span>`}
          · <span class="num">${Math.round(x.ddall)}</span> min <span class="dim">across everyone</span>
          </span></button>${
      bedMode ? `<button type="button" class="cc-bed" data-bed="${x.i}" aria-pressed="${bed}"
          title="${bed ? "needs a room — tap to allow a chair" : "can use a chair — tap to require a room"}"
          ${on ? `` : `disabled`}>room</button>` : ``}</div>`;
  }).join("");
  const sortSeg = $("ccSortSeg");
  if(sortSeg) sortSeg.querySelectorAll("[data-sort]").forEach(b=>{
    b.setAttribute("aria-pressed", S.ccSort === b.dataset.sort);
    b.onclick = () => { S.ccSort = b.dataset.sort; run() };
  });
  $("ccList").querySelectorAll("[data-cc]").forEach(btn=>btn.onclick=()=>{
    const i=+btn.dataset.cc; PICK.has(i)?PICK.delete(i):PICK.add(i); run();
  });
  $("ccList").querySelectorAll("[data-bed]").forEach(btn=>btn.onclick=()=>{
    const i=+btn.dataset.bed; BEDPICK.has(i)?BEDPICK.delete(i):BEDPICK.add(i); run();
  });
  $("ccSum").innerHTML = mx.share
    ? `Taking <b class="num">${(pts*mx.share).toFixed(1)}</b> of the
       <b class="num">${pts.toFixed(1)}</b> ESI 4/5 patients who arrive in the lane's hours —
       <b class="num">${Math.round(100*mx.share)}%</b> of them, of whom
       <b class="num">${Math.round(100*mx.shr)}%</b> need a test.
       <span class="dim">(The day brings ${LEVELS[S.level].pts} in total.)</span>`
    : `Nothing selected — the lane takes no one.`;
}


/* ⚠ One full recompute is ~16 ms of simulation plus a rebuild of the hero, the bars, the
   criteria list and the chart. A dragged slider fires far faster than that, so the events pile
   up and the handle stutters. Coalesce to at most one per animation frame: the readouts have
   already updated synchronously, so the slider stays glued to the pointer either way. */
let lastCritKey = null, lastBoardKey = null, lastBedKey = null;
let runQueued = false, runRaf = 0, runTimer = 0;
function requestRun(){
  if(runQueued) return;
  runQueued = true;
  /* ⚠ rAF ALONE IS NOT SAFE HERE. A hidden tab pauses rAF, so the queued recompute never fires
     and `runQueued` stays true — after which no later input schedules one either, and the page
     shows numbers that no longer match its own controls. Belt and braces: whichever of the two
     fires first does the work and cancels the other. */
  const go = () => {
    if(!runQueued) return;
    runQueued = false;
    if(runRaf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(runRaf);
    if(runTimer) clearTimeout(runTimer);
    runRaf = runTimer = 0;
    run();
  };
  if(typeof requestAnimationFrame === "function") runRaf = requestAnimationFrame(go);
  runTimer = setTimeout(go, 120);
}

function run(){
  const m=modeOf(), lvl=LEVELS[S.level];
  const cfg = {mode:S.mode, A:S.A, R:S.R, cyc:S.cyc, assess:S.assess, fastDischarge:S.fastDischarge,
               bedcc: BEDPICK.size ? [...BEDPICK].sort((a,b)=>a-b).join(".") : "-", bedExtra:S.bedExtra, bedIntp:S.bedIntp,
               bedGrp:S.bedGrp, turnRoom:S.turnRoom, turnChair:S.turnChair, roomsA:S.roomsA,
               loadPct:S.loadPct, docs:S.docs, assessNo:S.assessNo,
               cc: PICK.size ? [...PICK].sort((a,b)=>a-b).join(".") : "-", start:S.start, len:S.len, bar:S.bar};
  const E = evaluate(cfg, lvl.pts), o = E.o;
  LAST_SCORE = E.score;   // what the hero card is about to show, exposed so a guard can compare
                          // the SAVED row against it — the save path had no test at all
  drawSpeed(m); drawTurn(); drawWindow(); syncWindow();
  $("speedCtl").querySelectorAll("[data-fd]").forEach(bt=>bt.onclick=()=>{
    S.fastDischarge = bt.dataset.fd==="1"; run() });

  const winArr = E.hours.reduce((a,h)=>a + D.lam24[h]*(lvl.pts/D.day_mean), 0);
  const mins = S.len*60;
  const mx = mix();
  // what one patient demands of each side, given the assessment time the physician set
  const fPace = NOMOVE.has(m.id) ? S.cyc/D.T_A : 1;
  const perAssess = m.id==="pooled" ? D.hold_all*fPace
    : S.fastDischarge ? S.assess
    : mx.shr*S.assess + (1-mx.shr)*D.g.now*mx.fo;
  const perRes = m.id==="pooled" ? 0
    : S.fastDischarge
      ? mx.shr*(D.g.asw*mx.fa + D.g.res*mx.fr - S.assess) + (1-mx.shr)*Math.max(0, D.g.now*mx.fo - S.assess)
      : mx.shr*(D.g.asw*mx.fa + D.g.res*mx.fr - S.assess);
  /* ⚠ BED-FIRST HAS A DIFFERENT TIGHT SPOT, and reading it as two independent pools would be
     wrong in both directions. Rooms are not a stage every patient passes through — they are the
     preferred pool, so the estate is really ONE pool of A+R with a rule attached. What the rule
     adds is a second constraint on top: the bed-required share can only ever be served by the A
     rooms. Either can bind, so both are offered and the worse one is named. */
  const sides = [];
  if(m.id==="bedfirst"){
    const hold = D.hold_all*fPace, br = bedShareDisplay(liveBedShare(), S.bedGrp);   // as routed
    sides.push({n:"estate", spaces:S.A+S.R, thing:"rooms and chairs together", coming: E.accepted,
                load: E.accepted*hold/((S.A+S.R)*mins), cap: (S.A+S.R)*mins/hold});
    if(br > 0) sides.push({n:"rooms", spaces:S.A, coming: E.accepted*br,
                thing:"rooms, for the patients who cannot be put in a chair",
                load: E.accepted*br*hold/(S.A*mins), cap: S.A*mins/hold});
  } else if(m.id==="stream"){
    /* TWO POOLS, TWO LOADS, AND NEITHER RELIEVES THE OTHER. Streaming is the one layout where
       "the estate" is not a meaningful denominator: each side sees only its own share of the
       arrivals and only its own spaces, so they are sized independently and the worse one is
       named. It also read "assessment spaces" here, which is not what a stream lane has. */
    /* ⚠ the share the ENGINE routes, not the drawn share. liveBedShare() deliberately excludes
       siblings (sim() forces parties into rooms structurally), so sizing the two sides from it
       under-counts the room side — and with the sibling rule ON BY DEFAULT the banner named
       chairs as the tight spot on a lane whose rooms were the jam, directly contradicting the
       stream boards printed underneath it. */
    const hold = D.hold_all*fPace, br = bedShareDisplay(liveBedShare(), S.bedGrp);
    sides.push({n:"rooms", spaces:S.A, thing:"rooms", coming: E.accepted*br,
                load: br ? E.accepted*br*hold/(S.A*mins) : 0, cap: S.A*mins/hold});
    sides.push({n:"chairs", spaces:S.R, thing:"chairs", coming: E.accepted*(1-br),
                load: E.accepted*(1-br)*hold/(S.R*mins), cap: S.R*mins/hold});
  } else {
    sides.push({n:"assessment", spaces:S.A, thing:"assessment spaces", coming: E.accepted,
                load: E.accepted*perAssess/(S.A*mins), cap: S.A*mins/perAssess});
    if(m.hasR) sides.push({n:"results", spaces:S.R, thing:"results chairs", coming: E.accepted,
                           load: E.accepted*perRes/(S.R*mins), cap: S.R*mins/perRes});
  }
  const bind = sides.reduce((a,b)=>b.load>a.load?b:a), rho = bind.load;

  if(o.idle){
    $("load").className = "load";
    $("load").innerHTML = `The lane takes no one — check the hours and the complaints.`;
  } else {
    $("load").className = "load" + (rho>=1 ? " bad" : rho>0.85 ? " warn" : "");
    const busy = rho * bind.spaces;
    $("load").innerHTML = rho >= 1
      ? `<b>Too many patients for the ${bind.thing}.</b> While the lane is open they can get
         through about <b class="num">${bind.cap.toFixed(0)}</b> patients, and
         <b class="num">${bind.coming.toFixed(0)}</b> are coming. The queue never catches up, so
         people are still waiting when it closes.`
      : `<b>${rho > 0.85 ? `The ${bind.thing} are the tight spot.`
                         : `The ${bind.thing} fill up first.`}</b> On average
         <b class="num">${busy.toFixed(1)}</b> of your <b class="num">${bind.spaces}</b> are in use.
         That is not <b class="num">${(bind.spaces-busy).toFixed(1)}</b> going spare — patients
         arrive in clusters, so people start waiting well before every one is taken.`;
  }

  /* ⚠ TWO BOARDS FOR TWO STREAMS. With pools that never lend to each other, one row of averages
     describes neither side: the whole point of the layout is that one can jam while the other
     idles, and that is exactly what an average erases. The lane-wide score stays — it is what the
     board ranks on and what charges the patients the lane turns away — and each side then gets
     its own line. Only in `stream`; bed-first is a preference, not a partition, so its pools are
     not separate queues and splitting them would invent a distinction the model does not make. */
  const twoStream = m.id === "stream" && o.streams && !o.idle;
  $("streamBoards").innerHTML = !twoStream ? `` : [
    ["Rooms",  o.streams[1], S.A, "sorted to a room"],
    ["Chairs", o.streams[0], S.R, "everyone else"]
  ].map(([name, st, spaces, who]) => `<div class="strm">
      <div class="strm-h">${name} <span class="dim">· ${spaces} space${spaces===1?"":"s"} · ${who}</span></div>
      <div class="strm-row">
        <div><b class="num">${st.n.toFixed(1)}</b><span>arrive here</span></div>
        <div><b class="num">${st.wait.toFixed(1)}</b><span>min each, waiting for a space</span></div>
        <div><b class="num">${st.diverted.toFixed(1)}</b><span>still waiting at close</span></div>
        <div><b class="num">${st.peak.toFixed(1)}</b><span>at once at its busiest, of ${spaces}</span></div>
      </div></div>`).join("")
    + `<div class="strm-note">Neither side lends to the other, so these are two queues, not one.
       A side that is idle while the other is jammed is the arrangement, not a rounding error.</div>`;

  $("hero").innerHTML = [
    [`${E.score.toFixed(1)}`, `minutes per ESI 4/5 patient arriving that day, lower is better —
      against ${E.base.toFixed(1)} for ${(BARS[S.bar]||BARS.today).n}`,
      /* ⚠ NO COLOUR VERDICT. The intro says there is no pass mark, and these cards were quietly
         delivering two: green for beating today, red once more than 2% were still waiting. A
         reader who takes the intro at its word then asks what the red means, and the honest
         answer is "a threshold nobody told you about" — the same reason the 15-minute target was
         taken out. The comparison is in the words underneath, where it can be argued with. */
      ""],
    [o.idle ? "—" : `${o.perArrival.toFixed(1)}`,
     /* "the lane accepts" is arithmetically right — the denominator is every arrival into the
        lane's stream — but it reads as "got a chair", two cards from one counting who did not. */
     o.idle ? "nobody in the lane"
            : "minutes per patient the lane sees, including those it sends away", ""],
    [`${Math.round(100*E.cover)}%`, `of the day's ${lvl.pts} ESI 4/5 patients go through the lane`, ""],
    [o.idle ? "everyone" : `${o.diverted.toFixed(1)}`,
     o.idle ? "the lane takes nobody, so the main department sees them all"
            : "still waiting when it closes — sent to the main department", ""],
    /* Peak concurrent, not the space count: capacity is what you set aside, this is what the
       lane actually reached. They differ whenever the lane is not full at its busiest. */
    [o.idle ? "—" : `${o.peak.toFixed(1)}`,
     o.idle ? "nobody in the lane"
            : `in the lane at once at its busiest, of ${S.A + (m.hasR?S.R:0)} spaces`, ""]
  ].map(([v,k,c])=>`<div class="stat ${c}"><div class="v num">${v}</div><div class="k">${k}</div></div>`).join("");

  const top = Math.max(6, Math.ceil(o.worst*1.15));
  $("bars").innerHTML = o.byHour.map((v,i)=>`<div class="bar${v===o.worst&&v>0?" peak":""}">
        <div class="val">${v.toFixed(0)}</div>
        <div class="fill" style="height:${Math.max(1,100*v/top)}%"></div></div>`).join("");
  $("bars").style.gridTemplateColumns = `repeat(${S.len},1fr)`;
  $("hours").style.gridTemplateColumns = `repeat(${S.len},1fr)`;
  $("hours").innerHTML = E.hours.map(h=>`<span>${h}</span>`).join("");
  drawArrivals(E);

  const _B = BARS[S.bar] || BARS.today;
  const _lo = _B.m24.indexOf(Math.min(..._B.m24)), _hi = _B.m24.indexOf(Math.max(..._B.m24));
  $("barNote").innerHTML = `Everyone the lane does not take — outside its hours or outside its
    criteria — is charged what they wait instead, by the hour they arrive:
    <b class="num">${_B.mean.toFixed(1)}</b> min across the day, best at ${_lo}:00
    (${_B.m24[_lo].toFixed(0)}) and worst at ${_hi}:00 (${_B.m24[_hi].toFixed(0)}).`;
  drawLevels(E);
  /* ⚠ Neither of these depends on the slider being dragged. drawBoard RE-SIMULATES every saved
     entry (600 days x 4 seeds each) and only its day/bar can change the answer; drawCriteria rebuilds
     25 buttons and only the hours and the day move its numbers. Redrawing both on every pointer
     move was most of the stutter. Keyed, so they run when they can actually differ. */
  /* ⚠ the mode and the bed list belong in this key now. The complaint list carries the bed chips,
     so it has to redraw when the layout changes (chips appear) and when a chip is tapped — it was
     keyed on the criteria alone, and switching to a bed layout left a list with no chips at all. */
  const critKey = `${S.start}|${S.len}|${S.level}|${[...PICK].sort((x,y)=>x-y).join(".")}`
    + `|${S.mode}|${[...BEDPICK].sort((x,y)=>x-y).join(".")}|${S.ccSort}`;
  if(critKey !== lastCritKey){ lastCritKey = critKey; drawCriteria() }
  const bedKey = `${S.mode}|${critKey}|${[...BEDPICK].sort((x,y)=>x-y).join(".")}|${S.bedExtra}|${S.bedIntp?1:0}|${S.bedGrp?1:0}|${S.turnRoom}|${S.turnChair}|${S.roomsA?1:0}|${S.assessNo}|${S.loadPct}|${S.docs}`;
  if(bedKey !== lastBedKey){ lastBedKey = bedKey; drawBedList() }
  const boardKey = `${S.level}|${S.bar}`;
  if(boardKey !== lastBoardKey){ lastBoardKey = boardKey; drawBoard() }
  // any change to the lane invalidates the recorded evening — a stage showing one layout while
  // the numbers describe another is worse than no stage
  if(PLAY.trace){ PLAY.trace = null; PLAY.runs = null; PLAY.pick = 0; playPause(false); PLAY.t = 0; }
  if(!PLAY.trace){ drawStageIdle(); $("reroll").hidden = true;
    /* ⚠ ASK THE LANE, NOT THE LAST TRACE. `PLAY.expect` is written only by buildTrace(), which
       runs when someone presses Play — it starts at 0, so the first run() at load overwrote the
       caption with "Nothing is selected, so nobody arrives." while all 26 complaints were
       selected and the hero card beside it read 26.5 patients. After that it always described
       the PREVIOUS configuration. mix().share is current by construction. */
    if(mix().share < 0.002){ $("stageHint").textContent = "Nothing is selected, so nobody arrives."; }
  else $("stageHint").textContent = "The same run the numbers come from — one simulated day, replayed "
      + "on a clock. A space that looks full is full."; }
  // keep the query string — it carries ?board=, and replacing the URL with a bare hash would
  // drop the shared board from the address bar on the first render
  SELF_HASH = encodeURIComponent(hashState());
  history.replaceState(null, "", location.pathname + location.search + "#" + SELF_HASH);
}

/* ⚠ A PASTED LINK MUST LAND, even in a tab that is already open. fromHash() ran once at startup
   and nothing listened afterwards, so a colleague's lane pasted into an open tab changed the
   address bar and NOTHING else — the page went on showing the lane you already had, which is the
   worst possible failure for a tool whose whole point is comparing lanes. Sharing by pasting into
   an open tab is how these actually get passed around.
   The guard is SELF_HASH: run() rewrites the address on every recompute, and reacting to our own
   write would reset the lane mid-edit. Only a hash we did not write is treated as an arrival. */
var SELF_HASH = "", LAST_SCORE = null;   // var, not let: run() assigns it before this line is reached
addEventListener("hashchange", () => {
  const h = location.hash.replace(/^#/, "");
  if(!h || h === SELF_HASH) return;
  fromHash(); drawPresets(); drawModes(); drawSpaces(); drawWindow(); run();
});

function drawLevels(E){
  $("levels").innerHTML = LEVELS.map((l,i)=>{
    const on = i===S.level;
    return `<div class="lv" data-i="${i}" aria-current="${on}" role="button" tabindex="0">
      <div class="n">${l.n}</div><div class="d">${l.pts} ESI 4/5 patients · ${l.d}</div>
      <div class="r">${on ? E.score.toFixed(1)+" min per arrival" : "&nbsp;"}</div></div>`;
  }).join("");
  $("levels").querySelectorAll(".lv").forEach(el=>{
    const go=()=>{S.level=+el.dataset.i;run()};
    el.onclick=go; el.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();go()}};
  });
}

fromHash();
drawPresets(); drawModes(); drawSpaces(); run();
/* Two tabs. The lab is the thing; the reasoning behind it is 650 words and was sitting in the
   middle of the controls. Plain hidden/unhidden — no routing, no history, so a shared link still
   lands on the lab with its setup intact. */
(function tabs(){
  const lab=$("tabLab"), notes=$("tabNotes"), lb=$("tabLabBtn"), nb=$("tabNotesBtn");
  if(!lab || !notes) return;
  const show = which => {
    lab.hidden = which !== "lab"; notes.hidden = which === "lab";
    lb.setAttribute("aria-selected", which === "lab");
    nb.setAttribute("aria-selected", which !== "lab");
    if(which !== "lab") window.scrollTo(0,0);
  };
  lb.onclick = () => show("lab");
  nb.onclick = () => show("notes");
})();

$("bedBlake").onclick = () => { BEDPICK = new Set(BED_IDS); S.bedIntp = true;  S.bedGrp = true;  run() };
$("bedNone").onclick  = () => { BEDPICK = new Set();          S.bedIntp = false; S.bedGrp = false; run() };
$("ccAll").onclick  = () => { PICK = new Set(CC.map(x=>x.i)); run() };
$("ccNone").onclick = () => { PICK = new Set(); run() };
$("ccLow").onclick  = () => { PICK = new Set(CC.filter(x=>x.w<=0.25).map(x=>x.i)); run() };
$("playBtn").onclick = () => playPause();
$("speedSel").onchange = e => { PLAY.speed = +e.target.value };
$("reroll").onclick = () => { if(!PLAY.runs) return;
  PLAY.pick = (PLAY.pick + 1) % PLAY.runs.length; playPause(false); buildTrace(); };
drawStageIdle();
$("add").onclick = addEntry;
$("who").onkeydown = e => { if(e.key==="Enter") addEntry() };
$("share").onclick = () => {
  navigator.clipboard?.writeText(toHash()).then(
    ()=>{ $("share").textContent="Link copied"; setTimeout(()=>$("share").textContent="Copy link to this setup",1600) },
    ()=>{ $("share").textContent="Copy failed — the link is in the address bar"; });
};
$("clearBoard").onclick = () => {
  // ⚠ named board.json / serve_board.py, which is the one backend the physicians using this are
  // NOT on — it read as a leaked dev note. The two cases differ: the baked-in group board is
  // someone's spreadsheet, a pasted endpoint is wherever they put it.
  if(SHARED){ alert(API === DEFAULT_BOARD
      ? "This is the group's shared board — everyone on the link sees these entries, so it is "
      + "not cleared from here. Whoever set up the board can remove rows in its spreadsheet."
      : "This is a shared board. Clear it wherever it is hosted — this page only reads and adds.");
    return }
  if(confirm("Clear the board in this browser?")){ saveLocal([]); drawBoard() }
};
markShared(); probeShared();
$("boardSetup").onclick = e => { e.preventDefault(); const d=$("setupRow"); d.hidden = !d.hidden;
  if(!d.hidden) $("apiUrl").value = (API && API!=="board") ? API : ""; };
$("apiSave").onclick = () => { setEndpoint($("apiUrl").value); $("setupRow").hidden = true; };
</script>
