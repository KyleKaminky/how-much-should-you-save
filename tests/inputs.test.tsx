// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';

afterEach(cleanup);

const age = () => screen.getByLabelText<HTMLInputElement>(/Current age/);
const retire = () => screen.getByLabelText<HTMLInputElement>(/Retire at/);

/**
 * These guard a bug that shipped: the fields are controlled by a *clamped*
 * value, so clearing one produced NaN and snapped the old value back, and the
 * first digit of "45" committed 4, which the age clamp rewrote to 16 before the
 * 5 could be typed. Typing an age was effectively impossible.
 */
describe('typing into numeric fields', () => {
  it('lets you clear a field', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.clear(age());
    expect(age().value).toBe('');
  });

  it('lets you type a two-digit age whose first digit is below the clamp', async () => {
    const user = userEvent.setup();
    render(<App />);

    // 4 alone clamps to 16; the field must still let the 5 land.
    await user.clear(age());
    await user.type(age(), '45');
    expect(age().value).toBe('45');
  });

  it('lets you type an age below the minimum digit by digit', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.clear(age());
    await user.type(age(), '18');
    expect(age().value).toBe('18');
  });

  it('re-syncs to the clamped value on blur', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.clear(age());
    await user.type(age(), '9'); // below the 16 floor
    await user.tab();
    expect(age().value).toBe('16');
  });

  it('keeps an empty field from committing NaN', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.clear(age());
    await user.tab();
    // Blur drops the draft and the last committed (clamped) value returns.
    expect(Number.isFinite(Number(age().value))).toBe(true);
    expect(age().value).not.toBe('');
  });

  it('types a retirement age without interference', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.clear(retire());
    await user.type(retire(), '67');
    expect(retire().value).toBe('67');
  });

  it('recomputes the result from what was typed', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Default 30 -> 60 is 25.3%. Retiring at 65 instead must lower it.
    await user.clear(retire());
    await user.type(retire(), '65');
    await user.tab();

    expect(retire().value).toBe('65');
    // The hero rate should now be well under the 25.3% baseline.
    const hero = document.querySelector('.hero-value')!.textContent!;
    expect(Number.parseFloat(hero)).toBeLessThan(25.3);
    expect(Number.parseFloat(hero)).toBeGreaterThan(0);
  });

  it('types into a percent field', async () => {
    const user = userEvent.setup();
    render(<App />);

    const replace = screen.getByLabelText<HTMLInputElement>(/Income to replace/);
    await user.clear(replace);
    await user.type(replace, '65');
    expect(replace.value).toBe('65');
  });

  it('types a dollar amount with more digits than the default', async () => {
    const user = userEvent.setup();
    render(<App />);

    const savings = screen.getByLabelText<HTMLInputElement>(/Current retirement savings/);
    await user.clear(savings);
    await user.type(savings, '250000');
    expect(savings.value).toBe('250000');
  });
});
