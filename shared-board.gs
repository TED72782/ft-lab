/**
 * Fast Track Chair Lab — shared leaderboard.
 *
 * Paste this whole file into a new Apps Script project bound to a Google Sheet, deploy it as a
 * Web app ("Execute as: Me", "Who has access: Anyone"), and paste the /exec URL it gives you
 * into the lab page. Nothing else to configure.
 *
 * The sheet becomes the board: one row per lane, columns who / mode / A / R / cyc / assess /
 * fastDischarge / at / cc / start / len / bedcc / bedExtra. Sort or annotate it freely — the
 * page only ever reads these columns.
 *
 * ⚠ cc IS WRITTEN AS TEXT ON PURPOSE. A Sheet parses what it is handed: appendRow('0.10')
 * stores the NUMBER 0.1, and reading it back gives "0.1" — complaints {0,10} silently become
 * {0,1} and the row scores a lane nobody built. The leading apostrophe forces the cell to text;
 * Sheets strips it on read, and read_() strips one anyway so neither half depends on the other.
 *
 * ⚠ EVERY FIELD THE PAGE SENDS MUST BE STORED. The first version kept only the first eight
 * columns, silently dropping the chief-complaint criteria and the operating hours. A row saved
 * from a narrowed lane came back as an everyone-24/7 lane, so the board re-scored it against a
 * configuration nobody had chosen and the load button could not reproduce it. Adding a control
 * to the page means adding a column here.
 */

var SHEET = 'board';
var HEAD = ['who', 'mode', 'A', 'R', 'cyc', 'assess', 'fastDischarge', 'at',
            'cc', 'start', 'len', 'bedcc', 'bedExtra', 'bedIntp',
            'bedGrp', 'turnRoom', 'turnChair', 'roomsA', 'assessNo'];

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET);
  if (!sh) {
    sh = ss.insertSheet(SHEET);
    sh.appendRow(HEAD);
  } else if (sh.getLastColumn() < HEAD.length) {
    sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]);   // widen a board written by v1
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function read_() {
  var rows = sheet_().getDataRange().getValues();
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (!r[0]) continue;
    while (r.length < HEAD.length) r.push('');   // a narrower legacy sheet reads short
    out.push({
      who: String(r[0]).slice(0, 28),
      // a v1 row has no cc/start/len: leaving them undefined is exactly how the page reads
      // "every complaint, the original 15:00-23:00 lane", so old rows keep scoring as they did
      cfg: { mode: String(r[1]), A: Number(r[2]), R: Number(r[3]),
             cyc: Number(r[4]), assess: Number(r[5]), fastDischarge: r[6] === true || r[6] === 'TRUE',
             cc: r[8] === '' || r[8] === undefined ? undefined : String(r[8]).replace(/^'/, ''),
             start: r[9] === '' || r[9] === undefined ? undefined : Number(r[9]),
             len: r[10] === '' || r[10] === undefined ? undefined : Number(r[10]),
             // pre-bed-first rows have neither, and were not that layout: undefined, not 0.
             // bedcc is a dot-joined id list and is written as text for the same reason cc is.
             bedcc: r[11] === '' || r[11] === undefined ? undefined : String(r[11]).replace(/^'/, ''),
             bedExtra: r[12] === '' || r[12] === undefined ? undefined : Number(r[12]),
             // a row saved before the interpreter criterion existed was scored WITHOUT it;
             // undefined (not false) so the page applies its own legacy rule, as with bedcc
             bedIntp: r[13] === '' || r[13] === undefined ? undefined
                      : (r[13] === true || r[13] === 'TRUE'),
             bedGrp: r[14] === '' || r[14] === undefined ? undefined
                     : (r[14] === true || r[14] === 'TRUE'),
             // turnover: a row saved before it existed was scored with none, so undefined not 0 —
             // the page's own legacy rule decides, exactly as it does for bedcc
             turnRoom: r[15] === '' || r[15] === undefined ? undefined : Number(r[15]),
             turnChair: r[16] === '' || r[16] === undefined ? undefined : Number(r[16]),
             roomsA: r[17] === '' || r[17] === undefined ? undefined
                     : (r[17] === true || r[17] === 'TRUE'),
             // undefined, not a number: the page falls it back to `assess`, which is what a row
             // saved before the two halves were split actually meant
             assessNo: r[18] === '' || r[18] === undefined ? undefined : Number(r[18]) },
      at: Number(r[7]) || 0
    });
  }
  return out;
}

function doGet() {
  return json_(read_());
}

/**
 * The page posts text/plain on purpose. A JSON content-type would make the browser send a CORS
 * preflight, and Apps Script web apps cannot answer one — the request would fail before it ever
 * reached this function. text/plain is a "simple request", so it goes straight through.
 */
function doPost(e) {
  var lock = LockService.getScriptLock();       // two physicians clicking at once must not interleave
  try {
    lock.waitLock(8000);
    var b = JSON.parse(e.postData.contents);
    var who = String(b.who || '').slice(0, 28);
    var c = b.cfg || {};
    var modes = ['split', 'pooled', 'bedfirst', 'stream'];   // 'rooms'/'zone' retired with the four-mode UI
    if (!who || modes.indexOf(String(c.mode)) < 0) return json_({ error: 'bad entry' });

    var sh = sheet_();
    var rows = sh.getDataRange().getValues();
    // one row per person per distinct lane — re-adding the same lane refreshes it in place
    for (var i = rows.length - 1; i >= 1; i--) {
      if (String(rows[i][0]) === who && String(rows[i][1]) === String(c.mode) &&
          Number(rows[i][2]) === Number(c.A) && Number(rows[i][3]) === Number(c.R) &&
          Number(rows[i][4]) === Number(c.cyc) && Number(rows[i][5]) === Number(c.assess) &&
          (rows[i][6] === true || rows[i][6] === 'TRUE') === (c.fastDischarge === true) &&
          String(rows[i][8] || '').replace(/^'/, '') === String(c.cc || '') &&
          Number(rows[i][9] === '' ? 15 : rows[i][9]) === Number(c.start === undefined ? 15 : c.start) &&
          Number(rows[i][10] === '' ? 8 : rows[i][10]) === Number(c.len === undefined ? 8 : c.len) &&
          String(rows[i][11] === undefined ? '' : rows[i][11]).replace(/^'/, '') ===
            String(c.bedcc === undefined ? '' : c.bedcc) &&
          String(rows[i][12] === undefined ? '' : rows[i][12]) ===
            String(c.bedExtra === undefined || c.bedExtra === null ? '' : c.bedExtra) &&
          (rows[i][13] === true || rows[i][13] === 'TRUE') === (c.bedIntp === true) &&
        (rows[i][14] === true || rows[i][14] === 'TRUE') === (c.bedGrp === true) &&
        Number(rows[i][15] || 0) === Number(c.turnRoom || 0) &&
        Number(rows[i][16] || 0) === Number(c.turnChair || 0) &&
        (rows[i][17] === true || rows[i][17] === 'TRUE') === (c.roomsA === true) &&
        Number(rows[i][18] || 0) === Number(c.assessNo || 0)) {
        sh.deleteRow(i + 1);
      }
    }
    sh.appendRow([who, String(c.mode), Number(c.A) || 0, Number(c.R) || 0,
                  Number(c.cyc) || 0, Number(c.assess) || 0, c.fastDischarge === true,
                  Number(b.at) || Date.now(),
                  /* ⚠ '' AND "none" ARE DIFFERENT LANES. read_() maps a blank cell back to
                     undefined, which the page reads as "the default" — so a lane saved with the
                     criteria cleared came back taking EVERY complaint, and one saved with the room
                     list cleared came back with Blake's three. Eight minutes of score on a board
                     whose layouts sit within one minute of each other. The page sends "-" for an
                     empty set; store it. */
                  c.cc === undefined ? '' : "'" + String(c.cc),
                  c.start === undefined || c.start === null || c.start === '' ? 15 : Number(c.start),
                  c.len === undefined || c.len === null || c.len === '' ? 8 : Number(c.len),
                  c.bedcc === undefined ? '' : "'" + String(c.bedcc),
                  c.bedExtra === undefined || c.bedExtra === null || c.bedExtra === '' ? ''
                    : Number(c.bedExtra),
                  c.bedIntp === true,
                  c.bedGrp === true,
                  c.turnRoom === undefined || c.turnRoom === null ? '' : Number(c.turnRoom),
                  c.turnChair === undefined || c.turnChair === null ? '' : Number(c.turnChair),
                  c.roomsA === true,
                  c.assessNo === undefined || c.assessNo === null ? '' : Number(c.assessNo)]);
    return json_(read_());
  } catch (err) {
    return json_({ error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}
