const store={};
/* ⚠ Enough DOM to see a slot as an ELEMENT, not just a string. The figures-invisible bug
   (2026-08-20) lived entirely in element churn — the markup was identical every frame, so a
   shim that only compares innerHTML strings can never catch it. children/outerHTML let the
   test assert that an unchanged slot keeps the SAME object across frames. */
const SLOT_RE=/<span class="slot[\s\S]*?<\/span>/g;
function mkKid(html,parent,idx){
  const k=(html.match(/data-k="([^"]*)"/)||[])[1];
  return {_html:html,dataset:{k},
    get outerHTML(){return this._html},
    set outerHTML(v){ parent._kids[idx]=mkKid(String(v),parent,idx); parent._sync() }};
}
const mk=id=>({id,_h:"",_t:"",value:"",hidden:false,style:{},dataset:{},_kids:[],
  _parse(){this._kids=(this._h.match(SLOT_RE)||[]).map((s,i)=>mkKid(s,this,i))},
  _sync(){this._h=this._kids.map(k=>k._html).join("")},
  get children(){return this._kids}, get childElementCount(){return this._kids.length},
  set innerHTML(v){this._h=String(v); this._parse()}, get innerHTML(){return this._h},
  set textContent(v){this._t=String(v)}, get textContent(){return this._t},
  set className(v){this._c=v}, get className(){return this._c},
  /* ⚠ REAL BUTTONS, NOT AN EMPTY LIST. This returned [] , so every onclick the page wires —
     the mode buttons, presets, complaint rows, room chips, the sort segment, the tabs, the
     board's load buttons — was assigned and never reachable. Whole classes of bug lived behind
     handlers where no check could see them (the mode buttons quietly grew the lane's estate on
     every click, and nothing noticed for a day). Parse the buttons out of the markup and hand
     back objects the page can attach to and a test can click. */
  querySelectorAll(sel){
    /* ⚠ ONE SET OF OBJECTS PER MARKUP, FILTERED PER SELECTOR. The page wires handlers onto what IT
       gets back and a test clicks what IT gets back; if those differ the handler is never reached
       and the check passes having done nothing. Caching per SELECTOR was not enough — the page
       asks for "button" and a test asks for "[data-m]", which are different keys over the same
       buttons. Parse once, filter after. That is exactly how the estate-growing bug survived a
       guard written to catch it. */
    if(this._qsFor !== this._h){
      this._qsFor = this._h;
      this._qsAll = [];
      const re = /<button\b([^>]*)>([\s\S]*?)<\/button>/g;
      let m;
      while((m = re.exec(this._h))){
        const attrs = m[1], inner = m[2], data = {};
        let a; const ar = /data-([a-zA-Z-]+)="([^"]*)"/g;
        while((a = ar.exec(attrs))) data[a[1].replace(/-([a-z])/g, (_,c)=>c.toUpperCase())] = a[2];
        this._qsAll.push({dataset:data, _attrs:attrs, _set:{},
          disabled:/\bdisabled\b/.test(attrs), innerHTML:inner,
          textContent:inner.replace(/<[^>]*>/g,"").replace(/\s+/g," ").trim(),
          getAttribute(k){ if(k in this._set) return this._set[k];
                           const g=new RegExp(k+'="([^"]*)"').exec(this._attrs); return g?g[1]:null },
          setAttribute(k,v){ this._set[k]=String(v) },
          onclick:null, oninput:null, querySelectorAll:()=>[] });
      }
    }
    const want = (sel.match(/\[data-([a-zA-Z-]+)/)||[])[1];
    if(!want) return this._qsAll;
    const key = want.replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
    return this._qsAll.filter(el => key in el.dataset);
  },
  insertAdjacentHTML(v, html){ this._h += String(html); this._parse() }, focus(){}});
/* ⚠ A CONTROL MISSING FROM THIS SET IS INVISIBLE TO THE HARNESS AND NEVER RENDERS.
   getElementById returns null for anything not listed, so its draw function returns early
   and every check still prints yes. On 2026-08-22 the turnover sliders, the no-test
   assessment slider, the interpreter and sibling criteria and both tabs were all absent —
   38 checks passed over code that had never run. Add the id here when you add a control. */
const REAL_IDS = new Set(['add', 'apiSave', 'apiUrl', 'arrBars', 'arrHours', 'arrNote', 'asn', 'asnOut', 'asx', 'asxBoth', 'asxOut', 'barNote', 'bars', 'bedBlake', 'bedExtraCtl', 'bedGrpBtn', 'bedIntpBtn', 'bedIntpCtl', 'bedList', 'bedNone', 'bedPanel', 'bedSum', 'bedx', 'bedxOut', 'boardBody', 'boardNote', 'boardSetup', 'ccAll', 'ccHint', 'ccList', 'ccLow', 'ccNone', 'ccSortSeg', 'ccSum', 'clearBoard', 'cyc', 'cycOut', 'hero', 'hours', 'levels', 'load', 'modes', 'playBtn', 'presets', 'reroll', 'roomsASeg', 'setupRow', 'share', 'sharedTag', 'spaceCtl', 'spaceTot', 'speedCtl', 'speedSel', 'streamBoards', 'stageA', 'stageAH', 'stageB', 'stageBH', 'stageBar', 'stageClock', 'stageFoot', 'stageGone', 'stageHint', 'stageSent', 'stageWait', 'stageWaitN', 'tabLab', 'tabLabBtn', 'tabNotes', 'tabNotesBtn', 'trc', 'trcOut', 'trn', 'trnOut', 'turnCtl', 'unlock', 'who', 'winCtl', 'wlen', 'wlenOut', 'wstart', 'wstartOut']);
global.document={getElementById:id=>{ if(!REAL_IDS.has(id)) return null;
  return store[id]||(store[id]=mk(id)) }};
/* ⚠ hash is a GETTER/SETTER because a browser normalises it and a plain property does not: the
   page assigns `location.hash = "split,6,..."` and a browser stores "#split,6,...", so fromHash's
   .slice(1) removes the "#". With a plain property the "s" was eaten instead, the mode failed to
   match and fromHash returned early — which made a round-trip test look like an app bug. */
global.location={origin:"https://ted72782.github.io",pathname:"/ft-lab/",
  protocol:"https:",search:"?board=https%3A%2F%2Fscript.google.com%2Fx%2Fexec",
  href:"https://ted72782.github.io/ft-lab/?board=https%3A%2F%2Fscript.google.com%2Fx%2Fexec"};
Object.defineProperty(global.location, "hash", {
  get(){ return this._h || ""; },
  set(v){ v = String(v); this._h = v === "" ? "" : (v[0] === "#" ? v : "#" + v); },
  enumerable:true, configurable:true});
global.history={replaceState(a,b,u){const s=String(u).split("?")[1];location.search=s?"?"+s.split("#")[0]:"";}};
const LS={}; global.localStorage={getItem:k=>LS[k]??null,setItem:(k,v)=>{LS[k]=v},removeItem:k=>{delete LS[k]}};
global.navigator={}; global.confirm=()=>true; global.alert=()=>{};
let SERVER=[];
global.fetch=(url,opt)=>{
  if(!String(url).startsWith("https://script.google.com")) return Promise.reject(new Error("unreachable"));
  if(opt&&opt.method==="POST"){
    if(opt.headers["Content-Type"]!=="text/plain;charset=utf-8") return Promise.reject(new Error("PREFLIGHT would fire"));
    const e=JSON.parse(opt.body);
    SERVER=SERVER.filter(x=>!(x.who===e.who&&JSON.stringify(x.cfg)===JSON.stringify(e.cfg))); SERVER.push(e);
  }
  return Promise.resolve({ok:true,json:()=>Promise.resolve(SERVER)});
};

global.requestAnimationFrame=fn=>0;
global.cancelAnimationFrame=()=>{};
