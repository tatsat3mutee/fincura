import { useState } from 'react'
import '../styles/calculators.css'

// ── math helpers ────────────────────────────────────────────────────────────

function calcFD(principal: number, rateAnnual: number, years: number) {
  const r = rateAnnual / 100 / 4
  const n = years * 4
  const maturity = principal * Math.pow(1 + r, n)
  return { invested: principal, interest: maturity - principal, maturity }
}

function calcRD(monthly: number, rateAnnual: number, years: number) {
  const n = years * 12
  const r = rateAnnual / 100 / 4
  let maturity = 0
  for (let i = 1; i <= n; i++) {
    const quartersRemaining = (n - i + 1) / 3
    maturity += monthly * Math.pow(1 + r, quartersRemaining)
  }
  return { invested: monthly * n, interest: maturity - monthly * n, maturity }
}

function calcPPF(annual: number, rateAnnual: number, years: number) {
  const r = rateAnnual / 100
  let balance = 0
  for (let y = 0; y < years; y++) {
    balance = (balance + annual) * (1 + r)
  }
  return { invested: annual * years, interest: balance - annual * years, maturity: balance }
}

function calcNSC(principal: number, rateAnnual: number, years: number) {
  const maturity = principal * Math.pow(1 + rateAnnual / 100, years)
  return { invested: principal, interest: maturity - principal, maturity }
}

function calcSCSS(principal: number, rateAnnual: number, years: number) {
  const quarterlyPayout = (principal * rateAnnual / 100) / 4
  const totalPayout = quarterlyPayout * years * 4
  return { invested: principal, interest: totalPayout, maturity: principal + totalPayout }
}

function calcSSY(annual: number, rateAnnual: number, depositYears: number, maturityYears: number) {
  const r = rateAnnual / 100
  let balance = 0
  for (let y = 0; y < maturityYears; y++) {
    if (y < depositYears) balance = (balance + annual) * (1 + r)
    else balance = balance * (1 + r)
  }
  return { invested: annual * depositYears, interest: balance - annual * depositYears, maturity: balance }
}

function calcKVP(principal: number, rateAnnual: number) {
  const months = Math.ceil(Math.log(2) / Math.log(1 + rateAnnual / 100 / 12))
  const maturity = principal * 2
  return { invested: principal, interest: maturity - principal, maturity, months }
}

function calcMIS(principal: number, rateAnnual: number, years: number) {
  const monthlyInterest = (principal * rateAnnual / 100) / 12
  const totalInterest = monthlyInterest * years * 12
  return { invested: principal, interest: totalInterest, maturity: principal + totalInterest, monthlyInterest }
}

function calcSIP(monthly: number, rateAnnual: number, years: number) {
  const r = rateAnnual / 100 / 12
  const n = years * 12
  const maturity = r === 0 ? monthly * n : monthly * ((Math.pow(1 + r, n) - 1) / r) * (1 + r)
  return { invested: monthly * n, interest: maturity - monthly * n, maturity }
}

function calcLumpsum(principal: number, rateAnnual: number, years: number) {
  const maturity = principal * Math.pow(1 + rateAnnual / 100, years)
  return { invested: principal, interest: maturity - principal, maturity }
}

// ── formatting ───────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)

const fmtN = (n: number) => n.toFixed(2)

// ── Result card ───────────────────────────────────────────────────────────────

function Result({ invested, interest, maturity, extra }: {
  invested: number; interest: number; maturity: number; extra?: string
}) {
  const multiple = invested > 0 ? (maturity / invested).toFixed(2) : '0'
  return (
    <div className="calc-result">
      <div className="calc-result-row">
        <span>Total invested</span><strong>{fmt(invested)}</strong>
      </div>
      <div className="calc-result-row">
        <span>Interest / returns</span><strong className="calc-result-gain">{fmt(interest)}</strong>
      </div>
      <div className="calc-result-row calc-result-row--total">
        <span>Maturity value</span><strong>{fmt(maturity)}</strong>
      </div>
      <div className="calc-result-row">
        <span>Wealth multiple</span><strong>{multiple}×</strong>
      </div>
      {extra && <div className="calc-result-extra">{extra}</div>}
    </div>
  )
}

// ── Individual calculators ────────────────────────────────────────────────────

function FDCalc() {
  const [principal, setPrincipal] = useState('100000')
  const [term, setTerm] = useState('1')
  const terms = [
    { label: '1 year', years: 1, rate: 6.9 },
    { label: '2 years', years: 2, rate: 7.0 },
    { label: '3 years', years: 3, rate: 7.1 },
    { label: '5 years', years: 5, rate: 7.5 },
  ]
  const selected = terms.find(t => String(t.years) === term) ?? terms[0]
  const res = calcFD(parseFloat(principal) || 0, selected.rate, selected.years)
  return (
    <div className="calc-body">
      <div className="calc-fields">
        <label className="form-label">Principal (₹)<input type="number" min="1000" value={principal} onChange={e => setPrincipal(e.target.value)} className="form-input" /></label>
        <label className="form-label">
          Term
          <select value={term} onChange={e => setTerm(e.target.value)} className="form-input">
            {terms.map(t => <option key={t.years} value={t.years}>{t.label} @ {t.rate}% p.a.</option>)}
          </select>
        </label>
        <p className="calc-note">Quarterly compounding · Post Office rates (Q1 FY 2024–25)</p>
      </div>
      <Result {...res} />
    </div>
  )
}

function RDCalc() {
  const RATE = 6.7
  const [monthly, setMonthly] = useState('5000')
  const [years, setYears] = useState('5')
  const res = calcRD(parseFloat(monthly) || 0, RATE, parseFloat(years) || 0)
  return (
    <div className="calc-body">
      <div className="calc-fields">
        <label className="form-label">Monthly deposit (₹)<input type="number" min="100" value={monthly} onChange={e => setMonthly(e.target.value)} className="form-input" /></label>
        <label className="form-label">Tenure (years)<input type="number" min="1" max="20" value={years} onChange={e => setYears(e.target.value)} className="form-input" /></label>
        <p className="calc-note">Rate: {RATE}% p.a. · Quarterly compounding · Post Office RD</p>
      </div>
      <Result {...res} />
    </div>
  )
}

function PPFCalc() {
  const RATE = 7.1
  const [annual, setAnnual] = useState('150000')
  const [years, setYears] = useState('15')
  const res = calcPPF(parseFloat(annual) || 0, RATE, Math.min(Math.max(parseInt(years) || 15, 15), 50))
  return (
    <div className="calc-body">
      <div className="calc-fields">
        <label className="form-label">Annual deposit (₹, max ₹1.5L)<input type="number" min="500" max="150000" value={annual} onChange={e => setAnnual(e.target.value)} className="form-input" /></label>
        <label className="form-label">Tenure (years, min 15)<input type="number" min="15" max="50" value={years} onChange={e => setYears(e.target.value)} className="form-input" /></label>
        <p className="calc-note">Rate: {RATE}% p.a. · Annual compounding · Tax-free returns (EEE)</p>
      </div>
      <Result {...res} />
    </div>
  )
}

function NSCCalc() {
  const RATE = 7.7
  const [principal, setPrincipal] = useState('100000')
  const res = calcNSC(parseFloat(principal) || 0, RATE, 5)
  return (
    <div className="calc-body">
      <div className="calc-fields">
        <label className="form-label">Investment (₹)<input type="number" min="1000" value={principal} onChange={e => setPrincipal(e.target.value)} className="form-input" /></label>
        <p className="calc-note">Rate: {RATE}% p.a. · Annual compounding · Fixed 5-year term · Post Office NSC</p>
      </div>
      <Result {...res} />
    </div>
  )
}

function SCSSCalc() {
  const RATE = 8.2
  const [principal, setPrincipal] = useState('500000')
  const res = calcSCSS(parseFloat(principal) || 0, RATE, 5)
  return (
    <div className="calc-body">
      <div className="calc-fields">
        <label className="form-label">Investment (₹, max ₹30L)<input type="number" min="1000" max="3000000" value={principal} onChange={e => setPrincipal(e.target.value)} className="form-input" /></label>
        <p className="calc-note">Rate: {RATE}% p.a. · Quarterly payouts · 5-year term · For 60+ years · SCSS</p>
      </div>
      <Result {...res} extra={`Quarterly payout: ${fmt(parseFloat(principal) * RATE / 100 / 4)}`} />
    </div>
  )
}

function SSYCalc() {
  const RATE = 8.2
  const [annual, setAnnual] = useState('150000')
  const res = calcSSY(parseFloat(annual) || 0, RATE, 15, 21)
  return (
    <div className="calc-body">
      <div className="calc-fields">
        <label className="form-label">Annual deposit (₹, max ₹1.5L)<input type="number" min="250" max="150000" value={annual} onChange={e => setAnnual(e.target.value)} className="form-input" /></label>
        <p className="calc-note">Rate: {RATE}% p.a. · Deposit for 15 years · Matures at 21 years · Sukanya Samriddhi Yojana · EEE tax benefit</p>
      </div>
      <Result {...res} />
    </div>
  )
}

function KVPCalc() {
  const RATE = 7.5
  const [principal, setPrincipal] = useState('100000')
  const res = calcKVP(parseFloat(principal) || 0, RATE)
  return (
    <div className="calc-body">
      <div className="calc-fields">
        <label className="form-label">Investment (₹)<input type="number" min="1000" value={principal} onChange={e => setPrincipal(e.target.value)} className="form-input" /></label>
        <p className="calc-note">Rate: {RATE}% p.a. · Money doubles in ~{res.months} months · Kisan Vikas Patra</p>
      </div>
      <Result {...res} extra={`Doubles in ~${res.months} months (${fmtN(res.months / 12)} years)`} />
    </div>
  )
}

function MISCalc() {
  const RATE = 7.4
  const [principal, setPrincipal] = useState('450000')
  const res = calcMIS(parseFloat(principal) || 0, RATE, 5)
  return (
    <div className="calc-body">
      <div className="calc-fields">
        <label className="form-label">Investment (₹, max ₹9L single / ₹15L joint)<input type="number" min="1000" max="1500000" value={principal} onChange={e => setPrincipal(e.target.value)} className="form-input" /></label>
        <p className="calc-note">Rate: {RATE}% p.a. · Monthly interest payout · 5-year term · Post Office MIS</p>
      </div>
      <Result {...res} extra={`Monthly payout: ${fmt(res.monthlyInterest ?? 0)}`} />
    </div>
  )
}

function SIPCalc() {
  const [monthly, setMonthly] = useState('10000')
  const [rate, setRate] = useState('12')
  const [years, setYears] = useState('10')
  const res = calcSIP(parseFloat(monthly) || 0, parseFloat(rate) || 0, parseFloat(years) || 0)
  return (
    <div className="calc-body">
      <div className="calc-fields">
        <label className="form-label">Monthly SIP (₹)<input type="number" min="500" value={monthly} onChange={e => setMonthly(e.target.value)} className="form-input" /></label>
        <label className="form-label">Expected annual return (%)<input type="number" min="1" max="50" step="0.1" value={rate} onChange={e => setRate(e.target.value)} className="form-input" /></label>
        <label className="form-label">Duration (years)<input type="number" min="1" max="40" value={years} onChange={e => setYears(e.target.value)} className="form-input" /></label>
        <p className="calc-note">Monthly compounding · Equity mutual funds historically 10–15% CAGR</p>
      </div>
      <Result {...res} />
    </div>
  )
}

function LumpsumCalc() {
  const [principal, setPrincipal] = useState('100000')
  const [rate, setRate] = useState('15')
  const [years, setYears] = useState('10')
  const res = calcLumpsum(parseFloat(principal) || 0, parseFloat(rate) || 0, parseFloat(years) || 0)
  return (
    <div className="calc-body">
      <div className="calc-fields">
        <label className="form-label">Lumpsum investment (₹)<input type="number" min="1000" value={principal} onChange={e => setPrincipal(e.target.value)} className="form-input" /></label>
        <label className="form-label">Expected CAGR (%)<input type="number" min="1" max="50" step="0.1" value={rate} onChange={e => setRate(e.target.value)} className="form-input" /></label>
        <label className="form-label">Duration (years)<input type="number" min="1" max="40" value={years} onChange={e => setYears(e.target.value)} className="form-input" /></label>
        <p className="calc-note">Annual compounding · Stocks / direct equity / lumpsum mutual fund</p>
      </div>
      <Result {...res} />
    </div>
  )
}

// ── Tab structure ─────────────────────────────────────────────────────────────

const TABS = [
  { id: 'fd',      label: 'Post Office FD', sub: '6.9–7.5%',   Component: FDCalc },
  { id: 'rd',      label: 'Post Office RD', sub: '6.7%',        Component: RDCalc },
  { id: 'ppf',     label: 'PPF',            sub: '7.1% EEE',    Component: PPFCalc },
  { id: 'nsc',     label: 'NSC',            sub: '7.7%',        Component: NSCCalc },
  { id: 'scss',    label: 'SCSS',           sub: '8.2%',        Component: SCSSCalc },
  { id: 'ssy',     label: 'SSY',            sub: '8.2% EEE',    Component: SSYCalc },
  { id: 'kvp',     label: 'KVP',            sub: '7.5%',        Component: KVPCalc },
  { id: 'mis',     label: 'Post Office MIS',sub: '7.4%',        Component: MISCalc },
  { id: 'sip',     label: 'SIP / MF',       sub: 'custom rate', Component: SIPCalc },
  { id: 'lumpsum', label: 'Stocks',         sub: 'custom CAGR', Component: LumpsumCalc },
]

export default function Calculators() {
  const [active, setActive] = useState('fd')
  const tab = TABS.find(t => t.id === active)!

  return (
    <div className="calc-page">
      <h1 className="page-title">Investment Calculators</h1>
      <p className="calc-intro">Compare Indian savings instruments — rates as of FY 2024–25.</p>

      <div className="calc-tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`calc-tab ${active === t.id ? 'calc-tab--active' : ''}`}
            onClick={() => setActive(t.id)}
          >
            <span className="calc-tab-label">{t.label}</span>
            <span className="calc-tab-sub">{t.sub}</span>
          </button>
        ))}
      </div>

      <div className="calc-panel">
        <h2 className="calc-panel-title">{tab.label} <span className="calc-panel-sub">{tab.sub}</span></h2>
        <tab.Component />
      </div>
    </div>
  )
}
