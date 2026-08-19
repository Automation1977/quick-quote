import { useState, useEffect, useRef } from "react";
import { Mic, Square, Printer, Copy, Save, Trash2, Plus, Loader2, CheckCircle2, MessageSquare, Tag, ChevronDown, ChevronUp, TrendingUp } from "lucide-react";

const JOB_TYPES = ["Landscaping", "Handyman", "Cleaning", "Painting", "Other"];
const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Courier+Prime:wght@400;700&family=Inter:wght@400;500;600&display=swap');`;

function uid() {
  return "wo_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
}
function money(n) {
  const v = Number(n) || 0;
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}
function lsSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // storage full or unavailable — fail quietly, app still works this session
  }
}

export default function App() {
  const [businessName, setBusinessName] = useState(() => lsGet("qq_business", "Your Business Name"));
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [jobType, setJobType] = useState("Landscaping");
  const [description, setDescription] = useState("");
  const [hourlyRate, setHourlyRate] = useState("45");
  const [taxRate, setTaxRate] = useState("8");
  const [materials, setMaterials] = useState(() => lsGet("qq_pricelist", []));
  const [priceListOpen, setPriceListOpen] = useState(false);
  const [newMatName, setNewMatName] = useState("");
  const [newMatUnit, setNewMatUnit] = useState("ea");
  const [newMatRate, setNewMatRate] = useState("");
  const [listening, setListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ticket, setTicket] = useState(null);
  const [history, setHistory] = useState(() => lsGet("qq_history", []));
  const [savedFlash, setSavedFlash] = useState(false);
  const recogRef = useRef(null);
  const ticketNumRef = useRef((lsGet("qq_history", []).length || 0) + 1);

  useEffect(() => lsSet("qq_business", businessName), [businessName]);
  useEffect(() => lsSet("qq_pricelist", materials), [materials]);
  useEffect(() => lsSet("qq_history", history), [history]);

  const addMaterial = () => {
    if (!newMatName.trim() || !newMatRate) return;
    setMaterials((prev) => [...prev, { id: uid(), name: newMatName.trim(), unit: newMatUnit.trim() || "ea", rate: Number(newMatRate) }]);
    setNewMatName("");
    setNewMatRate("");
  };
  const removeMaterial = (id) => setMaterials((prev) => prev.filter((m) => m.id !== id));

  const monthlyTotal = history
    .filter((h) => {
      if (!h.createdAt) return false;
      const d = new Date(h.createdAt);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((sum, h) => sum + (Number(h.total) || 0), 0);

  const toggleMic = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setError("Voice dictation isn't supported in this browser. Type it in instead.");
      return;
    }
    if (listening) {
      recogRef.current && recogRef.current.stop();
      setListening(false);
      return;
    }
    const recog = new SR();
    recog.continuous = true;
    recog.interimResults = false;
    recog.lang = "en-US";
    recog.onresult = (e) => {
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) text += e.results[i][0].transcript;
      setDescription((prev) => (prev ? prev.trim() + " " : "") + text.trim());
    };
    recog.onerror = () => setListening(false);
    recog.onend = () => setListening(false);
    recogRef.current = recog;
    recog.start();
    setListening(true);
  };

  const generateQuote = async () => {
    setError("");
    if (!clientName.trim() || !description.trim()) {
      setError("Add a client name and a quick description of the job first.");
      return;
    }
    setLoading(true);
    setTicket(null);
    try {
      const systemPrompt = `You are a pricing assistant for a small trade business (${jobType}). Given a plain-language job description, hourly rate, and tax rate, produce a fair, realistic work order quote.
Respond with ONLY valid JSON, no markdown fences, no preamble, matching exactly this shape:
{
  "summary": "one short sentence describing the job in professional language",
  "lineItems": [ { "label": "string", "detail": "string", "qty": number, "unit": "hrs or ea or string", "rate": number, "amount": number } ],
  "subtotal": number,
  "taxRate": number,
  "tax": number,
  "total": number
}
Use the given hourly rate for labor lines. Estimate a reasonable number of labor hours and any materials mentioned or clearly implied. Keep it to 2-5 line items. All numbers must be plain numbers (no currency symbols, no commas). Make subtotal = sum of amounts, tax = subtotal * taxRate/100, total = subtotal + tax, all rounded to 2 decimals.
${materials.length > 0 ? `\nThis business has a saved price list. Use these exact rates whenever a line item matches one of these materials:\n${materials.map((m) => `- ${m.name}: $${m.rate} per ${m.unit}`).join("\n")}` : ""}`;

      const userPrompt = `Job type: ${jobType}
Client: ${clientName}
Hourly rate: $${hourlyRate}/hr
Tax rate: ${taxRate}%
Job description: ${description}`;

      const response = await fetch("/api/generate-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemPrompt, userPrompt }),
      });
      const parsed = await response.json();
      if (parsed.error) throw new Error(parsed.error);

      const newTicket = {
        id: uid(),
        number: ticketNumRef.current,
        date: new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }),
        createdAt: Date.now(),
        clientName: clientName.trim(),
        clientPhone: clientPhone.trim(),
        jobType,
        ...parsed,
      };
      setTicket(newTicket);
    } catch (e) {
      setError("Couldn't generate the quote. Try again, or simplify the description.");
    } finally {
      setLoading(false);
    }
  };

  const saveTicket = () => {
    if (!ticket) return;
    const updated = [ticket, ...history.filter((h) => h.id !== ticket.id)];
    setHistory(updated);
    ticketNumRef.current = updated.length + 1;
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1800);
  };

  const deleteHistoryItem = (id) => setHistory((prev) => prev.filter((h) => h.id !== id));

  const copyTicket = () => {
    if (!ticket) return;
    const lines = [
      `${businessName}`,
      `WORK ORDER #${String(ticket.number).padStart(4, "0")} \u2014 ${ticket.date}`,
      `Client: ${ticket.clientName}`,
      "",
      ticket.summary,
      "",
      ...ticket.lineItems.map((li) => `${li.label} (${li.qty} ${li.unit} @ $${money(li.rate)})${li.detail ? " \u2014 " + li.detail : ""}: $${money(li.amount)}`),
      "",
      `Subtotal: $${money(ticket.subtotal)}`,
      `Tax (${ticket.taxRate}%): $${money(ticket.tax)}`,
      `TOTAL: $${money(ticket.total)}`,
    ].join("\n");
    navigator.clipboard.writeText(lines).catch(() => {});
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1400);
  };

  const printTicket = () => window.print();

  const textClient = () => {
    if (!ticket) return;
    if (!clientPhone.trim() && !ticket.clientPhone) {
      setError("Add the client's phone number above first, then generate again.");
      return;
    }
    const phone = (ticket.clientPhone || clientPhone).replace(/[^0-9+]/g, "");
    const body = `Hi ${ticket.clientName.split(" ")[0] || "there"}, here's your quote from ${businessName}: ${ticket.summary} Total: $${money(ticket.total)}. Reply with any questions!`;
    window.open(`sms:${phone}?body=${encodeURIComponent(body)}`, "_blank");
  };

  const newQuote = () => {
    setTicket(null);
    setClientName("");
    setClientPhone("");
    setDescription("");
    setError("");
  };

  const reopenHistory = (h) => {
    setTicket(h);
    setClientName(h.clientName);
    setClientPhone(h.clientPhone || "");
    setJobType(h.jobType);
  };

  return (
    <div className="qq-root">
      <style>{`
        ${FONT_IMPORT}
        html, body, #root { height: 100%; }
        .qq-root {
          --canvas: #EDE6D6; --ink: #262421; --ink-soft: #57534a; --orange: #E4572E;
          --green: #3F5346; --carbon: #E8B4B8; --chalk: #FAF7F0; --line: #c9c0ac;
          font-family: 'Inter', sans-serif; color: var(--ink); background: var(--canvas);
          min-height: 100vh; padding: 28px 16px 60px; box-sizing: border-box;
        }
        .qq-root * { box-sizing: border-box; }
        .qq-shell { max-width: 640px; margin: 0 auto; }
        .qq-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 22px; padding-bottom: 16px; border-bottom: 2px solid var(--ink); }
        .qq-mark { width: 42px; height: 42px; border-radius: 50%; border: 2.5px solid var(--orange); display: flex; align-items: center; justify-content: center; font-family: 'Oswald', sans-serif; font-weight: 700; font-size: 15px; color: var(--orange); transform: rotate(-6deg); flex-shrink: 0; }
        .qq-title-wrap { display: flex; align-items: center; gap: 12px; }
        .qq-title { font-family: 'Oswald', sans-serif; font-weight: 600; font-size: 22px; letter-spacing: 0.3px; }
        .qq-biz-input { font-family: 'Courier Prime', monospace; font-size: 13px; color: var(--ink-soft); background: transparent; border: none; border-bottom: 1px dashed var(--line); padding: 2px 0; width: 220px; text-align: right; outline: none; }
        .qq-biz-input:focus { border-bottom-color: var(--orange); }
        .qq-stat-ribbon { font-family: 'Courier Prime', monospace; font-size: 11px; font-weight: 700; color: var(--green); display: flex; align-items: center; gap: 5px; background: rgba(63,83,70,0.1); padding: 3px 9px; border-radius: 20px; }
        .qq-card { background: var(--chalk); border-radius: 4px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 0 var(--line); }
        .qq-eyebrow { font-family: 'Courier Prime', monospace; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--ink-soft); margin-bottom: 12px; }
        .qq-field { margin-bottom: 14px; }
        .qq-label { display: block; font-size: 12.5px; font-weight: 600; margin-bottom: 5px; color: var(--ink-soft); }
        .qq-input, .qq-textarea, .qq-select { width: 100%; font-family: 'Inter', sans-serif; font-size: 14.5px; padding: 9px 11px; border: 1.5px solid var(--line); border-radius: 3px; background: #fff; color: var(--ink); outline: none; }
        .qq-input:focus, .qq-textarea:focus { border-color: var(--orange); }
        .qq-textarea { min-height: 88px; resize: vertical; }
        .qq-row { display: flex; gap: 12px; }
        .qq-row .qq-field { flex: 1; }
        .qq-chips { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 14px; }
        .qq-chip { font-family: 'Courier Prime', monospace; font-size: 12px; padding: 5px 11px; border-radius: 20px; border: 1.5px solid var(--line); background: #fff; cursor: pointer; color: var(--ink-soft); }
        .qq-chip.active { border-color: var(--green); background: var(--green); color: #fff; }
        .qq-desc-wrap { position: relative; }
        .qq-mic-btn { position: absolute; right: 8px; bottom: 8px; width: 30px; height: 30px; border-radius: 50%; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; background: var(--ink); color: #fff; }
        .qq-mic-btn.on { background: var(--orange); animation: pulse 1.2s infinite; }
        @keyframes pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(228,87,46,0.5);} 50% { box-shadow: 0 0 0 7px rgba(228,87,46,0);} }
        .qq-pricelist-toggle { display: flex; align-items: center; gap: 7px; cursor: pointer; font-size: 12.5px; font-weight: 600; color: var(--ink-soft); margin-bottom: 14px; user-select: none; }
        .qq-pricelist-toggle svg:last-child { margin-left: auto; }
        .qq-pricelist-panel { background: #fff; border: 1.5px solid var(--line); border-radius: 3px; padding: 12px; margin-bottom: 16px; }
        .qq-mat-row { display: flex; align-items: center; gap: 10px; font-size: 13px; padding: 6px 0; border-bottom: 1px dashed var(--line); }
        .qq-mat-name { flex: 1; font-weight: 600; }
        .qq-mat-rate { font-family: 'Courier Prime', monospace; color: var(--ink-soft); }
        .qq-mat-add { display: flex; gap: 6px; margin-top: 10px; }
        .qq-mat-unit { max-width: 64px; }
        .qq-mat-rate-input { max-width: 76px; }
        .qq-pdf-hint { font-size: 11.5px; color: var(--ink-soft); margin-top: -16px; margin-bottom: 20px; }
        .qq-generate { width: 100%; font-family: 'Oswald', sans-serif; font-weight: 600; letter-spacing: 0.5px; font-size: 15px; text-transform: uppercase; padding: 13px; border: none; border-radius: 3px; background: var(--ink); color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; }
        .qq-generate:disabled { opacity: 0.6; cursor: default; }
        .qq-error { font-size: 13px; color: var(--orange); margin-top: 10px; font-weight: 500; }
        .qq-ticket { background: var(--chalk); border-radius: 4px; overflow: hidden; margin-bottom: 20px; }
        .qq-ticket-section { padding: 20px 22px; }
        .qq-perf { height: 14px; background-image: radial-gradient(circle, var(--canvas) 3px, transparent 3.6px); background-size: 16px 14px; background-position: center; background-color: var(--carbon); }
        .qq-tab-label { font-family: 'Courier Prime', monospace; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: var(--ink-soft); margin-bottom: 2px; }
        .qq-ticket-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
        .qq-ticket-num { font-family: 'Courier Prime', monospace; font-weight: 700; font-size: 15px; }
        .qq-ticket-date { font-family: 'Courier Prime', monospace; font-size: 12px; color: var(--ink-soft); }
        .qq-ticket-client { font-family: 'Oswald', sans-serif; font-size: 17px; font-weight: 600; margin-bottom: 4px; }
        .qq-ticket-summary { font-size: 13.5px; color: var(--ink-soft); margin-bottom: 14px; }
        .qq-hr { border: none; border-top: 1.5px dashed var(--line); margin: 12px 0; }
        .qq-li { display: flex; justify-content: space-between; gap: 10px; font-size: 13.5px; margin-bottom: 8px; }
        .qq-li-left { flex: 1; }
        .qq-li-label { font-weight: 600; }
        .qq-li-detail { color: var(--ink-soft); font-size: 12.5px; }
        .qq-li-meta { font-family: 'Courier Prime', monospace; color: var(--ink-soft); font-size: 12px; }
        .qq-li-amt { font-family: 'Courier Prime', monospace; font-weight: 700; white-space: nowrap; }
        .qq-totals { margin-top: 4px; }
        .qq-total-row { display: flex; justify-content: space-between; font-size: 13.5px; padding: 3px 0; font-family: 'Courier Prime', monospace; }
        .qq-total-final { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; }
        .qq-grand { font-family: 'Oswald', sans-serif; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
        .qq-stamp { font-family: 'Oswald', sans-serif; font-weight: 700; font-size: 19px; color: var(--orange); border: 3px solid var(--orange); border-radius: 46% 54% 51% 49% / 53% 47% 53% 47%; padding: 8px 16px; transform: rotate(-7deg); opacity: 0.92; }
        .qq-actions { display: flex; gap: 8px; margin-bottom: 24px; flex-wrap: wrap; }
        .qq-action-btn { flex: 1; min-width: 100px; display: flex; align-items: center; justify-content: center; gap: 6px; font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 600; padding: 10px; cursor: pointer; border-radius: 3px; border: 1.5px solid var(--ink); background: transparent; color: var(--ink); }
        .qq-action-btn.primary { background: var(--green); border-color: var(--green); color: #fff; }
        .qq-flash { color: var(--green); font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 5px; margin-top: -14px; margin-bottom: 20px; }
        .qq-history-title { font-family: 'Oswald', sans-serif; font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px; color: var(--ink-soft); margin-bottom: 10px; }
        .qq-hist-item { display: flex; justify-content: space-between; align-items: center; padding: 11px 14px; background: var(--chalk); border-radius: 3px; margin-bottom: 6px; cursor: pointer; }
        .qq-hist-item:hover { outline: 1.5px solid var(--line); }
        .qq-hist-left { font-size: 13px; }
        .qq-hist-num { font-family: 'Courier Prime', monospace; color: var(--ink-soft); margin-right: 8px; }
        .qq-hist-right { display: flex; align-items: center; gap: 12px; }
        .qq-hist-amt { font-family: 'Courier Prime', monospace; font-weight: 700; font-size: 13px; }
        .qq-hist-del { background: none; border: none; cursor: pointer; color: var(--ink-soft); padding: 4px; }
        .qq-hist-del:hover { color: var(--orange); }
        .qq-empty { font-size: 13px; color: var(--ink-soft); font-style: italic; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media print {
          .qq-card, .qq-actions, .qq-history-title, .qq-hist-item, .qq-header, .qq-pdf-hint { display: none !important; }
          .qq-root { background: #fff; padding: 0; }
        }
      `}</style>

      <div className="qq-shell">
        <div className="qq-header">
          <div className="qq-title-wrap">
            <div className="qq-mark">QQ</div>
            <div className="qq-title">Quick Quote</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <input className="qq-biz-input" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Your Business Name" />
            {history.length > 0 && (
              <div className="qq-stat-ribbon"><TrendingUp size={11} /> ${money(monthlyTotal)} written this month</div>
            )}
          </div>
        </div>

        <div className="qq-card">
          <div className="qq-eyebrow">New Work Order</div>
          <div className="qq-row">
            <div className="qq-field">
              <label className="qq-label">Client name</label>
              <input className="qq-input" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Jane Doe" />
            </div>
            <div className="qq-field">
              <label className="qq-label">Client phone (optional, for texting the quote)</label>
              <input className="qq-input" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="(555) 123-4567" />
            </div>
          </div>
          <div className="qq-row">
            <div className="qq-field">
              <label className="qq-label">Hourly rate ($)</label>
              <input className="qq-input" type="number" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} />
            </div>
            <div className="qq-field">
              <label className="qq-label">Estimated tax rate (%)</label>
              <input className="qq-input" type="number" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
            </div>
          </div>
          <div className="qq-chips">
            {JOB_TYPES.map((t) => (
              <div key={t} className={"qq-chip" + (jobType === t ? " active" : "")} onClick={() => setJobType(t)}>{t}</div>
            ))}
          </div>
          <div className="qq-field">
            <label className="qq-label">Describe the job (type it, or use the mic)</label>
            <div className="qq-desc-wrap">
              <textarea className="qq-textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Trim the front hedges, mow and edge the lawn, haul away three bags of clippings..." />
              <button className={"qq-mic-btn" + (listening ? " on" : "")} onClick={toggleMic} title="Dictate">
                {listening ? <Square size={13} /> : <Mic size={15} />}
              </button>
            </div>
          </div>
          <div className="qq-pricelist-toggle" onClick={() => setPriceListOpen((v) => !v)}>
            <Tag size={13} /> Price list ({materials.length}) — helps the AI cost materials accurately
            {priceListOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
          {priceListOpen && (
            <div className="qq-pricelist-panel">
              {materials.length === 0 && <div className="qq-empty" style={{ marginBottom: 10 }}>No saved materials yet. Add the ones you buy often, like mulch or paint.</div>}
              {materials.map((m) => (
                <div className="qq-mat-row" key={m.id}>
                  <span className="qq-mat-name">{m.name}</span>
                  <span className="qq-mat-rate">${money(m.rate)} / {m.unit}</span>
                  <button className="qq-hist-del" onClick={() => removeMaterial(m.id)}><Trash2 size={13} /></button>
                </div>
              ))}
              <div className="qq-mat-add">
                <input className="qq-input" placeholder="Material (e.g. mulch)" value={newMatName} onChange={(e) => setNewMatName(e.target.value)} />
                <input className="qq-input qq-mat-unit" placeholder="unit" value={newMatUnit} onChange={(e) => setNewMatUnit(e.target.value)} />
                <input className="qq-input qq-mat-rate-input" type="number" placeholder="$" value={newMatRate} onChange={(e) => setNewMatRate(e.target.value)} />
                <button className="qq-action-btn primary" style={{ flex: "0 0 auto", padding: "9px 14px" }} onClick={addMaterial}><Plus size={14} /></button>
              </div>
            </div>
          )}
          <button className="qq-generate" onClick={generateQuote} disabled={loading}>
            {loading ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Plus size={16} />}
            {loading ? "Writing the quote..." : "Generate Quote"}
          </button>
          {error && <div className="qq-error">{error}</div>}
        </div>

        {ticket && (
          <>
            <div className="qq-ticket">
              <div className="qq-ticket-section">
                <div className="qq-tab-label">Office Copy</div>
                <div className="qq-ticket-top">
                  <div className="qq-ticket-num">WORK ORDER #{String(ticket.number).padStart(4, "0")}</div>
                  <div className="qq-ticket-date">{ticket.date}</div>
                </div>
                <div className="qq-ticket-client">{ticket.clientName}</div>
                <div className="qq-ticket-summary">{ticket.summary}</div>
                <hr className="qq-hr" />
                {ticket.lineItems.map((li, i) => (
                  <div className="qq-li" key={i}>
                    <div className="qq-li-left">
                      <div className="qq-li-label">{li.label}</div>
                      {li.detail && <div className="qq-li-detail">{li.detail}</div>}
                      <div className="qq-li-meta">{li.qty} {li.unit} &times; ${money(li.rate)}</div>
                    </div>
                    <div className="qq-li-amt">${money(li.amount)}</div>
                  </div>
                ))}
                <hr className="qq-hr" />
                <div className="qq-totals">
                  <div className="qq-total-row"><span>Subtotal</span><span>${money(ticket.subtotal)}</span></div>
                  <div className="qq-total-row"><span>Tax ({ticket.taxRate}%)</span><span>${money(ticket.tax)}</span></div>
                  <div className="qq-total-final">
                    <span className="qq-grand">Total Due</span>
                    <span className="qq-stamp">${money(ticket.total)}</span>
                  </div>
                </div>
              </div>
              <div className="qq-perf" />
              <div className="qq-ticket-section">
                <div className="qq-tab-label">Customer Copy</div>
                <div className="qq-ticket-client" style={{ marginTop: 4 }}>{businessName}</div>
                <div className="qq-ticket-summary">Thanks for the work, {ticket.clientName.split(" ")[0] || "there"}. Questions on this quote? Just reply to this ticket.</div>
              </div>
            </div>
            <div className="qq-actions">
              <button className="qq-action-btn" onClick={copyTicket}><Copy size={14} /> Copy</button>
              <button className="qq-action-btn" onClick={printTicket}><Printer size={14} /> Save PDF</button>
              <button className="qq-action-btn" onClick={textClient}><MessageSquare size={14} /> Text Client</button>
              <button className="qq-action-btn primary" onClick={saveTicket}><Save size={14} /> Save</button>
              <button className="qq-action-btn" onClick={newQuote}><Plus size={14} /> New</button>
            </div>
            <div className="qq-pdf-hint">Tip: "Save PDF" opens your browser's print dialog — choose <em>Save as PDF</em> as the destination.</div>
            {savedFlash && <div className="qq-flash"><CheckCircle2 size={14} /> Saved</div>}
          </>
        )}

        <div className="qq-history-title">Saved Work Orders</div>
        {history.length === 0 && <div className="qq-empty">Nothing saved yet — generate and save your first quote above.</div>}
        {history.map((h) => (
          <div className="qq-hist-item" key={h.id} onClick={() => reopenHistory(h)}>
            <div className="qq-hist-left">
              <span className="qq-hist-num">#{String(h.number).padStart(4, "0")}</span>
              {h.clientName} <span style={{ color: "var(--ink-soft)" }}>&middot; {h.jobType}</span>
            </div>
            <div className="qq-hist-right">
              <span className="qq-hist-amt">${money(h.total)}</span>
              <button className="qq-hist-del" onClick={(e) => { e.stopPropagation(); deleteHistoryItem(h.id); }}><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
