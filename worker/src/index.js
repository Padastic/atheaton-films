/**
 * Atheaton Films — the assistant behind the chat widget.
 *
 * A Cloudflare Worker. It does three things and nothing else:
 *
 *   1. keeps the DeepSeek key on the server, so it never reaches the page
 *   2. collects the details of a couple, one question at a time
 *   3. computes the indicative cost itself, from the 2027 brochure
 *
 * On money: the model is never allowed to state a figure. It returns the
 * package and the extras the couple chose; the price is summed here, in code,
 * from the catalogue below. If the model ever writes a price, it is discarded.
 */

/* ------------------------------------------------------------------ catalogue
   Straight from the 2027 brochure. Nothing here may be guessed or rounded. */
const CATALOGUE = {
  packages: {
    "Indie Solo": { price: 1500, note: "one day, up to 8 hours, one videographer with drone, 10 minute film or 2 minute highlight plus full footage" },
    "Indie Duo": { price: 2000, note: "one day, up to 8 hours, two videographers with drone, 10 minute film or 2 minute highlight plus full footage" },
    "Signature Cinema": { price: 2600, note: "one day, up to 8 hours, two videographers with drone, wedding film 8 to 12 minutes, 1 to 2 minute highlight, full footage" },
    "Timeless Collection": { price: 3200, note: "one day with no time limit, two videographers with drone, wedding film 8 to 12 minutes, 1 to 2 minute highlight, full footage, three social media reels" }
  },
  extras: {
    "Extra filming hour": 150,
    "Couple's shoot": 400,
    "Pre-wedding event": 400,
    "2-3 minute highlight": 200,
    "10 minute wedding film": 500,
    "3 social media reels": 450,
    "Full video footage": 500,
    "Express 48 hour short": 250,
    "Express delivery 45 days": 800,
    "Incognito privacy": 1000
  }
};

const VAT_NOTE = "VAT is added where it applies, and a member of our team confirms it with the quote.";

/* --------------------------------------------------------------- the prompt */
function systemPrompt() {
  return `You are the assistant on the website of Atheaton Films, a wedding film studio in Chania, Crete, filming since 2007 across Crete and the Greek islands.

Your voice is warm, calm and human. Two or three short sentences at most. No emojis, no exclamation marks, no flattery, no marketing language. React to what they just said in one short phrase, then move on. Never write a person's name: whoever answers them is "a member of our team", or "we".

You collect a few details so a member of our team can write back with a full quote. You never ask a question yourself — the system adds the next question to your reply. You write only a short, warm acknowledgment of what they just said, one or two sentences at most, and extract it into "state". Accept whatever they give, even if partial: first names are enough, a month or a rough window is enough for the date.

If they ask a question, answer it briefly. Anything about prices, a particular date being free, or payment is answered personally by a member of our team. You never quote a price and never say whether a date is free.

English only, in every single message, whatever language they write in.

Reply with JSON only, no other text, in this shape:
{"reply": "what you say to the couple", "state": {"names": "", "date": "", "date_iso": "", "window_from": "", "window_to": "", "venue": "", "guests": "", "wishes": [], "budget": "", "email": ""}}

Copy every field you already know into "state" unchanged, and fill in only what the couple just told you. "date" is the date exactly as they wrote it. "date_iso" is a single settled day as YYYY-MM-DD, empty when the day is not settled. When they give a range or a month, put the first and last day into "window_from" and "window_to" as YYYY-MM-DD and leave "date_iso" empty. When they name no year, it is the next one, and say the year back once, lightly. "wishes" is a short list of what they want in the film. "budget" is what they said about money, in their own words. Anything that is not one of the fields belongs in "reply" alone.`;
}
/* ------------------------------------------------------------------ helpers */
const ALLOWED_ORIGINS = [
  "https://padastic.github.io",
  "http://localhost:8899",
  "http://127.0.0.1:8899"
];
function cors(request) {
  const origin = request.headers.get("Origin") || "";
  const ok = ALLOWED_ORIGINS.includes(origin) || origin.endsWith("atheatonfilms.com");
  return {
    "Access-Control-Allow-Origin": ok ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  };
}
function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, headers || {})
  });
}
function str(v, max) { return typeof v === "string" ? v.trim().slice(0, max || 200) : ""; }
function looksLikeEmail(v) { return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v || ""); }
function futureDate(v) {
  const t = Date.parse(v);
  return !isNaN(t) && t > Date.now() - 86400000;
}

/* the model may describe a figure; it never reaches the couple */
function cleanText(text) {
  return str(text, 900)
    .replace(/[€$]\s?[\d.,]+/g, "")
    .replace(/\b\d{3,4}\s?(euro|EUR)\b/gi, "the figure")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s.,;:]+/, "")
    .trim();
}
function normalizeExtras(raw) {
  const out = {};
  if (Array.isArray(raw)) {
    raw.forEach(function (x) { if (CATALOGUE.extras[x]) out[x] = (out[x] || 0) + 1; });
  } else if (raw && typeof raw === "object") {
    Object.keys(raw).forEach(function (k) {
      if (!CATALOGUE.extras[k]) return;
      const n = Math.max(1, Math.min(24, parseInt(raw[k], 10) || 1));
      out[k] = n;
    });
  }
  return out;
}

/* the price, summed here, never by the model */
function estimate(state) {
  const pkg = CATALOGUE.packages[state.package];
  if (!pkg) return null;
  const lines = [{ label: state.package, qty: 1, amount: pkg.price }];
  const ex = normalizeExtras(state.extras);
  Object.keys(ex).forEach(function (x) {
    lines.push({ label: x, qty: ex[x], amount: CATALOGUE.extras[x] * ex[x] });
  });
  const total = lines.reduce(function (s, l) { return s + l.amount; }, 0);
  const rows = lines.map(function (l) {
    return l.qty > 1 ? l.label + " x" + l.qty + " " + l.amount : l.label + " " + l.amount;
  }).join(", ");
  return {
    lines: lines,
    total: total,
    text: rows + ". Indicative total " + total + " euro, plus VAT."
  };
}

/* what the figure was based on, so it is shown again only when it changes */
function priceSignature(state) {
  return JSON.stringify({ p: state.package || "", e: normalizeExtras(state.extras) });
}

function hasDate(state) {
  return !!(str(state.date_iso, 20) || str(state.date, 60) || (str(state.window_from, 10) && str(state.window_to, 10)));
}

function twoNames(s) {
  return /( and | & |,|\+|\sy\s)/i.test(" " + str(s, 120) + " ");
}

function missing(state) {
  const out = [];
  if (!str(state.names)) out.push("names");
  else if (!twoNames(state.names)) out.push("partner");
  if (!hasDate(state)) out.push("date");
  if (!str(state.venue)) out.push("venue");
  if (!str(state.guests)) out.push("guests");
  if (!(state.wishes && state.wishes.length)) out.push("wishes");
  if (!str(state.email) || !looksLikeEmail(state.email)) out.push("email");
  return [...new Set(out)];
}

/* One system, two languages. The model speaks for itself in whatever language the
   couple writes in; these are the fixed phrases it cannot invent by itself, kept
   side by side so nothing has to be programmed twice. A third language would be
   one more column here, and the model already handles the conversation in it. */
const T = {
  en: {
    rate: "You have reached the number of messages this chat allows for now. Please try again a little later.",
    error: "Something went wrong on our side. Please try again in a moment.",
    ready: "Thank you, that is everything we need. A member of our team will write back soon with the full quote and to confirm your date.",
    next: {
      names: "May I have your names?",
      partner: "And your partner's name?",
      date: "And what date are you thinking of for the wedding?",
      venue: "And where will it be? The venue and the town are enough.",
      guests: "And roughly how many guests are you expecting?",
      wishes: "And how do you picture your film? A short trailer, a longer cinematic film, or the full day with drone shots?",
      email: "What is your email address, so the full quote can reach you?"
    },
    faq: [
      { re: /how many (videographer|filmmaker|people|of you)|two cameras|crew/i,
        a: "One videographer comes in Indie Solo, and two in the other three packages. A drone is included in every package." },
      { re: /music|song|soundtrack/i,
        a: "Tell us what you love and what the day means to you, and the film is cut around it." },
      { re: /how long (does it take|until|before)|deliver|delivery|when will we (get|receive)/i,
        a: "A short film can be delivered within 48 hours, and everything within 45 days, if you want it early. Otherwise a member of our team confirms the timing with the quote." },
      { re: /hours|how long do you (film|stay|shoot)|time limit/i,
        a: "Coverage runs up to eight hours in Indie Solo, Indie Duo and Signature Cinema, and the Timeless Collection has no time limit at all." },
      { re: /are you free|available|availability|still free|book/i,
        a: "Whether that particular date is still free is something a member of our team confirms for you." },
      { re: /drone|aerial/i,
        a: "We fly it wherever the law, the church and the weather allow, and we plan around the rules of the venue." },
      { re: /baptism|christening|other celebration|other event/i,
        a: "That is something a member of our team can answer for you personally." },
      { re: /wedding film|how long is|duration|highlights?\b|reels|social media/i,
        a: "You receive a wedding film, a short highlight to share, and the full footage with the ceremony and the speeches. The Timeless Collection adds three short films for social media." },
      { re: /privacy|private|anonym|incognito/i,
        a: "The day can be kept entirely private, out of the showreel and out of anything public." },
      { re: /usb|download|how do we (get|receive)|what do we receive/i,
        a: "Everything arrives on a private link where you can watch and download it, and a USB if you prefer." },
      { re: /deposit|payment|pay\b|contract|cancel/i,
        a: "A member of our team explains the deposit, the contract and the cancellation terms." },
      { re: /travel|outside crete|another island|destination/i,
        a: "We are based in Chania and film across Crete and the Greek islands, and the arrangements are settled with the team." },
      { re: /price|cost|how much|budget|expensive|charge/i,
        a: "I will give you an indicative figure as soon as I know the date, the place and the coverage you have in mind." }
    ],
    estimate: {
      total: "Indicative total",
      vat: "+ VAT",
      note: "This is an indicative figure rather than a final quote. A member of our team will confirm availability for your date and send the detailed offer by email."
    }
  },

  el: {
    rate: "Έχετε φτάσει τον αριθμό μηνυμάτων που επιτρέπει αυτή η συνομιλία για τώρα. Δοκιμάστε ξανά λίγο αργότερα.",
    error: "Κάτι πήγε στραβά από τη δική μας πλευρά. Δοκιμάστε ξανά σε λίγο.",
    ready: "Ευχαριστούμε, αυτά χρειαζόμασταν. Ένα μέλος της ομάδας μας θα σας γράψει σύντομα με την αναλυτική προσφορά και θα επιβεβαιώσει την ημερομηνία σας.",
    next: {
      names: "Πώς σας λένε;",
      partner: "Και το όνομα του συντρόφου σας;",
      date: "Ποια είναι η ημερομηνία του γάμου σας;",
      venue: "Πού θα γίνει, ποιος χώρος και σε ποια πόλη;",
      guests: "Περίπου πόσους καλεσμένους περιμένετε;",
      wishes: "Και πώς φαντάζεστε το φιλμ; Ένα σύντομο τρέιλερ, μια μεγαλύτερη κινηματογραφική ταινία, ή όλη τη μέρα με drone;",
      email: "Ποιο email να στείλουμε την αναλυτική προσφορά;"
    },
    faq: [
      { re: /βιντεογράφ|πόσοι|άτομα|συνεργείο|κάμερες/i,
        a: "Στο Indie Solo έρχεται ένας βιντεογράφος, στα άλλα τρία πακέτα δύο. Το drone περιλαμβάνεται σε κάθε πακέτο." },
      { re: /μουσικ|τραγούδι/i,
        a: "Πείτε μας τι αγαπάτε και τι σημαίνει για σας αυτή η μέρα, και το φιλμ χτίζεται γύρω από αυτό." },
      { re: /παράδοσ|πόσο καιρό|πότε θα (το |τα )?(πάρω|πάρετε)|πότε θα (είναι|παραλάβ)/i,
        a: "Ένα σύντομο φιλμ μπορεί να παραδοθεί μέσα σε 48 ώρες, και τα πάντα μέσα σε 45 ημέρες, αν το θέλετε νωρίτερα. Αλλιώς ένα μέλος της ομάδας μας επιβεβαιώνει τον χρόνο μαζί με την προσφορά." },
      { re: /ώρες|χρονικό όριο|πόσο (θα )?(μείνετε|μένουμε|κρατήσει)/i,
        a: "Η κάλυψη φτάνει τις οκτώ ώρες στα Indie Solo, Indie Duo και Signature Cinema, και η Timeless Collection δεν έχει καθόλου χρονικό όριο." },
      { re: /ελεύθερ|διαθέσιμ|διαθεσιμότητα|να κλείσ/i,
        a: "Αν η συγκεκριμένη ημερομηνία είναι ακόμα ελεύθερη, το επιβεβαιώνει ένα μέλος της ομάδας μας για εσάς." },
      { re: /drone|εναέρι/i,
        a: "Το πετάμε όπου το επιτρέπουν ο νόμος, η εκκλησία και ο καιρός, και σχεδιάζουμε γύρω από τους κανόνες του χώρου." },
      { re: /βάφτισ|βάπτισ|άλλη (εκδήλωση|γιορτή)/i,
        a: "Αυτό μπορεί να σας το απαντήσει προσωπικά ένα μέλος της ομάδας μας." },
      { re: /πόσο διαρκεί|διάρκεια|reel|highlight|ταινία|βίντεο θα πάρ/i,
        a: "Παραλαμβάνετε την ταινία του γάμου, ένα σύντομο highlight για να το μοιραστείτε, και όλο το υλικό με το μυστήριο και τις ομιλίες. Η Timeless Collection προσθέτει τρία σύντομα βίντεο για τα social media." },
      { re: /ιδιωτικ|ανώνυμ|incognito|διακριτικ/i,
        a: "Η μέρα μπορεί να κρατηθεί απολύτως ιδιωτική, έξω από το showreel και από κάθε δημόσια προβολή." },
      { re: /usb|κατέβασ|πώς θα (το |τα )?(πάρω|πάρετε)|σε τι μορφή/i,
        a: "Όλα φτάνουν σε έναν ιδιωτικό σύνδεσμο όπου μπορείτε να τα δείτε και να τα κατεβάσετε, και σε USB αν προτιμάτε." },
      { re: /προκαταβολ|πληρωμ|πληρώσ|συμβόλαι|ακύρωσ/i,
        a: "Ένα μέλος της ομάδας μας εξηγεί την προκαταβολή, το συμβόλαιο και τους όρους ακύρωσης." },
      { re: /μετακίν|ταξίδι|έξω από (την Κρήτη|τα Χάνια)|άλλο νησί/i,
        a: "Η βάση μας είναι στα Χανιά και κινηματογραφούμε σε όλη την Κρήτη και τα νησιά, και οι λεπτομέρειες κλείνονται με την ομάδα." },
      { re: /πόσο κοστίζει|τιμ[ήέ]|κόστος|προϋπολογισμ|χρεών/i,
        a: "Θα σας δώσω ενδεικτικό ποσό μόλις μάθω την ημερομηνία, τον τόπο και την κάλυψη που έχετε στον νου σας." }
    ],
    estimate: {
      total: "Ενδεικτικό σύνολο",
      vat: "+ ΦΠΑ",
      note: "Ενδεικτικό ποσό, όχι τελική προσφορά. Ένα μέλος της ομάδας μας θα επιβεβαιώσει τη διαθεσιμότητα για την ημερομηνία σας και θα στείλει την αναλυτική προσφορά με email."
    }
  }
};

/* which language the couple is writing in, from the letters themselves */
function langOf(text) {
  const s = String(text || "");
  if (/[\u0370-\u03ff\u1f00-\u1fff]/.test(s)) return "el";
  if (/[A-Za-z]/.test(s)) return "en";
  return "";
}
function nextQuestion(gap, lang) {
  const t = T[lang] || T.en;
  return t.next[gap[0]] || t.ready;
}
/* the fixed question for the current state, in flow order, so the code always asks
   the right thing and the model never has to */
function askQuestion(state, lang) {
  const t = T[lang] || T.en;
  if (!str(state.names)) return t.next.names;
  if (!twoNames(state.names)) return t.next.partner;
  if (!hasDate(state)) return t.next.date;
  if (!str(state.venue)) return t.next.venue;
  if (!str(state.guests)) return t.next.guests;
  if (!(state.wishes && state.wishes.length)) return t.next.wishes;
  if (!str(state.email)) return t.next.email;
  return t.ready;
}
function faqAnswer(text, lang) {
  const t = T[lang] || T.en;
  for (const f of t.faq) { if (f.re.test(text || "")) return f.a; }
  return "";
}

/* ---------------------------------------------------------------------------
   Writing into the studio's calendar. The assistant never deletes and never
   changes what is already there; it only adds, and every entry it adds carries
   info@atheatonfilms.com as a guest, so Google sends the notice on its own.

   Colours, by how much attention the entry needs:
     11 tomato    HOLD, a date held for another couple, waiting on a decision
      6 tangerine INQUIRY, a new request waiting for an answer
      5 banana    FOLLOW-UP, the five day reminder
     10 basil     BOOKED, a settled job
--------------------------------------------------------------------------- */
function b64url(bytes) {
  let s = "";
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function gcalToken(env) {
  try {
    if (!env.GCAL_KEY) return "";
    const key = JSON.parse(env.GCAL_KEY);
    if (!key.client_email || !key.private_key) return "";
    const now = Math.floor(Date.now() / 1000);
    const head = b64url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
    const claim = b64url(new TextEncoder().encode(JSON.stringify({
      iss: key.client_email,
      scope: "https://www.googleapis.com/auth/calendar.events",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now
    })));
    const unsigned = head + "." + claim;
    const pem = key.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
    const der = Uint8Array.from(atob(pem), function (c) { return c.charCodeAt(0); });
    const ck = await crypto.subtle.importKey("pkcs8", der,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", ck, new TextEncoder().encode(unsigned));
    const jwt = unsigned + "." + b64url(new Uint8Array(sig));
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=" + jwt
    });
    if (!r.ok) return "";
    const d = await r.json();
    return d.access_token || "";
  } catch (e) { return ""; }
}

const COLOUR = { "HOLD": "11", "INQUIRY": "6", "FOLLOW-UP": "5", "BOOKED": "10" };

function plusDays(iso, n) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function writeEntry(env, kind, when, title, text) {
  try {
    if (!env.GCAL_KEY || !env.GCAL_CALENDAR_ID || !when) return false;
    const token = await gcalToken(env);
    if (!token) return false;
    const event = {
      summary: (kind + ": " + title).slice(0, 200),
      description: text,
      start: { date: when },
      end: { date: plusDays(when, 1) },
      colorId: COLOUR[kind] || "8",
      reminders: { useDefault: false, overrides: [{ method: "email", minutes: 0 }] }
    };
    const r = await fetch("https://www.googleapis.com/calendar/v3/calendars/" +
      encodeURIComponent(env.GCAL_CALENDAR_ID) + "/events?sendUpdates=all", {
      method: "POST",
      headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify(event)
    });
    if (!r.ok) return { ok: false, status: r.status, why: (await r.text()).slice(0, 200) };
    const made = await r.json();
    return { ok: true, colour: made.colorId, link: made.htmlLink };
  } catch (e) { return { ok: false, why: String(e).slice(0, 140) }; }
}

/* everything the studio needs about a couple, in one readable block */
function requestText(record, kind) {
  const ex = Object.keys(record.extras).length
    ? Object.keys(record.extras).map(function (k) { return k + " x" + record.extras[k]; }).join(", ")
    : "none";
  return [
    kind === "BOOKED" ? "A settled job." : "",
    "Names: " + (record.names || "not given"),
    "Date: " + (record.date || "not given"),
    "Venue: " + (record.venue || "not given"),
    "Guests: " + (record.guests || "not given"),
    "Package: " + (record.package || "not given"),
    "Wants in the film: " + (record.wishes && record.wishes.length ? record.wishes.join(", ") : "not said"),
    "Extras: " + ex,
    "Budget mentioned: " + (record.budget || "not said"),
    "How to reach them: " + (record.channel || "not said"),
    "Email: " + (record.email || "not given"),
    "Telephone: " + (record.phone || "not given"),
    "Address: " + (record.address || "not given"),
    "Identity or passport: " + (record.id_number || "not given"),
    record.booking_requested ? "THEY ASKED TO SECURE THE DATE" : "",
    record.estimate ? "Figure shown to them: " + record.estimate.text : "",
    "From the website chat, " + record.at
  ].filter(function (x) { return x !== ""; }).join("\n");
}

/* A whole window at once, so a couple who give a range hear what the days look
   like. One reading of the calendar, then the facts, grouped so they read well. */
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAY_WORDS = ["first","second","third","fourth","fifth","sixth","seventh","eighth","ninth","tenth","eleventh","twelfth","thirteenth","fourteenth","fifteenth","sixteenth","seventeenth","eighteenth","nineteenth","twentieth","twenty-first","twenty-second","twenty-third","twenty-fourth","twenty-fifth","twenty-sixth","twenty-seventh","twenty-eighth","twenty-ninth","thirtieth","thirty-first"];

function sayDay(iso) {
  const d = Number(iso.slice(8, 10)), m = Number(iso.slice(5, 7));
  return "the " + DAY_WORDS[d - 1] + " of " + MONTH_NAMES[m - 1];
}
function readSpan(a, b) {
  const da = Number(a.slice(8, 10)), db = Number(b.slice(8, 10));
  if (a.slice(0, 7) !== b.slice(0, 7) || da === db) return sayDay(a) + " and " + sayDay(b);
  return "the " + DAY_WORDS[da - 1] + " to the " + DAY_WORDS[db - 1] + " of " + MONTH_NAMES[Number(a.slice(5, 7)) - 1];
}
/* Turn a list of days into the shortest honest phrase: runs of days become spans. */
function readDays(list) {
  if (!list.length) return "";
  const months = {}; list.forEach(function (d) { months[d.slice(0, 7)] = true; });
  const oneMonth = Object.keys(months).length === 1;
  const dayOnly = function (iso) { return "the " + DAY_WORDS[Number(iso.slice(8, 10)) - 1]; };
  const word = oneMonth ? dayOnly : sayDay;
  const out = [];
  let start = 0;
  for (let i = 1; i <= list.length; i++) {
    const chained = i < list.length && (Date.parse(list[i]) - Date.parse(list[i - 1])) === 86400000;
    if (chained) continue;
    const runLen = i - start;
    if (runLen === 1) out.push(word(list[start]));
    else if (runLen === 2) out.push(word(list[start]) + " and " + word(list[start + 1]));
    else out.push(oneMonth
      ? "the " + DAY_WORDS[Number(list[start].slice(8, 10)) - 1] + " to the " + DAY_WORDS[Number(list[i - 1].slice(8, 10)) - 1]
      : readSpan(list[start], list[i - 1]));
    start = i;
  }
  const joined = out.length === 1 ? out[0] : out.slice(0, -1).join(", ") + " and " + out[out.length - 1];
  return oneMonth ? joined + " of " + MONTH_NAMES[Number(list[0].slice(5, 7)) - 1] : joined;
}
/* Read a window of days out of what they wrote, so the conversation never stalls
   waiting for a year or for a single day. When no year is named it is the next one. */
const MONTH_LOOKUP = { january:1, february:2, march:3, april:4, may:5, june:6, july:7, august:8, september:9, october:10, november:11, december:12,
  jan:1, feb:2, mar:3, apr:4, jun:6, jul:7, aug:8, sep:9, sept:9, oct:10, nov:11, dec:12 };
function monthLength(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
function twoDigit(n) { return (n < 10 ? "0" : "") + n; }
function isoOf(y, m, d) { return y + "-" + twoDigit(m) + "-" + twoDigit(d); }

function deriveWindow(text) {
  const t = String(text || "").toLowerCase();
  if (!t) return null;
  const today = new Date().toISOString().slice(0, 10);
  const ym = t.match(/\b(20\d{2})\b/);
  let year = ym ? Number(ym[1]) : 0;
  let mon = 0;
  for (const k in MONTH_LOOKUP) { if (new RegExp("\\b" + k + "\\b").test(t)) { mon = MONTH_LOOKUP[k]; break; } }
  if (!mon) return null;
  if (!year) {
    year = Number(today.slice(0, 4));
    if (isoOf(year, mon, monthLength(year, mon)) < today) year += 1;   /* that month has gone, so it is next year */
  }
  const cap = monthLength(year, mon);
  let a = 0, b = 0;
  const range = t.match(/\b(?:between\s+)?(\d{1,2})\s*(?:st|nd|rd|th)?\s*(?:to|and|until|till|-|–|—)\s*(\d{1,2})/);
  if (range) { a = Number(range[1]); b = Number(range[2]); }
  else {
    const one = t.match(/\b(\d{1,2})\s*(?:st|nd|rd|th)\b/);
    if (one) { a = b = Number(one[1]); }
  }
  if (!a) {
    if (/\bearly\b/.test(t)) { a = 1; b = 10; }
    else if (/\bmid(?:dle)?\b/.test(t)) { a = 11; b = 20; }
    else if (/\blate\b/.test(t)) { a = 21; b = cap; }
    else { a = 1; b = cap; }
  }
  a = Math.min(Math.max(a, 1), cap); b = Math.min(Math.max(b, 1), cap);
  if (b < a) { const t2 = a; a = b; b = t2; }
  return { from: isoOf(year, mon, a), to: isoOf(year, mon, b) };
}

/* What comes next in the conversation, worked out from what is still missing,
   so the flow always goes forward and nobody is asked for what they have said. */
function nextStep(state, hasDates) {
  if (!str(state.names)) return "the two names";
  if (!hasDates) return "the wedding date, which can be a month or a rough window";
  if (!str(state.venue)) return "the venue and the town";
  if (!str(state.guests)) return "roughly how many guests they expect";
  if (!(state.wishes && state.wishes.length)) return "how they picture their film";
  if (!str(state.email)) return "their email address, so the quote can reach them";
  return "";
}

/* The sentence the couple reads about their dates is written here, by the code,
   so it is told every time and can never be dropped or changed along the way. */
function coupleSentence(f) {
  const ex = [];
  if (f.held && f.held.length) {
    ex.push(readDays(f.held) + (f.held.length > 1 ? " are" : " is") + " being held for another couple at the moment (though " + (f.held.length > 1 ? "they can" : "it can") + " still be secured)");
  }
  if (f.taken && f.taken.length) {
    ex.push(readDays(f.taken) + (f.taken.length > 1 ? " are" : " is") + " already taken");
  }
  if (!ex.length) return "The whole of that window looks open at the moment.";
  const rest = (f.open && f.open.length) ? "; the rest of that window looks open" : "";
  return ex[0].charAt(0).toUpperCase() + ex[0].slice(1) + (ex.length > 1 ? "; " + ex.slice(1).join("; ") : "") + rest + ".";
}

async function calendarWindow(env, from, to) {
  if (!env.CAL_ICS_URL || !from || !to) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) return null;
  const days = [];
  for (let t = Date.parse(from); t <= Date.parse(to) && days.length < 70; t += 86400000) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  if (!days.length) return "";
  try {
    const r = await fetch(env.CAL_ICS_URL);                     /* a fresh reading, availability must not be stale */
    if (!r.ok) return "";
    const ics = await r.text();
    const blocks = ics.split("BEGIN:VEVENT").slice(1);
    const busy = {}, held = {};
    for (const block of blocks) {
      const body = block.split("END:VEVENT")[0];
      const summary = (body.match(/SUMMARY:(.*)/) || [])[1] || "";
      if (/INQUIRY|FOLLOW-UP/i.test(summary)) continue;
      const start = (body.match(/DTSTART[^:\r\n]*:(\d{8})/) || [])[1] || "";
      const end = (body.match(/DTEND[^:\r\n]*:(\d{8})/) || [])[1] || "";
      if (!start) continue;
      const day = start.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3");
      const last = end ? end.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3") : day;
      const allDay = /DTSTART;VALUE=DATE:/.test(body);
      const repeating = /RRULE/.test(body);
      const isHold = /HOLD/i.test(summary);
      for (const d of days) {
        const covers = repeating ? d >= day : (allDay ? (d >= day && d < last) : d === day);
        if (!covers) continue;
        if (isHold) held[d] = true; else busy[d] = true;
      }
    }
    return {
      open: days.filter(function (d) { return !busy[d] && !held[d]; }),
      taken: days.filter(function (d) { return busy[d]; }),
      held: days.filter(function (d) { return held[d] && !busy[d]; })
    };
  } catch (e) { return null; }
}

/* The studio's calendar, read only. Nothing here ever writes to it or changes it.
   A date is "held" when the day carries an all day entry whose title says HOLD. */
async function calendarState(env, iso) {
  if (!env.CAL_ICS_URL || !iso) return "";
  try {
    const r = await fetch(env.CAL_ICS_URL);                     /* a fresh reading, availability must not be stale */
    if (!r.ok) return "";
    const ics = await r.text();
    const blocks = ics.split("BEGIN:VEVENT").slice(1);
    let busy = false, held = false;
    for (const block of blocks) {
      const body = block.split("END:VEVENT")[0];
      const summary = (body.match(/SUMMARY:(.*)/) || [])[1] || "";
      const start = (body.match(/DTSTART[^:\r\n]*:(\d{8})/) || [])[1] || "";
      const end = (body.match(/DTEND[^:\r\n]*:(\d{8})/) || [])[1] || "";
      if (!start) continue;
      const day = start.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3");
      const last = end ? end.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3") : day;
      const allDay = /DTSTART;VALUE=DATE:/.test(body);
      const repeating = /RRULE/.test(body);
      const covers = repeating ? iso >= day : (allDay ? (iso >= day && iso < last) : iso === day);
      if (!covers) continue;
      if (/^\s*(INQUIRY|FOLLOW-UP)\b/i.test(summary)) continue;   /* ours, not a booking */
      if (/hold|κρ[άα]τησ|kratis/i.test(summary)) held = true; else busy = true;
    }
    if (held) return "held";
    if (busy) return "taken";
    return "free";
  } catch (e) {
    return "";
  }
}

/* People write to provoke. Provocation gets one answer, the same one every time and
   the same one for every side. A remark that mentions a wedding is left alone, so a
   couple from anywhere in the world can talk about their guests and their day. */
const TOUCHY = /(israel|palestin|gaza|hamas|zionis|terroris|ukrain|russia|putin|netanyahu|politic|election|\bwar\b|\bhate\b|\bgod\b|\ballah\b|jesus|islam|muslim|jew|religio|fuck|shit|bitch|cunt|dick|\bsex\b|\bdie\b|\bkill\b)/i;
const WEDDINGISH = /(wedding|marry|marriage|married|bride|groom|guest|venue|ceremon|celebrat|film|video|date|church|photograph|couple|honeymoon|santorini|crete|chania|athens|reception|dinner|drone|package|collection|family|budget)/i;
function isProvocation(text) {
  const s = str(text, 300);
  const words = s.trim().split(/\s+/).filter(Boolean).length;
  return words > 0 && words <= 8 && TOUCHY.test(s) && !WEDDINGISH.test(s);
}

/* The words around the figure. Ours for English and Greek, the model's own words
   for every other language the couple may write in. Digits are stripped from them,
   so no amount can travel in on the label. */
function labelsFor(lang, ui) {
  if (lang === "en" || lang === "el") return T[lang].estimate;
  const clean = function (s) {
    return typeof s === "string" ? s.replace(/[\d\u20ac$]/g, "").replace(/\s{2,}/g, " ").trim().slice(0, 220) : "";
  };
  if (ui && clean(ui.total) && clean(ui.note)) {
    return { total: clean(ui.total), vat: clean(ui.vat) || "", note: clean(ui.note) };
  }
  return T.en.estimate;
}

/* When the model comes back with nothing, a small focused call does two things:
   it answers the couple warmly in other words, and it rescues whatever they just
   told us, so the conversation moves on instead of asking the same thing twice. */
async function repair(env, lastUserText, pendingQuestion, state) {
  const r = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.DEEPSEEK_API_KEY },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: "You are the assistant on the website of Atheaton Films, a wedding film studio in Chania, on Crete. English only. The couple's last message arrived out of order or was missed. Reply with JSON only, in this shape: {\"reply\": \"...\", \"state\": {\"names\": \"\", \"date\": \"\", \"date_iso\": \"\", \"window_from\": \"\", \"window_to\": \"\", \"venue\": \"\", \"guests\": \"\", \"wishes\": [], \"email\": \"\"}}. In \"reply\", write one short, warm acknowledgment of what they just said, and never ask a question. In \"state\", copy what is already known from what you are given and fill in only what their last message plainly tells you: a place they name is the venue, a number on its own is the number of guests. Leave the rest empty rather than guessing. Two short sentences at most. No names of people." },
        { role: "user", content: "What they wrote: " + lastUserText + "\nThe question still open: " + (pendingQuestion || "none") + "\nWhat is known so far: " + JSON.stringify(state) }
      ],
      response_format: { type: "json_object" },
      temperature: 0.5,
      max_tokens: 320
    })
  });
  if (!r.ok) return null;
  const d = await r.json();
  let text = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || "";
  text = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const j = JSON.parse(text);
    return { reply: str(j.reply, 600), state: (j.state && typeof j.state === "object") ? j.state : {} };
  } catch (e) {
    return { reply: str(text, 600), state: {} };
  }
}

/* --------------------------------------------------------------- rate limit */
async function allow(env, request) {
  try {
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const now = new Date();
    const hour = now.toISOString().slice(0, 13);
    const day = now.toISOString().slice(0, 10);
    const keys = [
      { k: "rBh:" + ip + ":" + hour, cap: 40, ttl: 3700 },
      { k: "gB:" + day, cap: 500, ttl: 90000 }
    ];
    for (const item of keys) {
      const raw = await env.RATE.get(item.k);
      const n = raw ? parseInt(raw, 10) : 0;
      if (n >= item.cap) return { ok: false, scope: item.k[0] };
    }
    for (const item of keys) {
      const raw = await env.RATE.get(item.k);
      const n = raw ? parseInt(raw, 10) : 0;
      await env.RATE.put(item.k, String(n + 1), { expirationTtl: item.ttl });
    }
    return { ok: true };
  } catch (e) {
    /* if the counters cannot be kept, the couple is not the one who pays for it */
    return { ok: true };
  }
}

/* ---------------------------------------------------------------- deepseek */
async function think(env, messages) {
  const r = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + env.DEEPSEEK_API_KEY
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: messages,
      response_format: { type: "json_object" },
      temperature: 0.5,
      max_tokens: 700
    })
  });
  if (!r.ok) throw new Error("deepseek " + r.status);
  const d = await r.json();
  let text = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || "{}";
  text = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(text); } catch (e) { return { reply: text, state: null, stage: "collecting" }; }
}

/* ------------------------------------------------------------------ routes */
export default {
  async fetch(request, env) {
    const corsHeaders = cors(request);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

    const url = new URL(request.url);
    const readOnly = (url.pathname === "/leads" || url.pathname === "/test/entries" || url.pathname === "/test/clear") && request.method === "GET";
    if (request.method !== "POST" && !readOnly) return json({ error: "POST only" }, 405, corsHeaders);

    let body = {};
    if (!readOnly) {
      try { body = await request.json(); } catch (e) { return json({ error: "bad json" }, 400, corsHeaders); }
    }

    /* ---- the conversation -------------------------------------------------- */
    if (url.pathname === "/chat") {
      const state = body.state && typeof body.state === "object" ? body.state : {};
      const full = Array.isArray(body.messages) ? body.messages : [];
      const lastUser = (full.filter(function (m) { return m && m.role === "user"; }).pop() || {}).content || "";
      const lang = "en";

      const gate = (body.key && env.LEAD_KEY && body.key === env.LEAD_KEY) ? { ok: true } : await allow(env, request);
      if (!gate.ok) return json({ reply: T[lang].rate, lang: lang }, 200, corsHeaders);

      const guess = deriveWindow(str(state.date, 60) || lastUser);
      const win = (str(state.window_from, 10) && str(state.window_to, 10))
        ? { from: str(state.window_from, 10), to: str(state.window_to, 10) }
        : guess;

      const messages = [{ role: "system", content: systemPrompt() }];
      full.slice(-14).forEach(function (m) {
        if (m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string") {
          messages.push({ role: m.role, content: m.content.slice(0, 900) });
        }
      });
      messages.push({ role: "system", content:
        "What you know so far, as JSON: " + JSON.stringify(state) +
        "\nToday is " + new Date().toISOString().slice(0, 10) + "." +
        "\nExtract anything new they just told you into the state, and write one short, warm acknowledgment of it. Do not ask a question." });

      let out;
      try { out = await think(env, messages); }
      catch (e) {
        try { out = await think(env, messages); }
        catch (e2) { return json({ reply: T[lang].error, lang: lang }, 200, corsHeaders); }
      }
      if (!out || !str(out.reply)) {
        try { const again = await think(env, messages); if (again && str(again.reply)) out = again; } catch (e) {}
      }

      /* the model proposes, this code decides */
      const next = Object.assign({}, state, out.state || {});
      next.wishes = Array.isArray(next.wishes)
        ? next.wishes.slice(0, 8).map(function (w) { return str(w, 80); }).filter(Boolean)
        : [];
      const words = str(lastUser, 60).trim().split(/\s+/).length;
      const digits = str(lastUser, 60).replace(/\D/g, "");
      if (!str(next.guests) && words <= 4 && digits && digits.length <= 3) next.guests = digits;
      if (!str(next.email)) {
        const em = str(lastUser, 200).match(/[^\s@]+@[^\s@]+\.[a-z]{2,}/i);
        if (em) next.email = em[0];
      }
      next.lang = lang;
      let gap = missing(next);

      const rawReply = str(out.reply, 900);
      let reply = cleanText(rawReply);
      /* the model only acknowledges; drop any question it wrote anyway */
      const qmark = reply.indexOf("?");
      if (qmark !== -1) {
        const cut = reply.lastIndexOf(".", qmark);
        reply = (cut > 10) ? reply.slice(0, cut + 1).trim() : "";
      }

      if (!reply) {
        try {
          const fix = await repair(env, lastUser, "", next);
          if (fix && fix.reply) reply = cleanText(fix.reply);
          if (fix && fix.state) {
            const pick = function (k) { if (!str(next[k]) && str(fix.state[k])) next[k] = str(fix.state[k], 160); };
            ["names", "date", "date_iso", "venue", "guests", "email"].forEach(pick);
            if (!next.wishes.length && Array.isArray(fix.state.wishes)) {
              next.wishes = fix.state.wishes.slice(0, 6).map(function (w) { return str(w, 80); }).filter(Boolean);
            }
            gap = missing(next);
          }
        } catch (e) {}
      }

      /* a past or too-close date is rejected with one clean line, before anything else */
      const exactIso = /^\d{4}-\d{2}-\d{2}$/.test(str(next.date_iso, 20)) ? str(next.date_iso, 20) : "";
      const earliest = plusDays(new Date().toISOString().slice(0, 10), 2);
      const badDate = (exactIso && exactIso < earliest) || (!exactIso && win && win.to < earliest);
      if (badDate) {
        const nice = new Date(earliest + "T00:00:00Z").toLocaleDateString("en-GB",
          { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
        reply = "That date is not one we can take. The earliest date we can film is " + nice + ". Could you tell me another date for the wedding?";
        next.date = ""; next.date_iso = ""; next.window_from = ""; next.window_to = "";
        gap = missing(next);
      }

      /* settle the date fields from the window, for the request itself */
      if (win && !badDate) {
        if (!str(next.window_from, 10)) { next.window_from = win.from; next.window_to = win.to; }
        if (!str(next.date, 120)) {
          next.date = (win.from === win.to ? readDays([win.from]) : "between " + readDays([win.from, win.to])) + " " + win.from.slice(0, 4);
        }
        if (win.from === win.to && !str(next.date_iso, 20)) next.date_iso = win.from;
      }
      gap = missing(next);

      /* provocation, once; a second one closes the conversation */
      let closed = false;
      if (isProvocation(lastUser)) {
        next.prov = (parseInt(next.prov, 10) || 0) + 1;
        if (next.prov >= 2) {
          reply = "I am not able to respond to that. This conversation is here for couples planning their wedding film, and I will leave it here.";
          closed = true;
        } else {
          reply = "I am not able to respond to that. This conversation is here for couples planning their wedding film.";
        }
      }

      /* the code asks the next question; the model's acknowledgment sits in front of it */
      let done = false;
      if (!badDate && !closed) {
        const q = askQuestion(next, lang);
        if (q === T[lang].ready) {
          reply = q;
          done = true;
          closed = true;   /* the form is complete; end the conversation */
        } else {
          reply = (reply ? reply + " " : "") + q;
        }
      }

      return json({ reply: reply, state: next, stage: done ? "ready" : "collecting", done: done, lang: lang, closed: closed }, 200, corsHeaders);
    }
    /* ---- the lead, kept for the studio ------------------------------------- */
    if (url.pathname === "/lead") {
      const state = body.state || {};
      const at = new Date().toISOString();
      const key = "lead:" + at.slice(0, 10) + ":" + Math.random().toString(36).slice(2, 10);
      const record = {
        at: at,
        names: str(state.names, 120), date: str(state.date, 60), venue: str(state.venue, 160),
        guests: str(state.guests, 40), package: str(state.package, 60),
        wishes: (Array.isArray(state.wishes) ? state.wishes : []).slice(0, 8).map(function (w) { return str(w, 80); }).filter(Boolean),
        budget: str(state.budget, 80),
        surnames: str(state.surnames, 120), id_number: str(state.id_number, 40),
        address: str(state.address, 200), phone: str(state.phone, 60),
        booking_requested: state.booking_requested === true,
        extras: normalizeExtras(state.extras),
        email: str(state.email, 160),
        estimate: estimate(state)
      };
      await env.LEADS.put(key, JSON.stringify(record), { expirationTtl: 60 * 60 * 24 * 400 });

      /* and out by mail, so an enquiry is never something anyone has to remember to look for */
      let mailed = false;
      if (env.RESEND_API_KEY && env.LEAD_TO) {
        const ex = Object.keys(record.extras).length
          ? Object.keys(record.extras).map(function (k) { return k + " x" + record.extras[k]; }).join(", ")
          : "none";
        const lines = [
          "New enquiry from the website.",
          "",
          "Names: " + (record.names || "not given"),
          "Date: " + (record.date || "not given"),
          "Venue: " + (record.venue || "not given"),
          "Guests: " + (record.guests || "not given"),
          "Package: " + (record.package || "not given"),
          "Wants in the film: " + (record.wishes.length ? record.wishes.join(", ") : "not said"),
          "Budget they mentioned: " + (record.budget || "not said"),
          record.booking_requested ? "ASKED TO SECURE THE DATE: yes" : "",
          record.surnames ? "Surnames: " + record.surnames : "",
          record.id_number ? "Identity or passport: " + record.id_number : "",
          record.address ? "Address: " + record.address : "",
          record.phone ? "Telephone: " + record.phone : "",
          "Extras: " + ex,
          "Email: " + (record.email || "not given"),
          record.estimate ? "Indicative figure shown to the couple: " + record.estimate.text : "",
          "",
          "Received " + at
        ].filter(function (x) { return x !== ""; }).join("\n");
        try {
          const sent = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.RESEND_API_KEY },
            body: JSON.stringify({
              from: "Atheaton website <onboarding@resend.dev>",
              to: [env.LEAD_TO],
              subject: "Website enquiry: " + (record.names || "a couple") + (record.date ? ", " + record.date : ""),
              text: lines
            })
          });
          mailed = sent.ok;
        } catch (e) { mailed = false; }
      }
      /* and it becomes an entry in the studio's calendar, with Google sending the notice */
      let written = false;
      if (env.GCAL_KEY) {
        const when = str(state.date_iso, 20) || str(state.date, 60);
        written = (await writeEntry(env, "INQUIRY", when,
          (record.names || "a couple") + (record.package ? ", " + record.package : "") +
          (record.booking_requested ? ", asked to secure" : ""),
          requestText(record, "INQUIRY"))).ok === true;
        if (state.followup === true) {
          const soon = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
          await writeEntry(env, "FOLLOW-UP", soon,
            "ask " + (record.names || "the couple") + " for confirmation" + (record.date ? ", " + record.date : ""),
            requestText(record, "FOLLOW-UP"));
        }
      }
      return json({ ok: true, key: key, mailed: mailed, written: written }, 200, corsHeaders);
    }

    /* ---- the enquiries, on one page, for whoever holds the key ------------- */
    if (url.pathname === "/leads") {
      const pass = url.searchParams.get("key") || "";
      if (!env.LEAD_KEY || pass !== env.LEAD_KEY) return json({ error: "not found" }, 404, corsHeaders);
      const list = await env.LEADS.list({ limit: 100 });
      const rows = [];
      for (const k of list.keys) {
        if (k.name.indexOf("lead:") !== 0) continue;
        const raw = await env.LEADS.get(k.name);
        if (raw) rows.push(JSON.parse(raw));
      }
      rows.sort(function (a, b) { return (b.at || "").localeCompare(a.at || ""); });
      const esc = function (s) {
        return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
          return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
        });
      };
      const html = "<!doctype html><meta charset=utf-8><title>Enquiries</title>"
        + "<style>body{font:15px/1.6 Georgia,serif;color:#1c1c1c;margin:40px;max-width:820px}"
        + "h1{font-size:22px;font-weight:400}.e{border-left:3px solid #cec3ba;padding:14px 18px;margin:0 0 22px;background:#f7f6f5}"
        + ".k{color:#6b615a;font-size:13px;letter-spacing:.06em}b{font-weight:600}</style>"
        + "<h1>Website enquiries (" + rows.length + ")</h1>"
        + rows.map(function (r) {
            const ex = r.extras && Object.keys(r.extras).length
              ? Object.keys(r.extras).map(function (k) { return k + " x" + r.extras[k]; }).join(", ")
              : "none";
            return "<div class=e><div class=k>" + esc(r.at) + "</div><p>"
              + "<b>" + esc(r.names) + "</b><br>" + esc(r.date) + " | " + esc(r.venue) + " | " + esc(r.guests) + " guests<br>"
              + esc(r.package) + " | " + esc(ex) + "<br>" + esc(r.email)
              + (r.estimate ? "<br><b>" + esc(r.estimate.total) + " euro + VAT</b>" : "") + "</p></div>";
          }).join("")
        + (rows.length ? "" : "<p>Nothing yet.</p>");
      return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    /* ---- the four kinds of entry, on consecutive days, to see them in place -- */
    if (url.pathname === "/test/clear") {
      if (!env.LEAD_KEY || url.searchParams.get("key") !== env.LEAD_KEY) return json({ error: "not found" }, 404, corsHeaders);
      const match = str(url.searchParams.get("match") || "", 60);
      if (!match) return json({ error: "nothing to match on" }, 400, corsHeaders);
      const token = await gcalToken(env);
      if (!token) return json({ error: "no calendar access" }, 500, corsHeaders);
      const q = "https://www.googleapis.com/calendar/v3/calendars/" + encodeURIComponent(env.GCAL_CALENDAR_ID)
        + "/events?q=" + encodeURIComponent(match) + "&maxResults=50";
      const found = await (await fetch(q, { headers: { Authorization: "Bearer " + token } })).json();
      const gone = [];
      for (const ev of (found.items || [])) {
        const d = await fetch("https://www.googleapis.com/calendar/v3/calendars/" + encodeURIComponent(env.GCAL_CALENDAR_ID)
          + "/events/" + encodeURIComponent(ev.id), { method: "DELETE", headers: { Authorization: "Bearer " + token } });
        gone.push({ id: ev.id, summary: ev.summary, deleted: d.ok });
      }
      return json({ matched: match, deleted: gone }, 200, corsHeaders);
    }
    if (url.pathname === "/test/entries") {
      if (!env.LEAD_KEY || url.searchParams.get("key") !== env.LEAD_KEY) return json({ error: "not found" }, 404, corsHeaders);
      const from = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
      const demo = {
        names: "Athina and Spiros (test)", date: from, venue: "Aion, Santorini", guests: "42",
        package: "Signature Cinema", wishes: ["full coverage of the day", "a longer cinematic film"],
        extras: { "Express delivery 45 days": 1 }, budget: "around 2000 euros", channel: "email",
        email: "test@example.com", phone: "+30 6900000000", address: "Chania, Crete",
        id_number: "AB123456", booking_requested: true,
        estimate: { text: "Signature Cinema 2600 euro, plus VAT" }, at: new Date().toISOString()
      };
      const out = [];
      const holdOn = str(url.searchParams.get("hold") || "", 10);
      const bookedOn = str(url.searchParams.get("booked") || "", 10);
      if (holdOn || bookedOn) {
        if (holdOn) out.push({ kind: "HOLD", when: holdOn, ok: await writeEntry(env, "HOLD", holdOn, "demo couple, awaiting decision", requestText(demo, "HOLD")) });
        if (bookedOn) out.push({ kind: "BOOKED", when: bookedOn, ok: await writeEntry(env, "BOOKED", bookedOn, "demo couple, Signature Cinema", requestText(demo, "BOOKED")) });
        return json({ results: out }, 200, corsHeaders);
      }
      out.push({ kind: "INQUIRY", when: from,
        ok: await writeEntry(env, "INQUIRY", from, "Athina and Spiros (test), Signature Cinema", requestText(demo, "INQUIRY")) });
      out.push({ kind: "FOLLOW-UP", when: plusDays(from, 1),
        ok: await writeEntry(env, "FOLLOW-UP", plusDays(from, 1), "ask Athina and Spiros (test) for confirmation", requestText(demo, "FOLLOW-UP")) });
      out.push({ kind: "HOLD", when: plusDays(from, 2),
        ok: await writeEntry(env, "HOLD", plusDays(from, 2), "Athina and Spiros (test), awaiting a decision", requestText(demo, "HOLD")) });
      out.push({ kind: "BOOKED", when: plusDays(from, 3),
        ok: await writeEntry(env, "BOOKED", plusDays(from, 3), "Athina and Spiros (test), Signature Cinema", requestText(demo, "BOOKED")) });
      return json({ from: from, results: out }, 200, corsHeaders);
    }

    /* ---- the six digit code, once a mail sender is set up ----------------- */
    if (url.pathname === "/code/send") {
      if (!env.RESEND_API_KEY) return json({ skipped: true, reason: "no mail sender configured" }, 200, corsHeaders);
      const email = str(body.email, 160);
      if (!looksLikeEmail(email)) return json({ error: "email" }, 400, corsHeaders);
      const code = String(Math.floor(100000 + Math.random() * 900000));
      await env.LEADS.put("code:" + email.toLowerCase(), code, { expirationTtl: 900 });
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.RESEND_API_KEY },
        body: JSON.stringify({
          from: "Atheaton Films <assistant@atheatonfilms.com>",
          to: [email],
          subject: "Your code, Atheaton Films",
          text: "Your code is " + code + ". It is valid for fifteen minutes."
        })
      });
      return json({ sent: r.ok }, r.ok ? 200 : 502, corsHeaders);
    }
    if (url.pathname === "/code/verify") {
      const email = str(body.email, 160).toLowerCase();
      const code = str(body.code, 10);
      const saved = await env.LEADS.get("code:" + email);
      const ok = !!saved && saved === code;
      if (ok) await env.LEADS.delete("code:" + email);
      return json({ ok: ok }, 200, corsHeaders);
    }

    return json({ error: "unknown path" }, 404, corsHeaders);
  }
};
