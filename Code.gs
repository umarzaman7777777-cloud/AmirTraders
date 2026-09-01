/**
 * AMIR TRADERS — POS Google Sheet Sync backend
 *
 * SETUP:
 * 1. Open the exact Google Sheet this script is wired to — SHEET_ID below
 *    always points at one specific sheet regardless of which sheet's Apps
 *    Script editor you're working in, so there's no "create a new sheet"
 *    step: https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit
 * 2. In that Sheet, go to Extensions > Apps Script.
 * 3. Delete any starter code in Code.gs and paste this entire file in its place.
 * 4. Click Deploy > New deployment (or, if you've deployed this before,
 *    Deploy > Manage deployments > pencil icon > New version, to push an
 *    edit onto your existing URL instead of creating a second one).
 *    - Click the gear icon next to "Select type" and choose "Web app".
 *    - Description: anything (e.g. "POS sync").
 *    - Execute as: Me.
 *    - Who has access: Anyone.
 *    - Click Deploy, then Authorize access (approve the permissions prompt).
 * 5. Copy the "Web app URL" you're given — it looks like:
 *      https://script.google.com/macros/s/XXXXXXXXXXXX/exec
 * 6. Paste that URL into the SHEET_API_URL constant near the top of the
 *    <script> section in index.html, replacing the empty string.
 * 7. Reload the app. The sync widget in the top-right corner should
 *    turn green ("Synced") once it successfully connects.
 * 8. (Optional, only if you want cheque-clearance reminder emails) Open the
 *    function dropdown at the top of this editor, select
 *    "setupChequeReminderTrigger", click Run, and accept the extra
 *    permissions prompt (Gmail send access). This installs a daily trigger
 *    that emails you whenever a cheque payment is still Pending past its
 *    due date — see the comment above setupChequeReminderTrigger below.
 *
 * NOTE: Every time you edit this script in the Apps Script editor, you must
 * create a NEW deployment (Deploy > Manage deployments > pencil icon > New
 * version) for the changes to actually take effect on the existing URL.
 *
 * CHANGE LOG:
 * - CHANGED: "By Self Weight Stock" is weight WE'VE supplied to a Custom
 *   Ledger's party (an outgoing advance), not weight received — it's now
 *   ONE running total for the whole ledger (new "selfWeightStock" column
 *   on the "Custom Ledgers" roster tab), not split per Description like
 *   it briefly was. When that party later provides their own stock via
 *   "+ Add Stock" in the app, it now pays down this balance FIRST, and
 *   only the leftover tops up the ledger's shared Weight/Remaining
 *   Weight. Each item entry also carries its own "selfWeightStock"
 *   snapshot column (new, on CustomLedgerEntries) — a historical record
 *   of the running total at that point, not itself read back into the
 *   live total on load.
 * - NEW: The Custom Ledger item's Description field now has a "Manage"
 *   link — it opens the Manage Lists modal to a plain "Description" view
 *   (List dropdown hidden) that manages the SAME customDescriptions list
 *   the Description field's own inline suggestion dropdown already reads
 *   from, so anything added/removed there is reflected in the field's
 *   suggestions too. (An earlier revision had this write to a SEPARATE
 *   "By Self Weight Stock" list instead — that's been removed; the
 *   Payment Method (Steel Weight) / By Self Weight Stock section is
 *   triggered purely by a Description literally containing "self
 *   weight", same as before that separate list existed.)
 * - NEW (SUPERSEDED — see "CHANGED" entry above): Custom Ledger items
 *   can now also be paid by "Steel Weight" (in addition to Cash/Bank/
 *   Online/Cheque) — like a per-ITEM cheque, it starts 'pending'
 *   (highlighted, with Confirm/Reject buttons in the ledger) and only a
 *   Confirm actually credits that item's Item Count × Weight per Item
 *   into a running total, "By Self Weight Stock". New "itemWeightStatus"
 *   column on CustomLedgerEntries.
 * - NEW: Custom Ledger items ("+ Add Item" blocks) can now each carry
 *   their own Payment Method (Cash/Bank/Online/Cheque/Steel Weight) —
 *   e.g. one item in an entry can be a Steel Wire delivery paid Cash
 *   while another is an Advance payment made by Cheque. This is
 *   separate from the existing entry-level Payment Method tied to the
 *   whole entry's Credit field. New "itemMethod" column on the
 *   CustomLedgerEntries sheet tab, one value per item like
 *   desc/itemColour/etc. (An earlier revision of this also had a Method
 *   Detail field per item; that box was removed — no column for it.)
 * - NEW: Custom Ledgers — separate extra ledgers for specific suppliers,
 *   kept entirely apart from the Raw Material Ledger (added via "Add
 *   Specific Ledger" on the Raw Material page). Fields: Description,
 *   Item, Item Type, Item Colour, Weight, Bundle Count, Gauge, Size,
 *   Item Count, Rate per Item, Debit (Cost — Item Count × Rate) and
 *   Credit (Payment, with Cash/Bank/Online/Cheque). New "Custom Ledgers"
 *   (roster) and "CustomLedgerEntries" sheet tabs; included in cheque
 *   highlighting and the daily overdue-cheque reminder email.
 * - NEW: Paint Ledger entries can now carry Item Size/Item Type/Factory
 *   Name (reusable "type to add, ✕ to delete" combo lists, independent
 *   of the real Factories & Suppliers records) plus Item Count and Rate
 *   per Item — the app auto-fills Credit (Work) as Count × Rate when
 *   both are set and Credit is still empty. New columns on the
 *   PaintLedger sheet tab; the three suggestion lists are folded into
 *   the existing "Labour Lists" tab under their own types, same pattern
 *   as the Raw Material Ledger's fields.
 * - NEW: Labour Ledger payment/advance entries can now use Cheque as the
 *   payment method too, same as Customer/Painter/Supplier — a Cheque Date
 *   field, ChequeDate/ChequeStatus columns on the Labour sheet, row
 *   highlighting while pending/overdue, and inclusion in the daily
 *   overdue-cheque reminder email (its own scan pass, since the Labour
 *   sheet's columns are capitalized unlike the other three ledgers).
 * - NEW: Cheque payments extended to the Labour Ledger — Payment/Advance
 *   entries can now use Method "Cheque" with a chequeDate, same as
 *   Customer/Painter/Supplier. New ChequeDate/ChequeStatus columns on the
 *   Labour sheet tab, sheet row highlighting, and the daily overdue-cheque
 *   email now also covers Labour (its own scan pass, since that sheet's
 *   columns are capitalized unlike the other three).
 * - NEW: Raw Material Ledger entries now carry Weight/Bundle Count/Gauge/
 *   Size, alongside a reusable Item list (Steel Taar/Steel Patri/Kirrik
 *   Karri Patri/Chutki/Tala/Mono by default) replacing the old free-text
 *   Description. New columns on the RawLedger sheet tab; the five
 *   underlying suggestion lists are folded into the existing "Labour
 *   Lists" tab under their own types (rawItem/rawWeight/rawBundle/
 *   rawGauge/rawSize), same pattern as productWeight.
 * - NEW: Order Booked / Transactions sheet has an "itemCounts" column —
 *   one qty per line, matching itemsSummary/size/colour line-for-line, so
 *   a multi-product order shows each product's own quantity instead of
 *   only the combined itemCount total in exports.
 * - NEW: Cheque payments. Painter/Supplier/Customer ledger entries can now
 *   be recorded with Method "Cheque" and a chequeDate — the amount is
 *   deducted from the balance right away (same as any other payment) but
 *   the row is highlighted on the sheet (yellow while pending, red once
 *   its due date has passed) until it's marked Cleared or Bounced in the
 *   app. Marking it Bounced excludes that entry from the balance
 *   calculation entirely, which is what adds the deducted amount back.
 *   New "chequeDate"/"chequeStatus" columns on the PaintLedger, RawLedger,
 *   and CustomerLedger sheet tabs. See setupChequeReminderTrigger below
 *   for the optional daily overdue-cheque reminder email.
 * - Paint moved from a flat qty/unit/cost inventory item to a per-painter
 *   Debit/Credit ledger. Two new sheet tabs handle this:
 *     "Painters"    — roster of painter names (so a painter with zero
 *                     entries still survives a reload).
 *     "PaintLedger" — every debit/credit entry, one row per entry,
 *                     linked back to its painter by name.
 *   Labour still uses the original "Inventory" tab unchanged
 *   (name/qty/unit/cost).
 * - Raw Material moved the SAME way — from flat qty/unit/cost rows into a
 *   per-supplier Debit/Credit ledger (mirrors Paint, minus the colour
 *   column). Two new sheet tabs handle this:
 *     "Suppliers"  — roster of supplier names (so a supplier with zero
 *                    entries still survives a reload).
 *     "RawLedger"  — every debit/credit entry, one row per entry, linked
 *                    back to its supplier by name.
 *   The old flat "Raw Material" rows in the "Inventory" tab are no longer
 *   written by the app — you can leave any old rows there or delete them,
 *   they're simply ignored now.
 * - Products (the catalog under Add Product / product cards) now persist
 *   too, via a new "Products" tab. Previously the product list only lived
 *   in the page's memory and reset to the built-in defaults on every
 *   reload — any product you added or edited (including weight, used by
 *   American Pedestal Fan) was lost when the browser closed.
 * - Transactions' Paid/Unpaid status (and payment method/details) is now
 *   saved and restored. Previously only id/date/time/items/total/factory
 *   were persisted — paid/method were silently dropped, so every
 *   transaction came back from a reload with no paid value at all, and
 *   the app treats "no value" as Paid. That's why Unpaid transactions
 *   looked like they'd "become Paid automatically" after reopening.
 * - PaintLedger entries now also carry a "colour" column (e.g. which
 *   paint colour was used for that job), alongside description/debit/credit.
 * - Transactions sheet no longer stores method/detailCash/detailBank/
 *   detailOnline — the app's Order Booked tab dropped the payment-method
 *   picker (Cash/Bank/Online) and now only tracks a simple Paid/Unpaid
 *   toggle, so those extra columns were removed. "paid" is kept.
 * - The "Transactions" sheet tab is now named "Order Booked" to match
 *   the app's renamed tab. Make sure your actual Google Sheet tab is
 *   also named exactly "Order Booked" — otherwise the script will just
 *   auto-create a new blank tab with that name instead of using your
 *   existing data.
 * - Order Booked sheet now has separate "size" and "colour" columns
 *   (comma-joined if an order has multiple line items with different
 *   sizes/colours), instead of only showing them inline in itemsSummary.
 * - Multi-item orders now list one product per line (embedded newline)
 *   in itemsSummary/size/colour instead of comma-joining them onto one
 *   line, with those columns set to WRAP so the lines actually display
 *   stacked in the sheet instead of running together.
 * - New "Sales Summary" tab: one row per period (Daily, Last Day, Weekly,
 *   Last Week, Monthly, Last Month, Yearly, Last Year) with Sales, Orders,
 *   Average Sale, and Items Sold — mirrors the app's Sales Summary page,
 *   recomputed fresh from transactionsLog on every save.
 * - New "Expenses Summary" tab: same idea, one row per period with Total
 *   Expenses and Entries — mirrors the app's Daily Expenses page and the
 *   Overview dashboard's Finance module period dropdown.
 * - Expense receipts (optional file upload in Add/Edit Expense) are now
 *   actually persisted: the image/PDF is uploaded to a Drive folder named
 *   "POS Expense Receipts", and a shareable link is stored in a new
 *   "receipt" column on the Expenses sheet. IMPORTANT: this needs the
 *   Drive scope, which the script didn't need before — you'll be asked to
 *   re-authorize (accept an expanded permissions prompt) the first time
 *   you run/redeploy this version.
 * - New "Expense Categories" tab: the user-editable category list shown
 *   in the Add/Edit Expense dropdown (Manage Categories button), so
 *   categories added or removed in the app persist across reloads.
 * - Raw Material Ledger entries can now carry an optional receipt image
 *   (any image type, or PDF), same as expense receipts: uploaded to the
 *   "POS Expense Receipts" Drive folder, with a shareable link stored in
 *   a new "receipt" column on the "RawLedger" sheet tab.
 * - Raw Material Ledger receipts now upload to their OWN Drive folder,
 *   "POS Raw Material Ledger Receipts", instead of sharing the Expenses
 *   folder — see RECEIPT_FOLDERS. Also fixed: a "receipt" cell is only
 *   ever treated as already-uploaded if it's a real http(s) link — stale
 *   plain text (e.g. a bare filename from early testing) no longer gets
 *   preserved forever and now self-heals into a fresh upload instead.
 * - NEW: Labour Ledger now persists. Two tabs:
 *     "Labour"       — one row per worker per thing that happened to
 *                      them: a configured piece rate, an attendance/
 *                      payment/advance entry, or (if neither yet) a bare
 *                      profile row. The worker's name/work type/rate
 *                      type/start-end date are repeated on EVERY one of
 *                      their rows, so any single row reads on its own —
 *                      no row-type label needed, and no big blank gaps:
 *                      what kind of row it is follows from which columns
 *                      are filled (a Date means it's a ledger entry; no
 *                      Date but a GuardSize/Weight/Sticks means it's a
 *                      configured piece rate).
 *     "Labour Lists" — the Add Worker form's four saved suggestion lists
 *                      (Work Type / Guard Size / Weight / Sticks No.),
 *                      kept separate since it's settings data with no
 *                      worker or date attached — mixing it into "Labour"
 *                      would just add empty-Worker rows to what is
 *                      otherwise a clean per-worker table.
 */

// ============================================================
// RUN THIS FIRST (one-time only): open the function dropdown at the
// top of this editor, select "authorize", click Run. This is the only
// purpose of this function — it forces Google's permission screen to
// appear so the script can use Drive (needed for expense receipts).
// After accepting the prompt once, delete this function if you like —
// nothing else in the file calls it.
// ============================================================
function authorize(){
  // Deliberately exercises the SAME operations uploadReceiptToDrive_ needs
  // (create a folder, create a file in it, share it) — a read-only call
  // like getRootFolder() can succeed even without write access, giving a
  // false "it's working" result, so this tests the real thing instead.
  // Tests BOTH receipt folders (Expenses and Raw Material Ledger each get
  // their own — see RECEIPT_FOLDERS below) so one authorization covers both.
  Object.keys(RECEIPT_FOLDERS).forEach(key=>{
    const name = RECEIPT_FOLDERS[key];
    const folder = DriveApp.getFoldersByName(name).hasNext()
      ? DriveApp.getFoldersByName(name).next()
      : DriveApp.createFolder(name);
    const testFile = folder.createFile(Utilities.newBlob('auth test', 'text/plain', 'auth-test.txt'));
    testFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    testFile.setTrashed(true); // clean up immediately, this was just a test
  });
}

// ============================================================
// CHEQUE REMINDER EMAIL — run ONCE (one-time only): open the function
// dropdown at the top of this editor, select "setupChequeReminderTrigger",
// click Run, and accept the permissions prompt (needs Gmail send access,
// which is separate from the Drive access "authorize" above grants).
// This installs a daily trigger that emails you a summary of every cheque
// payment (Painter/Supplier/Customer ledgers) that's still marked Pending
// past its due date — this is what makes the reminder work even when the
// POS page itself isn't open in a browser anywhere. Safe to re-run any
// time (e.g. to change the hour below); it clears its own old trigger
// first so you never end up with duplicates.
// ============================================================
function setupChequeReminderTrigger(){
  ScriptApp.getProjectTriggers().forEach(t=>{
    if(t.getHandlerFunction() === 'sendOverdueChequeEmail_') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendOverdueChequeEmail_')
    .timeBased()
    .everyDays(1)
    .atHour(9) // change this number (0-23) to reschedule what hour the daily email goes out
    .create();
}
// Scans the Painter, Supplier, Customer, Labour, and Custom ledgers for
// cheque
// entries that are still 'pending' (not yet marked Cleared or Bounced in
// the app) whose chequeDate has already passed. Returns a plain array so
// both the email sender below and (via doGet) the app's own in-page
// banner can share this one source of truth instead of duplicating the
// scan logic.
function checkOverdueCheques_(){
  const today = new Date(); today.setHours(0,0,0,0);
  const overdue = [];
  function scan(sheetName, nameField, label){
    readTable_(sheetName).forEach(r=>{
      if(r.method !== 'Cheque' || r.chequeStatus !== 'pending') return;
      const due = parseDMY_(cellDateStr_(r.chequeDate));
      if(due && due < today){
        overdue.push({
          type: label,
          name: r[nameField] || '',
          amount: Number(r.debit) || Number(r.credit) || 0,
          due: cellDateStr_(r.chequeDate),
          desc: r.desc || ''
        });
      }
    });
  }
  scan(SHEETS.paintLedger, 'painter', 'Painter');
  scan(SHEETS.rawLedger, 'supplier', 'Supplier');
  scan(SHEETS.customerLedger, 'customer', 'Customer');
  scan(SHEETS.customLedgerEntries, 'ledger', 'Custom Ledger');
  // Labour uses capitalized column headers (Method/ChequeStatus/ChequeDate/
  // Worker/etc, see LABOUR_HEADER) unlike the three lowercase-header
  // sheets above, so it needs its own pass rather than reusing scan().
  readTable_(SHEETS.labour).forEach(r=>{
    if(r.Method !== 'Cheque' || r.ChequeStatus !== 'pending') return;
    const due = parseDMY_(cellDateStr_(r.ChequeDate));
    if(due && due < today){
      overdue.push({
        type: 'Labour',
        name: r.Worker || '',
        amount: Number(r.Debit) || 0,
        due: cellDateStr_(r.ChequeDate),
        desc: r.Note || ''
      });
    }
  });
  return overdue;
}
// Called by the daily trigger set up in setupChequeReminderTrigger above.
// Sends nothing when there's nothing overdue, so this doesn't turn into
// daily noise once you're caught up on marking cheques Cleared/Bounced.
function sendOverdueChequeEmail_(){
  const overdue = checkOverdueCheques_();
  if(overdue.length === 0) return;
  const email = getBackupEmailAddress_();
  if(!email) return;
  const lines = overdue.map(o =>
    '- [' + o.type + '] ' + o.name + ' — Rs ' + o.amount + ' (due ' + o.due + ')' + (o.desc ? ' — ' + o.desc : '')
  );
  const body = 'The following cheque payments are past their due date and still marked Pending clearance:\n\n'
    + lines.join('\n')
    + '\n\nOpen the ledger and mark each one Cleared or Bounced once you know the outcome — a Bounced cheque automatically adds its amount back into that balance.';
  MailApp.sendEmail({
    to: email,
    subject: BUSINESS_NAME + ' — ' + overdue.length + ' overdue cheque' + (overdue.length === 1 ? '' : 's') + ' pending clearance',
    body: body
  });
}

// ============================================================
// PIN RECOVERY BY EMAIL (2026-08-22) — "forgot pin to send recovery
// password to gmail" — an alternative to the on-device security
// question for resetting a forgotten PIN. Sends a one-time 6-digit code
// to the SAME account the weekly backup already goes to (the account
// that owns/deployed this script) — not whichever Google account is
// signed in on the phone — so a code always lands with the shop owner
// regardless of who's locked out. Code + expiry live in this script's
// own Script Properties, never in the sheet or the app.
// ============================================================
const PIN_RECOVERY_CODE_PROP_ = 'PIN_RECOVERY_CODE';
const PIN_RECOVERY_EXPIRES_PROP_ = 'PIN_RECOVERY_EXPIRES';
const PIN_RECOVERY_CODE_TTL_MS_ = 10 * 60 * 1000; // 10 minutes

function sendPinRecoveryCode_(){
  const email = getBackupEmailAddress_();
  if(!email) return { ok: false, error: 'No account email available to send to.' };
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const props = PropertiesService.getScriptProperties();
  props.setProperty(PIN_RECOVERY_CODE_PROP_, code);
  props.setProperty(PIN_RECOVERY_EXPIRES_PROP_, String(Date.now() + PIN_RECOVERY_CODE_TTL_MS_));
  MailApp.sendEmail({
    to: email,
    subject: BUSINESS_NAME + ' — PIN reset code',
    body: 'Your PIN reset code is: ' + code + '\n\nThis code expires in 10 minutes. If you didn\'t request this, you can safely ignore this email — your PIN hasn\'t changed.'
  });
  // Mask for display in the app (e.g. "u***n@gmail.com") without fully
  // exposing the address to whoever's standing at the locked phone.
  const at = email.indexOf('@');
  const masked = at > 1 ? (email[0] + '***' + email.slice(at - 1)) : email;
  return { ok: true, email: masked };
}
function verifyPinRecoveryCode_(submittedCode){
  const props = PropertiesService.getScriptProperties();
  const code = props.getProperty(PIN_RECOVERY_CODE_PROP_);
  const expires = Number(props.getProperty(PIN_RECOVERY_EXPIRES_PROP_) || 0);
  if(!code || Date.now() > expires) return { ok: false, error: 'expired' };
  if(String(submittedCode).trim() !== code) return { ok: false, error: 'incorrect' };
  // One-time use — clear it the moment it's successfully used, so the
  // same code can't be replayed to reset the PIN again later.
  props.deleteProperty(PIN_RECOVERY_CODE_PROP_);
  props.deleteProperty(PIN_RECOVERY_EXPIRES_PROP_);
  return { ok: true };
}

// ============================================================
// PUSH NOTIFICATIONS (2026-08-22) — mirrors the exact same 5 categories
// the app's own Notifications tab computes client-side (see
// getPendingInquiries_, getPendingCheques_, getPendingSlips_,
// getPendingOrderReceipts_, getLowStockAlerts_ in index.html), but runs
// here on a timer instead, so a push still goes out even when nobody
// has the app open anywhere. See setupPushNotifications below to turn
// this on for the first time.
// ============================================================

const FCM_SERVICE_ACCOUNT_PROP_ = 'FCM_SERVICE_ACCOUNT_JSON';

// ONE-TIME SETUP: paste the ENTIRE contents of the service-account JSON
// key you downloaded from Firebase Console > Project Settings > Service
// Accounts > Generate new private key between the backticks below, then
// open the function dropdown above, select "saveFcmServiceAccount",
// click Run, and accept the permissions prompt. This stores it in THIS
// SCRIPT's own Script Properties — private to this Apps Script project,
// never part of index.html or the GitHub repo, and never sent to the
// app. Safe to delete the pasted JSON from here afterwards; it's saved.
function saveFcmServiceAccount(){
  const SERVICE_ACCOUNT_JSON = `PASTE_YOUR_SERVICE_ACCOUNT_JSON_HERE`;
  if(SERVICE_ACCOUNT_JSON.indexOf('PASTE_') === 0){
    throw new Error('Paste your service-account JSON between the backticks above first, then run this again.');
  }
  // The private_key field's PEM block is supposed to keep its line breaks
  // as an escaped "\n" (two characters: backslash, n) — but pasting
  // through some editors/clipboards silently turns those into real
  // newline bytes instead, which raw JSON.parse rejects ("Bad control
  // character in string literal"). sanitizeJsonControlChars_ below fixes
  // exactly that (and stray real tabs/carriage-returns the same way)
  // before parsing, so this works regardless of how the paste mangled it.
  const cleaned = sanitizeJsonControlChars_(SERVICE_ACCOUNT_JSON);
  const parsed = JSON.parse(cleaned); // throws early with a clear error if it's still not valid JSON
  if(!parsed.private_key || !parsed.client_email || !parsed.project_id){
    throw new Error('That JSON is missing private_key/client_email/project_id — make sure you copied the whole file.');
  }
  PropertiesService.getScriptProperties().setProperty(FCM_SERVICE_ACCOUNT_PROP_, cleaned);
}
// Walks the text tracking whether we're inside a JSON string (respecting
// \" escapes), and only inside a string, replaces a literal newline/
// carriage-return/tab byte with its proper escaped form. Formatting
// whitespace BETWEEN fields (which JSON allows freely) is left exactly
// as-is — only whitespace that landed illegally inside a string value
// (almost always the private_key PEM block) gets fixed.
function sanitizeJsonControlChars_(text){
  let result = '';
  let inString = false;
  let escaped = false;
  for(let i = 0; i < text.length; i++){
    const ch = text.charAt(i);
    if(inString){
      if(escaped){ result += ch; escaped = false; continue; }
      if(ch === '\\'){ result += ch; escaped = true; continue; }
      if(ch === '"'){ inString = false; result += ch; continue; }
      if(ch === '\n'){ result += '\\n'; continue; }
      if(ch === '\r'){ result += '\\r'; continue; }
      if(ch === '\t'){ result += '\\t'; continue; }
      result += ch;
    } else {
      if(ch === '"') inString = true;
      result += ch;
    }
  }
  return result;
}

// RUN ONCE (one-time only, AFTER saveFcmServiceAccount above): open the
// function dropdown, select "setupPushNotifications", click Run, accept
// the permissions prompt. Installs the timer that checks for new
// pending items and sends real pushes for them, starting at the same
// 15-minute default the Settings > Notification Alerts card shows —
// changing that dropdown in the app calls setPushFrequency (see doPost)
// which re-installs this trigger with the new interval automatically,
// so this never needs to be re-run by hand afterwards.
function setupPushNotifications(){
  setupPushCheckTrigger_(15);
}

function setupPushCheckTrigger_(minutes){
  const allowed = [5, 15, 30, 60];
  const m = allowed.indexOf(Number(minutes)) > -1 ? Number(minutes) : 15;
  ScriptApp.getProjectTriggers().forEach(t=>{
    if(t.getHandlerFunction() === 'checkAndSendPushNotifications_') ScriptApp.deleteTrigger(t);
  });
  // everyMinutes() only accepts 1/5/10/15/30 — 60 needs everyHours(1).
  let builder = ScriptApp.newTrigger('checkAndSendPushNotifications_').timeBased();
  builder = (m === 60) ? builder.everyHours(1) : builder.everyMinutes(m);
  builder.create();
  PropertiesService.getScriptProperties().setProperty('PUSH_CHECK_FREQUENCY_MIN', String(m));
}

function base64UrlEncode_(bytes){
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

// Exchanges the service account's private key for a short-lived FCM
// access token (RS256-signed JWT bearer flow) — this is what lets the
// script send pushes with no user signed in anywhere. Cached for 50 of
// its 60-minute lifetime so a trigger running every 5 minutes doesn't
// re-sign a fresh JWT on every single run.
function getFcmAccessToken_(){
  const cache = CacheService.getScriptCache();
  const cached = cache.get('fcm_access_token');
  if(cached) return cached;
  const raw = PropertiesService.getScriptProperties().getProperty(FCM_SERVICE_ACCOUNT_PROP_);
  if(!raw) throw new Error('FCM service account not set up yet — run saveFcmServiceAccount() once from the function dropdown.');
  const sa = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600
  };
  const toSign = base64UrlEncode_(Utilities.newBlob(JSON.stringify(header)).getBytes())
    + '.' + base64UrlEncode_(Utilities.newBlob(JSON.stringify(claim)).getBytes());
  const signature = Utilities.computeRsaSha256Signature(toSign, sa.private_key);
  const jwt = toSign + '.' + base64UrlEncode_(signature);
  const resp = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt },
    muteHttpExceptions: true
  });
  const json = JSON.parse(resp.getContentText());
  if(!json.access_token) throw new Error('FCM auth failed: ' + resp.getContentText());
  cache.put('fcm_access_token', json.access_token, 50 * 60);
  return json.access_token;
}
function fcmProjectId_(){
  const raw = PropertiesService.getScriptProperties().getProperty(FCM_SERVICE_ACCOUNT_PROP_);
  return raw ? (JSON.parse(raw).project_id || '') : '';
}
// Sends one push to one device. Returns false (and quietly forgets that
// token — see removePushToken_ below) for an UNREGISTERED/NOT_FOUND
// token, since that just means the app was uninstalled or its data was
// cleared on that phone — an expected, ordinary thing over time, not a
// real error worth surfacing anywhere.
// FIX (2026-08-27, user report + screenshot: the exact same "Missing
// Receipt" alert delivered as two separate Android notifications at once):
// root cause was this same phone ending up with two live rows in the
// PushTokens sheet (an old FCM token that never got cleaned up, plus the
// new one issued after a token rotation/reinstall — see the client-side
// fix in wirePushListeners_'s 'registration' listener, which now deletes
// its own old token as soon as a new one arrives). That fix stops NEW
// duplicate rows from being created, but as a second, independent safety
// net, `tag` now travels through to Android's own notification (see the
// android.notification.tag param below) — Android collapses any
// notification sharing the same tag for this app into one, no matter
// which token/registration delivered it, so even a stray leftover
// duplicate row (from before this fix, or any other edge case) can only
// ever show as ONE notification on the phone instead of stacking.
function sendPushToToken_(fcmToken, title, body, data, tag){
  const accessToken = getFcmAccessToken_();
  const projectId = fcmProjectId_();
  const android = { priority: 'high' };
  if(tag) android.notification = { tag: String(tag) };
  const message = { message: {
    token: fcmToken,
    notification: { title: title, body: body },
    data: data || {},
    android: android
  }};
  const resp = UrlFetchApp.fetch('https://fcm.googleapis.com/v1/projects/' + projectId + '/messages:send', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + accessToken },
    payload: JSON.stringify(message),
    muteHttpExceptions: true
  });
  if(resp.getResponseCode() >= 400){
    const errText = resp.getContentText();
    if(errText.indexOf('UNREGISTERED') !== -1 || errText.indexOf('NOT_FOUND') !== -1) removePushToken_(fcmToken);
    return false;
  }
  return true;
}

function getPushTokens_(){
  return readTable_(SHEETS.pushTokens).map(r=>{
    let mutePrefs = {};
    try{ mutePrefs = r.mutePrefs ? JSON.parse(r.mutePrefs) : {}; }catch(e){ mutePrefs = {}; }
    return { token: r.token || '', deviceName: r.deviceName || '', mutePrefs: mutePrefs };
  }).filter(t => t.token);
}
function upsertPushToken_(fcmToken, deviceName, mutePrefs){
  if(!fcmToken) return;
  const sh = getSheet_(SHEETS.pushTokens);
  if(sh.getLastRow() === 0) sh.appendRow(['Token', 'DeviceName', 'MutePrefs', 'UpdatedAt']);
  const values = sh.getDataRange().getValues();
  let rowIndex = -1;
  for(let i = 1; i < values.length; i++){
    if(values[i][0] === fcmToken){ rowIndex = i + 1; break; }
  }
  const row = [fcmToken, deviceName || '', JSON.stringify(mutePrefs || {}), new Date()];
  if(rowIndex > -1) sh.getRange(rowIndex, 1, 1, 4).setValues([row]);
  else sh.appendRow(row);
}
function removePushToken_(fcmToken){
  const sh = getSheet_(SHEETS.pushTokens);
  const values = sh.getDataRange().getValues();
  for(let i = values.length - 1; i >= 1; i--){
    if(values[i][0] === fcmToken){ sh.deleteRow(i + 1); break; }
  }
}

// Every alert already sent, keyed by a stable id for that exact pending
// item (an order id, a specific cheque entry, a specific low-stock
// product...) — see computePendingPushItems_ below for how each key is
// built. Stores WHEN each was last pushed, not just whether — so
// checkAndSendPushNotifications_ can re-remind about something that's
// STILL pending after a while (see PUSH_REMINDER_INTERVAL_MS_ below),
// rather than pushing exactly once ever and going silent. A key that
// resolves (cheque cleared, receipt attached, restocked...) simply
// drops out, so if the same situation ever happens again later it's
// treated as new and can alert again from scratch.
// Configurable from Settings > Notification Alerts > "Remind Me Again
// After" (see action==='setPushReminderInterval' in doPost) — defaults
// to 24h until the person picks something else. 0 means "never repeat,
// push once only" (the original behavior).
function getPushReminderIntervalMs_(){
  const raw = PropertiesService.getScriptProperties().getProperty('PUSH_REMINDER_INTERVAL_HOURS');
  const hours = raw !== null ? Number(raw) : 24;
  return hours * 60 * 60 * 1000;
}
function getSentPushKeyTimestamps_(){
  const sh = getSheet_(SHEETS.pushNotifyLog);
  if(sh.getLastRow() === 0) return {};
  const values = sh.getRange(1, 1, sh.getLastRow(), 2).getValues();
  const map = {};
  values.forEach(r => { if(r[0]) map[r[0]] = r[1] ? new Date(r[1]).getTime() : 0; });
  return map;
}
function writeSentPushKeyTimestamps_(map){
  const sh = getSheet_(SHEETS.pushNotifyLog);
  sh.clearContents();
  const rows = Object.keys(map).map(k => [k, new Date(map[k])]);
  if(rows.length) sh.getRange(1, 1, rows.length, 2).setValues(rows);
}

// The 5-category scan itself — deliberately built from the SAME read*_
// functions loadAll_ already uses (readTransactions_, readPaintLedger_,
// etc.), so this can never drift out of sync with what the sheet
// actually holds. Field names/shapes here intentionally mirror
// getPendingInquiries_/getPendingCheques_/getPendingSlips_/
// getPendingOrderReceipts_/getLowStockAlerts_ in index.html — if you
// ever change what counts as "pending" there, mirror the change here too.
function computePendingPushItems_(){
  const items = [];
  const today = new Date(); today.setHours(0,0,0,0);

  readTransactions_().forEach(t=>{
    if(!t.factory) return;
    if(t.confirmed === false){
      items.push({
        key: 'inquiry:' + t.id, category: 'pending_inquiries',
        title: 'Pending Inquiry',
        body: (t.factory || '') + ' — Order #' + t.id + (t.total ? (' · Rs ' + t.total) : '')
      });
    }
    if(!t.receiptUrl){
      items.push({
        key: 'gatereceipt:' + t.id, category: 'pending_gate_receipts',
        title: 'Missing Gate Receipt',
        body: 'Order #' + t.id + ' / ' + (t.factory || '') + (t.total ? (' · Rs ' + t.total) : '')
      });
    }
  });

  function scanCheques(list, sourceLabel, kind){
    (list || []).forEach(bucket=>{
      (bucket.entries || []).forEach(e=>{
        if(e.method === 'Cheque' && e.chequeStatus === 'pending'){
          items.push({
            key: 'cheque:' + kind + ':' + bucket.name + ':' + (e.id || (e.date + '|' + e.chequeDate + '|' + e.desc)),
            category: 'pending_cheque_clearances', title: 'Pending Cheque',
            body: sourceLabel + ' — ' + bucket.name + ' · Rs ' + ((e.debit || 0) || (e.credit || 0))
          });
        }
      });
    });
  }
  scanCheques(readPaintLedger_(), 'Paint Ledger', 'paint');
  scanCheques(readRawLedger_(), 'Raw Material', 'rawmaterial');
  scanCheques(readCustomerLedger_(), 'Customer / Factory Ledger', 'customerledger');
  scanCheques(readLabourSheet_(), 'Labour Ledger', 'labourledger');
  scanCheques(readCustomLedgers_(), 'Custom Ledgers', 'customledger');
  // ADD (2026-08-25, user request): Scrap Ledger — same pending-cheque
  // push-notification coverage as every other ledger. Deliberately NOT
  // added to scanSlips below — Scrap Ledger entries have no receipt-
  // attachment feature at all (out of scope for this build), so every
  // non-cash entry would permanently show as "missing receipt" with no
  // way to ever clear it.
  scanCheques(readScrapLedger_(), 'Scrap Ledger', 'scrapledger');

  // ADD (2026-08-25, user request): Withdrawal Ledger — same pending-cheque
  // push-notification coverage, but Withdrawal is a FLAT array (see
  // readWithdrawal_), not roster+entries like every list scanCheques()
  // above expects (bucket.entries) — so this is its own small scan using
  // the entry's own Description as the identifying label instead of a
  // buyer/supplier/painter name (Withdrawal has no such per-party concept).
  (readWithdrawal_() || []).forEach(w=>{
    if(w.method === 'Cheque' && w.chequeStatus === 'pending'){
      items.push({
        key: 'cheque:withdrawal:' + (w.id || (w.date + '|' + w.chequeDate + '|' + w.desc)),
        category: 'pending_cheque_clearances', title: 'Pending Cheque',
        body: 'Withdrawal Ledger — ' + (w.desc || '') + ' · Rs ' + (w.amount || 0)
      });
    }
  });

  function scanSlips(list, sourceLabel, kind){
    (list || []).forEach(bucket=>{
      (bucket.entries || []).forEach(e=>{
        if(e.method && e.method !== 'Cash' && !e.receiptUrl){
          items.push({
            key: 'slip:' + kind + ':' + bucket.name + ':' + (e.id || (e.date + '|' + e.method + '|' + e.desc)),
            category: 'pending_slips', title: 'Missing Receipt',
            body: sourceLabel + ' — ' + bucket.name + ' · ' + e.method
          });
        }
      });
    });
  }
  scanSlips(readPaintLedger_(), 'Paint Ledger', 'paint');
  scanSlips(readRawLedger_(), 'Raw Material', 'rawmaterial');
  scanSlips(readCustomerLedger_(), 'Customer / Factory Ledger', 'customerledger');
  scanSlips(readLabourSheet_(), 'Labour Ledger', 'labourledger');
  scanSlips(readCustomLedgers_(), 'Custom Ledgers', 'customledger');
  readCustomerPayments_().forEach(p=>{
    if(p.method && p.method !== 'Cash' && !p.receiptUrl){
      items.push({
        key: 'slip:transaction:' + (p.id || p.txnId), category: 'pending_slips', title: 'Missing Receipt',
        body: 'Order #' + (p.txnId || '') + ' · ' + p.method
      });
    }
  });
  readExpenses_().forEach(x=>{
    if(x.method && x.method !== 'Cash' && !x.receiptUrl){
      items.push({
        key: 'slip:expense:' + x.id, category: 'pending_slips', title: 'Missing Receipt',
        body: (x.desc || 'Expense') + ' · ' + x.method
      });
    }
  });

  readCustomLedgers_().forEach(cl=>{
    const s = cl.weightStock && cl.weightStock[''];
    if(s && (s.weight || 0) > 0 && (s.remaining || 0) <= 0){
      items.push({
        key: 'lowstock:customledger:' + cl.name, category: 'low_stock_alerts', title: 'Stock Depleted',
        body: cl.name + ' — had ' + s.weight + 'kg, none remaining'
      });
    }
  });
  readProducts_().forEach(p=>{
    if(p.stock === undefined) return;
    const level = (p.reorderLevel || p.reorderLevel === 0) ? p.reorderLevel : 5;
    if(p.stock <= level){
      items.push({
        key: 'lowstock:product:' + p.id, category: 'low_stock_alerts', title: 'Low Stock',
        body: p.name + ' — ' + p.stock + ' left (reorder level ' + level + ')'
      });
    }
  });

  return items;
}

// The trigger's actual entry point (see setupPushNotifications above).
// Pushes for every genuinely NEW pending item, to every registered
// phone that hasn't muted that item's category — and re-pushes for
// anything that's STILL pending once PUSH_REMINDER_INTERVAL_MS_ has
// passed since it last alerted, so a forgotten cheque/receipt/order
// keeps nudging rather than going silent after the first push.
function checkAndSendPushNotifications_(){
  const items = computePendingPushItems_();
  const lastSent = getSentPushKeyTimestamps_();
  const now = Date.now();
  const reminderMs = getPushReminderIntervalMs_();
  const tokens = getPushTokens_();
  const nextLog = {};
  if(!tokens.length){
    // Nobody has push turned on yet — still record today's pending items
    // so that whoever DOES turn it on later only gets notified about
    // NEW items from that point on, not a flood of every already-
    // existing pending item the moment they enable it.
    items.forEach(it => { nextLog[it.key] = lastSent[it.key] || now; });
    writeSentPushKeyTimestamps_(nextLog);
    return;
  }
  items.forEach(it=>{
    const prev = lastSent[it.key];
    const isNew = !prev;
    const dueForReminder = prev && reminderMs > 0 && (now - prev >= reminderMs);
    if(isNew || dueForReminder){
      tokens.forEach(t=>{
        if(t.mutePrefs[it.category] === false) return; // this phone muted this category
        sendPushToToken_(t.token, it.title, it.body, { category: it.category }, it.key);
      });
      nextLog[it.key] = now;
    } else {
      nextLog[it.key] = prev;
    }
  });
  writeSentPushKeyTimestamps_(nextLog);
}

// ============================================================
// GMAIL BACKUP (automatic + on-demand) — makes a full, independent copy
// of this ENTIRE spreadsheet (every tab, every row, exactly as it stands)
// into a dedicated "Amir Traders Backups" Drive folder, then emails you
// the link. Deliberately a real spreadsheet copy rather than a raw file
// attachment — it's instantly restorable (just open it, or File > Make a
// copy back into place) and needs no extra permissions beyond what
// DriveApp/MailApp already have authorized for receipts and the cheque
// reminder above, so no new authorization prompt is needed.
//
// ONE-TIME SETUP for automatic backups: open the function dropdown at the
// top of this editor, select "setupBackupEmailTrigger", click Run, accept
// the permissions prompt if asked. This installs a DAILY trigger (changed
// 2026-08-26 from weekly, per user request) — see the .everyDays(...) line
// below to change how often. Safe to re-run any time; it always clears its
// own old trigger first so you never end up with duplicates. Manual/
// on-demand backups (the app's "Send Backup Now" button in Settings) work
// immediately without this setup step, since they call sendBackupEmail_
// directly rather than through a trigger.
// ============================================================
function setupBackupEmailTrigger(){
  ScriptApp.getProjectTriggers().forEach(t=>{
    if(t.getHandlerFunction() === 'sendBackupEmail_') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendBackupEmail_')
    .timeBased()
    .everyDays(1) // CHANGED (2026-08-26, user request): daily instead of weekly — change back to 7 for weekly if ever wanted
    .atHour(6) // 6 AM — change this number (0-23) to reschedule
    .create();
}
function getBackupFolder_(){
  const name = BACKUP_FOLDER_NAME;
  const existing = DriveApp.getFoldersByName(name);
  return existing.hasNext() ? existing.next() : DriveApp.createFolder(name);
}
// Keeps only the most recent N backup copies so Drive doesn't quietly
// fill up with years of old snapshots — trashes (not permanently deletes)
// anything older, so a mistaken prune is still recoverable from Trash.
function pruneOldBackups_(folder, keep){
  const files = [];
  const it = folder.getFiles();
  while(it.hasNext()) files.push(it.next());
  files.sort(function(a,b){ return b.getDateCreated() - a.getDateCreated(); });
  files.slice(keep).forEach(function(f){ f.setTrashed(true); });
}
// Called by the weekly trigger above, and also directly from doGet's
// 'sendBackupNow' action for an immediate on-demand backup triggered from
// the app's own Settings screen.
// ADD (2026-08-31): lets the shop owner see AND override where backup
// emails, overdue-cheque alerts, and PIN-recovery codes all go — all three
// previously hardcoded to Session.getActiveUser().getEmail() (whoever
// deployed this script), with no way to confirm or change it from inside
// the app. Stored in Script Properties (same mechanism already used for
// FCM config, push intervals, etc. — see PropertiesService usage
// elsewhere in this file). Falls back to the original deploy-account
// behavior when no override has ever been set, so an existing install
// keeps working exactly as before until someone explicitly sets one — no
// migration needed. A SINGLE shared function so all three email sites can
// never drift apart — see sendPinRecoveryCode_'s own comment on why it
// deliberately reuses "the same account the weekly backup already goes
// to"; routing all three through one function keeps that guarantee true
// even after an override is set, instead of only the backup email moving
// while PIN recovery silently keeps going to the old address.
const BACKUP_EMAIL_OVERRIDE_PROP_ = 'BACKUP_EMAIL_OVERRIDE';
function getBackupEmailAddress_(){
  const override = PropertiesService.getScriptProperties().getProperty(BACKUP_EMAIL_OVERRIDE_PROP_);
  if(override) return override;
  return Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail();
}
function sendBackupEmail_(){
  const email = getBackupEmailAddress_();
  if(!email) return;
  const folder = getBackupFolder_();
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'GMT+5', 'dd-MMM-yyyy HH-mm');
  const original = DriveApp.getFileById(SHEET_ID);
  const copy = original.makeCopy(BUSINESS_NAME + ' Backup — ' + stamp, folder);
  pruneOldBackups_(folder, 10);
  MailApp.sendEmail({
    to: email,
    subject: BUSINESS_NAME + ' — Backup (' + stamp + ')',
    body: 'A full backup of your ' + BUSINESS_NAME + ' Google Sheet was just created.\n\n'
      + 'Open it anytime here: ' + copy.getUrl()
      + '\n\nThis is a complete, independent copy — every ledger, every row, exactly as it stood at the time above. '
      + 'It keeps working even if something ever goes wrong with the live sheet. The 10 most recent backups are kept; older ones are moved to Drive Trash automatically.'
  });
  // FIX (2026-08-25, user request): record when this actually happened so
  // the app itself can show "last backup email: ..." and nudge if it looks
  // overdue, instead of the only record living in a Gmail inbox nobody
  // necessarily checks regularly. Meta is a small flat key/value tab and
  // writeRows_ always rewrites the WHOLE tab (clearContents() then a full
  // re-write, see writeRows_ above) — never a patch of just one row — so
  // this has to read every other Meta key first via readMeta_() and write
  // them all back unchanged, the same read-merge-write shape saveAll_ uses
  // just below for txnNumber/rawMaterialReorderLevels/etc. Skipping that
  // and writing only ['lastBackupEmailAt', ...] would silently blank out
  // txnNumber and every other Meta key the instant a backup email goes
  // out — a new, self-inflicted bug worse than the missing feature this is
  // meant to add.
  const nowIso = new Date().toISOString();
  const m = readMeta_();
  writeRows_(SHEETS.meta,
    ['key','value'],
    [
      ['txnNumber', m.txnNumber || 1],
      ['sessionTotal', m.sessionTotal || 0],
      ['sessionCount', m.sessionCount || 0],
      ['rawMaterialReorderLevels', JSON.stringify(m.rawMaterialReorderLevels || {})],
      ['rawMaterialItemReorderLevels', JSON.stringify(m.rawMaterialItemReorderLevels || {})],
      ['rawMaterialUnits', JSON.stringify(m.rawMaterialUnits || {})],
      ['rawLedgerDescriptions', JSON.stringify(m.rawLedgerDescriptions || [])],
      ['rawMaterialResetAt', JSON.stringify(m.rawMaterialResetAt || {})],
      ['lastBackupEmailAt', nowIso],
      // FIX (2026-08-26, found while adding orderTombstoneResetToken below):
      // this write was missing scrapDescriptions/scrapItemNames/scrapTypes/
      // withdrawalDescriptions/withdrawalByList/withdrawalInList entirely —
      // since writeRows_ always rewrites the WHOLE Meta tab (see the block
      // comment above this function), every one of those six saved-
      // suggestion lists was getting silently blanked back to [] on the
      // sheet every single time a backup email went out (scheduled OR
      // "Send Backup Now"). Carrying them all forward unchanged now, same
      // read-merge-write shape saveAll_ already uses.
      ['scrapDescriptions', JSON.stringify(m.scrapDescriptions || [])],
      ['scrapItemNames', JSON.stringify(m.scrapItemNames || [])],
      ['scrapTypes', JSON.stringify(m.scrapTypes || [])],
      ['withdrawalDescriptions', JSON.stringify(m.withdrawalDescriptions || [])],
      ['withdrawalByList', JSON.stringify(m.withdrawalByList || [])],
      ['withdrawalInList', JSON.stringify(m.withdrawalInList || [])],
      // Carry-forward only — see saveAll_'s matching comment.
      ['orderTombstoneResetToken', m.orderTombstoneResetToken || 0]
    ]
  );
  return nowIso;
}

const SHEETS = {
  // NOTE: this must match your sheet's actual tab name exactly. It was
  // 'Order Booked' — but your spreadsheet's tab is named 'Transactions',
  // so every save was silently auto-creating a brand-new 'Order Booked'
  // tab (see getSheet_ below: it creates a tab if the name doesn't exist)
  // instead of ever touching the 'Transactions' tab you were checking.
  // Nothing was actually failing — the app just kept writing successfully
  // into a tab you weren't looking at. Fixed to point at 'Transactions'.
  transactions: 'Transactions',
  customerPayments: 'Customer Payments', // partial/full payments against a transaction id — see readCustomerPayments_
  accountsSummary: 'Accounts Summary', // Cash/Bank/Online balances — write-only mirror, app computes this live itself
  inventory: 'Inventory',
  painters: 'Painters',
  paintLedger: 'PaintLedger',
  suppliers: 'Suppliers',
  rawLedger: 'RawLedger',
  // ADD (2026-08-25, user request): Scrap Ledger — same roster+entries
  // shape as Suppliers/RawLedger above (see readScrapLedger_/the
  // ScrapLedger write block in saveAll_ below), tracking scrap buyers
  // instead of raw material suppliers.
  scrapBuyers: 'ScrapBuyers',
  scrapLedger: 'ScrapLedger',
  // ADD (2026-08-25, user request): Withdrawal Ledger — flat array (like
  // Expenses), NOT roster+entries like ScrapBuyers/ScrapLedger above, since
  // a withdrawal has no per-party balance concept.
  withdrawal: 'Withdrawal',
  labour: 'Labour', // the one ledger tab — every row belongs to a worker, profile columns repeated on each row
  labourLists: 'Labour Lists', // the 4 saved-suggestion lists (different kind of data — settings, not ledger rows)
  products: 'Products',
  salesSummary: 'Sales Summary',
  expensesSummary: 'Expenses Summary',
  factories: 'Factories',
  customerLedger: 'CustomerLedger', // per-factory debit/credit entries — roster comes from Factories itself
  // ADD (2026-08-30, Tax Invoice feature): per-entry tax data for the
  // Customer/Factory Ledger, kept in its OWN tab rather than as extra
  // columns on CustomerLedger itself (per user's explicit request — the
  // normal ledger stays completely untouched). Linked back to its parent
  // CustomerLedger row by that row's own EntryId ('id' below), so a debit
  // entry's Tax %/Tax Amt can be found without touching the main sheet at
  // all. Only debit entries that were actually given a Tax % ever get a
  // row here — untaxed/older entries simply have no matching row, and
  // read back with tax = 0 (see readCustomerLedgerTaxMap_/readCustomerLedger_).
  customerLedgerTax: 'CustomerLedger_Tax',
  customLedgerRoster: 'Custom Ledgers', // roster of custom ledgers (name, balance) — see CustomLedgerEntries below
  customLedgerEntries: 'CustomLedgerEntries', // every debit/credit entry across all custom ledgers, one row per entry
  expenses: 'Expenses',
  expenseCategories: 'Expense Categories',
  meta: 'Meta',
  // ADD (2026-08-22): see the PUSH NOTIFICATIONS section below —
  // PushTokens is one row per phone with alerts turned on (its FCM
  // token + its own mute/type preferences), PushNotifyLog is every
  // alert already sent so the same pending item doesn't re-notify on
  // every single trigger run.
  pushTokens: 'PushTokens',
  pushNotifyLog: 'PushNotifyLog',
  // ADD (2026-08-23): see recordDeletions_/readDeletions_ below — one row
  // per deletion this device has ever confirmed to the backend
  // ('bucket','key'), so EVERY device (not just the one that did the
  // deleting) can learn about a deletion before it builds its own next
  // save. This is what closes the "delete on phone A, phone B (which had
  // a stale local copy and a failing sync) reconnects and pushes it
  // back" hole — deletedIds_ in index.html used to live ONLY in that one
  // device's localStorage, so no other device ever found out.
  deletions: 'Deletions'
};

// Each ledger/section that supports receipt uploads gets its OWN Drive
// folder (rather than everything piling into one shared folder), so it's
// easy to browse and stays organised as more ledgers get added later.
// Column layout for the "Labour" tab. Every row belongs to one worker —
// their name/work type/rate type/start-end date are repeated on EVERY row
// for that worker (a catalog row, a ledger entry, or a bare placeholder
// row for a worker with no activity yet), so any single row reads on its
// own without needing a "row type" label to decode it. What kind of row
// it is can be told from which columns are filled:
//   - Date filled            -> a ledger entry (attendance/payment/advance)
//   - Date blank, Sticks/
//     Weight/GuardSize filled -> a configured piece-rate (for that size)
//   - everything past EndDate blank -> just a profile row (no activity yet)
// RowType is a purely cosmetic column (never read back by
// readLabourSheet_ — that still infers the row kind from which columns
// are filled, same as before) added so a piece-rate config row and its
// matching attendance entry don't LOOK like a duplicate at a glance in
// the sheet. Values: "Piece Rate" (a configured size/rate), "Entry" (an
// attendance/payment/advance), "Profile" (a worker with no activity yet).
const LABOUR_HEADER = [
  'Worker','RowType','WorkType','RateType','Rate','StartDate','EndDate',
  'GuardSize','Weight','Sticks','Size',
  'EntryId','Date','Time','Kind','Status','Units','Note','Debit','Credit','Balance',
  'Method','MethodDetail','ChequeDate','ChequeStatus','ReceivedBy','ReceivedIn','Receipt','Photo','Device',
  // Advance/Loan (2026-08-19, appended at the end so nothing above shifts):
  // DERIVED, display-only columns for at-a-glance sheet readability — the
  // user asked to see Advance and Loan broken out separately instead of
  // having to check the Kind column to tell which entries in the single
  // Debit total are which. `Debit` (+ `Kind`) stays the real source of
  // truth the app reads back (see readLabourSheet_'s `debit: Number(r.Debit)`)
  // — these two never are, same "write-only" pattern already used
  // elsewhere in this file (mirrors the app's own PDF/CSV/JPG export,
  // which already splits Payment/Advance/Loan into their own columns —
  // see labourLedgerRows_ in index.html).
  'Advance','Loan'
];
// StartDate, EndDate, Date, Time — plain text, so Sheets doesn't
// auto-convert them to its own Date/Time type (see writeRows_ below for
// why that matters). GuardSize, Weight, Sticks, Size are ALSO forced to
// text for the same reason: a value like "8" (Sticks No.) or "12" (a
// guard size typed as just a number) looks numeric to Sheets and gets
// silently turned into a real number on write. Read back later, that
// number breaks any code that expects a string (e.g. calling
// .toLowerCase() on it in the app) — which is exactly what caused the
// "v.toLowerCase is not a function" save failure. MethodDetail (e.g. an
// account number or phone number) and ChequeDate get the same
// text-forcing, for the same reason. Column numbers are 1-based
// positions in LABOUR_HEADER.
const LABOUR_TEXT_COLS = [6,7,8,9,10,11,13,14,23,24,25,26,27];
// 1-based position of the Photo column in LABOUR_HEADER — see the
// "photoCol" param on safeWriteRows_/writeRows_ for what this drives.
const LABOUR_PHOTO_COL = 29;
function labourRow_(obj){
  return LABOUR_HEADER.map(h => (obj[h] !== undefined && obj[h] !== null) ? obj[h] : '');
}

const RECEIPT_FOLDERS = {
  expenses: 'POS Expense Receipts',
  rawLedger: 'POS Raw Material Ledger Receipts',
  customerPayments: 'POS Customer Payment Receipts',
  paintLedger: 'POS Painter Ledger Receipts',
  labour: 'POS Labour Ledger Receipts',
  customerLedger: 'POS Customer Ledger Receipts',
  customLedgerEntries: 'POS Custom Ledger Receipts',
  transactions: 'POS Order Receipts' // the factory's gate pass / receiving receipt attached via Order Booked's "Add Receipt" button — see saveAll_ above
};

// ================================================================
// PER-BUYER CONFIG — mirrors the same block in index.html (see that
// file's "PER-BUYER CONFIG" comment for the full reasoning). Business
// name and the Drive backup folder name used to be scattered as literal
// text across ~13 spots in THIS file alone (backup creation, recovery
// search messages, email subjects, log output) — now: change these two
// values, done, everywhere else in this file reads from here.
// ADD (2026-08-31, user request)
const BUSINESS_NAME = "Amir Traders";
const BACKUP_FOLDER_NAME = BUSINESS_NAME + " Backups";
// Paste your Google Sheet's ID here (the long string in its URL between
// /d/ and /edit, e.g. docs.google.com/spreadsheets/d/THIS_PART/edit).
// Using an explicit ID avoids "active spreadsheet" issues that can happen
// when this script runs as a Web App triggered from an external URL.
const SHEET_ID = "1sSuJiionVM2GZRr_V7f5y3_TGW0jjZGqNwsVrkWEVZ4";
// ================================================================

// ADD (2026-08-20): shared-secret gate on the web app. Before this, the
// deployment was reachable by ANYONE who had (or guessed, or pulled out of
// a decompiled APK) this URL — ?action=loadAll would hand over every
// ledger's data, and a crafted POST could overwrite/wipe the whole sheet,
// with zero check on who was asking. This is not real per-user auth (this
// app has no login system — see the PIN lock, which is a local-device
// convenience, not a server credential) — it's a shared secret the app
// already knows, same idea as an API key. Anyone without this exact string
// now gets rejected before doGet_/doPost_ touch the spreadsheet at all.
// MUST match SHEET_API_TOKEN in index.html exactly — if you ever rotate
// this, update both files together and redeploy, or the app will show
// "sync failed" on every request.
const API_TOKEN_ = "b9041187885007be5415b93a7fc59d96186fc1ec8c2c8972";
function isAuthorized_(token){
  return typeof token === 'string' && token === API_TOKEN_;
}

// Opening the spreadsheet (SpreadsheetApp.openById) is the slow part of
// every getSheet_() call — a network round trip, not a cheap lookup. A
// full loadAll_() touches 13+ tabs (transactions, inventory, painters,
// paintLedger, suppliers, rawLedger, labour, labourLists, products,
// factories, expenses, expenseCategories, meta) and saveAll_() touches
// even more, so calling getSheet_() once per tab used to re-open the
// SAME spreadsheet that many times in a single request. Caching it in
// this module-level variable means it's opened once per script
// execution and reused for every getSheet_() call after that — this is
// the main reason "Loading…" was slow, especially noticeable on a cold
// start. (Apps Script re-runs the whole file top-to-bottom on every
// execution, so this cache does NOT persist between separate requests —
// it only avoids repeat opens within one doGet/doPost call, which is
// exactly where the repetition was happening.)
let _ss_ = null;
function getSpreadsheet_(){
  if(!_ss_){
    _ss_ = SHEET_ID && SHEET_ID.indexOf('PASTE_') !== 0
      ? SpreadsheetApp.openById(SHEET_ID)
      : SpreadsheetApp.getActiveSpreadsheet();
  }
  return _ss_;
}

function getSheet_(name){
  const ss = getSpreadsheet_();
  let sh = ss.getSheetByName(name);
  if(!sh) sh = ss.insertSheet(name);
  return sh;
}

function doGet(e){
  const action = e.parameter.action;
  const callback = e.parameter.callback; // JSONP callback name, if provided
  let payload;
  try{
    if(!isAuthorized_(e.parameter.token)){
      // Deliberately vague — doesn't confirm/deny whether SHEET_ID or any
      // action name is valid, just that this caller isn't allowed in.
      payload = { error: 'Unauthorized' };
    } else if(action === 'loadAll'){
      // FIX (2026-08-21): root cause of "order is on the sheet but vanished
      // from the app after reopening on another phone" — saveAll_'s writes
      // (see below) clear a tab with clearContents() and then write the new
      // rows back a moment later; that's not instantaneous. This loadAll
      // path used to read the sheet with no coordination with an in-progress
      // save at all, so a load from one device landing in that narrow gap on
      // another device's save could read a tab as if a row it clears while
      // rewriting briefly didn't exist, and hand that incomplete snapshot to
      // the client as "the truth" — even though the sheet itself was never
      // actually missing anything and the save went on to finish correctly.
      // Taking the SAME script-wide lock saveAll_ uses means a load now
      // always waits for any in-progress save to fully finish first (and
      // vice versa — a save can't start clearing a tab while a load is
      // mid-read either), so a load can never again catch a tab in that
      // half-written state. tryLock's short timeout errs toward "briefly
      // unavailable, try again" (a normal, retried condition the app
      // already handles) rather than risking another silent read of
      // partially-written data.
      const loadLock = LockService.getScriptLock();
      const gotLoadLock = loadLock.tryLock(30000);
      if(!gotLoadLock){
        payload = { error: 'Server busy — a save is still in progress. Please try again in a moment.' };
      } else {
        try{
          // version is attached alongside the data so the client can
          // remember exactly which data-state this snapshot corresponds to
          // — see action==='version' below and getDataVersion_()'s comment
          // for why.
          payload = { data: loadAll_(), version: getDataVersion_() };
        } finally {
          loadLock.releaseLock();
        }
      }
    } else if(action === 'ping'){
      // Lightweight connection test for the app's "Test Connection" button —
      // deliberately does NOT call loadAll_() (which reads 13+ tabs and can
      // take 10-20+ seconds). Opening the target spreadsheet and reading its
      // name is enough to confirm both "is this deployment reachable" AND
      // "does SHEET_ID actually point at a real, accessible sheet" — the two
      // things most likely to be broken — without the full data load.
      const ss = SpreadsheetApp.openById(SHEET_ID);
      payload = { ok: true, sheetName: ss.getName() };
    } else if(action === 'version'){
      // SPEED: the app used to do a full loadAll() (10-20+ seconds on a
      // real amount of data) before almost every single save, purely to
      // check "did anything change on the sheet since I last looked" —
      // paid on every save, even though the overwhelming common case is
      // "no, nothing else touched this sheet since my last save a moment
      // ago". This is the cheap alternative: getDataVersion_() only reads
      // one number from Script Properties (no spreadsheet access at all),
      // so the app can ask "has anything actually changed?" first, and
      // only pay for the full loadAll() when the honest answer is yes.
      payload = { ok: true, version: getDataVersion_() };
    } else if(action === 'sendBackupNow'){
      // On-demand backup, triggered by the app's Settings > "Send Backup
      // Now" button. Runs synchronously — a Drive copy of the whole sheet
      // usually takes a couple of seconds, well within a normal request.
      // sendBackupEmail_() returns the ISO timestamp it just wrote to Meta
      // so the app can update its own "last backup email" display right
      // away, without waiting for the next full sync to pick it up.
      const sentAt = sendBackupEmail_();
      payload = { ok: true, lastBackupEmailAt: sentAt };
    } else if(action === 'getBackupEmail'){
      // Settings > Gmail Backup > "Backup Email Address" — lets the app
      // show where backups/overdue-cheque alerts/PIN-recovery codes
      // actually go today, without exposing whether that's a real
      // override or just the deploy-account default until asked.
      const override = PropertiesService.getScriptProperties().getProperty(BACKUP_EMAIL_OVERRIDE_PROP_);
      payload = { ok: true, email: getBackupEmailAddress_(), isOverride: !!override };
    } else {
      payload = { error: 'Unknown action' };
    }
  } catch(err){
    payload = { error: String(err) };
  }
  if(callback){
    // JSONP: browsers don't apply CORS rules to <script> tag loads,
    // so this works even though Apps Script doesn't send CORS headers.
    return ContentService
      .createTextOutput(callback + '(' + JSON.stringify(payload) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return jsonResponse_(payload);
}

function doPost(e){
  try{
    const body = JSON.parse(e.postData.contents);
    if(!isAuthorized_(body.token)){
      return jsonResponse_({ error: 'Unauthorized' });
    }
    if(body.action === 'saveAll'){
      // ADD (2026-08-20): saveAll_ does a full clearContents()+rewrite per
      // tab with no mutual exclusion — two saves landing within the same
      // moment (two phones at the counter, or a client retry firing while
      // the first attempt is still running) could previously interleave
      // their writes on the SAME tab, each one racing the other's
      // clearContents()/setValues() calls. That's real, silent ledger
      // corruption of a completely different kind than what safeWriteRows_
      // already guards against (which only stops a save from wiping a tab
      // down to empty — it does nothing about two non-empty saves
      // stomping on each other). LockService.getScriptLock() serializes
      // every saveAll_ call for this whole script, so a second save
      // literally waits its turn instead of running concurrently.
      // tryLock's 30s wait covers the slowest realistic saveAll_ (13+
      // tabs, photo embeds) — if it's still busy after that, this request
      // fails loudly with a real error instead of silently corrupting
      // data, and the client's existing retry logic picks it up again.
      const lock = LockService.getScriptLock();
      const gotLock = lock.tryLock(30000);
      if(!gotLock){
        return jsonResponse_({ error: 'Server busy — another save is still in progress. Please try again in a moment.' });
      }
      try{
        saveAll_(body.data);
      } finally {
        lock.releaseLock();
      }
      // Returning the resulting version lets the client update its own
      // "last known remote version" the instant its own save lands,
      // without needing a separate round trip to find out — see
      // action==='version' in doGet and computeRowsHash_'s SPEED comment.
      return jsonResponse_({ ok: true, version: getDataVersion_() });
    }
    // ADD (2026-08-22): called once this phone has an FCM token (see
    // enablePushNotifications_ in index.html) and again any time its
    // Settings > Notification Alerts card changes — same row every time
    // (matched on the token itself), so re-saving just updates it.
    if(body.action === 'savePushToken'){
      upsertPushToken_(body.fcmToken, body.deviceName, body.mutePrefs);
      return jsonResponse_({ ok: true });
    }
    // A phone that turns push off entirely (not just muting one category)
    // — stops it being sent to at all rather than leaving a stale row.
    if(body.action === 'deletePushToken'){
      removePushToken_(body.fcmToken);
      return jsonResponse_({ ok: true });
    }
    // Settings > Notification Alerts > "Check For New Alerts Every" — one
    // global trigger interval shared by every phone (Apps Script triggers
    // aren't per-caller), so whichever phone changes it last wins. Re-
    // installs the timer immediately, no separate setup step needed.
    if(body.action === 'setPushFrequency'){
      setupPushCheckTrigger_(body.minutes);
      return jsonResponse_({ ok: true });
    }
    // Settings > Notification Alerts > "Remind Me Again After" — how long
    // a STILL-pending item waits before re-pushing (see
    // getPushReminderIntervalMs_/checkAndSendPushNotifications_ above).
    // 0 = push once only, never repeat.
    if(body.action === 'setPushReminderInterval'){
      PropertiesService.getScriptProperties().setProperty('PUSH_REMINDER_INTERVAL_HOURS', String(Number(body.hours) || 0));
      return jsonResponse_({ ok: true });
    }
    // Settings > Gmail Backup > "Backup Email Address" — sets (or clears)
    // the override getBackupEmailAddress_() reads. An empty string clears
    // it, reverting backups/overdue-cheque alerts/PIN-recovery codes back
    // to the original deploy-account default — never leaves the app with
    // no working destination at all.
    if(body.action === 'setBackupEmail'){
      const raw = String(body.email || '').trim();
      const props = PropertiesService.getScriptProperties();
      if(!raw){
        props.deleteProperty(BACKUP_EMAIL_OVERRIDE_PROP_);
        return jsonResponse_({ ok: true, email: getBackupEmailAddress_(), isOverride: false });
      }
      // Simple sanity check, not exhaustive RFC validation — just enough
      // to catch an obvious typo before it silently swallows every future
      // backup/alert/recovery-code email into a dead address.
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)){
        return jsonResponse_({ error: "That doesn't look like a valid email address." });
      }
      props.setProperty(BACKUP_EMAIL_OVERRIDE_PROP_, raw);
      return jsonResponse_({ ok: true, email: raw, isOverride: true });
    }
    // "Forgot PIN?" > "Email me a code instead" on the lock screen — see
    // sendPinRecoveryCode_/verifyPinRecoveryCode_ above.
    if(body.action === 'sendPinRecoveryCode'){
      return jsonResponse_(sendPinRecoveryCode_());
    }
    if(body.action === 'verifyPinRecoveryCode'){
      return jsonResponse_(verifyPinRecoveryCode_(body.code));
    }
    return jsonResponse_({ error: 'Unknown action' });
  } catch(err){
    return jsonResponse_({ error: String(err) });
  }
}

// Bumped once by writeRows_ every time it actually performs a real write
// (never on a skipped no-op tab — see the hash check at the top of
// writeRows_). A single number that changes exactly when — and only
// when — something on the sheet actually changed, so the client can
// cheaply ask "is my copy still current?" via action==='version' instead
// of always paying for a full loadAll() to find out. Kept in Script
// Properties (not a cell on some hidden tab) so reading or bumping it
// never touches the spreadsheet at all.
const DATA_VERSION_PROP_ = 'dataVersion';
function getDataVersion_(){
  const v = PropertiesService.getScriptProperties().getProperty(DATA_VERSION_PROP_);
  return v ? parseInt(v, 10) : 0;
}
function bumpDataVersion_(){
  const props = PropertiesService.getScriptProperties();
  const next = getDataVersion_() + 1;
  props.setProperty(DATA_VERSION_PROP_, String(next));
  return next;
}

function jsonResponse_(obj){
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------- SAVE (full overwrite — simple & always consistent) ----------
function saveAll_(data){
  // The client tracks every roster item (painter/supplier/worker/customer)
  // it deletes in its own local tombstone list. When it's about to send an
  // empty roster+ledger pair for one of these, it first confirms EVERY
  // name that was on the sheet is in that tombstone list, and only then
  // sets confirmedEmpty[bucket] = true — proving the emptiness is a real
  // user action, not a stale/unloaded local copy. Only those buckets are
  // allowed past the safeWriteRows_ guard below; anything else emptying
  // out is still refused exactly as before.
  const confirmedEmpty = (data && data.confirmedEmpty) || {};
  // FIX (2026-08-25): reset for this save — see the declaration above
  // safeWriteRows_ for the full story on why this exists.
  SAVE_ALL_SKIPPED_TABS_ = [];
  // ADD (2026-08-23): record this device's deletion tombstones into the
  // shared Deletions tab BEFORE writing any other tab below — see
  // SHEETS.deletions/recordDeletions_ above. Order doesn't strictly matter
  // (this save's own data already reflects this device's deletions either
  // way), but doing it first means if anything below throws partway
  // through, the tombstone record still made it through, which is the
  // safer direction to fail in. This is the piece that was missing before:
  // SHEETS.deletions existed as a tab name but nothing ever actually wrote
  // to or read from it, so the "delete on phone A, phone B pushes it back"
  // hole this was meant to close was still wide open.
  recordDeletions_(data && data.tombstones);
  // See clearStaleRosterTombstonesForSave_'s own comment for the exact
  // "re-added worker vanishes on another device's next sync" bug this
  // closes. Must run AFTER recordDeletions_ above (so a delete performed
  // in this very save is recorded first) but BEFORE any of the writes
  // below — every one of those writes now hands over its own real,
  // current roster/entries, so nothing here can accidentally protect a
  // name that's actually being deleted in this same save (it's simply
  // never in the incoming inventory list from the moment it's deleted).
  clearStaleRosterTombstonesForSave_(data);
  // TEMPORARY DIAGNOSTIC — remove once inventory sync is confirmed working.
  Logger.log('saveAll_ received keys: ' + JSON.stringify(Object.keys(data || {})));
  Logger.log('products received: ' + ((data && data.products) ? data.products.length : 'undefined/missing') + ' items');
  const invDebug = (data && data.inventory) ? data.inventory : null;
  Logger.log('inventory keys: ' + (invDebug ? JSON.stringify(Object.keys(invDebug)) : 'undefined/missing'));
  Logger.log('labour items: ' + (invDebug && invDebug.labour ? invDebug.labour.length : 'n/a'));
  Logger.log('rawledger suppliers: ' + (invDebug && invDebug.rawledger ? invDebug.rawledger.length : 'n/a'));
  Logger.log('labourledger workers: ' + (invDebug && invDebug.labourledger ? invDebug.labourledger.length : 'n/a'));

  // FIX (2026-08-19): Status/AmountPaid/Due used to live here too, fully
  // duplicating what the Customer/Factory Ledger and Customer Payments tabs
  // already track (and re-derive live client-side via txnPaymentInfo_ —
  // never actually read back from these three columns by the app itself).
  // The user found this confusing: the order book showing its own
  // running payment numbers made it look like it disagreed with the
  // ledger, when really they were just two different, separately-computed
  // views of the same underlying payments. This tab is now pure order
  // details: what was ordered, whether it was confirmed, which phone
  // added it — one 'paid' Yes/No flag is kept (NOT a live status), purely
  // recording how the order was originally booked at creation (paid in
  // full on the spot vs. booked unpaid/on credit) so a second device
  // pulling this order fresh, with no Customer Payments/ledger credits to
  // go on yet, still has a correct starting point — see txnPaymentInfo_'s
  // final fallback in the app, which is the only place this is ever read.
  // Receipt handling mirrors Customer Payments/RawLedger/etc. above: an
  // existing real http(s) link is preserved unless the client sends fresh
  // receiptData to upload. This is the factory's gate pass / receiving
  // receipt attached via the "Add Receipt" button on Order Booked — added
  // 2026-08-19 at the user's request for a real-time embedded photo of it
  // on the Transactions tab, same as every other ledger already has.
  // Previously this receipt only ever lived in the phone's own localStorage
  // (LOCAL_ORDER_RECEIPTS_KEY) and never reached the sheet at all.
  const existingTxnReceipts = {};
  try{
    readTable_(SHEETS.transactions).forEach(r=>{
      if(r.id && isHttpUrl_(r.receipt)) existingTxnReceipts[r.id] = r.receipt;
    });
  } catch(e){ /* sheet doesn't exist yet on first run — nothing to preserve */ }
  safeWriteRows_(SHEETS.transactions,
    // ADD (2026-08-20): 'itemCosts' appended at the very END (append-only
    // convention — every other index/column argument below stays exactly
    // where it was, nothing needed renumbering). One cost-at-time-of-sale
    // per line, newline-joined line-for-line with itemsSummary/itemCounts
    // — captured from each cart line's OWN price/cost at the moment it was
    // added (see addToCart/cartTotal_ etc. in index.html), not looked up
    // fresh from the current product record, since a product's price/cost
    // can change or the product can be deleted after the sale — this is
    // what makes real per-order profit margin possible without either
    // guessing or corrupting historical orders when today's catalog
    // changes. A blank segment on any line just means that item's cost
    // wasn't on record at sale time — treated as "unknown", never as 0.
    // ADD (2026-08-23, user report: "not showing rate per item column"):
    // 'itemRates' appended after itemCosts, same append-only convention —
    // this is the actual SELLING price per unit at time of sale (cost
    // above is the wholesale/purchase cost, a different figure used for
    // profit margin, not what a customer was charged), same one-per-line
    // shape as itemCosts/itemCounts.
    // ADD (2026-08-25, user request): 'itemProductIds' appended after
    // itemRates, same append-only convention and same one-per-line shape —
    // one real product id per line, line-for-line with itemsSummary/
    // itemCounts, captured at sale time so a deleted order can restock
    // precisely by id (see restockProductsForOrder_ in index.html) instead
    // of guessing by product NAME, which a rename or a delete-and-recreate
    // would silently point at the wrong item.
    ['id','factory','date','time','itemsSummary','itemCount','itemCounts','size','colour','total','paid','confirmed','device','receipt','photo','itemCosts','itemRates','itemProductIds'],
    (data.transactionsLog || []).map(t => {
      const paid = t.paid !== false;
      let receiptUrl = (t.id && existingTxnReceipts[t.id]) || '';
      if(t.receiptData){
        const uploaded = uploadReceiptToDrive_(t.receiptData, t.receiptName || ((t.id || 'receipt') + '.jpg'), RECEIPT_FOLDERS.transactions);
        if(uploaded) receiptUrl = uploaded;
      }
      return [
        t.id, t.factory || '', t.date, to12Hour_(t.time), t.itemsSummary, t.itemCount, t.itemCounts || '', t.sizes || '', t.colors || '', t.total,
        (paid ? 'Yes' : 'No'), (t.confirmed === false ? 'No' : 'Yes'), t.device || '', receiptUrl, '', t.itemCosts || '', t.itemRates || '', t.itemProductIds || ''
      ];
    }),
    // FIX (2026-08-23): itemCosts was column 16 (1-based — see the header
    // array above: id=1,factory=2,...,photo=15,itemCosts=16), but this used
    // to list 15, which is actually the always-blank photo column — itemCosts
    // itself was never being force-set to plain text. Harmless in practice
    // so far (every read of it already goes through String(...) first — see
    // t.itemCosts in index.html — so a stray auto-converted Number never
    // crashed anything), but not what the comment below always intended.
    // Corrected to 16, and itemRates (17, new) gets the identical guard.
    // itemProductIds (18, new 2026-08-25) needs it too — a single-line
    // order's id (e.g. "1787632564776") is numeric-looking, same risk as
    // itemCounts below.
    [1,3,4,7,16,17,18], // id, date, time, itemCounts, itemCosts, itemRates, itemProductIds — keep as plain text. itemCounts MUST stay text: a
    // single-item order's value (e.g. "1") has no newline, so without this Sheets auto-converts it to a
    // NUMBER on save — which crashes the PDF export's (t.itemCounts || '').split('\n') on reload, since
    // numbers don't have .split(). Multi-item orders ("1\n1") were never at risk since a newline already
    // forces text, but this made single-item orders silently inconsistent and broke export for exactly them.
    // itemCosts/itemRates/itemProductIds are exactly the same shape (one number-or-blank per line), so they need the identical guard.
    [5,7,8,9,16,17,18], // itemsSummary, itemCounts, size, colour, itemCosts, itemRates, itemProductIds — wrap so multi-item orders show one product per line
    null, // rowColors — Transactions has no cheque highlighting
    // allowEmpty — REGRESTORED (was accidentally dropped when this block was
    // rewritten for the 2026-08-19 order-book-simplification change, which
    // silently reintroduced the exact "delete the last/only order and sync
    // fails forever" bug that computeConfirmedEmptyTransactions_ was built
    // to prevent). Without this, deleting every remaining transaction is
    // permanently refused by safeWriteRows_'s MIN_ROWS_TO_PROTECT_ guard —
    // the save throws, the WHOLE saveAll_ call aborts (not just this tab),
    // and every retry fails identically until this is restored.
    confirmedEmpty.transactions,
    15 // photo column — real embedded receipt image, urlCol=14 (Receipt) is the column right before it, see embedPhotos_
  );

  // Customer Payments — one row per payment made against a transaction
  // (full or partial), linked back to Order Booked by txnId. Mirrors the
  // shape of PaintLedger/RawLedger (a flat entries list with a running
  // balance concept), except the "roster" here is Order Booked itself —
  // no separate roster tab needed since every transaction already has
  // its own row there. Receipt handling mirrors expenses/RawLedger above:
  // an existing real http(s) link is preserved unless the client sends
  // fresh receiptData to upload.
  const existingPaymentReceipts = {};
  try{
    readTable_(SHEETS.customerPayments).forEach(r=>{
      if(r.id && isHttpUrl_(r.receipt)) existingPaymentReceipts[r.id] = r.receipt;
    });
  } catch(e){ /* sheet doesn't exist yet on first run — nothing to preserve */ }

  const customerPaymentRows = (data.customerPayments || []).map(p => {
    let receiptUrl = (p.id && existingPaymentReceipts[p.id]) || '';
    if(p.receiptData){
      const uploaded = uploadReceiptToDrive_(p.receiptData, p.receiptName || ((p.id || 'receipt') + '.jpg'), RECEIPT_FOLDERS.customerPayments);
      if(uploaded) receiptUrl = uploaded;
    }
    return [p.txnId || '', p.id || '', p.date || '', to12Hour_(p.time || ''), p.amount || 0, p.method || '', p.detail || '', p.receivedBy || '', p.receivedIn || '', receiptUrl, '', p.device || ''];
  });
  safeWriteRows_(SHEETS.customerPayments,
    ['txnId','id','date','time','amount','method','detail','receivedBy','receivedIn','receipt','photo','device'],
    customerPaymentRows,
    [1,2,3,4,7,8,9],
    // allowEmpty wired to confirmedEmpty.customerPayments (same gap as the
    // Products bug fixed 2026-08-19: this was hardcoded to null/falsy, so
    // deleting an order's last remaining payment(s) — which
    // removeTransactionAndPayments_ does automatically whenever an order is
    // deleted — could empty this tab with no way to prove it was
    // deliberate, permanently refusing the save and failing every sync
    // retry until fixed here).
    null, null, confirmedEmpty.customerPayments, 11
  );

  const inv = data.inventory || {};

  // Labour (and any other flat qty/unit/cost categories) — paint,
  // rawledger and labourledger are excluded here since they're now
  // ledgers, handled below.
  const invRows = [];
  Object.keys(inv).forEach(cat=>{
    if(cat === 'paint' || cat === 'rawledger' || cat === 'labourledger' || cat === 'customerledger') return;
    (inv[cat] || []).forEach(it=>{
      invRows.push([cat, it.name, it.qty, it.unit, it.cost]);
    });
  });
  writeRows_(SHEETS.inventory, ['category','name','qty','unit','cost'], invRows);

  // Paint Ledger — roster of painters (with their current balance), plus
  // every debit/credit entry (with a running balance column).
  // A bounced cheque (chequeStatus 'bounced') is excluded from both the
  // roster balance AND the running balance column below — the payment
  // never actually happened, so its debit/credit is skipped as if the
  // entry weren't there, which is what "adds the amount back" for a
  // bounced cheque. Only the Balance is affected; the entry itself (and
  // its original debit/credit figures) stays on the sheet as a record.
  const painters = inv.paint || [];
  safeWriteRows_(SHEETS.painters, ['name','balance'],
    painters.map(p => {
      const bal = (p.entries || []).reduce((s,e)=> e.chequeStatus === 'bounced' ? s : s + (e.credit||0) - (e.debit||0), 0);
      return [p.name, bal];
    }),
    null, null, null, confirmedEmpty.paint
  );

  // Preserve existing receipt links the same way expenses/RawLedger do —
  // an existing real http(s) link survives unless fresh receiptData is sent.
  const existingPaintReceipts = {};
  try{
    readTable_(SHEETS.paintLedger).forEach(r=>{
      if(r.id && isHttpUrl_(r.receipt)) existingPaintReceipts[r.id] = r.receipt;
    });
  } catch(e){ /* sheet doesn't exist yet on first run — nothing to preserve */ }

  const paintRows = [];
  const paintRowColors = [];
  painters.forEach(p=>{
    let running = 0;
    (p.entries || []).forEach(e=>{
      if(e.chequeStatus !== 'bounced') running += (e.credit||0) - (e.debit||0);
      let receiptUrl = (e.id && existingPaintReceipts[e.id]) || '';
      if(e.receiptData){
        const uploaded = uploadReceiptToDrive_(e.receiptData, e.receiptName || ((e.id || 'receipt') + '.jpg'), RECEIPT_FOLDERS.paintLedger);
        if(uploaded) receiptUrl = uploaded;
      }
      paintRows.push([p.name, e.id || '', e.date || '', to12Hour_(e.time || ''), e.desc || '', e.color || '', e.itemSize || '', e.itemType || '', e.itemFactory || '', e.itemCount || '', e.ratePerItem || '', e.debit || 0, e.credit || 0, running, e.method || '', e.detail || '', e.chequeDate || '', e.chequeStatus || '', e.receivedBy || '', e.receivedIn || '', receiptUrl, '', e.device || '']);
      paintRowColors.push(chequeRowColor_(e));
    });
  });
  safeWriteRows_(SHEETS.paintLedger, ['painter','id','date','time','desc','colour','itemSize','itemType','itemFactory','itemCount','ratePerItem','debit','credit','balance','method','detail','chequeDate','chequeStatus','receivedBy','receivedIn','receipt','photo','device'], paintRows, [2,3,4,7,16,17,19,20], null, paintRowColors, confirmedEmpty.paint, 22);

  // Raw Material Ledger — same pattern as Paint Ledger above, minus the
  // colour column. "Suppliers" holds the roster (with current balance) so
  // a supplier with zero entries still survives a reload; "RawLedger"
  // holds every debit/credit entry with a running balance column, plus an
  // optional receipt (uploaded to Drive, same as expense receipts below).
  // Bounced cheques are excluded from both balances — see the comment
  // above the Paint Ledger block for why.
  const suppliers = inv.rawledger || [];
  safeWriteRows_(SHEETS.suppliers, ['name','balance'],
    suppliers.map(s => {
      const bal = (s.entries || []).reduce((sum,e)=> e.chequeStatus === 'bounced' ? sum : sum + (e.credit||0) - (e.debit||0), 0);
      return [s.name, bal];
    }),
    null, null, null, confirmedEmpty.rawledger
  );

  // Preserve existing receipt links for entries whose receipt image isn't
  // being re-sent this save — same reasoning, and same self-healing
  // "must look like a real http(s) link" rule, as existingExpenseReceipts
  // above (see the comment there for why this check matters).
  const existingRawReceipts = {};
  try{
    readTable_(SHEETS.rawLedger).forEach(r=>{
      if(r.id && isHttpUrl_(r.receipt)) existingRawReceipts[r.id] = r.receipt;
    });
  } catch(e){ /* sheet doesn't exist yet on first run — nothing to preserve */ }

  const rawLedgerRows = [];
  const rawRowColors = [];
  suppliers.forEach(s=>{
    let running = 0;
    (s.entries || []).forEach(e=>{
      if(e.chequeStatus !== 'bounced') running += (e.credit||0) - (e.debit||0);
      let receiptUrl = (e.id && existingRawReceipts[e.id]) || '';
      if(e.receiptData){
        const uploaded = uploadReceiptToDrive_(e.receiptData, e.receiptName || ((e.id || 'receipt') + '.jpg'), RECEIPT_FOLDERS.rawLedger);
        if(uploaded) receiptUrl = uploaded;
      }
      // 'stockName'/'weightIn'/'itemsIn' appended (2026-08-24, "Raw Material
      // Stock" feature) — structured stock-tracking fields, separate from
      // the free-text desc/weight/bundleCount/etc. above. Blank/undefined
      // stays '' so a pure-payment entry (nothing actually received) never
      // shows up as "0 received" — see computeRawMaterialStock_ in
      // index.html, which only counts a cell that isn't blank.
      // 'rateType'/'rate' appended (2026-08-24, user request #2) — audit
      // trail of what was used to auto-fill Credit above (see
      // rlRecalcCreditFromRate_ in index.html); append-only at the very end
      // like receivedBy/receivedIn before them, so every existing numeric
      // textCols/wrapCols/photoCol index above stays correct unchanged.
      rawLedgerRows.push([s.name, e.id || '', e.date || '', to12Hour_(e.time || ''), e.desc || '', e.weight || '', e.bundleCount || '', e.gaugeCount || '', e.sizeCount || '', e.debit || 0, e.credit || 0, running, receiptUrl, e.method || '', e.detail || '', e.chequeDate || '', e.chequeStatus || '', e.receivedBy || '', e.receivedIn || '', '', e.device || '',
        e.stockName || '', (e.weightIn !== undefined ? e.weightIn : ''), (e.itemsIn !== undefined ? e.itemsIn : ''),
        e.rateType || '', (e.rate !== undefined ? e.rate : '')]);
      rawRowColors.push(chequeRowColor_(e));
    });
  });
  safeWriteRows_(SHEETS.rawLedger, ['supplier','id','date','time','desc','weight','bundleCount','gaugeCount','sizeCount','debit','credit','balance','receipt','method','detail','chequeDate','chequeStatus','receivedBy','receivedIn','photo','device','stockName','weightIn','itemsIn','rateType','rate'], rawLedgerRows, [2,3,4,6,7,8,9,16,17,18,19,22], null, rawRowColors, confirmedEmpty.rawledger, [13, 20]);

  // ADD (2026-08-25, user request): Scrap Ledger — same roster+entries
  // write pattern as Raw Material Ledger just above, minus receipts/
  // bundle-gauge-size/stock-tracking (none of those were asked for here).
  // "Debit" here means value owed BY the scrap buyer (weight × rate/kg,
  // auto-filled client-side — see scrapRecalcDebitFromRate_ in index.html);
  // "Credit" is payment actually received from them. This is the OPPOSITE
  // direction from Raw Material Ledger's suppliers (where Credit=value
  // owed, Debit=paid) — it's really the same Debit=Cost-owed/Credit=
  // Payment direction as customerLedgerBalance_/Custom Ledger, since a
  // scrap buyer is someone who owes the shop, not someone the shop owes.
  // FIX (2026-08-25): this was originally written as credit-debit (copied
  // from the Raw Material formula without re-deriving the sign for the
  // opposite real-world relationship) — with debit-credit, a buyer who
  // bought Rs 5000 of scrap and paid nothing showed a NEGATIVE balance
  // ("advance"/credit to them) instead of the correct positive "owed
  // Rs 5000". Corrected to debit-credit, matching customerLedgerBalance_.
  const scrapBuyers = inv.scrapledger || [];
  safeWriteRows_(SHEETS.scrapBuyers, ['name','balance'],
    scrapBuyers.map(s => {
      const bal = (s.entries || []).reduce((sum,e)=> e.chequeStatus === 'bounced' ? sum : sum + (e.debit||0) - (e.credit||0), 0);
      return [s.name, bal];
    }),
    null, null, null, confirmedEmpty.scrapledger
  );
  const scrapLedgerRows = [];
  const scrapRowColors = [];
  scrapBuyers.forEach(s=>{
    let running = 0;
    (s.entries || []).forEach(e=>{
      if(e.chequeStatus !== 'bounced') running += (e.debit||0) - (e.credit||0);
      scrapLedgerRows.push([s.name, e.id || '', e.date || '', to12Hour_(e.time || ''), e.desc || '', e.itemName || '', e.type || '',
        (e.weight !== undefined ? e.weight : ''), (e.rate !== undefined ? e.rate : ''),
        e.debit || 0, e.credit || 0, running, e.method || '', e.detail || '', e.chequeDate || '', e.chequeStatus || '', e.receivedBy || '', e.receivedIn || '', e.device || '']);
      scrapRowColors.push(chequeRowColor_(e));
    });
  });
  safeWriteRows_(SHEETS.scrapLedger, ['buyer','id','date','time','desc','itemName','type','weight','rate','debit','credit','balance','method','detail','chequeDate','chequeStatus','receivedBy','receivedIn','device'], scrapLedgerRows, [2,3,4,6,7,15,16,17,18], null, scrapRowColors, confirmedEmpty.scrapledger);


  // Labour — one row per worker per thing-that-happened-to-them: a
  // configured piece rate, a ledger entry, or (if they have neither yet) a
  // bare profile row. Their name/work type/rate type/start-end date are
  // repeated on EVERY one of their rows, so any single row is readable on
  // its own — no separate "roster" section and no row-type label needed;
  // what kind of row it is is obvious from which columns are filled (see
  // the comment above LABOUR_HEADER).
  const workers = inv.labourledger || [];
  const labourRows = [];
  const labourRowColors = [];
  // Preserve existing receipt links the same way expenses/RawLedger do —
  // an existing real http(s) link survives unless fresh receiptData is sent.
  const existingLabourReceipts = {};
  try{
    readTable_(SHEETS.labour).forEach(r=>{
      if(r.EntryId && isHttpUrl_(r.Receipt)) existingLabourReceipts[r.EntryId] = r.Receipt;
    });
  } catch(e){ /* sheet doesn't exist yet on first run — nothing to preserve */ }
  workers.forEach(w=>{
    const profile = {
      Worker: w.name, WorkType: w.workType || '', RateType: w.rateType || 'daily',
      StartDate: w.startDate || '', EndDate: w.endDate || ''
    };
    let wroteRow = false;

    // A row per attendance/payment/advance entry, with a running dues
    // balance for this worker as of that entry. The Rate, and — for
    // piece-rate workers — GuardSize/Weight/Sticks are folded straight
    // into this same row from the matching configured piece rate (by the
    // entry's Size label), so a piece-rate entry is ONE row that carries
    // both what the job was AND what happened, instead of needing a
    // separate config row alongside it. A bounced cheque is excluded from
    // the running balance — same reasoning as the Paint/Raw/Customer
    // ledgers above (see the comment near chequeRowColor_).
    let running = 0;
    const usedSizes = new Set(); // sizes whose config row we can skip below — an entry already carries it
    // FIX: sorted here too, not just client-side — this running balance
    // must be correct regardless of what order the client happens to
    // send entries in. Same reasoning as the Customer Ledger balance fix.
    const sortedEntries = (w.entries || []).slice().sort((a,b)=>{
      const da = parseDMY_(a.date), db = parseDMY_(b.date);
      const ta = da ? da.getTime() : 0, tb = db ? db.getTime() : 0;
      if(ta !== tb) return ta - tb;
      return String(a.time||'').localeCompare(String(b.time||''));
    });
    sortedEntries.forEach(e=>{
      if(e.chequeStatus !== 'bounced') running += (e.credit||0) - (e.debit||0);
      const matchedRate = (w.pieceRates || []).find(pr => pr.size === e.size);
      if(matchedRate) usedSizes.add(matchedRate.size);
      let receiptUrl = (e.id && existingLabourReceipts[e.id]) || '';
      if(e.receiptData){
        const uploaded = uploadReceiptToDrive_(e.receiptData, e.receiptName || ((e.id || 'receipt') + '.jpg'), RECEIPT_FOLDERS.labour);
        if(uploaded) receiptUrl = uploaded;
      }
      const entryFields = {
        RowType: 'Entry', Rate: w.rate || 0, EntryId: e.id || '', Date: e.date || '', Time: to12Hour_(e.time || ''),
        Kind: e.kind || '', Status: e.status || '', Size: e.size || '', Units: e.units || 0,
        Note: e.note || '', Debit: e.debit || 0, Credit: e.credit || 0, Balance: running,
        Method: e.method || '', MethodDetail: e.detail || '', ChequeDate: e.chequeDate || '', ChequeStatus: e.chequeStatus || '',
        ReceivedBy: e.receivedBy || '', ReceivedIn: e.receivedIn || '', Receipt: receiptUrl, Device: e.device || '',
        // Advance/Loan — this entry's Debit repeated here only when it's
        // actually that kind (blank otherwise), same pattern as the app's
        // own export (labourLedgerRows_'s advanceAmt/loanAmt in index.html).
        // A repayment against an existing Advance/Loan is stored as a
        // NEGATIVE debit under that same kind (see the app's wl-is-repayment
        // handling), so this naturally shows the repayment as a negative
        // number here too, not just a fresh advance/loan as positive.
        Advance: (e.kind === 'advance') ? (e.debit || 0) : '',
        Loan: (e.kind === 'loan') ? (e.debit || 0) : '',
        // Each entry now remembers its OWN Work Type from when it was
        // logged (see the app's entry-creation code) — without this,
        // WorkType came only from the shared profile object below, which
        // meant changing a worker's current job title retroactively
        // relabeled every past entry on the sheet with the new title,
        // even though nothing about that historical entry actually
        // changed. Falls back to the current profile value for any
        // entry logged before this fix, which never had its own.
        WorkType: e.workType || w.workType || ''
      };
      if(w.rateType === 'piece'){
        entryFields.Rate = matchedRate ? (matchedRate.rate || 0) : (e.units ? (e.credit || 0) / e.units : 0);
        if(matchedRate){
          entryFields.GuardSize = matchedRate.guardSize || '';
          entryFields.Weight = matchedRate.weight || '';
          entryFields.Sticks = matchedRate.sticks || '';
        }
      }
      labourRows.push(labourRow_(Object.assign({}, profile, entryFields)));
      labourRowColors.push(chequeRowColor_(e));
      wroteRow = true;
    });

    // A standalone row per configured guardSize/weight/sticks/rate
    // combination — but ONLY for a piece rate that no entry above has
    // used yet. Once at least one entry references a given size, that
    // size's config is already carried on those entry rows, so writing
    // it again here would be the exact duplicate the sheet used to show.
    // An unused rate still needs its own row, or it would vanish on the
    // next reload before ever being used.
    (w.pieceRates || []).forEach(pr=>{
      if(usedSizes.has(pr.size)) return;
      labourRows.push(labourRow_(Object.assign({}, profile, {
        RowType: 'Piece Rate', Rate: pr.rate || 0, GuardSize: pr.guardSize || '', Weight: pr.weight || '',
        Sticks: pr.sticks || '', Size: pr.size || ''
      })));
      labourRowColors.push(null);
      wroteRow = true;
    });

    // A worker with zero piece rates AND zero entries yet (just added)
    // still needs one row to survive a reload.
    if(!wroteRow){
      labourRows.push(labourRow_(Object.assign({}, profile, { RowType: 'Profile', Rate: w.rate || 0 })));
      labourRowColors.push(null);
    }
  });
  safeWriteRows_(SHEETS.labour, LABOUR_HEADER, labourRows, LABOUR_TEXT_COLS, null, labourRowColors, confirmedEmpty.labourledger, LABOUR_PHOTO_COL);

  // Saved suggestion lists for the Add Worker form (Work Type / Guard
  // Size / Weight / Sticks No.) — kept on their OWN small tab rather than
  // folded into "Labour" above: this is settings data with no worker or
  // date attached to it, so mixing it into the ledger table would just
  // add empty-Worker rows to an otherwise per-worker table.
  //
  // FIX (2026-08-25, user request): this whole tab used to be written
  // straight from `data.*` on every save, with nothing read back from the
  // sheet first — the one gap the 2026-08-21 whole-app sync audit flagged
  // and left alone as "purely cosmetic." A device that's behind (hasn't
  // picked up another device's newly-added suggestion yet) could silently
  // drop that suggestion the next time IT saved. Same union-merge treatment
  // as rawLedgerDescriptions below: read what the sheet already has via
  // readLabourLists_(), union each list with the incoming `data.*` value
  // (unionArrays_ — case-insensitive, existing entries/casing kept), and
  // write the unioned lists instead of the incoming ones raw. This protects
  // every device/build, not just ones with the matching client-side merge
  // (see SUGGESTION_LISTS_ in index.html).
  const existingLabourLists_ = readLabourLists_();
  const labourListRows = []
    .concat(unionArrays_(existingLabourLists_.workTypes, data.workTypes).map(v => ['workType', v]))
    .concat(unionArrays_(existingLabourLists_.guardSizes, data.guardSizes).map(v => ['guardSize', v]))
    .concat(unionArrays_(existingLabourLists_.guardWeights, data.guardWeights).map(v => ['weight', v]))
    .concat(unionArrays_(existingLabourLists_.stickCounts, data.stickCounts).map(v => ['sticks', v]))
    // Product Editor's remembered Weight values (American Pedestal Fan
    // products) — a different list from the Labour "weight" (guardWeights)
    // above, folded into this same small settings tab under its own
    // "productWeight" type so it doesn't need a whole tab of its own.
    .concat(unionArrays_(existingLabourLists_.productWeights, data.productWeights).map(v => ['productWeight', v]))
    // ADDED (2026-08-23): same reasoning as productWeights above, for the
    // Product Editor's Name and Size fields — these used to be a fixed,
    // hardcoded <option> list baked into index.html with no way to add or
    // remove entries. Now backed by these two saved lists exactly like
    // Weight already was, synced the same way.
    .concat(unionArrays_(existingLabourLists_.productNames, data.productNames).map(v => ['productName', v]))
    .concat(unionArrays_(existingLabourLists_.productSizes, data.productSizes).map(v => ['productSize', v]))
    // Raw Material Ledger's remembered Item/Weight/Bundle Count/Gauge/Size
    // values — same reasoning as productWeights above, folded in under
    // their own types rather than a dedicated tab.
    .concat(unionArrays_(existingLabourLists_.rawItemNames, data.rawItemNames).map(v => ['rawItem', v]))
    .concat(unionArrays_(existingLabourLists_.rawWeights, data.rawWeights).map(v => ['rawWeight', v]))
    .concat(unionArrays_(existingLabourLists_.rawBundleCounts, data.rawBundleCounts).map(v => ['rawBundle', v]))
    .concat(unionArrays_(existingLabourLists_.rawGaugeCounts, data.rawGaugeCounts).map(v => ['rawGauge', v]))
    .concat(unionArrays_(existingLabourLists_.rawSizeCounts, data.rawSizeCounts).map(v => ['rawSize', v]))
    // Paint Ledger's remembered Item Size/Item Type/Factory Name values —
    // same reasoning, folded in under their own types.
    .concat(unionArrays_(existingLabourLists_.paintItemSizes, data.paintItemSizes).map(v => ['paintItemSize', v]))
    .concat(unionArrays_(existingLabourLists_.paintItemTypes, data.paintItemTypes).map(v => ['paintItemType', v]))
    .concat(unionArrays_(existingLabourLists_.paintFactoryNames, data.paintFactoryNames).map(v => ['paintFactory', v]))
    // Custom Ledger's remembered Item Colour/Description/Weight-per-Item/
    // Weight-per-Scrap values — Weight/Size are shared with the Raw
    // Material Ledger's lists above (rawWeight/rawSize), so only these
    // four are new.
    .concat(unionArrays_(existingLabourLists_.customItemColours, data.customItemColours).map(v => ['customItemColour', v]))
    .concat(unionArrays_(existingLabourLists_.customDescriptions, data.customDescriptions).map(v => ['customDescription', v]))
    .concat(unionArrays_(existingLabourLists_.customWeightPerItems, data.customWeightPerItems).map(v => ['customWeightPerItem', v]))
    .concat(unionArrays_(existingLabourLists_.customWeightPerScraps, data.customWeightPerScraps).map(v => ['customWeightPerScrap', v]))
    .concat(unionArrays_(existingLabourLists_.customItemSizes, data.customItemSizes).map(v => ['customItemSize', v]))
    // "Received By" / "Received In" — shared free-text suggestion lists
    // used by every ledger's payment section (Record Payment, Paint,
    // Raw Material, Custom Ledgers, Labour). One shared pair of lists
    // across all of them, same as the app keeps in memory.
    .concat(unionArrays_(existingLabourLists_.paymentReceivedByList, data.paymentReceivedByList).map(v => ['paymentReceivedBy', v]))
    .concat(unionArrays_(existingLabourLists_.paymentReceivedInList, data.paymentReceivedInList).map(v => ['paymentReceivedIn', v]))
    // ADD (2026-08-26, user request): Product Editor's Colour field used to
    // be a fixed, hardcoded <option> list baked into index.html with no way
    // to add/remove entries, unlike every other product field. Now backed by
    // its own saved list exactly like productName/productSize already were.
    .concat(unionArrays_(existingLabourLists_.productColours, data.productColours).map(v => ['productColour', v]));
  // Column 2 ("name") is forced to plain text for the same reason as
  // LABOUR_TEXT_COLS above — a Sticks No. like "8" or a Guard Size like
  // "12" looks numeric to Sheets and would otherwise get silently
  // converted to a real number, which then breaks .toLowerCase() calls
  // on it back in the app.
  writeRows_(SHEETS.labourLists, ['type','name'], labourListRows, [2]);

  // allowEmpty wired to confirmedEmpty.products (set by the client only when
  // its own delete-tombstones prove every product the sheet last held was
  // deliberately deleted — see computeConfirmedEmptyProducts_ in index.html)
  // — this was the missing piece before: a genuine "delete every product"
  // save had no way to prove itself to the MIN_ROWS_TO_PROTECT_ guard below,
  // so it was refused forever, the sheet silently kept its old rows, and
  // every retry failed the exact same way.
  // 'cost', 'stock' and 'reorderLevel' appended (2026-08-20) — all three
  // are optional on the client (undefined = "unknown"/"not tracked", never
  // the same thing as a real 0), written as '' so readProducts_ below can
  // tell "no value on record" apart from a genuine 0.
  // 'recipe' appended (2026-08-24, "Raw Material Stock" feature) — an array
  // of {material, weightPerUnit, itemsPerUnit} set on the Add/Edit Product
  // modal (how much raw material one unit of this product consumes),
  // JSON-stringified into a single column, same pattern as customLedgers'
  // weightStock column below. textCols includes its index so Sheets never
  // tries to auto-format the JSON string as a number/formula.
  safeWriteRows_(SHEETS.products,
    ['id','name','cat','price','color','weight','size','device','cost','stock','reorderLevel','recipe'],
    (data.products || []).map(p => [p.id, p.name, p.cat, p.price, p.color || '', p.weight || '', p.size || '', p.device || '',
      (p.cost !== undefined ? p.cost : ''), (p.stock !== undefined ? p.stock : ''), (p.reorderLevel !== undefined ? p.reorderLevel : ''),
      JSON.stringify(p.recipe || [])]),
    [12], null, null, confirmedEmpty.products
  );

  // Sales Summary — one row per period (Daily, Last Day, Weekly, Last Week,
  // Monthly, Last Month, Yearly, Last Year), recomputed fresh on every save
  // so it always reflects the current date when it was last synced.
  writeRows_(SHEETS.salesSummary,
    ['Period','Sales','Orders','Average Sale','Items Sold'],
    data.salesSummary || []
  );

  // Expenses Summary — same idea as Sales Summary, one row per period.
  writeRows_(SHEETS.expensesSummary,
    ['Period','Total Expenses','Entries'],
    data.expensesSummary || []
  );

  // Accounts Summary — Cash/Bank/Online balances, computed CLIENT-SIDE
  // (see buildAccountsSummaryRows_ in the app) from every place money
  // actually moves: Customer Payments in, minus Painter/Supplier/Labour
  // ledger debit entries and Expenses out, grouped by method. This tab
  // is write-only — a mirror for viewing in the Sheet — the app itself
  // always recomputes the live figures from the ledgers it already has
  // in memory rather than reading this back in.
  writeRows_(SHEETS.accountsSummary,
    ['Account','Money In','Money Out','Balance'],
    data.accountsSummary || []
  );

  // FIX (2026-08-23): this call never accepted an allowEmpty argument at
  // all — every other roster tab (Products, CustomerLedger, Painters,
  // Suppliers, ...) got the confirmedEmpty treatment when THEIR "delete
  // the last one and sync never recovers" bug was fixed, but Factories
  // was missed. Deleting the shop's only/last factory made this call
  // permanently refuse the resulting empty save (safeWriteRows_'s default
  // is allowEmpty=false), which aborts saveAll_ entirely — not just this
  // tab — so CustomerLedger (and everything else in the same sync) got
  // stuck too. confirmedEmpty.factories is computed client-side in
  // computeConfirmedEmptyFactories_ from this device's own tombstones,
  // same proof-of-intentional-deletion pattern as every other tab here.
  safeWriteRows_(SHEETS.factories,
    ['name','location','contact'],
    (data.factories || []).map(f => [f.name, f.location, f.contact]),
    null, null, null, confirmedEmpty.factories
  );

  // Customer Ledger — one entries tab, no separate roster tab: Factories
  // itself (written just above) is the roster. Debit = amount billed/owed
  // by the customer, Credit = payment actually received from them (the
  // real cash-in side, which is why receipts attach to Credit here rather
  // than Debit — the reverse of the Painter/Supplier ledgers, where Debit
  // is the cash-out side).
  const customers = (data.inventory && data.inventory.customerledger) || [];
  const existingCustomerReceipts = {};
  try{
    readTable_(SHEETS.customerLedger).forEach(r=>{
      if(r.id && isHttpUrl_(r.receipt)) existingCustomerReceipts[r.id] = r.receipt;
    });
  } catch(e){ /* sheet doesn't exist yet on first run — nothing to preserve */ }

  const customerLedgerRows = [];
  const customerRowColors = [];
  // ADD (2026-08-30, Tax Invoice feature): collected in the same pass as
  // customerLedgerRows below, but written to its OWN sheet — see
  // SHEETS.customerLedgerTax above for why this stays separate from the
  // main CustomerLedger write. Only entries that actually carry a
  // taxPercent/taxAmt (set from the ledger's new Tax % field — a Credit
  // entry never has one) get a row here.
  const customerLedgerTaxRows = [];
  customers.forEach(c=>{
    let running = 0;
    // reportEntries (new): sent pre-merged by the app — one row per
    // confirmed order (its debit combined with whatever's been paid
    // toward it), matching the PDF export, instead of separate debit/
    // credit event rows. Falls back to the old raw c.entries (sorted
    // here) if an older client hasn't started sending reportEntries yet.
    const sortedEntries = Array.isArray(c.reportEntries) ? c.reportEntries : (c.entries || []).slice().sort((a,b)=>{
      const da = parseDMY_(a.date), db = parseDMY_(b.date);
      const ta = da ? da.getTime() : 0, tb = db ? db.getTime() : 0;
      if(ta !== tb) return ta - tb;
      return String(a.time||'').localeCompare(String(b.time||''));
    });
    sortedEntries.forEach(e=>{
      // Debit = owed by the customer, Credit = paid — opposite direction
      // from Paint/RawLedger's running balance above (see the comment
      // near customerLedgerBalance_ in the app for why). A bounced cheque
      // credit is skipped here too — the payment never really landed, so
      // it's excluded exactly like the Paint/RawLedger balances above.
      if(e.chequeStatus !== 'bounced') running += (e.debit || 0) - (e.credit || 0);
      let receiptUrl = (e.id && existingCustomerReceipts[e.id]) || '';
      if(e.receiptData){
        const uploaded = uploadReceiptToDrive_(e.receiptData, e.receiptName || ((e.id || 'receipt') + '.jpg'), RECEIPT_FOLDERS.customerLedger);
        if(uploaded) receiptUrl = uploaded;
      }
      customerLedgerRows.push([c.name, e.id || '', e.date || '', to12Hour_(e.time || ''), e.desc || '', e.debit || 0, e.credit || 0, running, e.method || '', e.detail || '', e.chequeDate || '', e.chequeStatus || '', receiptUrl, '', e.txnId || '', e.device || '', e.receivedBy || '', e.receivedIn || '']);
      customerRowColors.push(chequeRowColor_(e));
      // ADD (2026-08-30, Tax Invoice feature): mirrors the row above into
      // the tax helper sheet whenever this entry actually has tax data —
      // e.id must exist to link back (it always does for a real entry;
      // only skipped if somehow blank, since a tax row with no id could
      // never be matched back up on read).
      if(e.id && ((e.taxPercent || 0) > 0 || (e.taxAmt || 0) > 0)){
        customerLedgerTaxRows.push([c.name, e.id, e.taxPercent || 0, e.taxAmt || 0]);
      }
    });
  });
  // FIX (2026-08-19): appended receivedBy/receivedIn at the very END of the
  // header (append-only convention — every existing numeric textCols/
  // photoCol argument below stays correct with zero changes) so the
  // Customer/Factory Ledger's own manual-entry form (which just gained
  // Received By/In fields, matching every other ledger) can finally sync
  // them to the sheet too — this tab was the one deliberately left out
  // when Received By/In was first added elsewhere in the app.
  safeWriteRows_(SHEETS.customerLedger, ['customer','id','date','time','desc','debit','credit','balance','method','detail','chequeDate','chequeStatus','receipt','photo','txnId','device','receivedBy','receivedIn'], customerLedgerRows, [2,3,4,11,12], null, customerRowColors, confirmedEmpty.customerledger, 14);

  // ADD (2026-08-30, Tax Invoice feature): separate helper tab, always
  // allowEmpty (unlike the main CustomerLedger write above) — this table
  // is purely additive/optional per-entry tax info, not the core
  // financial record, so there's no "accidentally wiped the ledger" risk
  // in letting it shrink to zero rows (e.g. every taxed entry got deleted,
  // or an older client that doesn't send taxPercent/taxAmt yet saves).
  safeWriteRows_(SHEETS.customerLedgerTax, ['customer','id','taxPercent','taxAmt'], customerLedgerTaxRows, [2], null, null, true);

  // Custom Ledgers — separate extra ledgers for specific suppliers, kept
  // entirely apart from the Raw Material Ledger above. "Custom Ledgers"
  // holds the roster (name + balance), "CustomLedgerEntries" holds every
  // entry across all of them, one row per entry (same one-tab-per-thing
  // pattern as Painters/PaintLedger and Suppliers/RawLedger). Debit here
  // means Cost (Item Count × Rate — what's now owed) and Credit means
  // Payment — the SAME direction as CustomerLedger above (Debit=owed,
  // Credit=paid), the opposite of Paint/RawLedger's Debit=Paid/
  // Credit=Received. See the comment at the top of the Custom Ledger
  // modal in the app for the full reasoning.
  const customLedgersData = data.customLedgers || [];
  // weightStock is the per-Description running raw-material stock
  // (Weight/Weight per Item/Weight per Scrap/Remaining) used by the
  // Custom Ledger's weight tracking — kept as one JSON blob per ledger in
  // the roster sheet since it isn't naturally a per-entry row. Weight/
  // Remaining Weight/Weight per Item/Weight per Scrap are all actually
  // ONE SHARED pool for the whole ledger now (see the app's
  // culGetLedgerStock_ — always the blank-Description '' key inside this
  // blob), not really "per Description" anymore, but the JSON shape is
  // unchanged from when they were.
  //
  // "By Self Weight Stock" — weight WE'VE supplied to this ledger's party
  // (an outgoing advance) — moved OUT of that per-Description blob into
  // its own ledger-level "selfWeightStock" column below, since it's a
  // single running total for the whole ledger, not tied to any
  // Description. See the app's culMigrateSelfWeightStock_ for the
  // one-time migration off the old per-Description storage.
  safeWriteRows_(SHEETS.customLedgerRoster, ['name','balance','weightStock','selfWeightStock'],
    customLedgersData.map(cl => {
      const bal = (cl.entries || []).reduce((s,e)=> e.chequeStatus === 'bounced' ? s : s + (e.debit||0) - (e.credit||0), 0);
      return [cl.name, bal, JSON.stringify(cl.weightStock || {}), cl.selfWeightStock || 0];
    })
  );
  const existingCustomLedgerReceipts = {};
  try{
    readTable_(SHEETS.customLedgerEntries).forEach(r=>{
      if(r.id && isHttpUrl_(r.receipt)) existingCustomLedgerReceipts[r.id] = r.receipt;
    });
  } catch(e){ /* sheet doesn't exist yet on first run — nothing to preserve */ }
  const customLedgerRows = [];
  const customLedgerRowColors = [];
  customLedgersData.forEach(cl=>{
    let running = 0;
    (cl.entries || []).forEach(e=>{
      if(e.chequeStatus !== 'bounced') running += (e.debit || 0) - (e.credit || 0);
      let receiptUrl = (e.id && existingCustomLedgerReceipts[e.id]) || '';
      if(e.receiptData){
        const uploaded = uploadReceiptToDrive_(e.receiptData, e.receiptName || ((e.id || 'receipt') + '.jpg'), RECEIPT_FOLDERS.customLedgerEntries);
        if(uploaded) receiptUrl = uploaded;
      }
      customLedgerRows.push([
        cl.name, e.id || '', e.date || '', to12Hour_(e.time || ''), e.desc || '',
        e.itemColour || '', e.weight || '', e.sizeCount || '',
        e.itemCount || '', e.ratePerItem || '', e.itemMethod || '', e.itemWeightStatus || '',
        e.selfWeightStock || '',
        e.weightPerItem || 0, e.weightPerScrap || 0,
        (e.remainingWeight !== undefined && e.remainingWeight !== null) ? e.remainingWeight : '',
        e.debit || 0, e.credit || 0, running,
        e.method || '', e.detail || '', e.chequeDate || '', e.chequeStatus || '',
        e.receivedBy || '', e.receivedIn || '', receiptUrl, '', e.device || ''
      ]);
      customLedgerRowColors.push(chequeRowColor_(e));
    });
  });
  // itemMethod/itemWeightStatus/selfWeightStock (cols 11-13) hold the
  // PER-ITEM payment side of each "+ Add Item" block (e.g. one item was a
  // delivery paid Cash, another an advance paid by Steel Weight) —
  // separate from method/detail/chequeDate/chequeStatus (cols 20-23),
  // which are still the single entry-level payment method tied to the
  // Credit field. itemWeightStatus/selfWeightStock are only meaningful
  // when itemMethod is 'SteelWeight': itemWeightStatus is 'pending' until
  // manually Confirmed/Rejected in the app (see the
  // cul-item-weight-action-btn handler) — only a Confirm actually credits
  // that item's Item Count × Weight per Item into the ledger's single
  // running "By Self Weight Stock" total (SHEETS.customLedgerRoster's own
  // "selfWeightStock" column, see saveAll_ above — the LIVE source of
  // truth). selfWeightStock HERE is just a per-item historical snapshot
  // of that total at save/confirm/reject time, purely for the record —
  // never read back into the live total on load.
  safeWriteRows_(SHEETS.customLedgerEntries,
    ['ledger','id','date','time','desc','itemColour','weight','sizeCount','itemCount','ratePerItem','itemMethod','itemWeightStatus','selfWeightStock','weightPerItem','weightPerScrap','remainingWeight','debit','credit','balance','method','detail','chequeDate','chequeStatus','receivedBy','receivedIn','receipt','photo','device'],
    customLedgerRows,
    [2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,22,23,24,25], // id, date, time, desc, itemColour, weight, sizeCount, itemCount, ratePerItem, itemMethod, itemWeightStatus, selfWeightStock, weightPerItem, weightPerScrap, remainingWeight, chequeDate, chequeStatus, receivedBy, receivedIn — plain text so numeric-looking values (e.g. "18") and "+ Add Item" multi-line (one value per item) entries aren't silently mangled by Sheets' auto-number conversion
    [5,6,7,8,9,10,11,12,13,14,15,16], // desc, itemColour, weight, sizeCount, itemCount, ratePerItem, itemMethod, itemWeightStatus, selfWeightStock, weightPerItem, weightPerScrap, remainingWeight — WRAP so a multi-item "+ Add Item" entry's one-value-per-line text actually displays stacked, same as Order Booked's itemsSummary
    customLedgerRowColors,
    // allowEmpty — wired to confirmedEmpty.customLedgerEntries (2026-08-19,
    // same class of fix as customerPayments/transactions above). Deleting a
    // custom ledger's entry never even recorded a tombstone before, so
    // besides being unable to prove a genuine full-emptying to this guard,
    // a deleted entry could also resurface via the multi-device merge —
    // both fixed together: the delete handler now calls
    // markDeleted_('customLedgerEntries', removed.id).
    confirmedEmpty.customLedgerEntries,
    27 // photo column — real embedded receipt image, see embedPhotos_
  );

  // Preserve existing receipt links for expenses whose receipt image isn't
  // being re-sent this save — the client only sends the file data once
  // (right after it's picked), not on every subsequent sync, to avoid
  // re-uploading the same file to Drive over and over.
  // IMPORTANT: only a real http(s) link counts as "already has a receipt" —
  // any other text (e.g. a bare filename like "transactions.jpg" left over
  // from early testing, before this upload logic existed) is treated as if
  // there's no receipt at all. Without this check, that kind of stale text
  // gets copied forward forever and looks identical to a working link at a
  // glance, even though it was never actually a Drive URL — this makes a
  // legacy bad value self-heal back to blank (or a fresh real link, once
  // the browser that has that receipt cached re-syncs) instead of getting
  // stuck permanently.
  const existingExpenseReceipts = {};
  try{
    readTable_(SHEETS.expenses).forEach(r=>{
      if(r.id && isHttpUrl_(r.receipt)) existingExpenseReceipts[r.id] = r.receipt;
    });
  } catch(e){ /* sheet doesn't exist yet on first run — nothing to preserve */ }

  safeWriteRows_(SHEETS.expenses,
    ['id','date','desc','category','amount','receipt','method','detail','photo','device'],
    (data.expenses || []).map(x => {
      let receiptUrl = (x.id && existingExpenseReceipts[x.id]) || '';
      if(x.receiptRemoved){
        receiptUrl = '';
      } else if(x.receiptData){
        const uploaded = uploadReceiptToDrive_(x.receiptData, x.receiptName || ((x.id || 'receipt') + '.jpg'), RECEIPT_FOLDERS.expenses);
        if(uploaded) receiptUrl = uploaded;
      }
      return [x.id || '', x.date, x.desc, x.category, x.amount, receiptUrl, x.method || '', x.detail || '', '', x.device || ''];
    }),
    [1,2,7,8],
    null, null, undefined, [6, 9]
  );

  // ADD (2026-08-25, user request): Withdrawal Ledger — flat array (like
  // Expenses just above), NOT roster+entries like ScrapBuyers/ScrapLedger.
  // "it will not be treated in debit and credit but as just withdrawal" —
  // a single Amount column, no balance/running-total column. No receipt/
  // photo support (not requested, unlike Expenses).
  safeWriteRows_(SHEETS.withdrawal,
    ['id','date','desc','amount','method','detail','chequeDate','chequeStatus','withdrawnBy','withdrawnIn','device'],
    (data.withdrawals || []).map(x => [
      x.id || '', x.date, x.desc, x.amount, x.method || '', x.detail || '',
      x.chequeDate || '', x.chequeStatus || '', x.withdrawnBy || '', x.withdrawnIn || '', x.device || ''
    ]),
    [1,2,5,6,7,8],
    null, null, confirmedEmpty.withdrawals
  );

  // Expense Categories — the user-editable list shown in the Category
  // dropdown (Add/Edit Expense), so custom categories they add or remove
  // persist across reloads instead of resetting to the built-in defaults.
  // FIX (2026-08-25, user request): same union-merge treatment as the
  // Labour Lists tab above — read what the sheet already has first, union
  // with what this save is sending, write the union rather than the
  // incoming list raw. Protects a category added on another device from
  // being silently dropped by a save from a device that's behind.
  const mergedExpenseCategories_ = unionArrays_(readExpenseCategories_(), data.expenseCategories);
  writeRows_(SHEETS.expenseCategories,
    ['name'],
    mergedExpenseCategories_.map(c => [c])
  );

  // FIX (2026-08-21, re-applied 2026-08-23 when merging in the push
  // notification / PIN recovery / cross-device Deletions-tab branch): this
  // used to write data.txnNumber straight through, no matter what it was —
  // a blind overwrite. txnNumber is the counter that mints every new
  // order's id; if a device that's behind on sync mints a new order using
  // the same number another device already used for a real, different
  // order, mergeById_'s id-collision handling on the client silently keeps
  // whichever copy is already local and drops the other — a real order can
  // vanish with no error shown anywhere. Reading the sheet's own current
  // value here and taking the max protects every device/build, not just
  // ones with the matching client-side fix.
  const existingMeta_ = readMeta_();
  // 'rawMaterialReorderLevels' added (2026-08-24, "Raw Material Stock"
  // feature) — a small flat settings map (materialName -> low-stock
  // threshold), JSON-stringified into its own Meta row same as every other
  // key here. Merged with whatever's already on the sheet (existing keys
  // preserved, incoming keys win) rather than written straight through —
  // same reasoning as the txnNumber max-merge just above: a device running
  // an older build that doesn't know about this field yet would otherwise
  // silently wipe every threshold another device already set.
  const mergedRawMaterialReorderLevels_ = Object.assign({}, existingMeta_.rawMaterialReorderLevels || {}, data.rawMaterialReorderLevels || {});
  // 'rawMaterialItemReorderLevels' (2026-08-27, "mixed kg/items low-stock
  // threshold" fix) — the item-count counterpart to
  // rawMaterialReorderLevels just above: a material tracked by item count
  // (not weight) now gets its OWN low-stock threshold instead of being
  // compared against the weight-in-kg one. Same per-key union merge, same
  // reasoning.
  const mergedRawMaterialItemReorderLevels_ = Object.assign({}, existingMeta_.rawMaterialItemReorderLevels || {}, data.rawMaterialItemReorderLevels || {});
  // 'rawMaterialUnits' (2026-08-26, grams-saved-as-kg fix) — same per-key
  // union merge as rawMaterialReorderLevels just above, same reasoning.
  const mergedRawMaterialUnits_ = Object.assign({}, existingMeta_.rawMaterialUnits || {}, data.rawMaterialUnits || {});
  // 'rawLedgerDescriptions' (2026-08-24, user request #2) — the Raw
  // Material Ledger's own Description suggestion list, split off from
  // rawItemNames (see readCustomerLedger_-adjacent comments in index.html
  // for the matching client fix). Simple array union, same as every other
  // saved-suggestion list already merged this way elsewhere in this file.
  const mergedRawLedgerDescriptions_ = unionArrays_(existingMeta_.rawLedgerDescriptions || [], data.rawLedgerDescriptions || []);
  // 'rawMaterialResetAt' (2026-08-24, user request #2) — per material name,
  // per weight/items, the date+time "Reset" was last pressed (see
  // rawMaterialResetAt / computeRawMaterialStock_ in index.html). Merged
  // one level deeper than a plain per-key union — for a mark actually
  // present on both sides, keep whichever is more recent, so a reset done
  // on one device never gets silently reverted by an older mark still
  // sitting on another device that saves afterward.
  const mergedRawMaterialResetAt_ = mergeRawMaterialResetAt_(existingMeta_.rawMaterialResetAt || {}, data.rawMaterialResetAt || {});
  // 'scrapDescriptions'/'scrapItemNames'/'scrapTypes' (2026-08-25, Scrap
  // Ledger feature) — same simple array union as rawLedgerDescriptions
  // above, so a value added on one device is never dropped by a save from
  // another device that hasn't picked it up yet.
  const mergedScrapDescriptions_ = unionArrays_(existingMeta_.scrapDescriptions || [], data.scrapDescriptions || []);
  const mergedScrapItemNames_ = unionArrays_(existingMeta_.scrapItemNames || [], data.scrapItemNames || []);
  const mergedScrapTypes_ = unionArrays_(existingMeta_.scrapTypes || [], data.scrapTypes || []);
  // 'withdrawalDescriptions'/'withdrawalByList'/'withdrawalInList'
  // (2026-08-25, Withdrawal Ledger feature) — same simple array union as
  // the scrap lists above.
  const mergedWithdrawalDescriptions_ = unionArrays_(existingMeta_.withdrawalDescriptions || [], data.withdrawalDescriptions || []);
  const mergedWithdrawalByList_ = unionArrays_(existingMeta_.withdrawalByList || [], data.withdrawalByList || []);
  const mergedWithdrawalInList_ = unionArrays_(existingMeta_.withdrawalInList || [], data.withdrawalInList || []);
  writeRows_(SHEETS.meta,
    ['key','value'],
    [
      ['txnNumber', Math.max(data.txnNumber || 1, existingMeta_.txnNumber || 1)],
      ['sessionTotal', data.sessionTotal || 0],
      ['sessionCount', data.sessionCount || 0],
      ['rawMaterialReorderLevels', JSON.stringify(mergedRawMaterialReorderLevels_)],
      ['rawMaterialItemReorderLevels', JSON.stringify(mergedRawMaterialItemReorderLevels_)],
      ['rawMaterialUnits', JSON.stringify(mergedRawMaterialUnits_)],
      ['rawLedgerDescriptions', JSON.stringify(mergedRawLedgerDescriptions_)],
      ['rawMaterialResetAt', JSON.stringify(mergedRawMaterialResetAt_)],
      // 'lastBackupEmailAt' (2026-08-25, backup-freshness feature) — a
      // normal app save never has an opinion on this value; it's set only
      // by sendBackupEmail_() itself. Always carry forward whatever's
      // already on the sheet rather than defaulting it to blank, or every
      // ordinary save would silently erase the last-backup timestamp the
      // next time anyone saved anything.
      ['lastBackupEmailAt', existingMeta_.lastBackupEmailAt || ''],
      ['scrapDescriptions', JSON.stringify(mergedScrapDescriptions_)],
      ['scrapItemNames', JSON.stringify(mergedScrapItemNames_)],
      ['scrapTypes', JSON.stringify(mergedScrapTypes_)],
      ['withdrawalDescriptions', JSON.stringify(mergedWithdrawalDescriptions_)],
      ['withdrawalByList', JSON.stringify(mergedWithdrawalByList_)],
      ['withdrawalInList', JSON.stringify(mergedWithdrawalInList_)],
      // ADD (2026-08-26, order-numbering reset feature): same
      // carry-forward-only pattern as lastBackupEmailAt above — a normal
      // app save never sets this, only resetOrdersFresh() does. Always
      // keep whatever's already on the sheet so an ordinary save can never
      // blank it back to 0 and re-arm the client self-heal check for no
      // reason.
      ['orderTombstoneResetToken', existingMeta_.orderTombstoneResetToken || 0],
      // ADD (2026-08-30, Tax Invoice feature): business's NTN and Sales
      // Tax Registration numbers, editable from Settings — carry-forward-
      // only pattern (same as lastBackupEmailAt above) so a normal save
      // from a device that hasn't opened Settings never blanks whatever's
      // already saved.
      ['ntn', data.ntn !== undefined && data.ntn !== null ? data.ntn : (existingMeta_.ntn || '')],
      ['salesTaxReg', data.salesTaxReg !== undefined && data.salesTaxReg !== null ? data.salesTaxReg : (existingMeta_.salesTaxReg || '')]
    ]
  );
  // FIX (2026-08-25, critical multi-device data-loss bug): raise the
  // combined refusal now, only after every OTHER tab above — including
  // Meta — has already had its own independent chance to write. Deliberately
  // still starts with "Refused to overwrite" so it trips the exact same
  // client-side handling this always had (lastSaveBlockedByGuard in
  // index.html, the ~10s retry loop, the dialog testSheetConnection_
  // shows) — the only real change is that by the time the client sees this
  // error, every other tab this save touched is already safely committed
  // to the sheet, not silently stuck behind whichever tab happened to be
  // first in write order to refuse.
  if(SAVE_ALL_SKIPPED_TABS_.length){
    throw new Error('Refused to overwrite: ' + SAVE_ALL_SKIPPED_TABS_.join(', ') +
      '. Every other tab saved successfully — reload the app fully and retry so the tab(s) named above can catch up too.');
  }
}
// Case-insensitive de-duplicated union of two string arrays, preserving the
// first array's values (and its casing) when the same value appears in
// both — used for every simple saved-suggestion-list merge above.
function unionArrays_(a, b){
  const out = (a || []).slice();
  const seen = {};
  out.forEach(v => { seen[String(v).toLowerCase()] = true; });
  (b || []).forEach(v=>{
    const k = String(v).toLowerCase();
    if(!seen[k]){ seen[k] = true; out.push(v); }
  });
  return out;
}
// Combines a dd/MM/yyyy date string with an HH:mm time string into one
// comparable number — same minute-precision comparison as index.html's own
// rawStockTs_, kept independent since this runs server-side.
function rawStockTs_(dateStr, timeStr){
  const d = parseDMY_(dateStr);
  if(!d) return 0;
  const m = /^(\d{1,2}):(\d{2})/.exec(String(timeStr || ''));
  const mins = m ? (Number(m[1])*60 + Number(m[2])) : 0;
  return d.getTime() + mins*60000;
}
function mergeRawMaterialResetAt_(existing, incoming){
  const merged = Object.assign({}, existing);
  Object.keys(incoming || {}).forEach(name=>{
    const e = merged[name] || {};
    const inc = incoming[name] || {};
    const combined = {};
    ['weight','items'].forEach(kind=>{
      const a = e[kind], b = inc[kind];
      if(!a) combined[kind] = b;
      else if(!b) combined[kind] = a;
      else combined[kind] = (rawStockTs_(b.date,b.time) >= rawStockTs_(a.date,a.time)) ? b : a;
    });
    merged[name] = combined;
  });
  return merged;
}

// True only for a value that looks like an actual http(s) link — used to
// decide whether an existing "receipt" cell is a real Drive URL worth
// preserving, versus stale plain text (e.g. a bare filename) that should
// be treated as no-receipt instead of copied forward forever. See the
// existingExpenseReceipts / existingRawReceipts comments in saveAll_.
function isHttpUrl_(v){
  return typeof v === 'string' && /^https?:\/\//i.test(v.trim());
}

// Uploads a base64 data-URL (from an expense or raw ledger receipt file
// picked in the browser) to a dedicated Drive folder and returns a
// shareable view link. Storing the raw base64 directly in a sheet cell
// isn't reliable — Sheets caps cell content at ~50,000 characters, which a
// typical photo blows past easily — so Drive + a link in the cell is the
// robust approach. See RECEIPT_FOLDERS near the top of the file for which
// folder each section uses.
function getReceiptsFolder_(folderName){
  const name = folderName || RECEIPT_FOLDERS.expenses;
  const folders = DriveApp.getFoldersByName(name);
  if(folders.hasNext()) return folders.next();
  return DriveApp.createFolder(name);
}
function uploadReceiptToDrive_(dataUrl, filename, folderName){
  try{
    const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || '');
    if(!match){
      // Never fail silently — a bare '' return here is what let a stale
      // cell value get preserved indefinitely without anyone noticing
      // the upload never actually happened. An explicit ERROR string is
      // visible in the sheet immediately instead.
      Logger.log('[receipt-upload] rejected: dataUrl did not match expected "data:<mime>;base64,..." format (length=' + ((dataUrl || '').length) + ')');
      return 'ERROR: invalid image data';
    }
    const mimeType = match[1];
    const bytes = Utilities.base64Decode(match[2]);
    const blob = Utilities.newBlob(bytes, mimeType, filename || 'receipt');
    const file = getReceiptsFolder_(folderName).createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const url = file.getUrl();
    Logger.log('[receipt-upload] uploaded "' + (filename || 'receipt') + '" to "' + (folderName || RECEIPT_FOLDERS.expenses) + '" -> ' + url);
    return url;
  } catch(err){
    Logger.log('[receipt-upload] failed: ' + err);
    // TEMPORARY DIAGNOSTIC — write the actual error into the sheet cell
    // itself so it's visible immediately without digging through
    // Executions. Remove this once uploads are confirmed working.

    return 'ERROR: ' + err;
  }
}

// ---------- DECORATIVE HEADERS + REAL EMBEDDED RECEIPT IMAGES ----------
// One accent colour per tab, used to style that tab's header row (bold
// white text on a coloured background, frozen) so each ledger is visually
// distinct at a glance instead of every tab looking identical. Loosely
// matches the app's own in-app colour scheme (amber/orange primary accent,
// purple for paint, teal for raw material, blue for labour, red for
// expenses, green for factories).
const TAB_COLORS = {
  'Transactions':          '#F5B700',
  'Customer Payments':     '#E8590C',
  'CustomerLedger':        '#E8590C',
  'PaintLedger':           '#7C5CBF',
  'Painters':              '#7C5CBF',
  'RawLedger':             '#2EC4B6',
  'Suppliers':             '#2EC4B6',
  'ScrapLedger':           '#8B5E34',
  'ScrapBuyers':           '#8B5E34',
  'Labour':                '#3B82F6',
  'Labour Lists':          '#3B82F6',
  'Custom Ledgers':        '#5B4B8A',
  'CustomLedgerEntries':   '#5B4B8A',
  'Expenses':              '#D14343',
  'Expense Categories':    '#D14343',
  'Withdrawal':            '#B83232',
  'Factories':             '#4C9A5A',
  'Products':              '#4C9A5A',
  'Sales Summary':         '#F5B700',
  'Expenses Summary':      '#D14343',
  'Accounts Summary':      '#24282C',
  'Inventory':             '#24282C',
  'Meta':                  '#24282C'
};
function decorateHeader_(sh, sheetName, colCount){
  const color = TAB_COLORS[sheetName] || '#24282C';
  sh.getRange(1, 1, 1, colCount)
    .setBackground(color)
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  sh.setRowHeight(1, 26);
  sh.setFrozenRows(1);
}

// Extracts a Drive file ID out of the kind of shareable link
// uploadReceiptToDrive_ generates (file.getUrl(), e.g.
// "https://drive.google.com/file/d/<ID>/view?usp=drivesdk"). Returns null
// for anything that doesn't look like a Drive file link.
function extractDriveFileId_(url){
  if(typeof url !== 'string') return null;
  const m = /\/d\/([a-zA-Z0-9_-]+)/.exec(url);
  return m ? m[1] : null;
}

// Replaces the plain link text sitting in `photoCol` (copied there as a
// placeholder by writeRows_ below) with the REAL receipt file: an actual
// embedded photo for an image (SpreadsheetApp.newCellImage() — a true
// in-cell picture, not a floating anchor and not just a link) or a real
// clickable Drive link for a PDF (Sheets can't render a PDF as a picture).
// The link itself still lives in the column right before `photoCol` (see
// every safeWriteRows_/writeRows_ call above) so "is this already
// uploaded" checks (isHttpUrl_) keep working unchanged — this just makes
// the NEXT column show the real thing instead of a bare URL.
// Every full-table rewrite (writeRows_ always does a clearContents() +
// full rewrite) wipes any previously embedded pictures along with
// everything else, so this re-embeds from the links already on the row —
// no re-upload, just a fast Drive fetch per receipt. SPEED: this used to
// run on every tab on every save, no matter how small the change — adding
// or deleting one entry meant re-fetching and re-embedding every receipt
// in ALL 13+ tabs, not just the one that actually changed. writeRows_
// below now skips a tab completely (never reaching this function at all)
// when that tab's data is byte-identical to what it wrote last time — see
// computeRowsHash_ — so this only actually runs for tabs that genuinely
// changed. Within a tab that DID change, oldUrls/oldPhotoValues/
// oldPhotoFormulas (captured by writeRows_ right before it wiped the
// sheet) let a row reuse its already-fetched image/link instead of
// re-fetching from Drive, whenever that exact receipt URL is still
// sitting at that exact row position — see the SPEED comment at the
// capture site in writeRows_ for why this is positional, not ID-based.
function embedPhotos_(sh, urlCol, photoCol, rowCount, oldUrls, oldPhotoValues, oldPhotoFormulas){
  if(!photoCol || rowCount <= 0) return;
  const urls = sh.getRange(2, urlCol, rowCount, 1).getValues();
  for(let i = 0; i < rowCount; i++){
    const url = urls[i][0];
    if(!isHttpUrl_(url)) continue;
    const rowNum = i + 2;
    if(oldUrls && oldUrls[i] === url){
      const oldFormula = oldPhotoFormulas && oldPhotoFormulas[i];
      if(oldFormula && oldFormula.indexOf('=') === 0){
        // Was a real =HYPERLINK(...) (a PDF receipt) — reuse the formula
        // itself, not its display text, or the link would be lost.
        sh.getRange(rowNum, photoCol).setFormula(oldFormula);
        continue;
      }
      const oldValue = oldPhotoValues && oldPhotoValues[i];
      // A genuine embedded CellImage comes back from getValues() as an
      // object, not a string — this excludes blank cells, plain leftover
      // link text, and this function's own "(receipt unavailable: ...)"
      // error text, all of which must fall through and actually retry.
      if(oldValue && typeof oldValue === 'object'){
        sh.getRange(rowNum, photoCol).setValue(oldValue);
        continue;
      }
    }
    const fileId = extractDriveFileId_(url);
    if(!fileId) continue;
    try{
      const file = DriveApp.getFileById(fileId);
      const mime = file.getMimeType();
      if(mime && mime.indexOf('image/') === 0){
        // CellImageBuilder has NO setBlob() — that was a bug (threw
        // "setBlob is not a function" on every save). The only real way
        // to build an in-cell image is from a publicly-fetchable URL via
        // setSourceUrl(). uploadReceiptToDrive_ already shares every
        // receipt file as "Anyone with the link" at upload time (see
        // above), so lh3.googleusercontent.com — Google's own image-proxy
        // host, which serves the file's actual bytes with the right
        // content-type instead of a Drive "view" HTML page — can fetch it.
        const imageUrl = 'https://lh3.googleusercontent.com/d/' + fileId;
        const cellImage = SpreadsheetApp.newCellImage().setSourceUrl(imageUrl).setAltTextTitle(file.getName()).build();
        sh.getRange(rowNum, photoCol).setValue(cellImage);
      } else {
        // PDF (or any other non-image receipt) — a real clickable link to
        // the actual Drive file, not just a repeat of the plain URL text.
        sh.getRange(rowNum, photoCol).setFormula('=HYPERLINK("' + file.getUrl() + '","Open receipt")');
      }
    } catch(err){
      sh.getRange(rowNum, photoCol).setValue('(receipt unavailable: ' + err + ')');
    }
  }
}

// rowColors (optional): array the same length as rows — a CSS hex color
// string to highlight that row (e.g. a pending/overdue cheque), or a
// falsy value to leave it unhighlighted. clearContents() only clears
// cell VALUES, not formatting, so a row that was highlighted on a
// previous save and no longer needs it would otherwise stay highlighted
// forever — resetting the background across the sheet's full row count
// before applying this save's colors avoids that.
// SAFETY NET: refuses to let a save wipe out a tab that already holds
// real records. writeRows_ does a full clearContents()+rewrite on every
// single save — simple and always consistent, but with no protection:
// if the app's in-memory copy was ever unexpectedly empty at the moment
// a save fired (a client-side bug, a race on reload, a bad merge), this
// would previously erase every row in that tab permanently, with nothing
// left to recover. Used for tabs that only ever grow through real user
// actions (sales, ledger entries, payments, expenses) — a save that
// would drop one of these from a meaningful row count down to zero is
// rejected outright (throws, so doPost reports a real error) instead of
// silently applied.
const MIN_ROWS_TO_PROTECT_ = 1;
// FIX (2026-08-25, critical multi-device data-loss bug — user report: "even
// i added factory and after restart the app the added factory was vanished
// and cleared from both phone and sheet"). Root cause: saveAll_ writes each
// tab sequentially via safeWriteRows_, and the old code let a guard refusal
// on ANY tab (an unconfirmed empty-overwrite — e.g. RawLedger looking empty
// on a freshly-installed/degraded device while the real sheet still has
// data) throw immediately, which aborted the WHOLE saveAll_ call. Every tab
// positioned AFTER the refused one in the fixed write order below — this
// includes Factories, CustomerLedger, the Custom Ledgers, Expenses, and
// Withdrawal — never got attempted AT ALL in that save, over and over on
// every retry, even though their data had nothing to do with the actual
// refusal. Combined with the client's lastSaveBlockedByGuard flag (see
// index.html) then trusting the sheet wholesale on the next load — which
// is the right call FOR THE TAB THAT WAS ACTUALLY REFUSED, but wrong for
// every unrelated tab that simply never got a chance to save — a brand new
// Factory (or any other later-ordered addition) could be silently discarded
// on both the device that added it AND the sheet, forever, without ever
// reaching either. Reset to an empty array at the top of every saveAll_
// call; safeWriteRows_ (below) pushes into this instead of throwing
// immediately, so one tab's refusal no longer blocks any other tab from
// writing in the same pass — see the aggregate throw at the end of
// saveAll_.
let SAVE_ALL_SKIPPED_TABS_ = [];
// allowEmpty: set true when the CLIENT has already proven (via its own
// delete-tombstone list) that every row currently on the sheet was
// deliberately deleted by the user — see confirmedEmpty in saveAll_ below.
// Without an explicit true here, an empty save is always treated as
// suspicious and refused, same as before.
// photoCol (optional, 1-based): the column that should hold a REAL
// embedded receipt image/link. Either a plain number — meaning the URL it
// embeds from sits in the column right before it (the common case) — or
// a [urlCol, photoCol] pair when the receipt-URL column isn't immediately
// adjacent (e.g. RawLedger, where "receipt" and "photo" sit apart). See
// embedPhotos_ above.
function safeWriteRows_(sheetName, header, rows, textCols, wrapCols, rowColors, allowEmpty, photoCol){
  const sh = getSheet_(sheetName);
  const currentRowCount = Math.max(0, sh.getLastRow() - 1); // minus header row
  if(currentRowCount >= MIN_ROWS_TO_PROTECT_ && rows.length === 0 && !allowEmpty){
    // FIX (2026-08-25): used to throw here immediately, which aborted the
    // entire saveAll_ call and starved every tab written after this one in
    // the write order — see SAVE_ALL_SKIPPED_TABS_'s comment above for the
    // full story. Record the skip and let saveAll_ carry on to every other
    // tab; saveAll_ raises ONE combined "Refused to overwrite" error at the
    // very end (same message prefix, so every existing client-side handler
    // for it — lastSaveBlockedByGuard, the retry loop, testSheetConnection_
    // — keeps working exactly as before) once every tab has had its turn.
    SAVE_ALL_SKIPPED_TABS_.push(sheetName);
    Logger.log('safeWriteRows_: SKIPPED "' + sheetName + '" — would drop ' + currentRowCount +
      ' existing row(s) to 0 with no confirmed-empty proof. Left untouched on the sheet; every other tab still saves normally this pass.');
    return;
  }
  writeRows_(sheetName, header, rows, textCols, wrapCols, rowColors, photoCol);
}

// SPEED: this is the fix for "sync is slow / fails on multiple entries".
// saveAll_ used to call writeRows_ for EVERY tab on EVERY save, no matter
// how small the change — deleting one Raw Material entry still did a full
// clearContents() + rewrite + header restyle + (worst of all) a fresh
// Drive fetch-and-embed of every single receipt photo, for all 13+ tabs,
// even the ~12 that had nothing to do with the edit. On a business with a
// real amount of data and receipts, that adds up to a genuinely slow save
// and, since Apps Script has a hard execution time limit, can be exactly
// why a sync "fails" sometimes (the whole run got cut off partway through
// tabs that didn't even need touching).
// Fix: hash exactly what's about to be written (rows AND rowColors — see
// note below on why colors must be included) and compare it against the
// hash from the last successful write of this same tab, stored in Script
// Properties. An identical hash means this tab's sheet already holds
// exactly this data, so the entire rewrite (and, critically, the entire
// photo re-embed) is skipped — the tab is left completely untouched,
// including any images already embedded in it. A genuine change, however
// small, still triggers the exact same full rewrite as before; this only
// ever skips true no-op writes, so nothing about correctness changes.
// rowColors is part of the hash (not just rows) because cheque highlight
// colors are computed from TODAY'S real date (see chequeRowColor_ below),
// not just from the data itself — a cheque quietly crossing from
// "pending" to "overdue" overnight, with zero other data changes, must
// still be treated as a real change and NOT skipped, or the highlight
// would silently go stale until the next unrelated edit to that tab.
// Bump this any time something about HOW a tab gets written changes in a
// way that isn't reflected in `header`/`rows`/`rowColors` themselves (e.g.
// a header-styling change like the capitalization below) — it's folded
// into every tab's hash, so every stored hash instantly stops matching
// and the very next save naturally does one real rewrite of every tab to
// pick up the change, instead of tabs silently staying stale forever
// because their DATA never happened to change again.
const WRITE_FORMAT_SALT_ = 'capitalized-headers-v1';
function computeRowsHash_(header, rows, rowColors){
  const payload = JSON.stringify({ s: WRITE_FORMAT_SALT_, h: header, r: rows, c: rowColors || null });
  const digestBytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, payload, Utilities.Charset.UTF_8);
  return digestBytes.map(b => ((b < 0 ? b + 256 : b).toString(16)).padStart(2, '0')).join('');
}
// Display-only transform for the header ROW actually written to the
// sheet — capitalizes just the first character of each column label
// ('id' -> 'Id', 'receivedBy' -> 'ReceivedBy'), nothing else. The
// internal `header` array passed around the rest of this file (textCols/
// wrapCols indices, computeRowsHash_, etc.) is never touched — only what
// lands in row 1 changes. readTable_ below reverses this exact transform
// (lowercases the first character back) when it reads row 1 back in, so
// every existing `r.id`/`r.receivedBy`/etc. field name keeps working
// completely unchanged — this is purely cosmetic on the sheet.
function capitalizeHeader_(header){
  return header.map(h => (typeof h === 'string' && h.length > 0) ? (h.charAt(0).toUpperCase() + h.slice(1)) : h);
}
// ONE-OFF MANUAL FIX — not called by anything else in this file. The
// normal path (capitalizeHeader_ inside writeRows_, plus WRITE_FORMAT_SALT_
// forcing one real rewrite) only actually reaches a given tab's header the
// NEXT time the app performs a real save — if you want every tab
// capitalized RIGHT NOW instead of waiting for that, run this once by
// hand: open this project in the Apps Script editor, pick
// "capitalizeAllHeadersNow_" from the function dropdown at the top of the
// toolbar, click Run, approve any permission prompt, then check the
// sheet. It reads whatever's already sitting in row 1 of EVERY tab
// (whatever that currently says) and capitalizes just its first letter —
// it does not need to know each tab's "correct" header text, so there's
// no separate list to keep in sync with saveAll_ above, and it never
// touches any row other than row 1, so it cannot affect any real data.
// Safe to run more than once (already-capitalized text is left as-is).
function capitalizeAllHeadersNow_(){
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let touched = 0;
  ss.getSheets().forEach(sh=>{
    const lastCol = sh.getLastColumn();
    if(lastCol < 1) return;
    const headerRange = sh.getRange(1, 1, 1, lastCol);
    const header = headerRange.getValues()[0];
    headerRange.setValues([capitalizeHeader_(header)]);
    touched++;
  });
  Logger.log('capitalizeAllHeadersNow_: capitalized row 1 on ' + touched + ' tab(s).');
}

// ONE-OFF, run by hand from the Apps Script editor's function dropdown
// (Run once, approve permissions if asked). The app used to ship with 10
// hardcoded sample/placeholder products (Exhaust/Pedestal/Universal Fan
// Guards) pre-loaded on every fresh install, and an early sync pushed
// those same sample rows into this real Products tab — since then, every
// reinstall/new device pulled them straight back down from here. The app
// code no longer seeds them (index.html's PRODUCTS now starts empty), but
// this sheet still needs a one-time manual cleanup to remove whichever of
// those exact sample rows are still sitting in it.
// Matches on id+name+cat+price together (not just id) so it can only ever
// remove a row that's an EXACT match to one of the known sample products
// below — any real product the user added, even if it happens to reuse
// one of these ids, is left completely untouched. Safe to run more than
// once; a second run simply finds nothing left to remove.
function removeDemoProductsNow_(){
  const DEMO_PRODUCTS_ = [
    {id:1, name:'12" Exhaust Fan Guard', cat:'Bracket Exhaust Fan', price:350},
    {id:2, name:'16" Exhaust Fan Guard', cat:'Bracket Exhaust Fan', price:450},
    {id:3, name:'20" Exhaust Fan Guard', cat:'Bracket Exhaust Fan', price:600},
    {id:4, name:'24" Industrial Exhaust Guard', cat:'Bracket Exhaust Fan', price:850},
    {id:5, name:'18" Pedestal Fan Guard', cat:'Bracket Pedestal Fan', price:500},
    {id:6, name:'Stand Fan Guard (Round)', cat:'Bracket Pedestal Fan', price:400},
    {id:7, name:'Pedestal Fan Full Cage', cat:'Bracket Pedestal Fan', price:700},
    {id:16, name:'Universal Fan Guard — Small (12"–16")', cat:'Bracket Universal Fan', price:400},
    {id:17, name:'Universal Fan Guard — Medium (18"–20")', cat:'Bracket Universal Fan', price:550},
    {id:18, name:'Universal Fan Guard — Large (22"–24")', cat:'Bracket Universal Fan', price:750}
  ];
  const sh = getSheet_(SHEETS.products);
  const lastRow = sh.getLastRow();
  if(lastRow < 2){ Logger.log('removeDemoProductsNow_: Products tab has no data rows.'); return; }
  // header is row 1: id, name, cat, price, color, weight, size
  const values = sh.getRange(2, 1, lastRow - 1, 7).getValues();
  let removed = 0;
  for(let i = values.length - 1; i >= 0; i--){
    const row = values[i];
    const isDemo = DEMO_PRODUCTS_.some(d =>
      Number(row[0]) === d.id && String(row[1]) === d.name &&
      String(row[2]) === d.cat && Number(row[3]) === d.price
    );
    if(isDemo){
      sh.deleteRow(2 + i); // +2: row 1 is header, values[] is 0-indexed from row 2
      removed++;
    }
  }
  Logger.log('removeDemoProductsNow_: removed ' + removed + ' leftover demo product row(s).');
}

function writeRows_(sheetName, header, rows, textCols, wrapCols, rowColors, photoCol){
  const hashKey = 'rowsHash_' + sheetName;
  const newHash = computeRowsHash_(header, rows, rowColors);
  const props = PropertiesService.getScriptProperties();
  if(props.getProperty(hashKey) === newHash){
    return; // this tab already holds exactly this data — nothing to do
  }
  const sh = getSheet_(sheetName);
  // A tab written by an older version of this script (fewer columns than
  // `header` now has — several tabs grew when receivedBy/receivedIn/Photo
  // columns were added) needs its grid widened BEFORE writing into those
  // columns, or the write would fail. Sheets normally auto-grows for you,
  // but this makes it explicit instead of relying on that.
  if(sh.getMaxColumns() < header.length){
    sh.insertColumnsAfter(sh.getMaxColumns(), header.length - sh.getMaxColumns());
  }
  // SPEED: grab whatever's already sitting in the receipt-link and photo
  // columns BEFORE clearContents() wipes it, so embedPhotos_ below can
  // reuse an already-embedded image/link instead of re-fetching from
  // Drive when the same receipt URL is still at the same row. Positional,
  // not ID-based: appending a new entry at the end (the common case)
  // leaves every earlier row's position unchanged, so this catches
  // virtually all of them; a row shifts out of this shortcut only if
  // something was deleted/reordered ahead of it, in which case it just
  // falls back to a fresh fetch exactly as before — never wrong, just not
  // maximally fast for that one case.
  let oldUrls_ = null, oldPhotoValues_ = null, oldPhotoFormulas_ = null;
  if(photoCol){
    const photoCols_ = Array.isArray(photoCol) ? photoCol : [photoCol - 1, photoCol];
    const oldRowCount_ = Math.max(0, sh.getLastRow() - 1);
    if(oldRowCount_ > 0){
      oldUrls_ = sh.getRange(2, photoCols_[0], oldRowCount_, 1).getValues().map(r => r[0]);
      const oldPhotoRange_ = sh.getRange(2, photoCols_[1], oldRowCount_, 1);
      oldPhotoValues_ = oldPhotoRange_.getValues().map(r => r[0]);
      oldPhotoFormulas_ = oldPhotoRange_.getFormulas().map(r => r[0]);
    }
  }
  sh.clearContents();
  sh.getRange(1,1,1,header.length).setValues([capitalizeHeader_(header)]);
  decorateHeader_(sh, sheetName, header.length);
  const usedRows = Math.max(sh.getMaxRows() - 1, 1);
  sh.getRange(2, 1, usedRows, header.length).setBackground(null);
  if(rows.length > 0){
    // Force specific columns (1-based) to Plain Text BEFORE writing values,
    // so Sheets doesn't auto-convert strings like "23:35" or "10/08/2026"
    // into its own Date/Time type. Once that conversion happens, reading
    // it back gives a JS Date that serializes as a UTC "...Z" timestamp
    // instead of the original simple string — this must be set first,
    // not after, or the auto-conversion has already happened.
    if(textCols && textCols.length){
      textCols.forEach(colIdx=>{
        sh.getRange(2, colIdx, rows.length, 1).setNumberFormat('@');
      });
    }
    sh.getRange(2,1,rows.length,header.length).setValues(rows);
    // Columns holding multi-line values (e.g. one product per line for a
    // multi-item order) need WRAP so embedded newlines actually display
    // as stacked lines in the cell, instead of Sheets showing them run
    // together or clipped.
    if(wrapCols && wrapCols.length){
      wrapCols.forEach(colIdx=>{
        sh.getRange(2, colIdx, rows.length, 1).setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
      });
    }
    if(rowColors && rowColors.length){
      // SPEED: was one setBackground() call PER ROW — hundreds of separate
      // Apps Script calls on a big ledger, just for cheque highlighting,
      // on every single save. Building the full 2D color grid and calling
      // setBackgrounds() once does the exact same thing in a single call.
      const bgGrid = rowColors.map(color => {
        const row = new Array(header.length).fill(null);
        if(color) row.fill(color);
        return row;
      });
      sh.getRange(2, 1, rowColors.length, header.length).setBackgrounds(bgGrid);
    }
    if(photoCol){
      const photoCols = Array.isArray(photoCol) ? photoCol : [photoCol - 1, photoCol];
      embedPhotos_(sh, photoCols[0], photoCols[1], rows.length, oldUrls_, oldPhotoValues_, oldPhotoFormulas_);
    }
  }
  // Only recorded once the write above fully completed without throwing —
  // if anything failed partway through, the OLD hash stays in place, so
  // the next save attempt sees a "mismatch" and does a full rewrite again
  // instead of wrongly believing this incomplete state was saved.
  props.setProperty(hashKey, newHash);
  // A real, successful write happened — bump the global data-version
  // counter too, so a client's cheap action==='version' check correctly
  // sees that something changed (see DATA_VERSION_PROP_ above doPost).
  bumpDataVersion_();
}

// Reads the Deletions tab into the same { bucket: [key, key, ...] } shape
// the client's own deletedIds_ uses — so it can be merged straight into
// that object client-side. See the SHEETS.deletions comment above for the
// bug this fixes.
function readDeletions_(){
  const out = {};
  readTable_(SHEETS.deletions).forEach(r=>{
    const bucket = r.bucket;
    const key = r.key;
    if(!bucket || key === undefined || key === null || String(key).trim() === '') return;
    if(!Array.isArray(out[bucket])) out[bucket] = [];
    out[bucket].push(String(key));
  });
  return out;
}
// Merges the deletion tombstones this device knows about (data.tombstones
// — the client's field name for this stays "tombstones" even though the
// sheet tab and these functions are named "Deletions"; see SHEETS.deletions
// above) into whatever the sheet already has, and writes the union back —
// never a plain overwrite, since a plain overwrite from just THIS device's
// local tombstone list would silently drop every deletion some OTHER
// device already contributed. Tombstones only ever grow, so a union is
// always safe and nothing is ever lost by combining them this way.
// writeRows_'s own hash check means this is a no-op (no actual sheet
// write) when nothing new came in, same as every other tab.
function recordDeletions_(clientTombstones){
  if(!clientTombstones || typeof clientTombstones !== 'object') return;
  const existing = readDeletions_();
  Object.keys(clientTombstones).forEach(bucket=>{
    const keys = clientTombstones[bucket];
    if(!Array.isArray(keys)) return;
    if(!Array.isArray(existing[bucket])) existing[bucket] = [];
    keys.forEach(k=>{
      if(k === undefined || k === null || String(k).trim() === '') return;
      const key = String(k);
      if(!existing[bucket].includes(key)) existing[bucket].push(key);
    });
  });
  const rows = [];
  Object.keys(existing).forEach(bucket=>{
    existing[bucket].forEach(key=> rows.push([bucket, key]));
  });
  // Column 2 ("key") forced to plain text — an id/name tombstone key can
  // look numeric (e.g. a Custom Ledger id), same reasoning as every other
  // id-like column elsewhere in this file.
  writeRows_(SHEETS.deletions, ['bucket','key'], rows, [2]);
}

// Highlight color for a ledger row holding a cheque payment, based on its
// clearance status — used by the Paint/Raw/Customer ledger writers below.
// null means "leave it unhighlighted" (not a cheque, or already Cleared).
const CHEQUE_COLOR_PENDING = '#fff3cd'; // light yellow — awaiting clearance, due date not yet passed
const CHEQUE_COLOR_OVERDUE = '#f8d7da'; // light red — due date has passed, still not cleared
const CHEQUE_COLOR_BOUNCED = '#f5c6cb'; // red — bounced; its amount has been excluded from the Balance column
function chequeRowColor_(e){
  if(!e || e.method !== 'Cheque') return null;
  if(e.chequeStatus === 'bounced') return CHEQUE_COLOR_BOUNCED;
  if(e.chequeStatus === 'pending'){
    const due = parseDMY_(e.chequeDate);
    const today = new Date(); today.setHours(0,0,0,0);
    return (due && due < today) ? CHEQUE_COLOR_OVERDUE : CHEQUE_COLOR_PENDING;
  }
  return null; // 'cleared' — back to normal, no highlight
}

// ---------- LOAD ----------
function loadAll_(){
  const inventory = readInventory_();
  inventory.labourledger = readLabourSheet_();
  const labourLists = readLabourLists_();
  return {
    transactionsLog: readTransactions_(),
    customerPayments: readCustomerPayments_(),
    inventory: inventory,
    products: readProducts_(),
    factories: readFactories_(),
    expenses: readExpenses_(),
    expenseCategories: readExpenseCategories_(),
    withdrawals: readWithdrawal_(),
    workTypes: labourLists.workTypes,
    guardSizes: labourLists.guardSizes,
    guardWeights: labourLists.guardWeights,
    stickCounts: labourLists.stickCounts,
    productWeights: labourLists.productWeights,
    productNames: labourLists.productNames,
    productSizes: labourLists.productSizes,
    productColours: labourLists.productColours,
    rawItemNames: labourLists.rawItemNames,
    rawWeights: labourLists.rawWeights,
    rawBundleCounts: labourLists.rawBundleCounts,
    rawGaugeCounts: labourLists.rawGaugeCounts,
    rawSizeCounts: labourLists.rawSizeCounts,
    paintItemSizes: labourLists.paintItemSizes,
    paintItemTypes: labourLists.paintItemTypes,
    paintFactoryNames: labourLists.paintFactoryNames,
    customLedgers: readCustomLedgers_(),
    customItemColours: labourLists.customItemColours,
    customDescriptions: labourLists.customDescriptions,
    customWeightPerItems: labourLists.customWeightPerItems,
    customWeightPerScraps: labourLists.customWeightPerScraps,
    customItemSizes: labourLists.customItemSizes,
    paymentReceivedByList: labourLists.paymentReceivedByList,
    paymentReceivedInList: labourLists.paymentReceivedInList,
    // ADD (2026-08-23): the full cross-device deletion-tombstone set — see
    // SHEETS.deletions/recordDeletions_ above. The client merges this into
    // its own local tombstone list AND uses it to actively prune anything
    // it's still holding locally that another device already deleted. The
    // field name sent to the client stays "tombstones" (see
    // recordDeletions_'s comment on the client/server naming split).
    tombstones: readDeletions_(),
    ...readMeta_()
  };
}

// Cleans up any leftover Date/ISO values from BEFORE this fix — this covers
// two cases:
//  1) A genuine JS Date object (auto-converted by Sheets before the
//     setNumberFormat('@') change above).
//  2) A plain TEXT string that already looks like an ISO timestamp
//     ("2026-10-07T19:00:00.000Z") — this happens when a Date object from
//     case 1 got round-tripped through the client (JSON.stringify turns a
//     Date into that ISO string) and saved back as literal text. Since
//     it's already a string by then, the instanceof Date check alone
//     can't catch it, so we also detect the ISO pattern directly.
// Once re-saved, writeRows_ keeps these as plain text going forward, so
// this is a one-time cleanup for old data, not something needed forever.
var ISO_TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
function cellDateStr_(v){
  if(v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'dd/MM/yyyy');
  if(typeof v === 'string' && ISO_TS_RE.test(v)){
    var d = new Date(v);
    if(!isNaN(d.getTime())) return Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd/MM/yyyy');
  }
  return v || '';
}
// Parses the app's "dd/MM/yyyy" date strings (as used for both entry
// dates and cheque due-dates) into a real Date for comparison — returns
// null for anything that doesn't match, so callers can just skip it.
function parseDMY_(s){
  if(!s || typeof s !== 'string') return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if(!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return isNaN(d.getTime()) ? null : d;
}
function cellTimeStr_(v){
  if(v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'HH:mm');
  if(typeof v === 'string' && ISO_TS_RE.test(v)){
    var d = new Date(v);
    if(!isNaN(d.getTime())) return Utilities.formatDate(d, Session.getScriptTimeZone(), 'HH:mm');
  }
  // FIX (2026-08-19): sheet cells now hold 12-hour "h:mm AM/PM" text (see
  // to12Hour_ below) instead of the app's own internal 24-hour "HH:mm" —
  // this converts it back to 24-hour on the way IN, so every reader of
  // this value (the app's own formatTime12_ display, date/time sorting,
  // etc.) keeps working exactly as before; the sheet only shows 12-hour,
  // the app's internal state stays 24-hour throughout. Only triggers on a
  // real AM/PM suffix, so any older row still holding a plain 24-hour
  // string (written before this fix) passes through unchanged below.
  if(typeof v === 'string'){
    var m12 = /^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/.exec(v.trim());
    if(m12){
      var h12 = parseInt(m12[1], 10);
      var min12 = m12[2];
      var isPM = /p/i.test(m12[3]);
      if(h12 === 12) h12 = isPM ? 12 : 0;
      else if(isPM) h12 += 12;
      return (h12 < 10 ? '0' : '') + h12 + ':' + min12;
    }
  }
  return v || '';
}
// FIX (2026-08-19): "The time on sheet entries is in 24hours format.
// Change to 12 format" — every ledger's Time/time column is written from
// the app's raw 24-hour "HH:MM" string (e.g. "14:35"), forced to Plain
// Text format (see the textCols comment in writeRows_ above) so Sheets
// never reformats it — meaning whatever string is written here is
// EXACTLY what shows in the cell, verbatim. This converts that string to
// 12-hour "h:mm AM/PM" (e.g. "2:35 PM") right before it's written into
// each row, at every one of the 7 tabs that carry a time column
// (Transactions, Customer Payments, PaintLedger, RawLedger, Labour,
// CustomerLedger, CustomLedgerEntries) — see each safeWriteRows_ call
// above. This is a SHEET-DISPLAY-ONLY change: the app's own internal
// `time` values, its own 12-hour in-app display (formatTime12_ in
// index.html), and every date/time comparison in this file
// (parseDMY_-based sorting, etc.) all keep using the original 24-hour
// string exactly as before — only the string physically written into the
// sheet cell is converted, and only right here at the very last step.
// cellTimeStr_ above is the matching read-side counterpart that converts
// this 12-hour text back to 24-hour when the sheet is loaded back in, so
// the round trip is lossless.
function to12Hour_(t){
  if(!t) return t;
  var m = /^(\d{1,2}):(\d{2})/.exec(String(t).trim());
  if(!m) return t;
  var h = parseInt(m[1], 10);
  var min = m[2];
  var ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if(h === 0) h = 12;
  return h + ':' + min + ' ' + ampm;
}

function readTable_(sheetName){
  const sh = getSheet_(sheetName);
  const values = sh.getDataRange().getValues();
  if(values.length < 2) return [];
  // Reverses capitalizeHeader_() above — row 1 on the actual sheet now
  // reads "Id"/"ReceivedBy"/etc. for humans, but every field name used
  // throughout this file (r.id, r.receivedBy, ...) must keep working
  // exactly as before, so the first character is lowercased right back
  // before it's used as a key here.
  // EXCEPTION: the Labour tab (LABOUR_HEADER) was already written with
  // capitalized field names ('Worker','WorkType','ChequeDate', etc.) long
  // before capitalizeHeader_() existed, and every reference to it
  // (readLabourSheet_, the cheque-reminder scan) already reads r.Worker,
  // r.WorkType, and so on — capitalized, not lowerCamelCase. Lowercasing
  // that back here would break every one of those lookups, so this one
  // sheet's header is left exactly as read, unreversed.
  const header = (sheetName === SHEETS.labour)
    ? values[0]
    : values[0].map(h => (typeof h === 'string' && h.length > 0) ? (h.charAt(0).toLowerCase() + h.slice(1)) : h);
  return values.slice(1).map(row=>{
    const obj = {};
    header.forEach((h,i)=> obj[h] = row[i]);
    return obj;
  });
}

// Handles both the current "Paid"/"Unpaid" text and any older TRUE/FALSE
// boolean values already sitting in a sheet from before this change —
// used only as a fallback for a transaction saved before status/
// amountPaid/due existed (see readTransactions_ below).
function paidBool_(v){
  if(v === false) return false;
  if(v === true) return true;
  const s = String(v).trim().toLowerCase();
  return !(s === 'unpaid' || s === 'false' || s === '');
}

function readTransactions_(){
  return readTable_(SHEETS.transactions).map(r => {
    const total = Number(r.total) || 0;
    // 'paid' (Yes/No, same convention as 'confirmed') records how the
    // order was originally booked — see the comment in saveAll_ above.
    // Falls back to the older Status column (Paid/Partial/Unpaid) if this
    // particular row hasn't gone through a rewrite since the 2026-08-19
    // schema change yet (nothing looks wrong in that brief window), and
    // finally to the even older ad-hoc 'paid' format from before Status
    // existed at all — same three-tier fallback this already had, just
    // with the new format checked first now.
    let paid;
    if(r.paid !== undefined && r.paid !== null && r.paid !== ''){
      paid = r.paid !== 'No';
    } else if(r.status !== undefined && r.status !== null && r.status !== ''){
      paid = String(r.status).trim().toLowerCase() !== 'unpaid';
    } else {
      paid = paidBool_(r.paid);
    }
    return {
      id: String(r.id), date: cellDateStr_(r.date), time: cellTimeStr_(r.time), itemsSummary: r.itemsSummary,
      itemCount: r.itemCount, itemCounts: r.itemCounts || '', total: total, factory: r.factory || null,
      sizes: r.size || '', colors: r.colour || '',
      paid: paid,
      // Missing/blank on older rows saved before this existed — default to
      // already-confirmed so historical factory sales don't silently drop
      // out of the Sales-by-Factory chart the first time this loads.
      confirmed: r.confirmed !== 'No',
      device: r.device || '',
      // The factory's gate pass / receiving receipt attached via Order
      // Booked's "Add Receipt" button (2026-08-19) — real http(s) link to
      // the uploaded file, blank on older rows saved before this existed.
      receiptUrl: r.receipt || '',
      // Per-line cost-at-time-of-sale (2026-08-20) — blank on every order
      // placed before this existed, which profitMargin_() in index.html
      // treats as "unknown", not as zero.
      itemCosts: r.itemCosts || '',
      // Per-line SELLING price/rate-at-time-of-sale (2026-08-23) — the
      // figure the user asked for ("rate per item"), distinct from
      // itemCosts (wholesale cost) above. Blank on every order placed
      // before this existed; the frontend falls back to total/itemCount
      // for those (see rateExportCell_/txnExportRows_ in index.html).
      itemRates: r.itemRates || '',
      // Per-line real product id at time of sale (2026-08-25) — lets a
      // deleted order restock precisely by id instead of guessing by name
      // (see restockProductsForOrder_ in index.html). Blank on every order
      // placed before this existed, or imported via CSV — both simply
      // have nothing to restock, same graceful degradation as itemCosts/
      // itemRates above.
      itemProductIds: r.itemProductIds || ''
    };
  });
}

// Customer Payments — reads the flat payments-per-transaction ledger
// back into an array (grouped nowhere in particular; the app groups by
// txnId itself when it needs a specific transaction's payment history).
function readCustomerPayments_(){
  return readTable_(SHEETS.customerPayments).map(r => ({
    txnId: String(r.txnId || ''), id: r.id || '', date: cellDateStr_(r.date), time: cellTimeStr_(r.time),
    amount: Number(r.amount) || 0, method: r.method || '', detail: r.detail || '',
    receivedBy: r.receivedBy || '', receivedIn: r.receivedIn || '', receiptUrl: r.receipt || '', device: r.device || ''
  })).filter(p => p.txnId);
}

function readInventory_(){
  const rows = readTable_(SHEETS.inventory);
  const inv = { rawmaterial: [], labour: [] };
  rows.forEach(r=>{
    if(!inv[r.category]) inv[r.category] = [];
    inv[r.category].push({ name: r.name, qty: r.qty, unit: r.unit, cost: r.cost });
  });
  inv.paint = readPaintLedger_();
  inv.rawledger = readRawLedger_();
  inv.customerledger = readCustomerLedger_();
  inv.scrapledger = readScrapLedger_();
  return inv;
}

function readPaintLedger_(){
  const roster = readTable_(SHEETS.painters)
    .map(r => r.name)
    .filter(n => n !== undefined && n !== null && n !== '');

  const byName = {};
  roster.forEach(name => { byName[name] = { name: name, entries: [] }; });

  readTable_(SHEETS.paintLedger).forEach(r=>{
    const name = r.painter;
    if(!name) return;
    if(!byName[name]) byName[name] = { name: name, entries: [] };
    byName[name].entries.push({
      id: r.id || '',
      date: cellDateStr_(r.date),
      time: cellTimeStr_(r.time),
      desc: r.desc || '',
      color: r.colour || '',
      itemSize: r.itemSize || '',
      itemType: r.itemType || '',
      itemFactory: r.itemFactory || '',
      itemCount: r.itemCount || '',
      ratePerItem: r.ratePerItem || '',
      debit: Number(r.debit) || 0,
      credit: Number(r.credit) || 0,
      method: r.method || '',
      detail: r.detail || '',
      chequeDate: cellDateStr_(r.chequeDate),
      chequeStatus: r.chequeStatus || '',
      receivedBy: r.receivedBy || '',
      receivedIn: r.receivedIn || '',
      receiptUrl: r.receipt || '',
      device: r.device || ''
    });
  });

  // Preserve roster order first, then include any painter that only shows
  // up via ledger rows (shouldn't normally happen, but keeps data safe).
  const result = roster.map(name => byName[name]);
  Object.keys(byName).forEach(name=>{
    if(roster.indexOf(name) === -1) result.push(byName[name]);
  });
  return result;
}

// Same shape as readPaintLedger_ above, minus the colour field — reads the
// "Suppliers" roster tab and the "RawLedger" entries tab back into the
// per-supplier { name, entries } structure the app expects.
function readRawLedger_(){
  const roster = readTable_(SHEETS.suppliers)
    .map(r => r.name)
    .filter(n => n !== undefined && n !== null && n !== '');

  const byName = {};
  roster.forEach(name => { byName[name] = { name: name, entries: [] }; });

  readTable_(SHEETS.rawLedger).forEach(r=>{
    const name = r.supplier;
    if(!name) return;
    if(!byName[name]) byName[name] = { name: name, entries: [] };
    byName[name].entries.push({
      id: r.id || '',
      date: cellDateStr_(r.date),
      time: cellTimeStr_(r.time),
      desc: r.desc || '',
      weight: r.weight || '',
      bundleCount: r.bundleCount || '',
      gaugeCount: r.gaugeCount || '',
      sizeCount: r.sizeCount || '',
      debit: Number(r.debit) || 0,
      credit: Number(r.credit) || 0,
      receiptUrl: r.receipt || '',
      method: r.method || '',
      detail: r.detail || '',
      chequeDate: cellDateStr_(r.chequeDate),
      chequeStatus: r.chequeStatus || '',
      receivedBy: r.receivedBy || '',
      receivedIn: r.receivedIn || '',
      device: r.device || '',
      // 'stockName'/'weightIn'/'itemsIn' (2026-08-24) — same present-but-zero
      // handling as cost/stock/reorderLevel on Products: checked against ''
      // rather than truthiness so a genuine 0kg/0pcs entry isn't dropped
      // like "nothing recorded" would be.
      stockName: r.stockName || '',
      weightIn: (r.weightIn !== '' && r.weightIn !== undefined) ? Number(r.weightIn) : undefined,
      itemsIn: (r.itemsIn !== '' && r.itemsIn !== undefined) ? Number(r.itemsIn) : undefined,
      // 'rateType'/'rate' (2026-08-24, user request #2) — same
      // present-but-zero handling as weightIn/itemsIn above.
      rateType: r.rateType || '',
      rate: (r.rate !== '' && r.rate !== undefined) ? Number(r.rate) : undefined
    });
  });

  const result = roster.map(name => byName[name]);
  Object.keys(byName).forEach(name=>{
    if(roster.indexOf(name) === -1) result.push(byName[name]);
  });
  return result;
}

// ADD (2026-08-25, user request): Scrap Ledger — same roster+entries shape
// as readRawLedger_ above ("ScrapBuyers" holds the roster/balance so a
// buyer with zero entries still survives a reload, "ScrapLedger" holds
// every debit/credit entry with a running balance). Deliberately leaner
// than Raw Material's fields — no bundleCount/gaugeCount/sizeCount/
// stockName/weightIn/itemsIn/receipt, since none of those were asked for
// here; itemName/type/rate are new fields specific to this ledger.
function readScrapLedger_(){
  const roster = readTable_(SHEETS.scrapBuyers)
    .map(r => r.name)
    .filter(n => n !== undefined && n !== null && n !== '');

  const byName = {};
  roster.forEach(name => { byName[name] = { name: name, entries: [] }; });

  readTable_(SHEETS.scrapLedger).forEach(r=>{
    const name = r.buyer;
    if(!name) return;
    if(!byName[name]) byName[name] = { name: name, entries: [] };
    byName[name].entries.push({
      id: r.id || '',
      date: cellDateStr_(r.date),
      time: cellTimeStr_(r.time),
      desc: r.desc || '',
      itemName: r.itemName || '',
      type: r.type || '',
      weight: (r.weight !== '' && r.weight !== undefined) ? Number(r.weight) : undefined,
      rate: (r.rate !== '' && r.rate !== undefined) ? Number(r.rate) : undefined,
      debit: Number(r.debit) || 0,
      credit: Number(r.credit) || 0,
      method: r.method || '',
      detail: r.detail || '',
      chequeDate: cellDateStr_(r.chequeDate),
      chequeStatus: r.chequeStatus || '',
      receivedBy: r.receivedBy || '',
      receivedIn: r.receivedIn || '',
      device: r.device || ''
    });
  });

  const result = roster.map(name => byName[name]);
  Object.keys(byName).forEach(name=>{
    if(roster.indexOf(name) === -1) result.push(byName[name]);
  });
  return result;
}

// Same shape as readPaintLedger_/readRawLedger_ above, but the roster
// comes from the "Factories" tab itself (readFactories_ below) rather
// than a separate roster tab — Factories already lists every customer.
// Debit = amount billed/owed, Credit = payment received (the real cash-in
// side — see the comment above the CustomerLedger write in saveAll_ for
// why receipts attach to Credit here, unlike Painter/Supplier).
// ADD (2026-08-30, Tax Invoice feature): id -> {taxPercent, taxAmt} map
// read from the separate CustomerLedger_Tax helper tab (see SHEETS.customerLedgerTax
// above for why it's kept apart from the main sheet). Used by
// readCustomerLedger_ just below to attach tax data back onto its
// matching entry purely at read time — an entry with no matching row here
// simply gets taxPercent/taxAmt of 0, same as any untaxed or pre-feature
// entry.
function readCustomerLedgerTaxMap_(){
  const map = {};
  try{
    readTable_(SHEETS.customerLedgerTax).forEach(r=>{
      if(!r.id) return;
      map[r.id] = { taxPercent: Number(r.taxPercent) || 0, taxAmt: Number(r.taxAmt) || 0 };
    });
  } catch(e){ /* sheet doesn't exist yet on first run — nothing to join */ }
  return map;
}

function readCustomerLedger_(){
  const roster = readFactories_()
    .map(f => f.name)
    .filter(n => n !== undefined && n !== null && n !== '');

  const byName = {};
  roster.forEach(name => { byName[name] = { name: name, entries: [] }; });
  const taxMap_ = readCustomerLedgerTaxMap_();

  readTable_(SHEETS.customerLedger).forEach(r=>{
    const name = r.customer;
    if(!name) return;
    if(!byName[name]) byName[name] = { name: name, entries: [] };
    // FIX (2026-08-24): this used to unconditionally `return` here and skip
    // EVERY txnId row — they're the merged "one row per order" report rows
    // (see buildCustomerLedgerReportEntries_ in the app), and the app was
    // expected to always regenerate the equivalent debit-only entry itself
    // via reconcileFactoryLedgerOrders_, so sending the row back seemed
    // redundant. But that regeneration only works if the order is still in
    // the app's own transactionsLog — if a device's local Transactions data
    // is ever incomplete for ANY reason (a sync gap between devices, or the
    // 2026-08-24 critical data-loss bug), there's no order to regenerate
    // FROM, and since this row was never sent back here either, it was
    // silently and PERMANENTLY lost — gone from every device, forever,
    // with no way back. That's exactly what produced the real-device
    // report: "Refused to overwrite 'CustomerLedger': it currently has 1
    // row(s) but this save would leave it empty" — a deadlock that
    // persisted even after fully closing and reopening the app, because
    // every fresh load kept recomputing zero rows for the identical reason.
    // Sending the row back now instead — the app's own
    // reconcileFactoryLedgerOrders_/buildCustomerLedgerReportEntries_ (see
    // both for the matching fix) already de-dupe correctly by order id
    // regardless of whether a row came from here or was freshly
    // regenerated from a live order, and now correctly PRESERVE an orphaned
    // row instead of erasing it.
    byName[name].entries.push({
      id: r.id || '',
      date: cellDateStr_(r.date),
      time: cellTimeStr_(r.time),
      desc: r.desc || '',
      debit: Number(r.debit) || 0,
      credit: Number(r.credit) || 0,
      method: r.method || '',
      detail: r.detail || '',
      chequeDate: cellDateStr_(r.chequeDate),
      chequeStatus: r.chequeStatus || '',
      receiptUrl: r.receipt || '',
      txnId: r.txnId || '',
      device: r.device || '',
      receivedBy: r.receivedBy || '',
      receivedIn: r.receivedIn || '',
      // ADD (2026-08-30, Tax Invoice feature): joined in from the separate
      // CustomerLedger_Tax tab by this row's own id — see readCustomerLedgerTaxMap_.
      taxPercent: (r.id && taxMap_[r.id]) ? taxMap_[r.id].taxPercent : 0,
      taxAmt: (r.id && taxMap_[r.id]) ? taxMap_[r.id].taxAmt : 0
    });
  });

  const result = roster.map(name => byName[name]);
  Object.keys(byName).forEach(name=>{
    if(roster.indexOf(name) === -1) result.push(byName[name]);
  });
  return result;
}

// Custom Ledgers — roster comes from the "Custom Ledgers" tab itself
// (unlike Painters/Suppliers, there's no separate "add supplier" flow
// this rides on; a custom ledger is created directly via the app's
// "Add Specific Ledger" button, so its own roster tab is the source of
// truth for which ledgers exist, same as Factories is for CustomerLedger
// above). Debit=Cost/Credit=Payment, same direction as CustomerLedger.
function readCustomLedgers_(){
  const rosterRows = readTable_(SHEETS.customLedgerRoster)
    .filter(r => r.name !== undefined && r.name !== null && r.name !== '');
  const roster = rosterRows.map(r => r.name);

  const byName = {};
  rosterRows.forEach(r => {
    let weightStock = {};
    try{ weightStock = r.weightStock ? JSON.parse(r.weightStock) : {}; } catch(e){ weightStock = {}; }
    byName[r.name] = { name: r.name, entries: [], weightStock: weightStock, selfWeightStock: Number(r.selfWeightStock) || 0 };
  });

  readTable_(SHEETS.customLedgerEntries).forEach(r=>{
    const name = r.ledger;
    if(!name) return;
    if(!byName[name]) byName[name] = { name: name, entries: [], weightStock: {}, selfWeightStock: 0 };
    byName[name].entries.push({
      id: r.id || '',
      date: cellDateStr_(r.date),
      time: cellTimeStr_(r.time),
      desc: r.desc || '',
      itemColour: r.itemColour || '',
      weight: r.weight || '',
      sizeCount: r.sizeCount || '',
      itemCount: r.itemCount || '',
      ratePerItem: r.ratePerItem || '',
      itemMethod: r.itemMethod || '',
      itemWeightStatus: r.itemWeightStatus || '',
      // Same not-Number()-converted reasoning as weightPerItem/etc below —
      // this is a per-item historical snapshot, one value per item,
      // newline-separated for a multi-item entry.
      selfWeightStock: (r.selfWeightStock === undefined || r.selfWeightStock === null) ? '' : r.selfWeightStock,
      // Not Number()-converted: "+ Add Item" entries store one value per
      // item, newline-separated (see culSplitItems_ client-side) — a
      // multi-line string would silently collapse to 0 under Number().
      // A legacy single-item entry is still just one line, so it reads
      // back and behaves the same as a plain number would (e.g. "50" is
      // still truthy / parses fine with parseFloat on the client).
      weightPerItem: (r.weightPerItem === undefined || r.weightPerItem === null) ? 0 : r.weightPerItem,
      weightPerScrap: (r.weightPerScrap === undefined || r.weightPerScrap === null) ? 0 : r.weightPerScrap,
      remainingWeight: (r.remainingWeight === '' || r.remainingWeight === undefined || r.remainingWeight === null) ? undefined : r.remainingWeight,
      debit: Number(r.debit) || 0,
      credit: Number(r.credit) || 0,
      method: r.method || '',
      detail: r.detail || '',
      chequeDate: cellDateStr_(r.chequeDate),
      chequeStatus: r.chequeStatus || '',
      receivedBy: r.receivedBy || '',
      receivedIn: r.receivedIn || '',
      receiptUrl: r.receipt || '',
      device: r.device || ''
    });
  });

  const result = roster.map(name => byName[name]);
  Object.keys(byName).forEach(name=>{
    if(roster.indexOf(name) === -1) result.push(byName[name]);
  });
  return result;
}


// pieceRates and entries attached). There's no row-type label to key
// off — what a row IS follows from which columns are filled (see the
// comment above LABOUR_HEADER): a Date means it's a ledger entry; no
// Date but a GuardSize/Weight/Sticks means it's a configured piece rate;
// otherwise it's just a bare profile row (a worker with no activity yet).
function readLabourSheet_(){
  const byName = {};
  const roster = [];

  function ensureWorker_(r){
    if(!byName[r.Worker]){
      byName[r.Worker] = {
        name: r.Worker, workType: r.WorkType || '', rateType: r.RateType || 'daily', rate: 0,
        pieceRates: [], startDate: r.StartDate || '', endDate: r.EndDate || '', entries: []
      };
      roster.push(r.Worker);
    }
    return byName[r.Worker];
  }

  readTable_(SHEETS.labour).forEach(r=>{
    if(!r.Worker) return;
    const w = ensureWorker_(r);

    const isEntry = r.Date !== undefined && r.Date !== null && String(r.Date).trim() !== '';
    const isPieceRateRow = !isEntry && (r.GuardSize || r.Weight || r.Sticks);

    // Profile fields come ONLY from the actual Profile row now — not
    // from every row indiscriminately. Entries carry their own WorkType
    // (see below), and letting an old entry's WorkType overwrite the
    // worker's current profile-level value here would leak it right
    // back in, undoing the whole point of that separation.
    if(!isEntry && !isPieceRateRow){
      if(r.WorkType) w.workType = r.WorkType;
      if(r.RateType) w.rateType = r.RateType;
      if(r.StartDate) w.startDate = r.StartDate;
      if(r.EndDate) w.endDate = r.EndDate;
    }

    if(isEntry){
      w.entries.push({
        id: r.EntryId || '',
        date: cellDateStr_(r.Date),
        time: cellTimeStr_(r.Time),
        kind: r.Kind || 'attendance',
        status: r.Status || '',
        size: String(r.Size || ''),
        units: Number(r.Units) || 0,
        note: r.Note || '',
        debit: Number(r.Debit) || 0,
        credit: Number(r.Credit) || 0,
        method: r.Method || '',
        detail: r.MethodDetail || '',
        chequeDate: cellDateStr_(r.ChequeDate),
        chequeStatus: r.ChequeStatus || '',
        receivedBy: r.ReceivedBy || '',
        receivedIn: r.ReceivedIn || '',
        receiptUrl: r.Receipt || '',
        // This entry's own Work Type at the time it was logged — without
        // reading this back, it would silently fall back to the
        // worker's CURRENT profile-level Work Type on the very next
        // save, undoing the fix that stops old entries from being
        // retroactively relabeled when the current job title changes.
        workType: r.WorkType || '',
        device: r.Device || ''
      });
      if(w.rateType !== 'piece') w.rate = Number(r.Rate) || w.rate;
      // A piece-rate entry now carries its GuardSize/Weight/Sticks right
      // on this same row (see saveAll_ — this replaced the separate
      // config row once a size has been used). Recover that into
      // pieceRates here, once per distinct size, so the rate survives
      // reloads and future entries/edits for this size still have it
      // to look up — same as if it still had its own config row.
      if((r.GuardSize || r.Weight || r.Sticks) && r.Size && !w.pieceRates.some(pr => pr.size === String(r.Size))){
        w.pieceRates.push({
          guardSize: String(r.GuardSize || ''), weight: String(r.Weight || ''), sticks: String(r.Sticks || ''),
          rate: Number(r.Rate) || 0, size: String(r.Size || '')
        });
      }
    } else if(isPieceRateRow){
      // String(...) guards the same way as readLabourLists_ above — these
      // columns are now forced to plain text on write, but a row saved
      // before that fix may still hold real numbers (e.g. Sticks "8").
      w.pieceRates.push({
        guardSize: String(r.GuardSize || ''), weight: String(r.Weight || ''), sticks: String(r.Sticks || ''),
        rate: Number(r.Rate) || 0, size: String(r.Size || '')
      });
    } else {
      // bare profile row — its Rate is the worker's flat rate
      w.rate = Number(r.Rate) || w.rate;
    }
  });

  return roster.map(name => byName[name]);
}

// Reads the small "Labour Lists" tab (type + name columns) back into the
// fourteen separate arrays the app expects (5 Labour + 5 Raw Material
// Ledger + 3 Paint Ledger + 1 Custom Ledger) — mirrors writeRows_(SHEETS.
// labourLists, ...) in saveAll_ above. String(...) guards against any
// value that was saved BEFORE the column was forced to plain text (see
// LABOUR_TEXT_COLS comment) and got auto-converted to a number by
// Sheets — e.g. a Sticks No. of "8" read back as the number 8, which
// would crash the app's .toLowerCase() checks. New saves won't hit
// this, but old sheet data might until it's re-saved.
function readLabourLists_(){
  const out = {
    workTypes: [], guardSizes: [], guardWeights: [], stickCounts: [], productWeights: [],
    productNames: [], productSizes: [], productColours: [],
    rawItemNames: [], rawWeights: [], rawBundleCounts: [], rawGaugeCounts: [], rawSizeCounts: [],
    paintItemSizes: [], paintItemTypes: [], paintFactoryNames: [],
    customItemColours: [], customDescriptions: [], customWeightPerItems: [], customWeightPerScraps: [], customItemSizes: [],
    paymentReceivedByList: [], paymentReceivedInList: []
  };
  readTable_(SHEETS.labourLists).forEach(r=>{
    if(r.name === undefined || r.name === null || String(r.name).trim() === '') return;
    const name = String(r.name).trim();
    if(r.type === 'workType') out.workTypes.push(name);
    else if(r.type === 'guardSize') out.guardSizes.push(name);
    else if(r.type === 'weight') out.guardWeights.push(name);
    else if(r.type === 'sticks') out.stickCounts.push(name);
    else if(r.type === 'productWeight') out.productWeights.push(name);
    else if(r.type === 'productName') out.productNames.push(name);
    else if(r.type === 'productSize') out.productSizes.push(name);
    else if(r.type === 'productColour') out.productColours.push(name);
    else if(r.type === 'rawItem') out.rawItemNames.push(name);
    else if(r.type === 'rawWeight') out.rawWeights.push(name);
    else if(r.type === 'rawBundle') out.rawBundleCounts.push(name);
    else if(r.type === 'rawGauge') out.rawGaugeCounts.push(name);
    else if(r.type === 'rawSize') out.rawSizeCounts.push(name);
    else if(r.type === 'paintItemSize') out.paintItemSizes.push(name);
    else if(r.type === 'paintItemType') out.paintItemTypes.push(name);
    else if(r.type === 'paintFactory') out.paintFactoryNames.push(name);
    else if(r.type === 'customItemColour') out.customItemColours.push(name);
    else if(r.type === 'customDescription') out.customDescriptions.push(name);
    else if(r.type === 'customWeightPerItem') out.customWeightPerItems.push(name);
    else if(r.type === 'customWeightPerScrap') out.customWeightPerScraps.push(name);
    else if(r.type === 'customItemSize') out.customItemSizes.push(name);
    else if(r.type === 'paymentReceivedBy') out.paymentReceivedByList.push(name);
    else if(r.type === 'paymentReceivedIn') out.paymentReceivedInList.push(name);
  });
  return out;
}

function readFactories_(){
  return readTable_(SHEETS.factories).map(r => ({ name: r.name, location: r.location, contact: r.contact }));
}

function readProducts_(){
  return readTable_(SHEETS.products).map(r => {
    const p = { id: Number(r.id), name: r.name, cat: r.cat, price: Number(r.price), color: r.color || '' };
    if(r.weight) p.weight = r.weight;
    if(r.size) p.size = r.size;
    if(r.device) p.device = r.device;
    // Present-but-zero is meaningful for all three (a free item, an
    // out-of-stock item, a "notify me at 0" reorder level) — checked
    // against '' rather than truthiness so a real 0 isn't dropped like
    // "no value on record" would be.
    if(r.cost !== '' && r.cost !== undefined) p.cost = Number(r.cost);
    if(r.stock !== '' && r.stock !== undefined) p.stock = Number(r.stock);
    if(r.reorderLevel !== '' && r.reorderLevel !== undefined) p.reorderLevel = Number(r.reorderLevel);
    // 'recipe' (2026-08-24) — JSON-parsed back into a real array; a blank
    // cell (older row saved before this column existed) or malformed JSON
    // both fall back to an empty array rather than throwing and failing the
    // whole load.
    if(r.recipe){
      try{ const parsed = JSON.parse(r.recipe); if(Array.isArray(parsed) && parsed.length) p.recipe = parsed; }
      catch(e){ /* older row / malformed cell — leave p.recipe unset */ }
    }
    return p;
  });
}

function readExpenses_(){
  return readTable_(SHEETS.expenses).map(r => ({
    id: r.id || '', date: cellDateStr_(r.date), desc: r.desc, category: r.category, amount: r.amount,
    receiptUrl: r.receipt || '', method: r.method || '', detail: r.detail || '', device: r.device || ''
  }));
}

// ADD (2026-08-25, user request): Withdrawal Ledger — flat array, mirrors
// readExpenses_() above but with the extra fields (chequeDate/chequeStatus
// for the Cheque payment method, withdrawnBy/withdrawnIn) and no receipt.
function readWithdrawal_(){
  return readTable_(SHEETS.withdrawal).map(r => ({
    id: r.id || '', date: cellDateStr_(r.date), desc: r.desc, amount: r.amount,
    method: r.method || '', detail: r.detail || '',
    chequeDate: r.chequeDate || '', chequeStatus: r.chequeStatus || '',
    withdrawnBy: r.withdrawnBy || '', withdrawnIn: r.withdrawnIn || '', device: r.device || ''
  }));
}

function readExpenseCategories_(){
  return readTable_(SHEETS.expenseCategories)
    .map(r => r.name)
    .filter(n => n !== undefined && n !== null && n !== '');
}

// Reads the combined "Labour Lists" tab (type + name columns) back into
// the four separate arrays the app expects — mirrors writeRows_(SHEETS.
// labourLists, ...) in saveAll_ above.
function readMeta_(){
  const rows = readTable_(SHEETS.meta);
  const m = {};
  rows.forEach(r=>{ m[r.key] = r.value; });
  let rawMaterialReorderLevels = {};
  try{ rawMaterialReorderLevels = m.rawMaterialReorderLevels ? JSON.parse(m.rawMaterialReorderLevels) : {}; }
  catch(e){ rawMaterialReorderLevels = {}; }
  // ADD (2026-08-27, "mixed kg/items low-stock threshold" fix): the
  // item-count counterpart to rawMaterialReorderLevels just above — a
  // material tracked by item count gets its own threshold instead of being
  // wrongly compared against the weight-in-kg one. See the matching
  // index.html comment on rawMaterialItemReorderLevels for the full story.
  let rawMaterialItemReorderLevels = {};
  try{ rawMaterialItemReorderLevels = m.rawMaterialItemReorderLevels ? JSON.parse(m.rawMaterialItemReorderLevels) : {}; }
  catch(e){ rawMaterialItemReorderLevels = {}; }
  // ADD (2026-08-26, grams-saved-as-kg fix): same small flat per-material
  // settings map as rawMaterialReorderLevels above, but for which unit
  // ('g'/'kg') that material's numbers are actually tracked/typed in — see
  // the matching index.html comment on rawMaterialUnits for the full story.
  let rawMaterialUnits = {};
  try{ rawMaterialUnits = m.rawMaterialUnits ? JSON.parse(m.rawMaterialUnits) : {}; }
  catch(e){ rawMaterialUnits = {}; }
  let rawLedgerDescriptions = [];
  try{ rawLedgerDescriptions = m.rawLedgerDescriptions ? JSON.parse(m.rawLedgerDescriptions) : []; }
  catch(e){ rawLedgerDescriptions = []; }
  let rawMaterialResetAt = {};
  try{ rawMaterialResetAt = m.rawMaterialResetAt ? JSON.parse(m.rawMaterialResetAt) : {}; }
  catch(e){ rawMaterialResetAt = {}; }
  // ADD (2026-08-25, Scrap Ledger feature): three small saved-suggestion
  // lists for the Scrap Ledger entry form (Scrap Description/Item Name/
  // Type), stored the same way as rawLedgerDescriptions above — a
  // JSON-stringified array in its own Meta row, union-merged on save (see
  // saveAll_'s Meta write below) rather than overwritten wholesale.
  let scrapDescriptions = [];
  try{ scrapDescriptions = m.scrapDescriptions ? JSON.parse(m.scrapDescriptions) : []; }
  catch(e){ scrapDescriptions = []; }
  let scrapItemNames = [];
  try{ scrapItemNames = m.scrapItemNames ? JSON.parse(m.scrapItemNames) : []; }
  catch(e){ scrapItemNames = []; }
  let scrapTypes = [];
  try{ scrapTypes = m.scrapTypes ? JSON.parse(m.scrapTypes) : []; }
  catch(e){ scrapTypes = []; }
  // ADD (2026-08-25, Withdrawal Ledger feature): same pattern as the Scrap
  // Ledger lists above — Withdrawal's Description/Withdrawal By/Withdrawal
  // In saved-suggestion lists.
  let withdrawalDescriptions = [];
  try{ withdrawalDescriptions = m.withdrawalDescriptions ? JSON.parse(m.withdrawalDescriptions) : []; }
  catch(e){ withdrawalDescriptions = []; }
  let withdrawalByList = [];
  try{ withdrawalByList = m.withdrawalByList ? JSON.parse(m.withdrawalByList) : []; }
  catch(e){ withdrawalByList = []; }
  let withdrawalInList = [];
  try{ withdrawalInList = m.withdrawalInList ? JSON.parse(m.withdrawalInList) : []; }
  catch(e){ withdrawalInList = []; }
  return {
    txnNumber: m.txnNumber || 1,
    sessionTotal: m.sessionTotal || 0,
    sessionCount: m.sessionCount || 0,
    // ADD (2026-08-30, Tax Invoice feature): see the matching Meta write
    // in saveAll_ above.
    ntn: m.ntn || '',
    salesTaxReg: m.salesTaxReg || '',
    rawMaterialReorderLevels: rawMaterialReorderLevels,
    rawMaterialItemReorderLevels: rawMaterialItemReorderLevels,
    rawMaterialUnits: rawMaterialUnits,
    rawLedgerDescriptions: rawLedgerDescriptions,
    rawMaterialResetAt: rawMaterialResetAt,
    // ADD (2026-08-25, backup-freshness feature): ISO timestamp of the last
    // successful Gmail backup email, written by sendBackupEmail_() — see
    // that function's own comment for why it's a full read-merge-write
    // against this same tab rather than a blind overwrite.
    lastBackupEmailAt: m.lastBackupEmailAt || '',
    scrapDescriptions: scrapDescriptions,
    scrapItemNames: scrapItemNames,
    scrapTypes: scrapTypes,
    withdrawalDescriptions: withdrawalDescriptions,
    withdrawalByList: withdrawalByList,
    withdrawalInList: withdrawalInList,
    // ADD (2026-08-26, order-numbering reset feature): a plain counter/
    // timestamp bumped only by resetOrdersFresh() below. index.html
    // compares this against what it last saw (localStorage) and, on any
    // change, clears its OWN local transactionsLog deletion-tombstone
    // cache — see resetOrdersFresh's own comment for why that's required,
    // not optional, for a reset like this to actually stick.
    orderTombstoneResetToken: m.orderTombstoneResetToken || 0
  };
}

// =====================================================================
// ONE-OFF RECOVERY UTILITIES (2026-08-26)
// =====================================================================
// Added for the 2026-08-25 data-loss incident: the live Transactions
// (Order Booked) tab is still empty, and Factories has duplicate rows
// from the manual Version-History copy/paste recovery attempts. These
// are NOT called by the app or any trigger — run each ONCE, manually,
// from this editor (select the function name in the dropdown next to
// "Debug" at the top, then click Run), then check Deploy > ... no —
// check View > Executions (or the "Execution log" button) for the
// result. Safe to re-run if unsure whether it already ran: both are
// written to skip anything already correct rather than duplicate it.
//
// recoverTransactionsFromBackup(): the weekly Gmail backup
// (setupBackupEmailTrigger/sendBackupEmail_ above) — plus any on-demand
// "Send Backup Now" runs — makes a full, independent copy of the whole
// spreadsheet into a "Amir Traders Backups" Drive folder, up to the 10
// most recent kept at any time. Different backups can each hold
// different surviving orders (an order missing from the newest one may
// still be sitting in an older one), so this scans EVERY backup in that
// folder — not just the newest — and appends any order id it finds in
// ANY of them that isn't already on the live sheet. Purely additive —
// never clears or replaces the live Transactions tab — so it's safe to
// re-run even if some real data already made it back some other way.
// clearMatchingTombstones_(bucket, ids): removes any (bucket, key) pair
// from the shared Deletions tab whose key is in `ids`. Called by the
// recovery functions below right after they successfully add rows back.
//
// THE BUG THIS CLOSES: Transactions went back down to 0 rows after this
// session's earlier recovery runs, with no error anywhere — traced by
// diagnoseGhostOrders to this: a recovered order reuses its ORIGINAL id,
// and any device that still has an old tombstone for that same id (e.g.
// because it recorded a deletion for it back during the 2026-08-25
// incident, when the order first "vanished") will, on its very next
// ordinary save, see that id back on the sheet, match it against its own
// tombstone, and conclude — via computeConfirmedEmptyTransactions_ in
// index.html — that whatever smaller/empty local copy it's about to send
// represents a CONFIRMED deliberate deletion. That authorizes the backend
// guard to overwrite Transactions with the smaller copy, silently undoing
// the recovery with no error shown anywhere. Clearing the matching
// tombstone the moment an id is recovered closes this for good — nothing
// can "confirm" deleting an id that has no tombstone left.
function clearMatchingTombstones_(bucket, ids){
  if(!ids || !ids.length) return 0;
  const idSet = {};
  ids.forEach(function(id){ idSet[String(id)] = true; });
  const sh = getSheet_(SHEETS.deletions);
  const values = sh.getDataRange().getValues();
  if(values.length < 2) return 0;
  const header = values[0];
  const keep = [header];
  let removed = 0;
  values.slice(1).forEach(function(row){
    if(String(row[0]) === bucket && idSet[String(row[1])]) removed++;
    else keep.push(row);
  });
  if(removed > 0){
    sh.clearContents();
    sh.getRange(1, 1, keep.length, header.length).setValues(keep);
  }
  return removed;
}

// ROOT-CAUSE FIX (2026-08-28, real report: "add a labour, it syncs, then
// another device syncs, and the labour I just added vanishes"): tombstones
// (see the Deletions tab / clearMatchingTombstones_ just above) are
// permanent and shared — once a roster name (painter/supplier/worker/scrap
// buyer) or entry id is deleted anywhere, EVERY device remembers it as
// deleted forever, because mergeRosterWithEntries_ in index.html checks
// that tombstone before pulling a roster item in from a fresh load —
// BEFORE even checking whether this device already has it locally:
//   if(isDeleted_(bucket + 'Roster', rItem.name)) return;
// That's correct for a name that really is still deleted. But if the SAME
// name is later reused for a brand-new, legitimately re-added roster item
// (very common for workers — people leave and get rehired, or a new hire
// shares a common name; much rarer for suppliers/painters/scrap buyers,
// which is exactly why this was only ever reported on the Labour tab),
// any OTHER device that didn't add that name itself will see it
// tombstoned during its next merge and silently refuse to pull it in —
// then that device's own next save overwrites the WHOLE tab with its now-
// incomplete copy, permanently erasing the re-added worker (and every
// entry just logged for them) with no error shown anywhere.
//
// Fix: the moment a save actually includes a given roster name (or entry
// id) as real, current data, that's proof it's NOT deleted — clear any
// stale tombstone for it from the shared Deletions tab right here, same
// mechanism the manual recovery functions below already use for the exact
// same class of bug, just run automatically on every normal save instead
// of only by hand after an incident. One single read+rewrite of the
// Deletions tab covers every bucket at once (cheaper than calling
// clearMatchingTombstones_ separately per ledger, which would each pay
// for their own full sheet read/write on every single save).
//
// Scoped to the five buckets whose roster-deletion tombstones are ever
// actually written by a NAME that can legitimately be reused later
// (paintRoster/rawledgerRoster/scrapledgerRoster/labourledgerRoster/
// factories — see the markDeleted_ call sites in index.html), plus
// customerledgerEntries. Products is deliberately left out: its ids are
// millisecond timestamps (see nextProductId() in index.html) that are
// never reused, so a deleted product's id can never collide with a new
// one and there is nothing to reconcile there.
function clearStaleRosterTombstonesForSave_(data){
  data = data || {};
  const inv = data.inventory || {};
  const toClear = {}; // bucket -> { key: true }
  function noteBucket_(bucket, key){
    if(!bucket || !key) return;
    if(!toClear[bucket]) toClear[bucket] = {};
    toClear[bucket][String(key)] = true;
  }
  function addRoster_(rosterBucket, entriesBucket, items){
    (items || []).forEach(function(item){
      if(item && item.name) noteBucket_(rosterBucket, item.name);
      (item && item.entries || []).forEach(function(e){ if(e && e.id) noteBucket_(entriesBucket, e.id); });
    });
  }
  addRoster_('paintRoster', 'paintEntries', inv.paint);
  addRoster_('rawledgerRoster', 'rawledgerEntries', inv.rawledger);
  addRoster_('scrapledgerRoster', 'scrapledgerEntries', inv.scrapledger);
  addRoster_('labourledgerRoster', 'labourledgerEntries', inv.labourledger);
  addRoster_(null, 'customerledgerEntries', inv.customerledger);
  // Factories is a flat, top-level list (data.factories), not nested under
  // inventory like the other four — same name-reuse risk (mergeByName_ in
  // index.html checks isDeleted_('factories', name) exactly like
  // mergeRosterWithEntries_ does for the roster buckets above), so it
  // gets the exact same treatment here even though its shape differs.
  (data.factories || []).forEach(function(f){ if(f && f.name) noteBucket_('factories', f.name); });
  if(!Object.keys(toClear).length) return 0;
  const sh = getSheet_(SHEETS.deletions);
  const values = sh.getDataRange().getValues();
  if(values.length < 2) return 0;
  const header = values[0];
  const keep = [header];
  let removed = 0;
  values.slice(1).forEach(function(row){
    const bucket = String(row[0]);
    const key = String(row[1]);
    if(toClear[bucket] && toClear[bucket][key]){
      removed++;
    } else {
      keep.push(row);
    }
  });
  if(removed > 0){
    sh.clearContents();
    sh.getRange(1, 1, keep.length, header.length).setValues(keep);
    Logger.log('clearStaleRosterTombstonesForSave_: cleared ' + removed + ' stale tombstone(s) for name(s)/id(s) present in this save.');
  }
  return removed;
}

function recoverTransactionsFromBackup(){
  const folder = getBackupFolder_();
  const files = [];
  const it = folder.getFiles();
  while(it.hasNext()) files.push(it.next());
  if(!files.length){
    const msg = 'No backups found in the "' + BACKUP_FOLDER_NAME + '" Drive folder — nothing to recover from.';
    Logger.log(msg);
    return msg;
  }
  files.sort(function(a,b){ return b.getDateCreated() - a.getDateCreated(); });

  const liveSheet = getSheet_(SHEETS.transactions);
  const liveValues = liveSheet.getDataRange().getValues();
  const liveHeader = liveValues.length ? liveValues[0] : [];
  const liveIds = {};
  liveValues.slice(1).forEach(function(row){ if(row[0]) liveIds[String(row[0])] = true; });

  // The live header is the target shape every recovered row gets mapped
  // into by NAME, not by position — a backup taken before a column was
  // added (e.g. itemProductIds, added 2026-08-25) still merges cleanly,
  // it just leaves that one cell blank for its older rows.
  const TXN_HEADER = ['id','factory','date','time','itemsSummary','itemCount','itemCounts','size','colour','total','paid','confirmed','device','receipt','photo','itemCosts','itemRates','itemProductIds'];

  // FIX (2026-08-26, real result from the first version of this function):
  // stopping at the NEWEST backup with any rows at all assumed "newest with
  // data" means "most complete" — wrong assumption. The newest one that had
  // data turned out to have only 2 rows, both already on the live sheet, so
  // recovery reported nothing new even though OLDER backups (further back,
  // closer to before this recurring sync bug started actually costing real
  // data) might still hold orders that never made it into that particular
  // snapshot. Now scans EVERY backup, oldest to newest, and unions every
  // unique order id it finds across ALL of them — an order missing from the
  // newest backup but present in an older one still gets recovered. Still
  // purely additive against the live sheet either way.
  const filesOldestFirst = files.slice().reverse();
  let scannedWithData = [], appended = [], allBackupIds = [];
  filesOldestFirst.forEach(function(f){
    let ss;
    try{ ss = SpreadsheetApp.openById(f.getId()); }
    catch(e){ Logger.log('Skipped backup "' + f.getName() + '" — could not open it: ' + e); return; }
    const sh = ss.getSheetByName('Transactions');
    if(!sh) return;
    const values = sh.getDataRange().getValues();
    if(values.length < 2) return; // header only, no real rows in this backup
    // Backup's own header — lowercase-first-letter, mirrors readTable_'s
    // convention above, since capitalizeHeader_ wrote it as "Id"/"Factory"/etc.
    const backupHeader = values[0].map(h => (typeof h === 'string' && h.length) ? (h.charAt(0).toLowerCase() + h.slice(1)) : h);
    const rows = values.slice(1);
    let addedFromThisFile = 0;
    rows.forEach(function(row){
      const obj = {};
      backupHeader.forEach(function(h, idx){ obj[h] = row[idx]; });
      if(!obj.id) return;
      allBackupIds.push(String(obj.id)); // every real order id seen in any backup — see the tombstone-clear below for why this list matters even for ids already on the live sheet
      if(liveIds[String(obj.id)]) return; // already recovered/on the live sheet — skip appending, but its tombstone still gets cleared above
      liveIds[String(obj.id)] = true; // guard against the same id reappearing in a later (newer) backup too
      appended.push(TXN_HEADER.map(function(h){ return (obj[h] === undefined || obj[h] === null) ? '' : obj[h]; }));
      addedFromThisFile++;
    });
    scannedWithData.push({ name: f.getName(), rows: rows.length, added: addedFromThisFile });
  });

  if(!scannedWithData.length){
    const msg = 'Checked all ' + files.length + ' backup(s) in "' + BACKUP_FOLDER_NAME + '" — none had any rows in their Transactions tab. Nothing to recover.';
    Logger.log(msg);
    return msg;
  }
  const scanSummary = scannedWithData.map(function(s){ return s.name + ' (' + s.rows + ' row(s), ' + s.added + ' new)'; }).join('; ');
  if(!appended.length){
    // Nothing NEW to add, but these ids being on the live sheet at all
    // doesn't mean they're safe — see clearMatchingTombstones_'s comment
    // above recoverTransactionsFromBackup for why a device with a stale
    // tombstone for one of them can silently wipe it back out on its next
    // ordinary save, whether this run just added it or it was already
    // there from an earlier attempt. Clear their tombstones every time
    // this runs, not just on a run that actually appends something.
    const clearedTombstones = clearMatchingTombstones_('transactionsLog', allBackupIds);
    const msg = 'Scanned ' + scannedWithData.length + ' backup(s) with data — ' + scanSummary + '. Every id in every one of them is already on the live Transactions sheet. Nothing new to append.' + (clearedTombstones ? (' Cleared ' + clearedTombstones + ' stale deletion-tombstone(s) for these ids anyway, so they can\'t get silently wiped out again.') : '');
    Logger.log(msg);
    return msg;
  }

  // FIX (2026-08-26, real failure hit while testing this against the live
  // sheet): "Exception: Service error: Spreadsheets" on the setValues()
  // call below — the live Transactions tab, after everything it's been
  // through this week (wiped, manually pasted back into via Version
  // History more than once), had fewer than TXN_HEADER.length (18) actual
  // columns in its grid, so the write's range didn't exist yet. The
  // normal save path (writeRows_ above) already guards against exactly
  // this for every other tab it writes — this recovery function is
  // outside that path entirely, so it needs its own copy of the same
  // guard rather than assuming the grid is already wide enough.
  if(liveSheet.getMaxColumns() < TXN_HEADER.length){
    liveSheet.insertColumnsAfter(liveSheet.getMaxColumns(), TXN_HEADER.length - liveSheet.getMaxColumns());
  }
  const startRow = liveSheet.getLastRow() + 1;
  // Same reasoning as above, for ROWS — a sheet trimmed down during a
  // manual recovery attempt could have fewer rows in its grid than
  // startRow + appended.length - 1 needs.
  const neededMaxRow = startRow + appended.length - 1;
  if(liveSheet.getMaxRows() < neededMaxRow){
    liveSheet.insertRowsAfter(liveSheet.getMaxRows(), neededMaxRow - liveSheet.getMaxRows());
  }
  // Force the same text-preserving columns as the normal save path
  // (see safeWriteRows_'s call for Transactions above) BEFORE writing —
  // id/date/time/itemCounts/itemCosts/itemRates/itemProductIds must stay
  // plain text or Sheets silently converts a numeric-looking value.
  [1,3,4,7,16,17,18].forEach(function(colIdx){
    liveSheet.getRange(startRow, colIdx, appended.length, 1).setNumberFormat('@');
  });
  // DIAGNOSTIC (2026-08-26): this exact write threw "Service error:
  // Spreadsheets" on live data even with the grid-widening guards above in
  // place, for a reason not yet understood — wrapped so the NEXT failure
  // (if any) reports the actual sheet dimensions and row shapes instead of
  // just the bare exception, so the real cause can be found instead of
  // guessed at again.
  try{
    liveSheet.getRange(startRow, 1, appended.length, TXN_HEADER.length).setValues(appended);
  } catch(writeErr){
    const rowLengths = appended.map(function(r){ return r.length; });
    const diag = 'Write failed. liveSheet.getMaxRows()=' + liveSheet.getMaxRows() +
      ', getMaxColumns()=' + liveSheet.getMaxColumns() +
      ', getLastRow()=' + liveSheet.getLastRow() +
      ', getLastColumn()=' + liveSheet.getLastColumn() +
      ', startRow=' + startRow + ', appended.length=' + appended.length +
      ', TXN_HEADER.length=' + TXN_HEADER.length +
      ', row lengths=' + JSON.stringify(rowLengths) +
      ', first appended row=' + JSON.stringify(appended[0]) +
      ', original error=' + writeErr;
    Logger.log(diag);
    throw new Error(diag);
  }
  [5,7,8,9,16,17,18].forEach(function(colIdx){
    liveSheet.getRange(startRow, colIdx, appended.length, 1).setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
  });
  // See clearMatchingTombstones_'s own comment above — without this, a
  // device with an old tombstone for one of these ids can silently wipe
  // it right back out on its next ordinary save. Clears ALL ids seen
  // across every backup (allBackupIds), not just the ones newly appended
  // just now — an id that was already on the live sheet from an earlier
  // attempt is just as exposed to this bug and just as worth protecting.
  const clearedTombstones = clearMatchingTombstones_('transactionsLog', allBackupIds);

  const msg = 'Recovered ' + appended.length + ' order(s) total, scanned across ' + scannedWithData.length + ' backup(s) with data — ' + scanSummary + '. Appended to the live Transactions tab.' + (clearedTombstones ? (' Cleared ' + clearedTombstones + ' stale deletion-tombstone(s) for these ids so a device can\'t silently wipe them back out.') : '') + ' Reload the app on any device to see them.';
  Logger.log(msg);
  return msg;
}

// labourRowKey_(obj): a stable identity for one Labour-tab row, used by
// recoverLabourFromBackup() below to tell "already have this" from
// "genuinely missing" — an Entry row is identified by its EntryId (unique
// per attendance/payment/advance entry), but a Piece Rate or bare Profile
// row has no id of its own, so those are identified by everything that
// makes them who they are instead.
function labourRowKey_(obj){
  if(obj.EntryId) return 'entry:' + obj.EntryId;
  return ['cfg', obj.Worker, obj.RowType, obj.GuardSize, obj.Weight, obj.Sticks, obj.Size].map(function(v){ return (v === undefined || v === null) ? '' : String(v); }).join('|');
}

// recoverLabourFromBackup(): diagnoseOtherLedgers() (2026-08-26) proved the
// Labour tab had 6 real rows in the pre-incident 22-Aug backups and now has
// 0 on the live sheet — every OTHER ledger checked (RawLedger, PaintLedger,
// Painters, ScrapLedger, ScrapBuyers) was already at 0 even in those SAME
// 22-Aug backups (or its tab didn't exist yet), so this is the one tab that
// actually lost real data, not just an unused feature. Same silent-wipe
// mechanism as Transactions (see recoverTransactionsFromBackup above) —
// this is that function's mirror for Labour: scans every backup
// oldest-to-newest, unions every unique row by labourRowKey_, appends
// whatever's missing from the live sheet, and clears stale
// deletion-tombstones for every worker name and entry id involved (both
// 'labourledgerRoster' and 'labourledgerEntries' buckets) so a device with
// an old tombstone from the original incident can't silently wipe this
// recovery back out on its next ordinary save.
function recoverLabourFromBackup(){
  const folder = getBackupFolder_();
  const files = [];
  const it = folder.getFiles();
  while(it.hasNext()) files.push(it.next());
  if(!files.length){
    const msg = 'No backups found in the "' + BACKUP_FOLDER_NAME + '" Drive folder — nothing to recover from.';
    Logger.log(msg);
    return msg;
  }

  const liveSheet = getSheet_(SHEETS.labour);
  const liveValues = liveSheet.getDataRange().getValues();
  const liveKeys = {};
  liveValues.slice(1).forEach(function(row){
    const obj = {};
    LABOUR_HEADER.forEach(function(h, idx){ obj[h] = row[idx]; });
    liveKeys[labourRowKey_(obj)] = true;
  });

  const filesOldestFirst = files.slice().reverse();
  let scannedWithData = [], appended = [], allEntryIds = [], allWorkerNames = {};
  filesOldestFirst.forEach(function(f){
    let ss;
    try{ ss = SpreadsheetApp.openById(f.getId()); }
    catch(e){ Logger.log('Skipped backup "' + f.getName() + '" — could not open it: ' + e); return; }
    const sh = ss.getSheetByName(SHEETS.labour);
    if(!sh) return;
    const values = sh.getDataRange().getValues();
    if(values.length < 2) return; // header only, no real rows in this backup
    const backupHeader = values[0]; // Labour tab keeps capitalized headers on the sheet itself — see readTable_'s exception comment
    const rows = values.slice(1);
    let addedFromThisFile = 0;
    rows.forEach(function(row){
      const obj = {};
      backupHeader.forEach(function(h, idx){ obj[h] = row[idx]; });
      if(!obj.Worker) return;
      allWorkerNames[String(obj.Worker)] = true;
      if(obj.EntryId) allEntryIds.push(String(obj.EntryId));
      const key = labourRowKey_(obj);
      if(liveKeys[key]) return; // already recovered/on the live sheet
      liveKeys[key] = true; // guard against the same row reappearing in a later (newer) backup too
      appended.push(LABOUR_HEADER.map(function(h){ return (obj[h] === undefined || obj[h] === null) ? '' : obj[h]; }));
      addedFromThisFile++;
    });
    scannedWithData.push({ name: f.getName(), rows: rows.length, added: addedFromThisFile });
  });

  if(!scannedWithData.length){
    const msg = 'Checked all ' + files.length + ' backup(s) in "' + BACKUP_FOLDER_NAME + '" — none had any rows in their Labour tab. Nothing to recover.';
    Logger.log(msg);
    return msg;
  }
  const scanSummary = scannedWithData.map(function(s){ return s.name + ' (' + s.rows + ' row(s), ' + s.added + ' new)'; }).join('; ');
  const workerNameList = Object.keys(allWorkerNames);

  if(!appended.length){
    const clearedEntries = clearMatchingTombstones_('labourledgerEntries', allEntryIds);
    const clearedRoster = clearMatchingTombstones_('labourledgerRoster', workerNameList);
    const msg = 'Scanned ' + scannedWithData.length + ' backup(s) with data — ' + scanSummary + '. Every row in every one of them is already on the live Labour sheet. Nothing new to append.' + ((clearedEntries + clearedRoster) ? (' Cleared ' + (clearedEntries + clearedRoster) + ' stale deletion-tombstone(s) anyway, so they can\'t get silently wiped out again.') : '');
    Logger.log(msg);
    return msg;
  }

  if(liveSheet.getMaxColumns() < LABOUR_HEADER.length){
    liveSheet.insertColumnsAfter(liveSheet.getMaxColumns(), LABOUR_HEADER.length - liveSheet.getMaxColumns());
  }
  const startRow = liveSheet.getLastRow() + 1;
  const neededMaxRow = startRow + appended.length - 1;
  if(liveSheet.getMaxRows() < neededMaxRow){
    liveSheet.insertRowsAfter(liveSheet.getMaxRows(), neededMaxRow - liveSheet.getMaxRows());
  }
  // Same text-preserving guard as the normal save path (LABOUR_TEXT_COLS) —
  // must be applied BEFORE writing or Sheets silently converts a
  // numeric-looking value like a Sticks No. or GuardSize into a real number.
  LABOUR_TEXT_COLS.forEach(function(colIdx){
    liveSheet.getRange(startRow, colIdx, appended.length, 1).setNumberFormat('@');
  });
  try{
    liveSheet.getRange(startRow, 1, appended.length, LABOUR_HEADER.length).setValues(appended);
  } catch(writeErr){
    const diag = 'Write failed. liveSheet.getMaxRows()=' + liveSheet.getMaxRows() +
      ', getMaxColumns()=' + liveSheet.getMaxColumns() +
      ', getLastRow()=' + liveSheet.getLastRow() +
      ', getLastColumn()=' + liveSheet.getLastColumn() +
      ', startRow=' + startRow + ', appended.length=' + appended.length +
      ', LABOUR_HEADER.length=' + LABOUR_HEADER.length +
      ', first appended row=' + JSON.stringify(appended[0]) +
      ', original error=' + writeErr;
    Logger.log(diag);
    throw new Error(diag);
  }

  const clearedEntries = clearMatchingTombstones_('labourledgerEntries', allEntryIds);
  const clearedRoster = clearMatchingTombstones_('labourledgerRoster', workerNameList);

  const msg = 'Recovered ' + appended.length + ' Labour row(s) total for worker(s): ' + workerNameList.join(', ') + '. Scanned across ' + scannedWithData.length + ' backup(s) with data — ' + scanSummary + '. Appended to the live Labour tab.' + ((clearedEntries + clearedRoster) ? (' Cleared ' + (clearedEntries + clearedRoster) + ' stale deletion-tombstone(s) so a device can\'t silently wipe them back out.') : '') + ' Reload the app on any device to see them.';
  Logger.log(msg);
  return msg;
}

// recoverSuppliersRosterFromBackup(): mirrors recoverLabourFromBackup, but
// for the Suppliers roster tab (name + balance only). diagnoseOtherLedgers()
// found the 22-Aug backups have 1 supplier row that's missing from the live
// roster now. IMPORTANT: this only restores the NAME — the supplier's real
// debit/credit history lives in RawLedger, and every backup checked (old
// AND new) shows RawLedger completely empty, so there don't appear to be
// any actual transactions to recover for it, just the roster entry itself.
function recoverSuppliersRosterFromBackup(){
  const folder = getBackupFolder_();
  const files = [];
  const it = folder.getFiles();
  while(it.hasNext()) files.push(it.next());
  if(!files.length){
    const msg = 'No backups found in the "' + BACKUP_FOLDER_NAME + '" Drive folder — nothing to recover from.';
    Logger.log(msg);
    return msg;
  }

  const liveSheet = getSheet_(SHEETS.suppliers);
  const liveValues = liveSheet.getDataRange().getValues();
  const liveNames = {};
  liveValues.slice(1).forEach(function(row){ if(row[0]) liveNames[String(row[0])] = true; });

  const filesOldestFirst = files.slice().reverse();
  let scanned = [], appended = [], allNames = [];
  filesOldestFirst.forEach(function(f){
    let ss;
    try{ ss = SpreadsheetApp.openById(f.getId()); }
    catch(e){ Logger.log('Skipped backup "' + f.getName() + '" — could not open it: ' + e); return; }
    const sh = ss.getSheetByName(SHEETS.suppliers);
    if(!sh) return;
    const values = sh.getDataRange().getValues();
    if(values.length < 2) return;
    let added = 0;
    values.slice(1).forEach(function(row){
      const name = row[0];
      if(!name) return;
      allNames.push(String(name));
      if(liveNames[String(name)]) return;
      liveNames[String(name)] = true;
      appended.push([name, row[1] || 0]);
      added++;
    });
    if(values.length > 1) scanned.push(f.getName() + ' (' + (values.length - 1) + ' row(s), ' + added + ' new)');
  });

  const clearedRoster = clearMatchingTombstones_('rawledgerRoster', allNames);
  if(!appended.length){
    const msg = 'Checked ' + files.length + ' backup(s) — ' + (scanned.length ? scanned.join('; ') : 'none had a Suppliers tab with rows') + '. Nothing new to append.' + (clearedRoster ? (' Cleared ' + clearedRoster + ' stale deletion-tombstone(s) anyway.') : '');
    Logger.log(msg);
    return msg;
  }
  const startRow = liveSheet.getLastRow() + 1;
  liveSheet.getRange(startRow, 1, appended.length, 2).setValues(appended);
  const msg = 'Recovered ' + appended.length + ' supplier name(s) to the roster: ' + appended.map(function(r){ return r[0]; }).join(', ') + '. Scanned — ' + scanned.join('; ') + '.' + (clearedRoster ? (' Cleared ' + clearedRoster + ' stale deletion-tombstone(s) so a device can\'t silently wipe it back out.') : '') + ' Note: RawLedger itself (their actual debit/credit entries) is empty in every backup checked, old and new — this restores the NAME only, since there don\'t appear to be any lost transactions to go with it. Reload the app on any device to see it.';
  Logger.log(msg);
  return msg;
}

// resetOrdersFresh(): explicit user request (2026-08-26), after
// diagnoseOrderTombstones() showed #0001-#0003/#0006-#0009 have no trace in
// any backup and the user said not to bother chasing them further — start
// the order numbering completely clean instead. Run this ONCE, manually,
// same as every other function in this section.
//
// What it does, in order:
//  1. Reads whatever order(s) are CURRENTLY on the live Transactions sheet
//     (right now: just the one, the former #0010) and renumbers them
//     sequentially starting at #0001, in their existing row order.
//  2. Updates every order-linked CustomerLedger row (has a TxnId, or a
//     Description starting "Order #...") to match its order's new id —
//     and DELETES any order-linked row whose old id did NOT survive step 1
//     (a permanently-orphaned ghost from one of the already-confirmed-gone
//     ids, e.g. the leftover Rs 450 entry from the old #0007). Every
//     non-order-linked row (a real manual ledger entry — a payment, a
//     write-off, etc.) is left completely untouched.
//  3. Renumbers any CustomerPayments rows tied to a renumbered order
//     (defense-in-depth — none are expected to exist yet for #0010, since
//     it's still Unpaid, but this keeps the payment history intact if
//     that's changed by the time this runs).
//  4. Clears every 'transactionsLog' tombstone from the shared Deletions
//     tab — the whole point of this reset is a clean slate, and leaving
//     any of the old ones in place would just make some future id get
//     silently skipped again for no visible reason (nextFreeTxnId_ in
//     index.html already refuses to reuse a tombstoned id — good in
//     general, confusing here).
//  5. Sets Meta's txnNumber so the NEXT new order becomes #0002 (or
//     whatever correctly follows however many orders survived step 1).
//  6. Bumps Meta's orderTombstoneResetToken. THIS STEP IS NOT OPTIONAL:
//     each device's own local tombstone cache (deletedIds_.transactionsLog,
//     stored in that device's localStorage) has no way to hear that the
//     shared Deletions tab was just cleared — mergeRemoteTombstones_ only
//     ever ADDS remote tombstones into local, it never removes local ones
//     just because the server dropped them. Without this token, the very
//     next save from a device that still remembers deleting (say) the old
//     "0001" would silently wipe the freshly-renamed order right back out
//     — literally the same bug this whole session has been chasing, just
//     self-inflicted by this reset instead of the original race condition.
//     index.html watches this token on every load/pre-save merge and
//     clears its own local cache the moment it changes, so every device
//     self-heals the next time it syncs — no per-device action needed
//     beyond a normal connection.
function resetOrdersFresh(){
  const out = [];

  // ---- 1. Renumber the live Transactions sheet ----
  const txnSheet = getSheet_(SHEETS.transactions);
  const txnValues = txnSheet.getDataRange().getValues();
  if(!txnValues.length){
    const msg = 'Transactions sheet has no header row at all — aborting, nothing touched.';
    Logger.log(msg);
    return msg;
  }
  const txnHeader = txnValues[0];
  const realRows = txnValues.slice(1).filter(function(row){
    return row[0] !== '' && row[0] !== null && row[0] !== undefined;
  });
  const idMap = {}; // oldId -> newId, used by every step below
  const renumberedRows = realRows.map(function(row, i){
    const oldId = String(row[0]);
    const newId = String(i + 1).padStart(4, '0');
    idMap[oldId] = newId;
    const newRow = row.slice();
    newRow[0] = newId;
    return newRow;
  });
  txnSheet.clearContents();
  txnSheet.getRange(1, 1, 1, txnHeader.length).setValues([txnHeader]);
  if(renumberedRows.length){
    txnSheet.getRange(2, 1, renumberedRows.length, txnHeader.length).setValues(renumberedRows);
    txnSheet.getRange(2, 1, renumberedRows.length, 1).setNumberFormat('@'); // id column stays plain text
  }
  out.push('Transactions: renumbered ' + renumberedRows.length + ' surviving order(s). Mapping: ' + JSON.stringify(idMap));

  // ---- 2. Update / drop CustomerLedger's order-linked rows ----
  const clSheet = getSheet_(SHEETS.customerLedger);
  const clValues = clSheet.getDataRange().getValues();
  if(clValues.length > 1){
    const clHeader = clValues[0];
    const DESC_IDX = 4, TXNID_IDX = 14; // per the CustomerLedger header order in saveAll_
    let updatedCount = 0, deletedCount = 0;
    const keptRows = [clHeader];
    clValues.slice(1).forEach(function(row){
      const desc = String(row[DESC_IDX] || '');
      const descMatch = /^Order #(.+?)( — |$)/.exec(desc);
      const rawTxnId = row[TXNID_IDX] ? String(row[TXNID_IDX]) : '';
      const isOrderLinked = !!(rawTxnId || descMatch);
      if(!isOrderLinked){
        keptRows.push(row);
        return;
      }
      const linkedOldId = rawTxnId || descMatch[1];
      const newId = idMap[linkedOldId];
      if(newId){
        const newRow = row.slice();
        newRow[TXNID_IDX] = newId;
        if(descMatch) newRow[DESC_IDX] = desc.replace('Order #' + linkedOldId, 'Order #' + newId);
        keptRows.push(newRow);
        updatedCount++;
      } else {
        deletedCount++; // orphaned ghost — its order didn't survive step 1
      }
    });
    clSheet.clearContents();
    clSheet.getRange(1, 1, keptRows.length, clHeader.length).setValues(keptRows);
    out.push('CustomerLedger: updated ' + updatedCount + ' order-linked row(s), removed ' + deletedCount + ' orphaned ghost row(s). Every non-order-linked row was left untouched.');
  } else {
    out.push('CustomerLedger: no data rows, nothing to update.');
  }

  // ---- 3. Renumber any CustomerPayments tied to a renumbered order ----
  const cpSheet = getSheet_(SHEETS.customerPayments);
  const cpValues = cpSheet.getDataRange().getValues();
  let cpUpdated = 0;
  if(cpValues.length > 1){
    for(let i = 1; i < cpValues.length; i++){
      const oldId = String(cpValues[i][0] || '');
      if(idMap[oldId]){
        cpSheet.getRange(i + 1, 1).setValue(idMap[oldId]);
        cpUpdated++;
      }
    }
  }
  out.push('CustomerPayments: renumbered ' + cpUpdated + ' row(s).');

  // ---- 4. Clear every transactionsLog tombstone ----
  const delSheet = getSheet_(SHEETS.deletions);
  const delValues = delSheet.getDataRange().getValues();
  let clearedTombstones = 0;
  if(delValues.length > 1){
    const delHeader = delValues[0];
    const keep = [delHeader];
    delValues.slice(1).forEach(function(row){
      if(String(row[0]) === 'transactionsLog') clearedTombstones++;
      else keep.push(row);
    });
    if(clearedTombstones > 0){
      delSheet.clearContents();
      delSheet.getRange(1, 1, keep.length, delHeader.length).setValues(keep);
    }
  }
  out.push('Cleared ' + clearedTombstones + ' transactionsLog tombstone(s) from the Deletions tab.');

  // ---- 5 & 6. Reset the order counter + bump the client self-heal token ----
  const m = readMeta_();
  const newTxnNumber = renumberedRows.length + 1;
  const resetToken = Date.now();
  writeRows_(SHEETS.meta,
    ['key','value'],
    [
      ['txnNumber', newTxnNumber],
      ['sessionTotal', m.sessionTotal || 0],
      ['sessionCount', m.sessionCount || 0],
      ['rawMaterialReorderLevels', JSON.stringify(m.rawMaterialReorderLevels || {})],
      ['rawMaterialItemReorderLevels', JSON.stringify(m.rawMaterialItemReorderLevels || {})],
      ['rawMaterialUnits', JSON.stringify(m.rawMaterialUnits || {})],
      ['rawLedgerDescriptions', JSON.stringify(m.rawLedgerDescriptions || [])],
      ['rawMaterialResetAt', JSON.stringify(m.rawMaterialResetAt || {})],
      ['lastBackupEmailAt', m.lastBackupEmailAt || ''],
      ['scrapDescriptions', JSON.stringify(m.scrapDescriptions || [])],
      ['scrapItemNames', JSON.stringify(m.scrapItemNames || [])],
      ['scrapTypes', JSON.stringify(m.scrapTypes || [])],
      ['withdrawalDescriptions', JSON.stringify(m.withdrawalDescriptions || [])],
      ['withdrawalByList', JSON.stringify(m.withdrawalByList || [])],
      ['withdrawalInList', JSON.stringify(m.withdrawalInList || [])],
      ['orderTombstoneResetToken', resetToken]
    ]
  );
  out.push('Meta txnNumber reset to ' + newTxnNumber + ' (next new order will be #' + String(newTxnNumber).padStart(4,'0') + '). Client self-heal token bumped to ' + resetToken + ' — every device will clear its own local order-deletion memory the next time it syncs.');
  out.push('NEXT STEP: make sure both devices show "Synced" with no pending changes, then just let them sync normally (open the app / wait ~20s) — do not edit anything on either device until both show only the renumbered order(s).');

  const msg = out.join('\n');
  Logger.log(msg);
  return msg;
}

// recoverOrdersFromCustomerLedger(): the Drive backups (see
// recoverTransactionsFromBackup above) turned out not to hold the missing
// orders — but the CustomerLedger tab does. Every order automatically
// creates a debit row there (reconcileFactoryLedgerOrders_ in index.html)
// carrying a txnId column pointing back at the order's real id — and
// Code.gs deliberately keeps that row even if the matching Transactions
// row later goes missing (see the 2026-08-24 fix comment on
// readCustomerLedger_ above), specifically so this kind of recovery stays
// possible. This scans EVERY CustomerLedger row with a txnId across every
// factory, and for any txnId that isn't currently on the live Transactions
// sheet, reconstructs a best-effort order row from what the ledger still
// has: factory, date, time, item description, and total (debit). It CANNOT
// recover the exact original item count/cost/rate/product-id breakdown or
// any receipt photo — those never lived in the ledger row to begin with —
// so itemCount defaults to 1 and those extra columns are left blank.
// Confirm the recovered orders' amounts/dates against your own memory or
// paper records afterward. Purely additive against Transactions, same as
// recoverTransactionsFromBackup — never touches an id already there.
function recoverOrdersFromCustomerLedger(){
  const ledgerValues = getSheet_(SHEETS.customerLedger).getDataRange().getValues();
  if(ledgerValues.length < 2){
    const msg = 'CustomerLedger tab has no rows — nothing to recover from.';
    Logger.log(msg);
    return msg;
  }
  const ledgerHeader = ledgerValues[0].map(h => (typeof h === 'string' && h.length) ? (h.charAt(0).toLowerCase() + h.slice(1)) : h);
  const ledgerRows = ledgerValues.slice(1).map(function(row){
    const obj = {};
    ledgerHeader.forEach(function(h, idx){ obj[h] = row[idx]; });
    return obj;
  });

  const liveSheet = getSheet_(SHEETS.transactions);
  const liveValues = liveSheet.getDataRange().getValues();
  const liveIds = {};
  liveValues.slice(1).forEach(function(row){ if(row[0]) liveIds[String(row[0])] = true; });

  const TXN_HEADER = ['id','factory','date','time','itemsSummary','itemCount','itemCounts','size','colour','total','paid','confirmed','device','receipt','photo','itemCosts','itemRates','itemProductIds'];
  const ORDER_PREFIX_RE = /^Order #\S+\s*—\s*/; // strip the "Order #0005 — " prefix some rows carry, see buildOrderLedgerDesc_/buildCustomerLedgerReportEntries_ in index.html

  // FIX (2026-08-26, after first live run): more than one CustomerLedger
  // row can share the same txnId (e.g. a scrambled/partially-corrupted
  // duplicate left over from an earlier sync issue), and the original
  // version of this function took whichever one it saw FIRST — which
  // could be the corrupted one instead of the real one, producing a junk
  // Transactions row (blank factory, Rs 0). Now it groups by txnId first
  // and keeps whichever candidate row actually has usable data.
  const completeness = function(r){
    return (r.customer ? 1 : 0) + (r.date ? 1 : 0) + (r.desc ? 1 : 0) + ((Number(r.debit) || 0) > 0 ? 1 : 0);
  };
  const byTxnId = {};
  let skippedNoTxnId = 0;
  ledgerRows.forEach(function(r){
    const txnId = r.txnId ? String(r.txnId) : '';
    if(!txnId){ skippedNoTxnId++; return; }
    if(!byTxnId[txnId] || completeness(r) > completeness(byTxnId[txnId])) byTxnId[txnId] = r;
  });

  let appended = [], recoveredList = [], skippedCorrupted = [];
  Object.keys(byTxnId).forEach(function(txnId){
    if(liveIds[txnId]) return; // this order's Transactions row is already there — nothing to recover
    const r = byTxnId[txnId];
    if(completeness(r) === 0){
      // Every ledger row seen for this txnId is itself blank/zero — there's
      // nothing real to reconstruct from, and writing a Rs 0/blank-factory
      // row would just create a new piece of junk data. Skip and report it
      // instead so it can be looked at (or deleted) directly.
      skippedCorrupted.push(txnId);
      return;
    }
    liveIds[txnId] = true;
    const debit = Number(r.debit) || 0;
    const credit = Number(r.credit) || 0;
    const itemsSummary = String(r.desc || '').replace(ORDER_PREFIX_RE, '').trim();
    const obj = {
      id: txnId,
      factory: r.customer || '',
      date: cellDateStr_(r.date),
      time: r.time || '',
      itemsSummary: itemsSummary,
      itemCount: 1, // best-effort default — the ledger row never carried the exact original count
      itemCounts: '1',
      size: '',
      colour: '',
      total: debit,
      paid: (debit > 0 && credit >= debit) ? 'Yes' : 'No',
      confirmed: 'Yes', // reached the ledger, so it was a real completed sale, not a pending draft
      device: r.device || '',
      receipt: '',
      photo: '',
      itemCosts: '',
      itemRates: '',
      itemProductIds: ''
    };
    appended.push(TXN_HEADER.map(function(h){ return obj[h]; }));
    recoveredList.push(obj.factory + ' #' + txnId + ' (Rs ' + debit + ', ' + obj.date + ')');
  });

  const corruptedNote = skippedCorrupted.length ? (' ' + skippedCorrupted.length + ' order-linked id(s) had only blank/zero data on every CustomerLedger row and were skipped, not recovered: ' + skippedCorrupted.join(', ') + ' — these are themselves corrupted rows, worth deleting directly if they\'re just inflating a balance.') : '';

  if(!appended.length){
    const msg = 'Checked ' + ledgerRows.length + ' CustomerLedger row(s) (' + skippedNoTxnId + ' had no txnId, not order-linked) — every order-linked row already has a matching Transactions row.' + corruptedNote + (corruptedNote ? '' : ' Nothing to recover.');
    Logger.log(msg);
    return msg;
  }

  // Same grid-size safety as recoverTransactionsFromBackup above — see its
  // own comment for why this can't just assume the sheet is already wide/
  // tall enough.
  if(liveSheet.getMaxColumns() < TXN_HEADER.length){
    liveSheet.insertColumnsAfter(liveSheet.getMaxColumns(), TXN_HEADER.length - liveSheet.getMaxColumns());
  }
  const startRow = liveSheet.getLastRow() + 1;
  const neededMaxRow = startRow + appended.length - 1;
  if(liveSheet.getMaxRows() < neededMaxRow){
    liveSheet.insertRowsAfter(liveSheet.getMaxRows(), neededMaxRow - liveSheet.getMaxRows());
  }
  [1,3,4,7,16,17,18].forEach(function(colIdx){
    liveSheet.getRange(startRow, colIdx, appended.length, 1).setNumberFormat('@');
  });
  // Same diagnostic wrap as recoverTransactionsFromBackup's identical
  // write — see its comment for why.
  try{
    liveSheet.getRange(startRow, 1, appended.length, TXN_HEADER.length).setValues(appended);
  } catch(writeErr){
    const rowLengths = appended.map(function(r){ return r.length; });
    const diag = 'Write failed. liveSheet.getMaxRows()=' + liveSheet.getMaxRows() +
      ', getMaxColumns()=' + liveSheet.getMaxColumns() +
      ', getLastRow()=' + liveSheet.getLastRow() +
      ', getLastColumn()=' + liveSheet.getLastColumn() +
      ', startRow=' + startRow + ', appended.length=' + appended.length +
      ', TXN_HEADER.length=' + TXN_HEADER.length +
      ', row lengths=' + JSON.stringify(rowLengths) +
      ', first appended row=' + JSON.stringify(appended[0]) +
      ', original error=' + writeErr;
    Logger.log(diag);
    throw new Error(diag);
  }
  [5,7,8,9,16,17,18].forEach(function(colIdx){
    liveSheet.getRange(startRow, colIdx, appended.length, 1).setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
  });
  // See clearMatchingTombstones_'s own comment (above recoverTransactionsFromBackup)
  // — without this, a device with an old tombstone for one of these ids can
  // silently wipe it right back out on its next ordinary save, which is
  // exactly what happened to this session's first recovery run.
  const clearedTombstones = clearMatchingTombstones_('transactionsLog', appended.map(function(r){ return r[0]; }));

  const msg = 'Recovered ' + appended.length + ' order(s) from CustomerLedger: ' + recoveredList.join('; ') + '. Reconstructed from the ledger\'s own record (factory, date, item, amount) — item COUNT defaulted to 1 and cost/rate/product-id/receipt could not be recovered, so double-check those specific fields.' + corruptedNote + (clearedTombstones ? (' Cleared ' + clearedTombstones + ' stale deletion-tombstone(s) for these ids so a device can\'t silently wipe them back out.') : '') + ' Reload the app on any device to see them in Order Booked and Stock.';
  Logger.log(msg);
  return msg;
}

// diagnoseOrderTombstones(): read-only. Built (2026-08-26) after order
// #0010 was booked and the counter skipped straight past #0008 and #0009 —
// nextFreeTxnId_ (index.html) now deliberately refuses to reuse any id
// with a deletion-tombstone, which is the right call, but it means those
// two numbers being skipped is proof SOMETHING with those ids was deleted
// at some point — not proof of what, or when, or whether it was ever a
// real order in the first place. Rather than guess, this reads the actual
// Deletions tab for every tombstoned id in the 'transactionsLog' bucket,
// confirms each is genuinely absent from the live Transactions sheet (not
// just hidden by a display filter), and — for each one that's really
// gone — scans every "Amir Traders Backups" Drive snapshot for a row with
// that exact id, oldest to newest, reporting whatever real order details
// (date/factory/items/total) turn up. Changes nothing; run
// recoverTransactionsFromBackup() afterward if this finds something worth
// getting back.
function diagnoseOrderTombstones(){
  const out = [];
  const tombstonedIds = readDeletions_().transactionsLog || [];
  if(!tombstonedIds.length){
    const msg = 'No tombstoned ids in the transactionsLog bucket at all — the #0008/#0009 skip isn\'t explained by a deletion tombstone. Something else picked those ids (see nextFreeTxnId_\'s other check: an id already live in transactionsLog on another device not yet synced here).';
    Logger.log(msg);
    return msg;
  }
  out.push('Tombstoned transactionsLog ids (' + tombstonedIds.length + '): ' + tombstonedIds.join(', '));

  const liveSheet = getSheet_(SHEETS.transactions);
  const liveValues = liveSheet.getDataRange().getValues();
  const liveHeader = liveValues.length ? liveValues[0] : [];
  const liveById = {};
  liveValues.slice(1).forEach(function(row){ if(row[0]) liveById[String(row[0])] = row; });

  const genuinelyGone = [];
  tombstonedIds.forEach(function(id){
    if(liveById[id]){
      out.push('#' + id + ': STILL ON THE LIVE SHEET despite its tombstone — ' + JSON.stringify(liveById[id]) + ' (this on its own is fine; the tombstone just means a delete for it is on record somewhere).');
    } else {
      genuinelyGone.push(id);
    }
  });
  out.push('Genuinely absent from the live sheet (' + genuinelyGone.length + '): ' + (genuinelyGone.length ? genuinelyGone.join(', ') : 'none'));

  if(genuinelyGone.length){
    out.push('--- Searching "' + BACKUP_FOLDER_NAME + '" for these ids ---');
    let files = [];
    try{
      const folder = getBackupFolder_();
      const it = folder.getFiles();
      while(it.hasNext()) files.push(it.next());
      files.sort(function(a,b){ return a.getDateCreated() - b.getDateCreated(); }); // oldest first
    } catch(e){
      out.push('Could not scan backups — ' + e);
      files = [];
    }
    const found = {}; // id -> [ {backup, row} ]
    files.forEach(function(f){
      let ss;
      try{ ss = SpreadsheetApp.openById(f.getId()); }
      catch(e){ return; }
      const sh = ss.getSheetByName('Transactions');
      if(!sh) return;
      const values = sh.getDataRange().getValues();
      if(values.length < 2) return;
      const backupHeader = values[0].map(function(h){ return (typeof h === 'string' && h.length) ? (h.charAt(0).toLowerCase() + h.slice(1)) : h; });
      values.slice(1).forEach(function(row){
        const idIdx = backupHeader.indexOf('id');
        const rowId = idIdx !== -1 ? String(row[idIdx]) : '';
        if(rowId && genuinelyGone.indexOf(rowId) !== -1){
          if(!found[rowId]) found[rowId] = [];
          const obj = {};
          backupHeader.forEach(function(h, idx){ obj[h] = row[idx]; });
          found[rowId].push({ backup: f.getName(), created: f.getDateCreated(), date: obj.date, factory: obj.factory, itemsSummary: obj.itemsSummary, total: obj.total, confirmed: obj.confirmed });
        }
      });
    });
    genuinelyGone.forEach(function(id){
      if(found[id] && found[id].length){
        out.push('#' + id + ': found in ' + found[id].length + ' backup(s) — earliest: ' + JSON.stringify(found[id][0]));
      } else {
        out.push('#' + id + ': not found in any of the ' + files.length + ' backup(s) checked — likely un-recoverable unless it turns up some other way.');
      }
    });
  }

  const meta = readMeta_();
  out.push('Current live Meta txnNumber: ' + (meta && meta.txnNumber));

  const msg = out.join('\n');
  Logger.log(msg);
  return msg;
}

// diagnoseOtherLedgers(): read-only. Both devices independently now show
// Rs 0 on Raw Material Ledger, Labour Ledger, and Withdrawal Ledger — this
// checks the LIVE SHEET's actual row counts for every one of those tabs
// (plus Painters/Suppliers/ScrapBuyers/ScrapLedger/PaintLedger, in case
// they're affected too) so we know whether this is a real, sheet-side data
// loss or just something not yet synced back down to these two devices.
// Also checks every "Amir Traders Backups" Drive snapshot for the same
// tabs — those backups are dated 22-Aug-2026, BEFORE the 2026-08-25
// incident that has caused every other loss this week, so if this is the
// same underlying event, the backups may still hold real recoverable data
// here even though they didn't for Transactions.
function diagnoseOtherLedgers(){
  const out = [];
  const tabsToCheck = [
    ['RawLedger', SHEETS.rawLedger], ['Suppliers', SHEETS.suppliers],
    ['Labour', SHEETS.labour], ['Withdrawal', SHEETS.withdrawal],
    ['PaintLedger', SHEETS.paintLedger], ['Painters', SHEETS.painters],
    ['ScrapLedger', SHEETS.scrapLedger], ['ScrapBuyers', SHEETS.scrapBuyers]
  ];
  out.push('--- LIVE SHEET ---');
  tabsToCheck.forEach(function(pair){
    const name = pair[0], sheetName = pair[1];
    try{
      const sh = getSheet_(sheetName);
      const values = sh.getDataRange().getValues();
      out.push(name + ': ' + values.length + ' row(s) total (incl. header)' + (values.length ? ', header=' + JSON.stringify(values[0]) : ''));
      if(values.length > 1) out.push('  sample row: ' + JSON.stringify(values[1]));
    } catch(e){ out.push(name + ': error reading — ' + e); }
  });

  out.push('--- DRIVE BACKUPS ("' + BACKUP_FOLDER_NAME + '") ---');
  try{
    const folder = getBackupFolder_();
    const files = [];
    const it = folder.getFiles();
    while(it.hasNext()) files.push(it.next());
    files.sort(function(a,b){ return a.getDateCreated() - b.getDateCreated(); });
    if(!files.length){
      out.push('No backups found.');
    } else {
      files.forEach(function(f){
        let ss;
        try{ ss = SpreadsheetApp.openById(f.getId()); }
        catch(e){ out.push(f.getName() + ': could not open — ' + e); return; }
        const rowCounts = tabsToCheck.map(function(pair){
          const sh = ss.getSheetByName(pair[1]);
          if(!sh) return pair[0] + '=missing';
          const v = sh.getDataRange().getValues();
          return pair[0] + '=' + Math.max(0, v.length - 1);
        }).join(', ');
        out.push(f.getName() + ' (' + f.getDateCreated() + '): ' + rowCounts);
      });
    }
  } catch(e){ out.push('Could not scan backups — ' + e); }

  const msg = out.join('\n');
  Logger.log(msg);
  return msg;
}

// diagnoseGhostOrders(): read-only. deleteGhostLedgerRows found ZERO
// CustomerLedger rows with customer == "green fan" and ZERO junk
// Transactions rows — meaning either the row text doesn't literally match
// "green fan" (different spelling/spacing/hidden characters) or that data
// genuinely never reached the live sheet at all (still local-only on a
// device, or already gone from everywhere). This dumps every row on
// CustomerLedger/Transactions that mentions "green fan", "760", "0005",
// or a bare "5" ANYWHERE in the row (not just the expected column), plus
// row counts for every relevant tab, so we can see the real raw data
// instead of guessing at it again.
function diagnoseGhostOrders(){
  const out = [];

  const ledgerSheet = getSheet_(SHEETS.customerLedger);
  const ledgerValues = ledgerSheet.getDataRange().getValues();
  out.push('CustomerLedger: ' + ledgerValues.length + ' row(s) total (incl. header). Header: ' + JSON.stringify(ledgerValues[0] || []));
  const ledgerHits = [];
  ledgerValues.slice(1).forEach(function(row, i){
    const rowStr = JSON.stringify(row).toLowerCase();
    if(rowStr.indexOf('green fan') !== -1 || rowStr.indexOf('760') !== -1 || rowStr.indexOf('0005') !== -1 || row.some(function(c){ return String(c).trim() === '5'; })){
      ledgerHits.push('row ' + (i + 2) + ': ' + JSON.stringify(row));
    }
  });
  out.push('CustomerLedger matches (green fan / 760 / 0005 / bare 5): ' + (ledgerHits.length ? ('\n  ' + ledgerHits.join('\n  ')) : 'NONE'));

  const txnSheet = getSheet_(SHEETS.transactions);
  const txnValues = txnSheet.getDataRange().getValues();
  out.push('Transactions: ' + txnValues.length + ' row(s) total (incl. header). Header: ' + JSON.stringify(txnValues[0] || []));
  const txnHits = [];
  txnValues.slice(1).forEach(function(row, i){
    const rowStr = JSON.stringify(row).toLowerCase();
    if(rowStr.indexOf('green fan') !== -1 || rowStr.indexOf('760') !== -1 || rowStr.indexOf('0005') !== -1){
      txnHits.push('row ' + (i + 2) + ': ' + JSON.stringify(row));
    }
  });
  out.push('Transactions matches (green fan / 760 / 0005): ' + (txnHits.length ? ('\n  ' + txnHits.join('\n  ')) : 'NONE'));

  const factSheet = getSheet_(SHEETS.factories);
  const factValues = factSheet.getDataRange().getValues();
  out.push('Factories: ' + factValues.length + ' row(s) total (incl. header). Header: ' + JSON.stringify(factValues[0] || []));
  const factHits = [];
  factValues.slice(1).forEach(function(row, i){
    if(JSON.stringify(row).toLowerCase().indexOf('green fan') !== -1) factHits.push('row ' + (i + 2) + ': ' + JSON.stringify(row));
  });
  out.push('Factories matches (green fan): ' + (factHits.length ? ('\n  ' + factHits.join('\n  ')) : 'NONE'));

  const msg = out.join('\n');
  Logger.log(msg);
  return msg;
}

// deleteGhostLedgerRows(): the CustomerLedger recovery above found that
// "Green Fan"'s two Rs 760 "Auto (Order)" ledger rows aren't cleanly
// recoverable — one had a txnId but every other field blank/zero, which is
// why the first live run created a junk Transactions row (id "5", blank
// factory, Rs 0) instead of a real order. Rather than keep guessing at
// corrupted data, this deletes every CustomerLedger row for the named
// factory below AND the junk Transactions row that earlier run created —
// so the factory's balance goes back to Rs 0 / no history instead of
// showing a debt against an order that can't actually be reconstructed.
// Change TARGET_FACTORY_NAME and re-run for any other factory with the
// same problem.
function deleteGhostLedgerRows(){
  // FIX (after diagnoseGhostOrders): the original name-based match found
  // NOTHING, because diagnoseGhostOrders proved both of Green Fan's
  // CustomerLedger rows are corrupted stubs with a BLANK customer field —
  // a stray "5" sits in the TxnId column on one row and in a phantom
  // 19th column (past the declared 18-column header) on the other, but
  // customer/date/desc/debit are all empty on both. Matching by name can
  // never find these. Matching by "every real field is blank" does —
  // and is safe generally, since a real ledger row is never blank in
  // customer+date+desc+debit all at once.
  const ledgerSheet = getSheet_(SHEETS.customerLedger);
  const ledgerValues = ledgerSheet.getDataRange().getValues();
  const removedLedgerRows = [];
  for(let i = ledgerValues.length - 1; i >= 1; i--){
    const row = ledgerValues[i];
    const customer = String(row[0] || '').trim();
    const date = String(row[2] || '').trim();
    const desc = String(row[4] || '').trim();
    const debit = Number(row[5]) || 0;
    if(!customer && !date && !desc && debit === 0){
      removedLedgerRows.push('row ' + (i + 1) + ': ' + JSON.stringify(row));
      ledgerSheet.deleteRow(i + 1);
    }
  }

  // Also remove the specific junk Transactions row recoverOrdersFromCustomerLedger
  // created on its first run: blank factory + Rs 0 total is not a real order.
  const txnSheet = getSheet_(SHEETS.transactions);
  const txnValues = txnSheet.getDataRange().getValues();
  const removedTxnRows = [];
  for(let i = txnValues.length - 1; i >= 1; i--){
    const factory = String(txnValues[i][1] || '').trim();
    const total = Number(txnValues[i][9]) || 0;
    if(!factory && total === 0){
      removedTxnRows.push('row ' + (i + 1) + ': ' + JSON.stringify(txnValues[i]));
      txnSheet.deleteRow(i + 1);
    }
  }

  const msg = 'Removed ' + removedLedgerRows.length + ' blank/corrupted CustomerLedger row(s): ' + (removedLedgerRows.length ? removedLedgerRows.join(' | ') : 'none found') + '. Removed ' + removedTxnRows.length + ' blank-factory/zero-total Transactions row(s) (junk from an earlier recovery attempt): ' + (removedTxnRows.length ? removedTxnRows.join(' | ') : 'none found') + '. Reload the app on any device — the Green Fan balance should now show nothing owed and no ledger history.';
  Logger.log(msg);
  return msg;
}

// dedupeFactoriesTab(): collapses duplicate rows in the Factories tab
// (same name, case/whitespace-insensitive) down to one row each. Where
// duplicates disagree on location/contact, keeps whichever row has more
// of those fields actually filled in (ties broken by keeping the LAST
// occurrence, on the assumption a later row is more likely the most
// recently corrected one) — never invents or merges field values, and
// never touches a name that only appears once.
function dedupeFactoriesTab(){
  const sh = getSheet_(SHEETS.factories);
  const values = sh.getDataRange().getValues();
  if(values.length < 2){
    const msg = 'Factories tab has no rows — nothing to dedupe.';
    Logger.log(msg);
    return msg;
  }
  const header = values[0];
  const rows = values.slice(1);
  const completeness = function(row){ return (row[1] ? 1 : 0) + (row[2] ? 1 : 0); }; // location, contact filled in?

  const bestByKey = {}; // key -> {row, rowIndex (0-based within rows)}
  const order = []; // first-seen order of each unique key, so output order stays stable
  rows.forEach(function(row, idx){
    const name = String(row[0] || '').trim();
    if(!name) return; // skip blank rows entirely rather than guessing
    const key = name.toLowerCase();
    if(!(key in bestByKey)){ order.push(key); bestByKey[key] = { row: row, name: name, idx: idx }; }
    else {
      const cur = bestByKey[key];
      // Prefer the more complete row; on an exact tie, prefer the LATER
      // one (idx > cur.idx), matching the "most recent wins" convention
      // already used elsewhere in this file for de-duplication.
      if(completeness(row) >= completeness(cur.row)) bestByKey[key] = { row: row, name: name, idx: idx };
    }
  });

  const duplicateNames = Object.keys(bestByKey).filter(function(key){
    return rows.filter(function(r){ return String(r[0] || '').trim().toLowerCase() === key; }).length > 1;
  });

  if(!duplicateNames.length){
    const msg = 'Checked ' + rows.length + ' Factories row(s) — no duplicate names found. Nothing to change.';
    Logger.log(msg);
    return msg;
  }

  const dedupedRows = order.map(function(key){ return bestByKey[key].row; });
  const removedCount = rows.length - dedupedRows.length;

  sh.clearContents();
  sh.getRange(1, 1, 1, header.length).setValues([header]);
  if(dedupedRows.length){
    sh.getRange(2, 1, dedupedRows.length, header.length).setValues(dedupedRows);
  }

  const msg = 'Deduped Factories: ' + duplicateNames.length + ' name(s) had duplicates (' + duplicateNames.map(function(k){ return bestByKey[k].name; }).join(', ') + '), removed ' + removedCount + ' extra row(s), kept ' + dedupedRows.length + ' of ' + rows.length + ' total rows. Reload the app on any device to see the change.';
  Logger.log(msg);
  return msg;
}
