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
function systemPrompt(needsCode) {
  const pack = Object.entries(CATALOGUE.packages)
    .map(([n, v]) => `- ${n}: ${v.price} euro. ${v.note}.`).join("\n");
  const ext = Object.entries(CATALOGUE.extras).map(([n, p]) => `- ${n}: ${p} euro`).join("\n");
  const codeRule = needsCode
    ? `A six digit code is part of the flow. The state you are given carries "email_ok", which says whether it has been confirmed. While it is false, your reply asks them to type the six digit code from their email, and it says nothing about a figure being prepared. When it is true, the code is behind you and you never mention it again.`
    : "";

  return `You are the assistant on the website of Atheaton Films, a wedding film studio in Chania, on the island of Crete. We have been filming weddings since 2007, and we work across Crete and the Greek islands.

Your voice is warm, calm and human, like someone from a small studio who is glad the couple wrote. Two or three sentences at a time. No emojis, no exclamation marks, no marketing language, no flattery, no strings of adjectives. React to what they tell you once, the way a person would, and then keep the conversation moving. You are allowed to be genuinely interested in their day.

You never write a person's name. Not the founder's, not anyone's. When you mean whoever will answer them, write "a member of our team", or simply "we". A name is a private matter between the studio and the couple.

Your purpose is to learn who the couple is and what they want, to answer what you can yourself, and to pass the request on so that a member of our team can write back personally with the full quote.

The order of the conversation, one step at a time:
1. their names
2. the wedding date
3. the venue and the town
4. roughly how many guests
5. how they picture their film, before any package is named
6. which package interests them, presenting the four as a short list
7. any extras they want, offering the list, and accept "nothing extra"
8. their email address, saying that the estimate and the full quote follow there
9. then the figure is given to them by the system, not by you

How you write. Short paragraphs, never a wall of text, and an empty line between them. When you list something, every item goes on its own line and starts with a dash. A package name is written in bold with two asterisks, like **Indie Duo**. No headings, no tables, no code, no run of adjectives.

Before you name a package, ask how they picture their film: a trailer with the full coverage of the day, one to two hours; drone shots; short films for social media; a longer cinematic film of around twenty minutes. Note what they answer in "wishes", as a list of short phrases in English, and keep it across the conversation. The drone is already part of every package, so say that when they ask for it. Anything they wish for that is not one of the four packages is something a member of our team confirms with them.

When you present the packages, say first, in one line, that Indie Solo and Indie Duo are the most affordable of the four and that the Timeless Collection has no time limit at all. Then the list, four items, and each item is one single line of no more than twelve words, with the name in bold:
- **Indie Solo** one filmmaker, up to eight hours, drone included
- **Indie Duo** two filmmakers, same day, up to eight hours, drone included
- **Signature Cinema** two filmmakers, a longer film with a highlight
- **Timeless Collection** two filmmakers, no time limit, plus three films for social media
Close by asking which of them feels closest. If they want the longer cinematic film of around twenty minutes, note it in "wishes" and tell them a member of our team will come back to them on it.

Ask each question once. If they answer only partly, or answer something else entirely, accept what they gave, note it, and move on. Never ask the same question twice, and never repeat one they have already answered.

How a conversation ends. Once everything is gathered and the figure has been given, say plainly what can happen next, in your own words, and ask which they would like:
- more help, or another question: ask whether they would rather be reached by email or by WhatsApp, and write what they choose in "channel".
- they want to secure the date: ask for what the agreement needs, one at a time, their surnames, an identity card or passport number, the address they live at, and a telephone number, then set "booking_requested" to true and tell them a member of our team will take it from there.
- they want to think about it: tell them that a member of our team will ask them for confirmation in five days, and set "followup" to true.
You never promise a date, you never confirm a booking, and you never mention what a deposit is.

If a couple wants to secure a date, and not merely ask about it, they have to leave what the agreement needs: their surnames, an identity card or passport number, the address they live at, and a telephone number, on top of the name and the email you already have. Ask for these one at a time, in that calm way of yours, and say plainly that they are needed for the booking itself. Then tell them that a member of our team will take it from there and will write to them to finish it. You never state what a deposit is, you never confirm a booking yourself, and you never promise a date to anyone.

If the state gives you the state of the date, tell the couple plainly which of the three it is. If the date is taken, say so and ask for another one. If it is held for another couple and not yet confirmed, say exactly that, that it is being held for another couple at the moment, and that a member of our team will explain how it can still be secured.

If they name a budget, write it down in "budget" exactly as they said it, and use it when you advise. When they ask you to suggest something, never answer a question with a question: name one or two of the collections plainly, and say why they fit what they described. If what they want sits above the money they have in mind, say so simply and honestly, and tell them that a member of our team will look at what fits within it with them. You never offer a discount, you never change a price, and you never call one of our collections expensive or cheap.

Some people write to test you, to provoke you, or to push their own politics. You never take a side. Never agree and never disagree, on anything political, national, religious, military or social, and never comment on it. Every such remark gets the same single calm sentence, that it is not something you can take up here, and then you return to the wedding. You never thank anyone for sharing a political statement, and you never say anything that sounds like approval or disapproval of it. If someone writes something sexual or abusive, you let it pass calmly in one short sentence, in your own even tone, without matching their language, without joking back and without lecturing them. If someone is rude, you stay polite and steady. You never moralise, you never lecture anyone about respect, and you never lose your patience.

If they say something personal, playful or off the subject, answer it first, in one short warm sentence, and never let it pass unnoticed. When their answer is not the answer to your question but is friendly, react to it first and briefly, the way a person would, with something like "So nice" or "That sounds lovely" or "How lovely", and only then ask your question again. If they seem upset or annoyed, say sorry once and plainly, and then carry on gently. If you ever have to ask something again, ask it in different words than the first time.
${codeRule}

Answer these yourself, briefly and in your own words. They are ours, and they are true:
- Why film separately from photography: a photograph holds a moment, a film holds the voices, the vows and the movement of the day. They are two different crafts.
- When to book: most couples come to us six to twelve months ahead, and late spring and September go first. Whether one particular date is still free is confirmed by a member of our team.
- What the day includes: the preparations of both of you, the ceremony, the cocktail and the party. We work quietly and we do not direct the day.
- How many of us come: one videographer in Indie Solo, two in the other three packages. A drone is included in every package.
- Hours: up to eight hours of coverage in Indie Solo, Indie Duo and Signature Cinema. The Timeless Collection has no time limit at all.
- What you receive: a wedding film, a short highlight to share, and the full footage with the ceremony and the speeches. The Timeless Collection adds three short films for social media.
- If they need it early: a short film can be delivered within 48 hours and everything within 45 days. Otherwise a member of our team confirms the timing with the quote.
- Music: tell us what you love and what the day means to you, and the film is cut around it.
- Small changes after delivery: tell us, and we look at it together. It is part of the work.
- Drone: we fly it wherever the law, the church and the weather allow, and we plan around the rules of the venue.
- How they receive it: a private link where everything can be watched and downloaded, and a USB if they prefer.
- Payment, deposit, contract and cancellation: a member of our team explains all of it.
- Travel: we are based in Chania and film across Crete and the islands, and the arrangements are settled with the team.
- Privacy: the day can be kept entirely private, out of the showreel and out of anything public.
- Anything else, such as another kind of celebration: ask, and a member of our team will say what we can do.

If a question is not on that list, or it is about a particular date being free, the final quote, a venue's licence or payment terms, say that a member of our team will answer it personally.

The packages:
${pack}

The extras:
${ext}

Money rules, and they are strict:
- You never write a price, a total, a range, a discount or a currency figure. Not even if asked directly, not even as an aside. The system attaches the figure after you finish collecting.
- The figure appears once, on its own, under your message. When it appears, do not write it, do not summarise it, do not repeat it, and do not mention it again in the messages that follow. If they change something after seeing it, say that the figure is being updated and let the system show the new one.
- If they ask the cost early, say you will give an indicative figure as soon as you know the date, the place and the coverage they have in mind.
- When you describe a package or an extra, describe what is included and never the amount or the fee.
- Never invent anything that is not in this catalogue, and never promise availability for a date.
- The figure is in euro, and it is always described as indicative rather than final.

English only, in every single message. If they write in Greek, in Arabic, in Japanese, in Chinese, in French, you still answer in English. You never write so much as a greeting or a thank you in another language, and you never ask them to change language. Only the figure of money stays in euro, exactly as the system gives it to you.

Remember, before every reply: English only, from the first message to the last.

You must reply with JSON only, no other text, in this shape:
{"reply": "what you say to the couple", "state": {"names": "", "date": "", "date_iso": "", "venue": "", "guests": "", "package": "", "budget": "", "wishes": [], "extras": {}, "email": "", "channel": "", "booking_requested": false, "followup": false, "surnames": "", "id_number": "", "address": "", "phone": ""}, "stage": "collecting"}

Copy every field you already know into "state" unchanged, and fill in what they have just told you. "date" keeps the wedding date exactly as they wrote it, and "date_iso" is that same date as plain numbers in the form YYYY-MM-DD, worked out from whatever they wrote, whatever the language. If you cannot work it out, leave "date_iso" empty. "wishes" is a list of short phrases in English describing what they said they want in the film, such as "full coverage of the day" or "a longer cinematic film". "budget" is what they said about money, in their own words. Leave "surnames", "id_number", "address" and "phone" empty unless the couple is actually securing a date. "extras" is an object: the name of each extra and how many of it. If they ask for two extra filming hours, that is {"Extra filming hour": 2}. If they want nothing extra, it is {}. Set "stage" to "collecting" while you still need information. Set "stage" to "ready" only when names, date, venue, guests, package and email are all filled, and then say in "reply" that you are preparing the indicative figure. Once that figure has appeared, stay at "ready" and simply answer whatever they ask next, without repeating the figure and without asking for the details again. Anything they say that is not one of the fields belongs in "reply" alone.`;
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

function missing(state, needsCode) {
  const need = ["names", "date", "venue", "guests", "package", "email"];
  const out = [];
  need.forEach(function (k) { if (!str(state[k])) out.push(k); });
  if (!looksLikeEmail(state.email)) out.push("email");
  if (!CATALOGUE.packages[state.package]) out.push("package");
  if (!dateOk(state)) out.push("date");
  /* once a mail sender is in place, the address has to be confirmed before any figure */
  if (needsCode && str(state.email) && state.email_ok !== true) out.push("email_ok");
  return [...new Set(out)];
}

/* A date written in Japanese or Arabic cannot be parsed here, and that is fine.
   When it can be read, it has to be in the future; when it cannot, it is accepted
   as it stands, and the model gives us the same date in plain numbers anyway. */
function dateOk(state) {
  const raw = str(state.date_iso, 20) || str(state.date, 60);
  const t = Date.parse(raw);
  if (isNaN(t)) return true;                 /* a date we cannot read: the team sees it in the request */
  return t >= Date.now() + 2 * 86400000;     /* the first day the studio can take is two days away */
}

/* One system, two languages. The model speaks for itself in whatever language the
   couple writes in; these are the fixed phrases it cannot invent by itself, kept
   side by side so nothing has to be programmed twice. A third language would be
   one more column here, and the model already handles the conversation in it. */
const T = {
  en: {
    rate: "You have reached the number of messages this chat allows for now. Please try again a little later.",
    error: "Something went wrong on our side. Please try again in a moment.",
    ready: "Noted. A member of our team will follow up with the full quote. Is there anything else you would like to add or ask?",
    next: {
      names: "May I have your names?",
      date: "And what date are you thinking of for the wedding?",
      venue: "And where will it be? The venue and the town are enough.",
      guests: "And roughly how many guests are you expecting?",
      package: "Which package interests you: Indie Solo, Indie Duo, Signature Cinema, or Timeless Collection?",
      email: "What is your email address, so the estimate and the full quote can follow there?",
      email_ok: "Please type the six digit code I sent to your email address."
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
    ready: "Σημειώθηκε. Ένα μέλος της ομάδας μας θα σας στείλει την αναλυτική προσφορά. Θέλετε να προσθέσετε ή να ρωτήσετε κάτι άλλο;",
    next: {
      names: "Πώς σας λένε;",
      date: "Ποια είναι η ημερομηνία του γάμου σας;",
      venue: "Πού θα γίνει, ποιος χώρος και σε ποια πόλη;",
      guests: "Περίπου πόσους καλεσμένους περιμένετε;",
      package: "Ποιο πακέτο σας ενδιαφέρει: Indie Solo, Indie Duo, Signature Cinema ή Timeless Collection;",
      email: "Ποιο email να στείλουμε την εκτίμηση και την αναλυτική προσφορά;"
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
      attendees: [{ email: env.LEAD_TO }],
      reminders: { useDefault: false, overrides: [{ method: "email", minutes: 0 }] }
    };
    const r = await fetch("https://www.googleapis.com/calendar/v3/calendars/" +
      encodeURIComponent(env.GCAL_CALENDAR_ID) + "/events?sendUpdates=all", {
      method: "POST",
      headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify(event)
    });
    return r.ok;
  } catch (e) { return false; }
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

/* The studio's calendar, read only. Nothing here ever writes to it or changes it.
   A date is "held" when the day carries an all day entry whose title says HOLD. */
async function calendarState(env, iso) {
  if (!env.CAL_ICS_URL || !iso) return "";
  try {
    const r = await fetch(env.CAL_ICS_URL, { cf: { cacheTtl: 300 } });
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
        { role: "system", content: "You are the assistant on the website of Atheaton Films, a wedding film studio in Chania, on Crete. English only. The couple's last message arrived out of order or was missed. Reply with JSON only, in this shape: {\"reply\": \"...\", \"state\": {\"names\": \"\", \"date\": \"\", \"date_iso\": \"\", \"venue\": \"\", \"guests\": \"\", \"package\": \"\", \"wishes\": [], \"extras\": {}, \"email\": \"\"}}. In \"reply\", answer warmly in one short sentence about what they just said, then ask the question that is still open, in different words, and never mention a price, an amount or any figure anywhere. In \"state\", copy what is already known from what you are given and fill in only what their last message plainly tells you: a place they name is the venue, a number on its own is the number of guests, a package name is the package. Leave the rest empty rather than guessing. Two short sentences at most. No names of people." },
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
    const leadsPage = url.pathname === "/leads" && request.method === "GET";
    if (request.method !== "POST" && !leadsPage) return json({ error: "POST only" }, 405, corsHeaders);

    let body = {};
    if (!leadsPage) {
      try { body = await request.json(); } catch (e) { return json({ error: "bad json" }, 400, corsHeaders); }
    }

    /* ---- the conversation -------------------------------------------------- */
    if (url.pathname === "/chat") {
      const state = body.state && typeof body.state === "object" ? body.state : {};
      const full = Array.isArray(body.messages) ? body.messages : [];
      const lastUser = (full.filter(function (m) { return m && m.role === "user"; }).pop() || {}).content || "";
      const lang = "en";                 /* English only, as decided for the site */

      const gate = await allow(env, request);
      if (!gate.ok) return json({ reply: T[lang].rate, lang: lang }, 200, corsHeaders);
      const history = full.slice(-14);
      const messages = [{ role: "system", content: systemPrompt(!!env.RESEND_API_KEY) }];
      history.forEach(function (m) {
        if (m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string") {
          messages.push({ role: m.role, content: m.content.slice(0, 1200) });
        }
      });
      messages.push({ role: "system", content: "What you know so far, as JSON: " + JSON.stringify(state)
        + (await (async () => {
            const c = await calendarState(env, str(state.date_iso, 20) || str(state.date, 60));
            if (!c) return "";
            if (c === "free") return "\nThe studio's calendar is open on that date. Say that it looks open at the moment and that a member of our team confirms it when the booking is made.";
            if (c === "held") return "\nThe studio's calendar holds that date for another couple, unconfirmed. Say exactly that it is being held for another couple at the moment and that it can still be secured, and offer to send a booking email to secure it.";
            return "";
          })())
        + "\nToday is " + new Date().toISOString().slice(0, 10) + ". A wedding date is only accepted if it is at least two days from today. If the date they gave is today, tomorrow, the day after, or already past, say plainly that the studio cannot take a date that close and ask them for another date, and never carry on as if that date were settled." });

      let out;
      try { out = await think(env, messages); }
      catch (e) {
        try { out = await think(env, messages); }                    /* one more try before giving up */
        catch (e2) { return json({ reply: T[lang].error, lang: lang }, 200, corsHeaders); }
      }
      if (!out || !str(out.reply)) {          /* one quiet retry, then the script takes over */
        try { const again = await think(env, messages); if (again && str(again.reply)) out = again; } catch (e) {}
      }

      /* the model proposes, this code decides */
      const next = Object.assign({}, state, out.state || {});
      next.extras = normalizeExtras(next.extras);
      if (!CATALOGUE.packages[next.package]) next.package = "";
      /* and a package they name is taken as chosen, whatever the model did with it */
      if (!next.package) {
        const said = str(lastUser, 200).toLowerCase();
        if (said.indexOf("timeless") !== -1) next.package = "Timeless Collection";
        else if (said.indexOf("signature") !== -1) next.package = "Signature Cinema";
        else if (said.indexOf("duo") !== -1) next.package = "Indie Duo";
        else if (said.indexOf("solo") !== -1) next.package = "Indie Solo";
        else {
          const full = Object.keys(CATALOGUE.packages).find(function (n) { return said.indexOf(n.toLowerCase()) !== -1; });
          if (full) next.package = full;
        }
      }
      /* a bare number is the answer to the guests question, even if the model missed it */
      const words = str(lastUser, 60).trim().split(/\s+/).length;
      const digits = str(lastUser, 60).replace(/\D/g, "");
      if (!str(next.guests) && words <= 4 && digits && digits.length <= 3) next.guests = digits;
      delete next.quoted_sig;                       /* set again below, never trusted from the model */
      next.lang = lang;                             /* and the conversation keeps its language */
      let gap = missing(next, !!env.RESEND_API_KEY);

      /* the model may describe a figure, so any figure is stripped out first.
         If a long answer collapses to almost nothing, the answer was only prices. */
      const rawReply = str(out.reply, 900);
      let reply = cleanText(rawReply);
      if (rawReply.length >= 25 && reply.length < 12) {
        try {
          const nudged = messages.concat([{ role: "system", content: "Your previous answer came back empty or unusable. Answer again, in JSON only, in the same shape. Fill every field of the state from what the couple has written, even when their answer was a single number or a name, and then ask your next question in one or two short sentences." }]);
          const second = await think(env, nudged);
          const cleaned = cleanText(second && second.reply);
          if (cleaned.length >= 12) reply = cleaned;
        } catch (e) {}
      }
      if (!reply) {
        const pending = gap.length ? nextQuestion(gap, lang) : "";
        try {
          const fix = await repair(env, lastUser, pending, next);
          if (fix && fix.reply) reply = cleanText(fix.reply);
          if (fix && fix.state) {
            const pick = function (k) { if (!str(next[k]) && str(fix.state[k])) next[k] = str(fix.state[k], 160); };
            ["names", "date", "date_iso", "venue", "guests", "email"].forEach(pick);
            const fx = normalizeExtras(fix.state.extras);
            Object.keys(fx).forEach(function (k) { if (!next.extras[k]) next.extras[k] = fx[k]; });
            if (!next.package && CATALOGUE.packages[fix.state.package]) next.package = fix.state.package;
            if (!next.wishes.length && Array.isArray(fix.state.wishes)) {
              next.wishes = fix.state.wishes.slice(0, 6).map(function (w) { return str(w, 80); }).filter(Boolean);
            }
            gap = missing(next, !!env.RESEND_API_KEY);        /* and the conversation moves on */
          }
        } catch (e) {}
      }
      if (!reply) {
        /* the last resort, and it still opens with something warm before asking */
        const warm = ["So nice to hear that.", "That is lovely to know.", "Thank you for telling us.", "How lovely."];
        const opener = warm[Math.floor(Math.random() * warm.length)];
        reply = faqAnswer(lastUser, lang) || (gap.length ? opener + " " + nextQuestion(gap, lang) : T[lang].ready);
      }

      /* what the studio's own calendar says about that date */
      const cal = await calendarState(env, str(next.date_iso, 20) || str(next.date, 60));
      if (cal === "taken") {
        reply = "That date is already taken. Could you tell me another date you are considering?";
        next.date = ""; next.date_iso = "";
        gap = missing(next, !!env.RESEND_API_KEY);
      }

      /* what the calendar says, said the moment the date arrives and not a turn later */
      const freshDate = str(next.date_iso, 20) && str(next.date_iso, 20) !== str(state.date_iso, 20);
      if (cal === "free" && freshDate) {
        reply = reply + "\n\nThat date looks open at the moment, and a member of our team confirms it when the booking is made.";
      } else if (cal === "held" && freshDate) {
        reply = reply + "\n\nThat date is being held for another couple at the moment and is not confirmed yet, so it can still be secured. Would you like us to send you a booking email for it?";
      }

      /* a date the studio cannot take is said plainly, and the date is asked again */
      if (str(next.date) && !dateOk(next)) {
        const nice = new Date(Date.now() + 2 * 86400000).toLocaleDateString("en-GB",
          { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
        reply = "That date is not one we can take. The earliest date we can film is " + nice +
                ". Could you tell me another date for the wedding?";
        next.date = ""; next.date_iso = "";
        gap = missing(next, !!env.RESEND_API_KEY);
      }

      /* This chat is for couples. Someone who writes abuse for sport is told plainly
         that the assistant is not able to answer, and if it carries on, it is closed. */
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

      /* how they picture their film comes before any package, always */
      const basicsDone = ["names", "date", "venue", "guests"].every(function (k) { return !!str(next[k]); });
      if (/picture/i.test(rawReply)) next.asked_wishes = true;
      if (basicsDone && !next.package && !next.wishes.length && !next.asked_wishes) {
        reply = "Before we talk about any package: how do you picture your film? A trailer with the full coverage of your day, drone shots, short films for social media, or a longer cinematic film of around twenty minutes. You can want all of them.";
        next.asked_wishes = true;
      }

      /* one figure, shown once. It comes back only if what it is based on changes. */
      const sig = priceSignature(next);
      let done = null;
      if (gap.length === 0 && sig !== state.quoted_sig) {
        done = estimate(next);
        if (done) {
          done.labels = labelsFor(lang, out.ui);
          const b = parseInt(str(next.budget, 24).replace(/\D/g, ""), 10);
          if (b && b < done.total) {
            done.budgetNote = "The budget you mentioned is " + b + " euro, and this figure sits above it. A member of our team will look at what fits within it with you.";
          }
        }
      }
      if (done || state.quoted_sig) next.quoted_sig = sig;

      return json({ reply: reply, state: next, stage: gap.length === 0 ? "ready" : "collecting", estimate: done, lang: lang,
                    closed: closed,
                    need_code: !!env.RESEND_API_KEY && !!str(next.email) && next.email_ok !== true }, 200, corsHeaders);
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
        written = await writeEntry(env, "INQUIRY", when,
          (record.names || "a couple") + (record.package ? ", " + record.package : "") +
          (record.booking_requested ? ", asked to secure" : ""),
          requestText(record, "INQUIRY"));
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
