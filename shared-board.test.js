const rows = [];
let frozen = 0;   // the fake sheet must model the frozen header, or sheet_() throws
/* ⚠ A SHEET PARSES WHAT IT IS HANDED. appendRow('0.10') does not store the string "0.10" — it
   stores the NUMBER 0.1, and reading it back gives "0.1". The first version of this fake kept
   whatever it was given, so it could never see the criteria ids being eaten. A leading
   apostrophe is Sheets' "this is text" marker and is not part of the stored value. */
const asCell = v => {
  if (typeof v !== 'string') return v;
  if (v.charAt(0) === "'") return v.slice(1);
  return v !== '' && isFinite(Number(v)) ? Number(v) : v;
};
const sheet = {
  appendRow: r => rows.push(r.map(asCell)),
  getDataRange: () => ({ getValues: () => rows.map(r => { const c=r.slice(); while(c.length<11)c.push(''); return c }) }),
  getLastColumn: () => rows.length ? rows[0].length : 0,
  getFrozenRows: () => frozen, setFrozenRows: n => { frozen = n },
  getRange: (a,b,c,d) => ({ setValues: v => { rows[0] = v[0].slice() } }),
  deleteRow: i => rows.splice(i-1,1),
};
global.SpreadsheetApp = { getActiveSpreadsheet: () => ({ getSheetByName: () => rows.length?sheet:null, insertSheet: () => sheet }) };
global.ContentService = { createTextOutput: s => ({ setMimeType: () => s }), MimeType:{JSON:1} };
global.LockService = { getScriptLock: () => ({ waitLock(){}, releaseLock(){} }) };
eval(require('fs').readFileSync(__dirname + '/shared-board.gs','utf8'));

// 1. a v1 row, written before cc/start/len existed
sheet_(); rows.push(['Old Row','split',6,4,76,44,true,1000]);
// 2. a full modern entry
doPost({postData:{contents:JSON.stringify({who:'Park',cfg:{mode:'split',A:3,R:2,cyc:76,assess:30,
  fastDischarge:true,cc:'0.1.4',start:12,len:6},at:2000})}});
// 3. same person, same shape, DIFFERENT criteria — must be a separate row, not a replacement
doPost({postData:{contents:JSON.stringify({who:'Park',cfg:{mode:'split',A:3,R:2,cyc:76,assess:30,
  fastDischarge:true,cc:'0.1',start:12,len:6},at:2001})}});
// 3a. criteria whose ids would be EATEN by a sheet's number parsing: {0,10} -> 0.10 -> 0.1
doPost({postData:{contents:JSON.stringify({who:'Ten',cfg:{mode:'split',A:3,R:2,cyc:76,assess:30,
  fastDischarge:true,cc:'0.10',start:12,len:6},at:2100})}});
// 3b. a MIDNIGHT lane: start 0 is a legal window, not a missing value
doPost({postData:{contents:JSON.stringify({who:'Night',cfg:{mode:'split',A:6,R:4,cyc:76,assess:44,
  fastDischarge:true,cc:'0.1',start:0,len:24},at:3000})}});
// 3c. same lane, fastDischarge FLIPPED — a different lane, must NOT replace the other
doPost({postData:{contents:JSON.stringify({who:'Park',cfg:{mode:'split',A:3,R:2,cyc:76,assess:30,
  fastDischarge:false,cc:'0.1.4',start:12,len:6},at:2500})}});
// 3d. a bed-first lane: new mode, and bedShare must survive alongside everything else
doPost({postData:{contents:JSON.stringify({who:'Blake',cfg:{mode:'bedfirst',A:6,R:4,cyc:76,assess:44,
  fastDischarge:false,cc:'',start:15,len:8,bedcc:'2.9.20',bedExtra:0},at:4000})}});
// 3e. same bed-first lane at a DIFFERENT share — a different lane, must not replace it
doPost({postData:{contents:JSON.stringify({who:'Blake',cfg:{mode:'bedfirst',A:6,R:4,cyc:76,assess:44,
  fastDischarge:false,cc:'',start:15,len:8,bedcc:'2.9.20',bedExtra:15},at:4001})}});
// 3f. same bed-first lane with the interpreter criterion ON — a different lane again, so the
// field must take part in the dedup key and not silently overwrite 3d
doPost({postData:{contents:JSON.stringify({who:'Blake',cfg:{mode:'bedfirst',A:6,R:4,cyc:76,assess:44,
  fastDischarge:false,cc:'',start:15,len:8,bedcc:'2.9.20',bedExtra:0,bedIntp:true},at:4002})}});
// 3g. same lane again with turnover set — turnover changes what a lane MEANS, so it must take
// part in the dedup key rather than overwriting the same lane scored without it
doPost({postData:{contents:JSON.stringify({who:'Blake',cfg:{mode:'bedfirst',A:6,R:4,cyc:76,assess:44,
  fastDischarge:false,cc:'',start:15,len:8,bedcc:'2.9.20',bedExtra:0,bedIntp:true,
  bedGrp:true,turnRoom:10,turnChair:1,roomsA:true,assessNo:30},at:4003})}});
// 3h. the two-stream layout — a new mode string, so both backends must allow it
doPost({postData:{contents:JSON.stringify({who:'Stream',cfg:{mode:'stream',A:5,R:5,cyc:76,assess:44,
  fastDischarge:false,cc:'',start:15,len:8,bedcc:'2.9',bedExtra:0,bedIntp:true,bedGrp:true,
  turnRoom:10,turnChair:1,roomsA:false,assessNo:44},at:4004})}});
// 4. exact repeat of #2 — must replace it
doPost({postData:{contents:JSON.stringify({who:'Park',cfg:{mode:'split',A:3,R:2,cyc:76,assess:30,
  fastDischarge:true,cc:'0.1.4',start:12,len:6},at:2002})}});

const out = read_();
console.log('header       :', rows[0].join(','));
console.log('rows on board:', out.length, '(expect 8: legacy + two criteria sets + 0.10 + midnight + fd-flip + two bed-first)');
for(const e of out) console.log('  ', e.who.padEnd(9), 'cc=', String(e.cfg.cc), ' start=', String(e.cfg.start), ' len=', String(e.cfg.len));
const legacy = out.find(e=>e.who==='Old Row');
console.log('legacy cc/start/len undefined :', [legacy.cfg.cc,legacy.cfg.start,legacy.cfg.len].every(v=>v===undefined) ? 'yes' : 'FAIL');
const full = out.filter(e=>e.who==='Park');
console.log('criteria survive round trip   :', full.some(e=>e.cfg.cc==='0.1.4') && full.some(e=>e.cfg.cc==='0.1') ? 'yes' : 'FAIL');
console.log('hours survive round trip      :', full.every(e=>e.cfg.start===12 && e.cfg.len===6) ? 'yes' : 'FAIL');
console.log('exact repeat replaced, not dup:', full.filter(e=>e.cfg.cc==='0.1.4' && e.cfg.fastDischarge===true).length===1 ? 'yes' : 'FAIL');
const night = out.find(e=>e.who==='Night');
console.log('midnight start survives (0)   :', night && night.cfg.start===0 ? 'yes' : 'FAIL got '+(night&&night.cfg.start));
const fdPair = out.filter(e=>e.who==='Park' && e.cfg.cc==='0.1.4');
console.log('fd-flip kept as separate row  :', fdPair.length===2 ? 'yes' : 'FAIL got '+fdPair.length+' rows');
const ten = out.find(e=>e.who==='Ten');
console.log('numeric-looking cc kept whole :', ten && ten.cfg.cc==='0.10' ? 'yes' : 'FAIL got '+(ten&&ten.cfg.cc));
const bf = out.filter(e=>e.who==='Blake');
/* ⚠ assert the MODE is accepted, not a row count — this counted rows, and adding a lane to the
   fixtures below silently "failed" a check about something else entirely. The count belongs to
   the distinct-lanes check further down, which is the one that means it. */
console.log('bed-first mode accepted       :', bf.length && bf.every(e=>e.cfg.mode==='bedfirst')
  ? 'yes ('+bf.length+' rows)' : 'FAIL got '+bf.length+' rows');
console.log('exclusion list round trips    :',
  bf.every(e=>e.cfg.bedcc==='2.9.20') ? 'yes' : 'FAIL got '+bf.map(e=>e.cfg.bedcc).join('|'));
console.log('residual share round trips    :',
  bf.some(e=>e.cfg.bedExtra===0) && bf.some(e=>e.cfg.bedExtra===15) ? 'yes'
  : 'FAIL got '+bf.map(e=>e.cfg.bedExtra).join(','));
console.log('legacy row has no bed fields  :',
  legacy.cfg.bedcc===undefined && legacy.cfg.bedExtra===undefined ? 'yes' : 'FAIL');
console.log('interpreter flag round trips  :',
  bf.some(e=>e.cfg.bedIntp===true) && bf.some(e=>e.cfg.bedIntp===false) ? 'yes'
  : 'FAIL got '+bf.map(e=>String(e.cfg.bedIntp)).join(','));
console.log('interpreter is part of the key:', bf.length===4 ? 'yes (4 distinct Blake lanes)'
  : 'FAIL — '+bf.length+' rows, a lane collided with another');
const turned = bf.find(e=>e.cfg.turnRoom===10);
console.log('no-test assessment round trips:', turned && turned.cfg.assessNo===30 ? 'yes' : 'FAIL');
console.log('rooms flag round trips        :', turned && turned.cfg.roomsA===true ? 'yes' : 'FAIL');
console.log('turnover round trips          :', turned && turned.cfg.turnChair===1 && turned.cfg.bedGrp===true
  ? 'yes (room 10 / chair 1 / sibling rule on)'
  : 'FAIL got '+JSON.stringify(turned && {r:turned.cfg.turnRoom,c:turned.cfg.turnChair,g:turned.cfg.bedGrp}));
console.log('legacy row has no turnover    :',
  legacy.cfg.turnRoom===undefined && legacy.cfg.turnChair===undefined ? 'yes' : 'FAIL');
const streamRow = out.find(e=>e.who==='Stream');
console.log('stream mode accepted          :', streamRow && streamRow.cfg.mode==='stream'
  ? 'yes (' + streamRow.cfg.A + ' beds + ' + streamRow.cfg.R + ' chairs)' : 'FAIL');
const rej = doPost({postData:{contents:JSON.stringify({who:'X',cfg:{mode:'zone',A:2,R:8},at:1})}});
console.log('retired mode rejected         :', String(rej).indexOf('error')>=0 ? 'yes' : 'FAIL got '+rej);

/* ⚠ THE HIGHEST-VALUE GAP THE MUTATION AUDIT FOUND. A legacy row must read `assessNo` as
   UNDEFINED so the page falls it back to `assess`; if it read 0, lim() sees a finite number and
   clamps to the slider MINIMUM of 10 — scoring a legacy lane at a 10-minute assessment instead of
   44. There were fixtures asserting that contract for the turnover and bed fields, and none for
   assessNo, bedGrp or roomsA. */
rows.length = 0; frozen = 0;
rows.push(HEAD.slice(0, 7));                       // a v1 sheet: no assessNo/bedGrp/roomsA columns
rows.push(['Legacy2', 'split', 6, 4, 76, 44, true]);
const lg = read_()[0].cfg;
console.log('legacy row has no assessNo    :',
  lg.assessNo === undefined && lg.bedGrp === undefined && lg.roomsA === undefined
    ? 'yes (all three absent, so the page can fall them back)'
    : 'FAIL — assessNo=' + JSON.stringify(lg.assessNo) + ' bedGrp=' + JSON.stringify(lg.bedGrp)
      + ' roomsA=' + JSON.stringify(lg.roomsA));

/* bedcc needs the text marker for the same reason cc does, and only cc had a fixture for it:
   "2.10" is a NUMBER to a spreadsheet, stored as 2.1, and the trailing complaint is simply gone. */
rows.length = 0; frozen = 0; rows.push(HEAD.slice());
doPost({postData:{contents: JSON.stringify({who:'Digits', at:1,
  cfg:{mode:'split', A:6, R:4, cyc:76, assess:44, fastDischarge:true, cc:'2.10', bedcc:'2.10'}})}});
const kept = read_()[0].cfg;
console.log('bedcc keeps its trailing digit:', kept.cc === '2.10' && kept.bedcc === '2.10'
  ? 'yes (both survive the sheet as text)'
  : 'FAIL — cc=' + JSON.stringify(kept.cc) + ' bedcc=' + JSON.stringify(kept.bedcc));

/* and the header must survive being sorted into the data — the file invites operators to sort */
rows.length = 0; frozen = 0; rows.push(HEAD.slice());
doPost({postData:{contents: JSON.stringify({who:'Alvarez', at:1,
  cfg:{mode:'split', A:6, R:4, cyc:76, assess:44, fastDischarge:true}})}});
rows.sort((a, b) => String(a[0]) < String(b[0]) ? -1 : 1);        // an A-Z sort, header included
const sorted = read_();
console.log('a sorted sheet keeps its lanes:',
  sorted.length === 1 && sorted[0].who === 'Alvarez'
    ? 'yes (header skipped by content, not by position)'
    : 'FAIL — ' + JSON.stringify(sorted.map(r => r.who)));

/* ⚠ `who` IS FREE TEXT HANDED TO A SPREADSHEET. Unprotected, "007" is stored as the number 7 and
   the dedup key compares String(cell) === who, so "7" !== "007" and every re-post appends another
   row — the board filling with duplicate lanes under a name nobody typed. "0" is worse: read_()
   skips a row whose first cell is falsy, so that physician's lane vanishes outright. */
const numericNames = [];
for (const nm of ['007', '0', '42']) {
  rows.length = 0; frozen = 0; rows.push(HEAD.slice());
  const cfg = {mode:'split', A:6, R:4, cyc:76, assess:44, fastDischarge:true};
  doPost({postData:{contents: JSON.stringify({who:nm, at:1, cfg})}});
  doPost({postData:{contents: JSON.stringify({who:nm, at:2, cfg})}});   // same lane again
  const back = read_();
  if (!(back.length === 1 && back[0].who === nm)) numericNames.push(nm + ' -> ' + JSON.stringify(back.map(r => r.who)));
}
console.log('a numeric name still dedups   :', numericNames.length === 0
  ? 'yes ("007", "0" and "42" each keep one row under their own name)'
  : 'FAIL — ' + numericNames.join('; '));

/* ⚠ ONE FIXTURE PER KEY FIELD. The dedup key is a CONJUNCTION, so dropping one term only collides
   if some fixture PAIR differs in exactly that term — and only bedIntp had such a pair. Dropping
   bedGrp, turnRoom, turnChair, roomsA or assessNo from the key gave 0 FAILs, meaning a physician
   who re-saves a lane after changing only the turnover dial silently overwrites their earlier
   entry instead of adding a second row. Each field below is varied ALONE against a common base. */
/* ⚠ THE LIST IS DERIVED FROM HEAD, NOT TYPED OUT. It was typed out, and it drifted: loadPct
   and docs were added to the board on 2026-08-23 and never added here, so the two newest
   SCORED fields went uncovered by the very check that exists to catch that. A hand-kept list
   of what to test is a list that stops matching what exists. Anything in HEAD is now tested,
   and a column with no BASE value FAILS rather than being skipped. */
const BASE = {mode:'split', A:6, R:4, cyc:76, assess:44, fastDischarge:true,
              cc:'1.2', bedcc:'2', bedExtra:7, bedIntp:false, bedGrp:false,
              turnRoom:10, turnChair:1, roomsA:false, assessNo:44, start:15, len:8,
              loadPct:100, docs:1, capPerDoc:0};
const CFG_FIELDS = HEAD.filter(h => h !== 'who' && h !== 'at');
const noBase = CFG_FIELDS.filter(f => !(f in BASE));
console.log('every board column has a test value  :', noBase.length === 0
  ? 'yes (' + CFG_FIELDS.length + ' columns)'
  : 'FAIL — in HEAD but untested, add to BASE: ' + noBase.join(', '));
const ALT = {mode:'pooled', cc:'1.3', bedcc:'3'};
const unpinned = [];
for (const f of CFG_FIELDS) {
  const alt = f in ALT ? ALT[f]
            : typeof BASE[f] === 'boolean' ? !BASE[f]
            : Number(BASE[f]) + 3;
  rows.length = 0; frozen = 0; rows.push(HEAD.slice());
  doPost({postData:{contents: JSON.stringify({who:'Key', at:1, cfg:BASE})}});
  doPost({postData:{contents: JSON.stringify({who:'Key', at:2, cfg:{...BASE, [f]: alt}})}});
  if (read_().length !== 2) unpinned.push(f);
}
console.log('every scored field keys the row:', unpinned.length === 0
  ? 'yes (' + CFG_FIELDS.length + ' fields, each varied alone, each makes a distinct row)'
  : 'FAIL — changing these did NOT create a new row: ' + unpinned.join(', '));
