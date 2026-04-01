import { useState, useEffect, useRef, useCallback } from "react";

const CONTRACTS_EXPLOITED = [
  { name: "GemPad Lock", type: "BLIND TEST", score: 19, coverage: "MEDIUM", coveragePct: 17.4, exploit: "Reentrancy", lostAmount: "$1.9M", severity: { critical: 1, high: 2, medium: 1, low: 1 }, oneLiner: "Reentrancy in lock creation and liquidity functions — external calls before state updates enable fund drainage", tag: "Real exploit",
    details: { tools: ["Slither", "Aderyn"], findings: 5, keyFinding: "External calls in lockTokens() execute before balance state is updated, allowing recursive re-entry to drain locked funds", trustAssumptions: ["Lock contract assumes token transfer has no callback", "No reentrancy guard on critical functions"], attackVector: "Attacker deploys malicious token with transfer hook → calls lockTokens() → hook re-enters before state update → drains locked liquidity" } },
  { name: "LeetSwap V2", type: "AMM / DEX", score: 0, coverage: "MEDIUM", coveragePct: 60.9, exploit: "Fee Manipulation", lostAmount: "$630K", severity: { critical: 2, high: 3, medium: 0, low: 0 }, oneLiner: "Zero-address constructor bricks pair permanently — fee-on-transfer tokens break AMM reserve accounting", tag: "Real exploit",
    details: { tools: ["Slither", "Aderyn"], findings: 5, keyFinding: "Factory constructor allows zero-address fee recipient, permanently bricking pair contracts", trustAssumptions: ["Constructor parameters validated before deployment", "All tokens follow standard ERC-20 transfer semantics"], attackVector: "Deploy pair with zero-address fee recipient → pair becomes non-functional → combine with fee-on-transfer token to desync reserves → extract value" } },
  { name: "CloberDEX", type: "Order Book DEX", score: 60, coverage: "HIGH", coveragePct: 15.5, exploit: "Reentrancy", lostAmount: "$501K", severity: { critical: 0, high: 1, medium: 2, low: 2 }, oneLiner: "State updates after external transfers in mint() — checks-effects-interactions violation enables reserve manipulation", tag: "Real exploit",
    details: { tools: ["Slither", "Aderyn", "Mythril"], findings: 5, keyFinding: "mint() performs external token transfer before updating internal reserve state, violating CEI pattern", trustAssumptions: ["Token contracts in pools don't have callbacks", "Reserve state always consistent with balances"], attackVector: "Create pool with callback-enabled token → call mint() → callback during transfer → manipulate reserves → extract excess" } },
  { name: "SKI MASK DOG", type: "Meme Token", score: 0, coverage: "HIGH", coveragePct: 100, exploit: "Access Control", lostAmount: "Drainable", severity: { critical: 1, high: 1, medium: 0, low: 0 }, oneLiner: "Any user can drain all contract ETH via unprotected clearstuckEth() — no access control on fund transfer", tag: "Critical flaw",
    details: { tools: ["Slither", "Aderyn", "Mythril"], findings: 2, keyFinding: "clearstuckEth() transfers entire contract ETH balance to msg.sender with zero access control", trustAssumptions: ["Only owner would know about clearstuckEth() (security through obscurity)", "Contract would never hold significant ETH"], attackVector: "Call clearstuckEth() from any wallet → receive all contract ETH → repeat whenever contract accumulates ETH" } },
];
const CONTRACTS_ECOSYSTEM = [
  { name: "tBTC", type: "Bitcoin Bridge", score: 84, coverage: "HIGH", coveragePct: 15.4, severity: { critical: 0, high: 0, medium: 1, low: 3 }, oneLiner: "Upgradeable infrastructure with centralized owner — security depends on Threshold Network signer group integrity",
    details: { tools: ["Slither", "Aderyn", "Mythril"], findings: 4, keyFinding: "Proxy with single owner upgrade authority — compromise enables complete fund drainage through malicious implementation", trustAssumptions: ["Threshold Network signers maintain security", "Owner key protected by multisig", "Upgrade includes timelock"] } },
  { name: "Aerodrome", type: "Top DEX on Base", score: 71, coverage: "HIGH", coveragePct: 73.9, severity: { critical: 0, high: 1, medium: 1, low: 1 }, oneLiner: "Single minter address controls entire token supply — no timelock or multisig on minting privilege",
    details: { tools: ["Slither", "Aderyn", "Mythril"], findings: 3, keyFinding: "Minter role assigned to single address with no timelock, multisig, or supply cap", trustAssumptions: ["Minter controlled by trusted Aerodrome team", "Governance will transition to DAO", "Economic incentives prevent abuse"] } },
];

// ─── PDF filename mapping ───────────────────────────────────────────
const PDF_MAP = {
  "GemPad Lock": "GemPad_Lock.pdf",
  "LeetSwap V2": "LeetSwap_V2.pdf",
  "CloberDEX": "CloberDEX.pdf",
  "SKI MASK DOG": "SKI_MASK_DOG.pdf",
  "tBTC": "tBTC.pdf",
  "Aerodrome": "Aerodrome.pdf",
};

// ─── DOM-based Counter ──────────────────────────────────────────────
function Counter({ end, suffix = "", prefix = "" }) {
  const spanRef = useRef(null);
  useEffect(() => {
    const el = spanRef.current;
    if (!el) return;
    el.textContent = prefix + "0" + suffix;
    let rafId;
    const t0 = performance.now();
    const run = (now) => {
      const p = Math.min((now - t0) / 1500, 1);
      el.textContent = prefix + Math.round((1 - Math.pow(1 - p, 3)) * end) + suffix;
      if (p < 1) rafId = requestAnimationFrame(run);
    };
    rafId = requestAnimationFrame(run);
    return () => cancelAnimationFrame(rafId);
  }, [end, prefix, suffix]);
  return <span ref={spanRef} style={{ fontFamily: "var(--mono)", fontSize: 42, fontWeight: 800, lineHeight: 1 }} />;
}

// ─── DOM-based ScoreGauge ───────────────────────────────────────────
function ScoreGauge({ score, size = 100 }) {
  const numRef = useRef(null);
  const circRef = useRef(null);
  const gc = (s) => s >= 80 ? "#22c55e" : s >= 60 ? "#eab308" : s >= 40 ? "#f97316" : "#ef4444";
  const c = gc(score), r = (size - 12) / 2, ci = 2 * Math.PI * r * 0.75;
  useEffect(() => {
    const numEl = numRef.current, circEl = circRef.current;
    if (!numEl || !circEl) return;
    numEl.textContent = "0"; circEl.style.strokeDashoffset = String(ci);
    let rafId;
    const t0 = performance.now();
    const run = (now) => {
      const p = Math.min((now - t0) / 1200, 1);
      const v = Math.round((1 - Math.pow(1 - p, 3)) * score);
      numEl.textContent = String(v);
      circEl.style.strokeDashoffset = String(ci - (ci * v) / 100);
      if (p < 1) rafId = requestAnimationFrame(run);
    };
    rafId = requestAnimationFrame(run);
    return () => cancelAnimationFrame(rafId);
  }, [score, ci]);
  return (
    <div style={{ width: size, height: size, position: "relative", flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1a1a2e" strokeWidth="8" strokeDasharray={`${ci} ${2*Math.PI*r*0.25}`} strokeLinecap="round" transform={`rotate(135 ${size/2} ${size/2})`} />
        <circle ref={circRef} cx={size/2} cy={size/2} r={r} fill="none" stroke={c} strokeWidth="8" strokeDasharray={`${ci} ${2*Math.PI*r}`} strokeDashoffset={ci} strokeLinecap="round" transform={`rotate(135 ${size/2} ${size/2})`} style={{ filter: `drop-shadow(0 0 8px ${c}66)` }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingBottom: 4 }}>
        <span ref={numRef} style={{ fontSize: size*0.32, fontWeight: 800, color: c, fontFamily: "var(--mono)", lineHeight: 1 }}>0</span>
        <span style={{ fontSize: size*0.09, color: "#64748b", letterSpacing: "0.15em", textTransform: "uppercase", fontWeight: 600, marginTop: 2 }}>Safety Score</span>
      </div>
    </div>
  );
}

function SeverityBadges({ severity }) {
  return (<div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
    {[["critical","CRIT","#ef4444"],["high","HIGH","#f97316"],["medium","MED","#eab308"],["low","LOW","#64748b"]].map(([k,l,c]) =>
      severity[k] > 0 ? <span key={k} style={{ padding: "3px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700, fontFamily: "var(--mono)", color: c, background: `${c}18`, border: `1px solid ${c}30`, letterSpacing: "0.05em" }}>{severity[k]} {l}</span> : null
    )}
  </div>);
}

function ContractCard({ contract, onRequestReport }) {
  const [hov, setHov] = useState(false);
  const [exp, setExp] = useState(false);
  const isE = !!contract.exploit;
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} style={{ background: hov ? "linear-gradient(135deg,#0d0d1a,#111128)" : "linear-gradient(135deg,#0a0a14,#0d0d1f)", border: `1px solid ${hov ? "#2a2a4a" : "#16163a"}`, borderRadius: 16, overflow: "hidden", transition: "all 0.4s cubic-bezier(0.16,1,0.3,1)", transform: hov ? "translateY(-4px)" : "none", boxShadow: hov ? "0 20px 60px -15px rgba(0,0,0,0.6)" : "0 4px 20px -5px rgba(0,0,0,0.3)" }}>
      <div style={{ height: 2, background: contract.score >= 80 ? "linear-gradient(90deg,#22c55e,#22c55e00)" : contract.score >= 60 ? "linear-gradient(90deg,#eab308,#eab30800)" : "linear-gradient(90deg,#ef4444,#ef444400)" }} />
      <div style={{ padding: "20px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div style={{ flex: 1, minWidth: 0, marginRight: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#f0f0f5" }}>{contract.name}</h3>
              <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: "#ffffff08", color: "#8888aa", border: "1px solid #ffffff10", letterSpacing: "0.08em", textTransform: "uppercase" }}>{contract.type}</span>
            </div>
            {isE && <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 6, background: "#ef444412", border: "1px solid #ef444430", marginBottom: 10 }}><span style={{ fontSize: 11 }}>⚠</span><span style={{ fontSize: 11, fontWeight: 700, color: "#ef4444", fontFamily: "var(--mono)", letterSpacing: "0.05em" }}>{contract.tag} — {contract.lostAmount} lost</span></div>}
            <SeverityBadges severity={contract.severity} />
          </div>
          <ScoreGauge score={contract.score} size={100} />
        </div>
        <p style={{ margin: "14px 0", fontSize: 13, lineHeight: 1.6, color: "#8b8ba3", fontFamily: "var(--code)", borderLeft: `2px solid ${contract.score < 40 ? "#ef444440" : contract.score < 70 ? "#eab30840" : "#22c55e40"}`, paddingLeft: 12 }}>{contract.oneLiner}</p>
        {exp && contract.details && (
          <div style={{ margin: "16px 0", padding: 20, borderRadius: 12, background: "#06060e", border: "1px solid #12122a" }}>
            <div style={{ marginBottom: 16 }}><span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", color: "#6366f1", textTransform: "uppercase", fontFamily: "var(--mono)" }}>Key Finding</span><p style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.7, color: "#9999bb" }}>{contract.details.keyFinding}</p></div>
            <div style={{ marginBottom: 16 }}><span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", color: "#eab308", textTransform: "uppercase", fontFamily: "var(--mono)" }}>Trust Assumptions</span><div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>{contract.details.trustAssumptions.map((t,i) => <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, color: "#7777aa", lineHeight: 1.6 }}><span style={{ color: "#eab30860", flexShrink: 0 }}>◆</span>{t}</div>)}</div></div>
            {contract.details.attackVector && <div style={{ marginBottom: 16 }}><span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", color: "#ef4444", textTransform: "uppercase", fontFamily: "var(--mono)" }}>Attack Scenario</span><p style={{ margin: "6px 0 0", fontSize: 12, lineHeight: 1.7, color: "#9999bb", fontFamily: "var(--code)", padding: "10px 14px", borderRadius: 8, background: "#ef444406", border: "1px solid #ef444412" }}>{contract.details.attackVector}</p></div>}
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}><div><span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", color: "#555570", textTransform: "uppercase", fontFamily: "var(--mono)" }}>Tools</span><div style={{ display: "flex", gap: 6, marginTop: 6 }}>{contract.details.tools.map((t,i) => <span key={i} style={{ padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: "#6366f10a", border: "1px solid #6366f120", color: "#8888bb", fontFamily: "var(--mono)" }}>{t}</span>)}</div></div><div><span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", color: "#555570", textTransform: "uppercase", fontFamily: "var(--mono)" }}>Findings</span><p style={{ margin: "6px 0 0", fontSize: 20, fontWeight: 800, color: "#c0c0dd", fontFamily: "var(--mono)" }}>{contract.details.findings}</p></div></div>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 14, borderTop: "1px solid #ffffff06", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", gap: 16 }}><span style={{ fontSize: 11, color: "#555570" }}><span style={{ color: "#7777aa", fontWeight: 600 }}>Coverage</span> <span style={{ fontFamily: "var(--mono)" }}>{contract.coveragePct}%</span>{contract.coveragePct < 50 && <span style={{ color: "#55556a", marginLeft: 4, fontSize: 10 }}>· Libs excluded</span>}</span><span style={{ fontSize: 11, color: "#555570" }}><span style={{ color: "#7777aa", fontWeight: 600 }}>Confidence</span> <span style={{ fontFamily: "var(--mono)" }}>{contract.coverage}</span></span></div>
          <div style={{ display: "flex", gap: 8 }}><button onClick={() => setExp(!exp)} style={{ background: "none", border: "1px solid #ffffff10", color: "#8888aa", fontSize: 12, fontWeight: 600, padding: "6px 14px", borderRadius: 8, cursor: "pointer" }}>{exp ? "Collapse ↑" : "Details ↓"}</button><button onClick={() => onRequestReport(contract.name)} style={{ background: "#6366f118", border: "1px solid #6366f130", color: "#a5a5dd", fontSize: 12, fontWeight: 600, padding: "6px 14px", borderRadius: 8, cursor: "pointer" }}>Full report →</button></div>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }) {
  return <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 11, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#6366f1", fontFamily: "var(--mono)", marginBottom: 16 }}><div style={{ width: 20, height: 1, background: "#6366f1" }} />{children}</div>;
}

// ─── Email Gate with Brevo Integration ──────────────────────────────
function EmailGate({ isOpen, onClose, contractName }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState("form"); // form | loading | success | error
  const [pdfUrl, setPdfUrl] = useState(null);

  if (!isOpen) return null;
  const inp = { width: "100%", padding: "12px 16px", borderRadius: 10, border: "1px solid #1a1a3a", background: "#06060f", color: "#f0f0f5", fontSize: 14, outline: "none", fontFamily: "var(--font)", boxSizing: "border-box" };

  const handleSubmit = async () => {
    if (!name || !email) return;
    setStatus("loading");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, contractName }),
      });
      const data = await res.json();
      if (data.success && data.pdfUrl) {
        setPdfUrl(data.pdfUrl);
      } else {
        // Fallback: direct PDF link from map
        const file = PDF_MAP[contractName];
        if (file) setPdfUrl(`/reports/${file}`);
      }
      setStatus("success");
    } catch (err) {
      // API failed — still show PDF (graceful degradation)
      const file = PDF_MAP[contractName];
      if (file) setPdfUrl(`/reports/${file}`);
      setStatus("success");
    }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(12px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "linear-gradient(135deg,#0a0a18,#0f0f24)", border: "1px solid #1a1a3a", borderRadius: 20, padding: 40, maxWidth: 440, width: "100%", position: "relative" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg,#6366f1,#8b5cf6,#6366f100)" }} />

        {status === "form" && (<>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", color: "#6366f1", textTransform: "uppercase", fontFamily: "var(--mono)" }}>AXIOM Intelligence</span>
          <h2 style={{ margin: "8px 0", fontSize: 24, fontWeight: 700, color: "#f0f0f5" }}>Download Full Report</h2>
          <p style={{ margin: "0 0 28px", fontSize: 14, color: "#7777aa", lineHeight: 1.6 }}>Complete risk intelligence for <strong style={{ color: "#c0c0dd" }}>{contractName}</strong> — findings, attack scenarios, trust assumptions, and SHA-256 verification.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div><label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#7777aa", marginBottom: 6, letterSpacing: "0.08em", textTransform: "uppercase" }}>Name</label><input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" style={inp} /></div>
            <div><label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#7777aa", marginBottom: 6, letterSpacing: "0.08em", textTransform: "uppercase" }}>Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" style={inp} /></div>
            <button onClick={handleSubmit} disabled={!name || !email} style={{ marginTop: 6, padding: "14px 24px", borderRadius: 10, border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer", background: name && email ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "#1a1a2e", color: name && email ? "#fff" : "#555" }}>Get Report →</button>
          </div>
          <p style={{ margin: "20px 0 0", fontSize: 11, color: "#44445a", textAlign: "center" }}>No spam. Reports include SHA-256 hash.</p>
        </>)}

        {status === "loading" && (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div style={{ width: 40, height: 40, border: "3px solid #1a1a3a", borderTopColor: "#6366f1", borderRadius: "50%", margin: "0 auto 20px", animation: "spin 0.8s linear infinite" }} />
            <p style={{ color: "#7777aa", fontSize: 14 }}>Preparing your report...</p>
          </div>
        )}

        {status === "success" && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", margin: "0 auto 20px", background: "#22c55e12", border: "2px solid #22c55e40", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, color: "#22c55e" }}>✓</div>
            <h2 style={{ margin: "0 0 12px", fontSize: 22, fontWeight: 700, color: "#22c55e" }}>Report Ready</h2>
            <p style={{ margin: "0 0 20px", fontSize: 14, color: "#7777aa", lineHeight: 1.6 }}>Your {contractName} risk intelligence report is ready.</p>
            {pdfUrl && (
              <a href={pdfUrl} download style={{ display: "inline-block", padding: "14px 32px", borderRadius: 10, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", fontSize: 14, fontWeight: 700, textDecoration: "none", boxShadow: "0 4px 20px -5px #6366f160" }}>
                Download PDF ↓
              </a>
            )}
            <p style={{ margin: "16px 0 0", fontSize: 11, color: "#55556a" }}>SHA-256 verified · Professional risk intelligence report</p>
          </div>
        )}

        <button onClick={() => { onClose(); setStatus("form"); setName(""); setEmail(""); setPdfUrl(null); }} style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", color: "#555570", fontSize: 20, cursor: "pointer" }}>×</button>
      </div>
    </div>
  );
}

function PipelineStep({ num, title, desc, details, color = "#6366f1", last }) {
  const [exp, setExp] = useState(false);
  return (
    <div style={{ display: "flex", gap: 24 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, width: 48 }}><div style={{ width: 48, height: 48, borderRadius: 12, background: `${color}12`, border: `1px solid ${color}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, color, fontFamily: "var(--mono)" }}>{num}</div>{!last && <div style={{ width: 1, flex: 1, minHeight: 20, background: `linear-gradient(to bottom, ${color}30, ${color}08)` }} />}</div>
      <div style={{ flex: 1, paddingBottom: last ? 0 : 32 }}><h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700, color: "#e0e0f0", lineHeight: "48px" }}>{title}</h3><p style={{ margin: "0 0 12px", fontSize: 14, lineHeight: 1.7, color: "#7777aa" }}>{desc}</p>
        {details && (<><button onClick={() => setExp(!exp)} style={{ background: "none", border: "none", color, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0, fontFamily: "var(--mono)" }}>{exp ? "− Hide details" : "+ Technical details"}</button>{exp && <div style={{ marginTop: 12, padding: 16, borderRadius: 10, background: "#06060e", border: "1px solid #12122a", fontSize: 12, lineHeight: 1.8, color: "#8888aa", fontFamily: "var(--code)" }}>{details}</div>}</>)}
      </div>
    </div>
  );
}

function HexGrid() { return <svg style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", opacity: 0.03, pointerEvents: "none" }}><defs><pattern id="hx" width="56" height="100" patternUnits="userSpaceOnUse" patternTransform="scale(1.5)"><path d="M28 0L56 16.67V50L28 66.67L0 50V16.67Z M28 33.33L56 50V83.33L28 100L0 83.33V50Z" fill="none" stroke="#fff" strokeWidth="0.5" /></pattern></defs><rect width="100%" height="100%" fill="url(#hx)" /></svg>; }

function Disclaimer() {
  return (<div style={{ padding: 28, borderRadius: 14, background: "#0a0a14", border: "1px solid #1a1a30" }}><div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}><span style={{ fontSize: 14 }}>⚠</span><span style={{ fontSize: 11, fontWeight: 700, color: "#eab308", letterSpacing: "0.15em", textTransform: "uppercase", fontFamily: "var(--mono)" }}>Important Disclaimer</span></div><p style={{ fontSize: 12, lineHeight: 1.8, color: "#66667a", margin: 0 }}>This report is an automated risk intelligence analysis combining static analysis tools and AI-powered code review. It detects known vulnerability patterns (reentrancy, access control, overflow, input validation) and evaluates trust assumptions. <strong style={{ color: "#8888aa" }}>LIMITATIONS:</strong> This analysis does NOT test economic design, business logic correctness, or protocol-specific invariants. Vulnerabilities arising from the interaction between multiple contracts or from economic incentive misalignment require fuzzing-based analysis or manual expert audit. This is not a substitute for a formal security audit by human experts.</p></div>);
}

// ═══ PAGES ═══════════════════════════════════════════════════════════
function HomePage({ nav, openReport }) {
  return (<>
    <section style={{ position: "relative", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "120px 40px 80px", overflow: "hidden" }}>
      <HexGrid />
      <div style={{ position: "absolute", top: "15%", right: "10%", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle,#6366f108,transparent 70%)", pointerEvents: "none", animation: "float 6s ease-in-out infinite" }} />
      <div style={{ position: "absolute", bottom: "20%", left: "5%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle,#ef444408,transparent 70%)", pointerEvents: "none", animation: "float 8s ease-in-out infinite 2s" }} />
      <div style={{ maxWidth: 900, textAlign: "center", position: "relative", zIndex: 1 }}>
        <div className="fi fi1"><div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 16px", borderRadius: 100, background: "#6366f10a", border: "1px solid #6366f120", marginBottom: 32 }}><div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", animation: "pulse 2s ease-in-out infinite" }} /><span style={{ fontSize: 12, fontWeight: 600, color: "#8b8bbb", fontFamily: "var(--mono)", letterSpacing: "0.1em" }}>VALIDATED AGAINST REAL EXPLOITS ON BASE</span></div></div>
        <h1 className="hero-title fi fi2" style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.08, color: "#f0f0f5", marginBottom: 24, letterSpacing: "-0.02em" }}>Know the Risk<br /><span style={{ background: "linear-gradient(135deg,#6366f1,#a78bfa,#6366f1)", backgroundSize: "200% auto", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", animation: "shimmer 4s linear infinite" }}>Before You Invest</span></h1>
        <p className="fi fi3" style={{ fontSize: 18, lineHeight: 1.7, color: "#7777aa", maxWidth: 640, margin: "0 auto 40px" }}>Instant smart contract risk intelligence for Base chain. Multi-tool static analysis + AI-powered code review — delivered as a professional PDF report in minutes, not weeks.</p>
        <div className="fi fi4" style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={() => nav("reports")} style={{ padding: "14px 32px", borderRadius: 10, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", fontSize: 15, fontWeight: 600, border: "none", cursor: "pointer", boxShadow: "0 4px 20px -5px #6366f180" }}>View Reports</button>
          <button onClick={() => nav("methodology")} style={{ padding: "14px 32px", borderRadius: 10, background: "transparent", border: "1px solid #ffffff15", color: "#aaaacc", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>How It Works</button>
        </div>
      </div>
    </section>
    <section style={{ padding: "0 40px 100px", maxWidth: 1100, margin: "0 auto" }}>
      <div className="stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 1, background: "#ffffff06", borderRadius: 16, overflow: "hidden", border: "1px solid #ffffff08" }}>
        {[{v:75,s:"%",l:"Detection Rate",d:"6 of 8 exploited contracts"},{v:255,p:"$",s:"M+",l:"Losses Detected",d:"Aggregate exploit value"},{v:6,s:"",l:"Real Exploits",d:"Including 1 blind test"},{v:17,s:"",l:"Reports Generated",d:"Base ecosystem coverage"}].map((x,i) => (
          <div key={i} style={{ padding: "36px 28px", background: "#06060e", textAlign: "center" }}><div style={{ color: "#6366f1", marginBottom: 8 }}><Counter end={x.v} suffix={x.s} prefix={x.p||""} /></div><div style={{ fontSize: 13, fontWeight: 600, color: "#c0c0dd", marginBottom: 4 }}>{x.l}</div><div style={{ fontSize: 11, color: "#55556a" }}>{x.d}</div></div>
        ))}
      </div>
    </section>
    <section style={{ padding: "0 40px 80px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32, flexWrap: "wrap", gap: 16 }}><div><SectionLabel>Featured Reports</SectionLabel><h2 style={{ fontSize: 32, fontWeight: 700, color: "#f0f0f5" }}>Exploit Detection Highlights</h2></div><button onClick={() => nav("reports")} style={{ padding: "10px 24px", borderRadius: 8, background: "none", border: "1px solid #ffffff15", color: "#8888aa", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>View all reports →</button></div>
      <div className="cards-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 20 }}>{CONTRACTS_EXPLOITED.map((c,i) => <ContractCard key={i} contract={c} onRequestReport={openReport} />)}</div>
    </section>
    <section style={{ padding: "80px 40px 100px", maxWidth: 800, margin: "0 auto", textAlign: "center" }}>
      <SectionLabel>Get Started</SectionLabel>
      <h2 style={{ fontSize: 40, fontWeight: 700, color: "#f0f0f5", marginBottom: 20 }}>Stop Trusting. Start Verifying.</h2>
      <p style={{ fontSize: 16, color: "#7777aa", lineHeight: 1.7, maxWidth: 560, margin: "0 auto 40px" }}>Submit a contract address and receive comprehensive risk intelligence — multi-tool analysis, AI review, trust assumptions, attack scenarios, and Safety Score — as a professional PDF.</p>
      <a href="mailto:financial@kairovftechenology.site?subject=QuickScan Request" style={{ display: "inline-block", padding: "16px 40px", borderRadius: 12, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", fontSize: 16, fontWeight: 700, textDecoration: "none", boxShadow: "0 8px 30px -5px #6366f160" }}>Request a QuickScan — $10</a>
      <p style={{ marginTop: 14, fontSize: 12, color: "#55556a" }}>Multi-tool analysis + AI review · PDF report · Delivered in minutes</p>
    </section>
    <section style={{ padding: "0 40px 60px", maxWidth: 1100, margin: "0 auto" }}><Disclaimer /></section>
  </>);
}

function ReportsPage({ openReport }) {
  const [tab, setTab] = useState("all");
  const all = [...CONTRACTS_EXPLOITED, ...CONTRACTS_ECOSYSTEM];
  return (
    <section style={{ padding: "100px 40px 80px", maxWidth: 1100, margin: "0 auto" }}>
      <SectionLabel>Intelligence Portfolio</SectionLabel>
      <h2 style={{ fontSize: 40, fontWeight: 700, color: "#f0f0f5", marginBottom: 12 }}>Risk Intelligence Reports</h2>
      <p style={{ fontSize: 16, color: "#7777aa", marginBottom: 16, maxWidth: 680, lineHeight: 1.7 }}>AXIOM correctly identified vulnerability patterns in 6 of 8 contracts later exploited for $2.55M+ in aggregate losses on Base chain, including 1 blind test on an unseen contract.</p>
      <div style={{ display: "flex", gap: 8, marginBottom: 40, padding: 4, background: "#0a0a18", borderRadius: 12, border: "1px solid #12122a", width: "fit-content" }}>
        {[["all",`All (${all.length})`],["exploited",`Exploited (${CONTRACTS_EXPLOITED.length})`],["ecosystem",`Ecosystem (${CONTRACTS_ECOSYSTEM.length})`]].map(([id,lb]) => <button key={id} onClick={() => setTab(id)} style={{ padding: "8px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: `1px solid ${tab===id?"#6366f130":"transparent"}`, background: tab===id?"#6366f118":"transparent", color: tab===id?"#a5a5ee":"#66667a" }}>{lb}</button>)}
      </div>
      {(tab==="all"||tab==="exploited") && (<>{tab==="all" && <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}><div style={{ width: 3, height: 24, background: "#ef4444", borderRadius: 2 }} /><div><h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#f0f0f5" }}>Validated Against Real-World Exploits</h3><p style={{ margin: "4px 0 0", fontSize: 13, color: "#66667a" }}>Detected before or independently of exploitation</p></div></div>}<div className="cards-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 20, marginBottom: tab==="all"?60:0 }}>{CONTRACTS_EXPLOITED.map((c,i) => <ContractCard key={i} contract={c} onRequestReport={openReport} />)}</div></>)}
      {(tab==="all"||tab==="ecosystem") && (<>{tab==="all" && <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}><div style={{ width: 3, height: 24, background: "#6366f1", borderRadius: 2 }} /><div><h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#f0f0f5" }}>Base Ecosystem Screening</h3><p style={{ margin: "4px 0 0", fontSize: 13, color: "#66667a" }}>High-value Base protocols and infrastructure</p></div></div>}<div className="cards-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 20 }}>{CONTRACTS_ECOSYSTEM.map((c,i) => <ContractCard key={i} contract={c} onRequestReport={openReport} />)}</div></>)}
      <div style={{ marginTop: 48, padding: 24, borderRadius: 14, background: "linear-gradient(135deg,#0a0a1a,#0d0d22)", border: "1px solid #16163a", display: "flex", gap: 16 }}><span style={{ fontSize: 20, flexShrink: 0, width: 40, height: 40, borderRadius: 10, background: "#22c55e10", border: "1px solid #22c55e20", display: "flex", alignItems: "center", justifyContent: "center" }}>✓</span><div><h4 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700, color: "#c0c0dd" }}>Validation Methodology</h4><p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: "#7777aa" }}>Each report was generated by AXIOM's autonomous pipeline and compared against publicly documented exploit postmortems. The GemPad Lock analysis was a blind test. All portfolio reports use fixed outputs. Every PDF includes a SHA-256 hash.</p></div></div>
      <div style={{ marginTop: 40 }}><Disclaimer /></div>
    </section>
  );
}

function MethodologyPage() {
  return (
    <section style={{ padding: "100px 40px 100px", maxWidth: 1100, margin: "0 auto" }}>
      <SectionLabel>How It Works</SectionLabel>
      <h2 style={{ fontSize: 40, fontWeight: 700, color: "#f0f0f5", marginBottom: 12 }}>Multi-Layer Analysis Pipeline</h2>
      <p style={{ fontSize: 16, color: "#7777aa", marginBottom: 60, maxWidth: 680, lineHeight: 1.7 }}>AXIOM combines three independent static analysis tools with four specialized AI agents. Every step is automated.</p>
      <div style={{ maxWidth: 800 }}>
        <PipelineStep num="01" title="Source Acquisition" desc="Contract source fetched via BaseScan API. Proxy contracts auto-detected via EIP-1967." details={<span>• EIP-1967 proxy detection<br/>• Multi-file preservation<br/>• Smart truncation: 48K cap<br/>• Auto remappings for solc</span>} />
        <PipelineStep num="02" title="Static Analysis — Three Tools" color="#22c55e" desc="Slither, Aderyn, and Mythril each analyze independently." details={<span><strong style={{color:"#aaa"}}>Slither v0.11.5</strong> — 101 detectors<br/><br/><strong style={{color:"#aaa"}}>Aderyn v0.6.8</strong> — 88 detectors<br/><br/><strong style={{color:"#aaa"}}>Mythril v0.24.8</strong> — Z3 symbolic execution</span>} />
        <PipelineStep num="03" title="Coverage Confidence" color="#eab308" desc="Confidence assigned by tool compilation success. Affects Safety Score." details={<span><strong style={{color:"#22c55e"}}>HIGH</strong> — 2+ tools → 0pt<br/><strong style={{color:"#eab308"}}>MED</strong> — 1 tool → -5pt<br/><strong style={{color:"#ef4444"}}>LOW</strong> — 0 tools → -15pt</span>} />
        <PipelineStep num="04" title="AI Multi-Agent Analysis" color="#8b5cf6" desc="Four AI agents with 18-category checklists, 12 few-shots, 10 trust patterns." details={<span>Agent 1: Severity Analyst<br/>Agent 2: Trust & Risk Mapper<br/>Agent 3: Code Reviewer<br/>Agent 4: Report Assembler</span>} />
        <PipelineStep num="05" title="Safety Score (v2.2)" desc="Public formula. Same findings + coverage = same score. Always." />
        <PipelineStep num="06" title="PDF Generation" color="#22c55e" last desc="Professional PDF with SHA-256 hash. 6-8 pages. axiom_pdf_generator.py v2.3." />
      </div>
      <div style={{ marginTop: 60, padding: 32, borderRadius: 16, background: "linear-gradient(135deg,#0a0a1a,#0f0f28)", border: "1px solid #16163a" }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: "#e0e0f0", marginBottom: 16 }}>Safety Score v2.2</h3>
        <pre style={{ fontFamily: "var(--mono)", fontSize: 13, lineHeight: 2, color: "#8b8bbb", overflow: "auto", padding: 20, background: "#06060e", borderRadius: 10, border: "1px solid #12122a" }}>{`  Score = 100 - Σ(severity × weight) - coverage_penalty

  CRITICAL × 25    HIGH × 15    MEDIUM × 8    LOW × 3    INFO × 1
  Coverage:  HIGH → 0    MED → -5    LOW → -15`}</pre>
      </div>
      <div style={{ marginTop: 40 }}><Disclaimer /></div>
    </section>
  );
}

function AboutPage() {
  return (
    <section style={{ padding: "100px 40px 80px", maxWidth: 1100, margin: "0 auto" }}>
      <SectionLabel>About AXIOM</SectionLabel>
      <h2 style={{ fontSize: 40, fontWeight: 700, color: "#f0f0f5", marginBottom: 12 }}>Risk Intelligence, Not Auditing</h2>
      <p style={{ fontSize: 16, color: "#7777aa", marginBottom: 60, maxWidth: 720, lineHeight: 1.7 }}>AXIOM is an autonomous smart contract risk intelligence platform for fast due diligence on Base chain.</p>
      <div className="about-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 60 }}>
        <div style={{ padding: 28, borderRadius: 16, background: "linear-gradient(135deg,#22c55e06,#22c55e02)", border: "1px solid #22c55e18" }}><div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", color: "#22c55e", marginBottom: 16, fontFamily: "var(--mono)" }}>WHAT AXIOM IS</div>{["Instant risk screening","Multi-tool analysis (3 tools)","AI code review with knowledge injection","Trust assumption mapping","Attack scenarios from findings","SHA-256 verified PDF","Pre-audit triage for anyone in DeFi"].map((x,i) => <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10, fontSize: 13, color: "#9999bb", lineHeight: 1.6 }}><span style={{ color: "#22c55e", flexShrink: 0 }}>+</span>{x}</div>)}</div>
        <div style={{ padding: 28, borderRadius: 16, background: "linear-gradient(135deg,#ef444406,#ef444402)", border: "1px solid #ef444418" }}><div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", color: "#ef4444", marginBottom: 16, fontFamily: "var(--mono)" }}>WHAT AXIOM IS NOT</div>{["Not a formal security audit","Not a substitute for human review","Not economic/tokenomics analysis","Not business logic verification","Not multi-contract testing","Not a safety guarantee","Not fuzzing (QuickScan tier)"].map((x,i) => <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10, fontSize: 13, color: "#9999bb", lineHeight: 1.6 }}><span style={{ color: "#ef4444", flexShrink: 0 }}>−</span>{x}</div>)}</div>
      </div>
      <h3 style={{ fontSize: 24, fontWeight: 700, color: "#e0e0f0", marginBottom: 32 }}>Where AXIOM Fits</h3>
      <div style={{ overflow: "auto", borderRadius: 14, border: "1px solid #16163a", marginBottom: 60 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}><thead><tr style={{ background: "#0a0a1a" }}>{["Feature","AXIOM","Rug.ai","De.Fi","GoPlus"].map((h,i) => <th key={i} style={{ padding: "14px 18px", textAlign: "left", fontWeight: 700, color: i===1?"#6366f1":"#8888aa", borderBottom: "1px solid #16163a", fontSize: 12, background: i===1?"#6366f106":"transparent" }}>{h}</th>)}</tr></thead>
        <tbody>{[["Trust Assumptions",true,false,false,false],["Attack Scenarios",true,false,false,false],["Multi-tool","3 tools","1","1","1"],["AI Review","4 agents","ML","Basic","No"],["PDF Report",true,false,false,false],["Public Formula",true,false,false,false],["SHA-256",true,false,false,false],["Price","$10","Free","Free","Free"]].map((r,i) => <tr key={i} style={{ borderBottom: "1px solid #0d0d1f" }}><td style={{ padding: "12px 18px", color: "#9999bb" }}>{r[0]}</td>{[1,2,3,4].map(j => <td key={j} style={{ padding: "12px 18px", color: r[j]===true?"#22c55e":r[j]===false?"#ef444480":"#8888aa", fontWeight: r[j]===true||j===1?700:400, background: j===1?"#6366f106":"transparent", fontSize: 12 }}>{r[j]===true?"✓":r[j]===false?"✗":r[j]}</td>)}</tr>)}</tbody></table>
      </div>
      <h3 style={{ fontSize: 24, fontWeight: 700, color: "#e0e0f0", marginBottom: 32 }}>Products</h3>
      <div className="about-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 60 }}>
        <div style={{ padding: 32, borderRadius: 16, background: "linear-gradient(135deg,#0a0a1a,#0f0f28)", border: "1px solid #6366f130", position: "relative" }}><div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg,#6366f1,#6366f100)" }} /><div style={{ fontSize: 32, fontWeight: 800, color: "#6366f1", fontFamily: "var(--mono)" }}>$10</div><h4 style={{ margin: "6px 0", fontSize: 20, fontWeight: 700, color: "#e0e0f0" }}>QuickScan</h4><p style={{ fontSize: 13, color: "#eab308", fontWeight: 600, marginBottom: 16, fontFamily: "var(--mono)" }}>Fast risk triage</p>{["3-tool static analysis","4 AI agents","Trust Assumptions","Attack Scenarios","Safety Score v2.2","SHA-256 PDF"].map((f,i) => <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, color: "#8888aa", marginBottom: 6 }}><span style={{ color: "#6366f1", fontSize: 10 }}>◆</span>{f}</div>)}</div>
        <div style={{ padding: 32, borderRadius: 16, background: "linear-gradient(135deg,#0a0a1a,#0f0f28)", border: "1px solid #ffffff10", position: "relative", opacity: 0.6 }}><div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg,#8b5cf6,#8b5cf600)" }} /><div style={{ position: "absolute", top: 16, right: 16, padding: "4px 10px", borderRadius: 6, background: "#ffffff08", border: "1px solid #ffffff10", fontSize: 10, fontWeight: 700, color: "#8888aa", letterSpacing: "0.1em", fontFamily: "var(--mono)" }}>COMING SOON</div><div style={{ fontSize: 32, fontWeight: 800, color: "#8b5cf6", fontFamily: "var(--mono)" }}>$150</div><h4 style={{ margin: "6px 0", fontSize: 20, fontWeight: 700, color: "#e0e0f0" }}>Deep Report</h4><p style={{ fontSize: 13, color: "#eab308", fontWeight: 600, marginBottom: 16, fontFamily: "var(--mono)" }}>Institutional-grade</p>{["Everything in QuickScan","Fuzzing","Multi-LLM consensus","Executive Summary","Technical layer","Continuous rescan"].map((f,i) => <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, color: "#8888aa", marginBottom: 6 }}><span style={{ color: "#8b5cf6", fontSize: 10 }}>◆</span>{f}</div>)}</div>
      </div>
      <Disclaimer />
    </section>
  );
}

// ═══ MAIN APP ════════════════════════════════════════════════════════
export default function App() {
  const [page, setPage] = useState("home");
  const [homeKey, setHomeKey] = useState(0);
  const [emailGate, setEmailGate] = useState({ open: false, contract: "" });
  const [navSolid, setNavSolid] = useState(false);

  const nav = useCallback((p) => { setPage(p); if (p === "home") setHomeKey(k => k + 1); window.scrollTo(0, 0); }, []);
  const openReport = useCallback((name) => setEmailGate({ open: true, contract: name }), []);

  useEffect(() => {
    const fn = () => setNavSolid(prev => { const s = window.scrollY > 50; return prev !== s ? s : prev; });
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const showSolid = navSolid || page !== "home";

  return (
    <div style={{ "--font": "'Space Grotesk',sans-serif", "--mono": "'JetBrains Mono',monospace", "--code": "'IBM Plex Mono',monospace", minHeight: "100vh", background: "#06060e", color: "#f0f0f5", fontFamily: "var(--font)" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap');
        *{margin:0;padding:0;box-sizing:border-box}
        @keyframes fadeInUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}
        @keyframes scanLine{0%{transform:translateY(-100%)}100%{transform:translateY(100vh)}}
        @keyframes shimmer{0%{background-position:-200% center}100%{background-position:200% center}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        .fi{animation:fadeInUp .8s ease both}.fi1{animation-delay:.1s}.fi2{animation-delay:.2s}.fi3{animation-delay:.3s}.fi4{animation-delay:.4s}
        ::selection{background:#6366f140;color:#fff}
        ::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:#06060e}::-webkit-scrollbar-thumb{background:#1a1a3a;border-radius:3px}
        @media(max-width:768px){.hero-title{font-size:34px!important}.stats-grid{grid-template-columns:1fr 1fr!important}.cards-grid{grid-template-columns:1fr!important}.nav-links-d{display:none!important}.about-grid,.diff-grid{grid-template-columns:1fr!important}}
      `}</style>

      <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "1px", background: "linear-gradient(90deg,transparent,#6366f140,transparent)", animation: "scanLine 8s linear infinite", zIndex: 0, pointerEvents: "none", opacity: 0.5 }} />

      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, padding: "0 40px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between", background: showSolid ? "rgba(6,6,14,0.95)" : "transparent", backdropFilter: showSolid ? "blur(20px)" : "none", borderBottom: showSolid ? "1px solid #ffffff08" : "1px solid transparent", transition: "all 0.4s ease" }}>
        <button onClick={() => nav("home")} style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", cursor: "pointer" }}><svg width="28" height="32" viewBox="0 0 28 32"><path d="M14 0L27.5 8V24L14 32L0.5 24V8Z" fill="none" stroke="#6366f1" strokeWidth="1.5" style={{ filter: "drop-shadow(0 0 6px #6366f140)" }} /><text x="14" y="19" textAnchor="middle" fill="#6366f1" fontSize="11" fontWeight="800" fontFamily="'JetBrains Mono',monospace">A</text></svg><span style={{ fontSize: 16, fontWeight: 700, letterSpacing: "0.15em", color: "#f0f0f5", fontFamily: "var(--mono)" }}>AXIOM</span></button>
        <div className="nav-links-d" style={{ display: "flex", gap: 32, alignItems: "center" }}>
          {[["reports","Reports"],["methodology","Methodology"],["about","About"]].map(([id,lb]) => <button key={id} onClick={() => nav(id)} style={{ background: "none", border: "none", cursor: "pointer", padding: "8px 0", color: page===id?"#f0f0f5":"#7777aa", fontSize: 13, fontWeight: 500, borderBottom: page===id?"2px solid #6366f1":"2px solid transparent" }}>{lb}</button>)}
          <button onClick={() => nav("home")} style={{ padding: "8px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", border: "none", cursor: "pointer" }}>Request Scan</button>
        </div>
      </nav>

      {page === "home" && <HomePage key={homeKey} nav={nav} openReport={openReport} />}
      {page === "reports" && <ReportsPage openReport={openReport} />}
      {page === "methodology" && <MethodologyPage />}
      {page === "about" && <AboutPage />}

      <footer style={{ padding: 40, borderTop: "1px solid #ffffff06", textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10, marginBottom: 16 }}><svg width="20" height="22" viewBox="0 0 28 32"><path d="M14 0L27.5 8V24L14 32L0.5 24V8Z" fill="none" stroke="#333355" strokeWidth="1.5" /><text x="14" y="19" textAnchor="middle" fill="#333355" fontSize="11" fontWeight="800" fontFamily="'JetBrains Mono',monospace">A</text></svg><span style={{ fontSize: 13, fontWeight: 600, color: "#333355", fontFamily: "var(--mono)", letterSpacing: "0.15em" }}>AXIOM</span></div>
        <p style={{ fontSize: 11, color: "#333350", marginBottom: 8 }}>Risk Intelligence & Pre-Audit Screening · Base Chain · 2026</p>
        <div style={{ display: "flex", gap: 20, justifyContent: "center" }}>{[["reports","Reports"],["methodology","Methodology"],["about","About"]].map(([id,lb]) => <button key={id} onClick={() => nav(id)} style={{ background: "none", border: "none", fontSize: 11, color: "#44445a", cursor: "pointer" }}>{lb}</button>)}</div>
      </footer>

      <EmailGate isOpen={emailGate.open} onClose={() => setEmailGate({ open: false, contract: "" })} contractName={emailGate.contract} />
    </div>
  );
}
