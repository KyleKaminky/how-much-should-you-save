import { formatCurrency, formatPercent } from '../lib/format';
import type { Inputs, Results } from '../lib/types';

/**
 * The consistency check between the two inputs people set independently and
 * never think to compare: how much you draw, and how much you assume you earn.
 *
 * A portfolio holds its real value only while it earns at least what it pays
 * out. Everything downstream — whether the curve rises or falls after
 * retirement, whether the money runs dry — follows from that one comparison,
 * and nothing else on the page states it.
 */
export function SustainabilityNote({
  inputs,
  results,
}: {
  inputs: Inputs;
  results: Results;
}) {
  const s = results.sustainability;
  const glide = inputs.returnModel === 'glidePath';

  // The relevant comparison is the rate the portfolio settles at for the long
  // run: on a glide path that is the floor, otherwise the single rate.
  const margin = s.marginTerminal;
  const ok = s.sustainable;

  return (
    <div className={`callout ${ok ? 'callout-good' : 'callout-critical'}`}>
      <span className="callout-icon" aria-hidden="true">
        {ok ? '✓' : '▲'}
      </span>
      <span>
        <strong>
          {formatPercent(s.realTerminal, 2)} real return vs a {formatPercent(s.withdrawalRate, 2)}{' '}
          withdrawal
        </strong>{' '}
        — {ok ? 'earning' : 'drawing'}{' '}
        <strong>{formatPercent(Math.abs(margin), 2)}</strong>{' '}
        {ok ? 'more than you spend' : 'faster than it grows'}.
        {glide && s.nominalTerminal !== s.nominalAtRetirement ? (
          <>
            {' '}
            Your curve is {formatPercent(s.nominalAtRetirement, 2)} nominal at retirement, settling
            at {formatPercent(s.nominalTerminal, 2)} from age {s.floorAge}.
          </>
        ) : null}{' '}
        {ok ? (
          <>
            A portfolio above{' '}
            <strong>{formatCurrency(s.breakEvenTerminal)}</strong> grows in real terms
            indefinitely at this rate.
          </>
        ) : (
          <>
            Sustaining {formatPercent(s.withdrawalRate, 2)} indefinitely needs a{' '}
            <strong>{formatPercent(s.requiredNominalReturn, 2)}</strong> nominal return at{' '}
            {formatPercent(inputs.inflation, 1)} inflation — or a balance above{' '}
            <strong>{formatCurrency(s.breakEvenTerminal)}</strong>, which is{' '}
            {(s.breakEvenTerminal / Math.max(1, results.firstYearSpending)).toFixed(0)}× your annual
            spending. Lower the withdrawal rate, raise the floor, or expect the balance to decline.
          </>
        )}
      </span>
    </div>
  );
}
