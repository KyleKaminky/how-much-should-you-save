import { useEffect, useMemo, useState } from 'react';
import { BalanceChart } from './components/BalanceChart';
import { InputsPanel } from './components/InputsPanel';
import { MethodologyNotes } from './components/MethodologyNotes';
import { ReferenceGrid } from './components/ReferenceGrid';
import { ResultsSummary } from './components/ResultsSummary';
import { ShareLink } from './components/ShareLink';
import { DEFAULT_INPUTS } from './lib/defaults';
import { computeResults } from './lib/model';
import { decodeInputs, encodeInputs } from './lib/urlState';
import type { Inputs } from './lib/types';

type Theme = 'light' | 'dark' | 'system';

/** Keeps ages ordered so the model never sees an impossible timeline. */
function normalize(inputs: Inputs): Inputs {
  const currentAge = Math.max(16, Math.min(90, Math.round(inputs.currentAge)));
  const retirementAge = Math.max(currentAge + 1, Math.min(95, Math.round(inputs.retirementAge)));
  const planToAge = Math.max(retirementAge + 1, Math.min(110, Math.round(inputs.planToAge)));

  return {
    ...inputs,
    currentAge,
    retirementAge,
    planToAge,
    income: Math.max(0, inputs.income),
    currentSavings: Math.max(0, inputs.currentSavings),
    socialSecurity: {
      ...inputs.socialSecurity,
      claimAge: Math.max(62, Math.min(70, Math.round(inputs.socialSecurity.claimAge))),
    },
  };
}

export function App() {
  const [raw, setRaw] = useState<Inputs>(() =>
    typeof window === 'undefined' ? DEFAULT_INPUTS : decodeInputs(window.location.search),
  );
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);

  const inputs = useMemo(() => normalize(raw), [raw]);
  const results = useMemo(() => computeResults(inputs), [inputs]);

  // Keep the address bar in sync so the scenario is always linkable. replaceState
  // rather than pushState — every keystroke should not become a history entry.
  useEffect(() => {
    const qs = encodeInputs(inputs);
    const next = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
    if (next !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, '', next);
    }
  }, [inputs]);

  const patch = (p: Partial<Inputs>) => setRaw((prev) => ({ ...prev, ...p }));

  return (
    <div className="app">
      <header className="masthead">
        <div>
          <h1>How much should you save?</h1>
          <p>
            Work out the share of your income you need to invest — with your current balance,
            Social Security, and every assumption made editable. Runs entirely in your browser;
            nothing you type is sent anywhere.
          </p>
        </div>
        <button
          type="button"
          className="theme-toggle"
          onClick={() => setTheme(theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark')}
        >
          {theme === 'system' ? 'Theme: auto' : theme === 'dark' ? 'Theme: dark' : 'Theme: light'}
        </button>
      </header>

      <div className="layout">
        <InputsPanel
          inputs={inputs}
          requiredRate={results.requiredSavingsRate}
          onChange={patch}
          onReset={() => setRaw(DEFAULT_INPUTS)}
        />

        <div>
          <ResultsSummary inputs={inputs} results={results} />
          <ShareLink inputs={inputs} />
          <BalanceChart inputs={inputs} results={results} />
          <MethodologyNotes />
          <ReferenceGrid currentAge={inputs.currentAge} />
        </div>
      </div>

      <footer className="site-footer">
        <p>
          <strong>A planning tool, not financial advice.</strong> This is a simplified model built
          on assumptions you can and should argue with — it ignores taxes, sequence-of-returns risk
          and healthcare costs, among other things. Use it to see how the levers interact, not to
          make a decision on its own.
        </p>
        <p>
          The starting assumptions — an 80% income replacement target, an age-banded safe
          withdrawal rate, and an assumed return that declines as you age — are inspired by
          widely used retirement-planning guidelines, including those popularized by{' '}
          <a href="https://moneyguy.com" target="_blank" rel="noopener noreferrer">
            the Money Guy Show
          </a>
          . This site is not affiliated with or endorsed by them. All of those assumptions are
          editable here, and the methodology section above lists every formula and constant.
        </p>
        <p>Social Security figures from the Social Security Administration.</p>
      </footer>
    </div>
  );
}
