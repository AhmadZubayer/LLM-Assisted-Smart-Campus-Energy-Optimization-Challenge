import { GuardrailValidatorService } from './guardrail-validator.service';

describe('GuardrailValidatorService', () => {
  const guardrails = new GuardrailValidatorService();
  const CAPACITY = 500;

  it('accepts a well-formed response covering every note', () => {
    const outcome = guardrails.validate(
      {
        directive_interpretation: [
          {
            note_index: 0,
            applies: true,
            directive_type: 'solar_reduction',
            hours: [13, 14],
            factor: 0.2,
            explanation: 'panel cleaning',
          },
          {
            note_index: 1,
            applies: false,
            directive_type: 'no_op',
            explanation: 'irrelevant distractor',
          },
        ],
      },
      2,
      CAPACITY,
    );

    expect(outcome.ok).toBe(true);
    expect(outcome.interpretations).toEqual([
      {
        note_index: 0,
        applies: true,
        directive_type: 'solar_reduction',
        structured_adjustment: { hours: [13, 14], factor: 0.2 },
        explanation: 'panel cleaning',
      },
      {
        note_index: 1,
        applies: false,
        directive_type: 'no_op',
        structured_adjustment: null,
        explanation: 'irrelevant distractor',
      },
    ]);
  });

  it('reorders entries into note_index order regardless of model output order', () => {
    const outcome = guardrails.validate(
      {
        directive_interpretation: [
          {
            note_index: 1,
            applies: false,
            directive_type: 'no_op',
            explanation: 'b',
          },
          {
            note_index: 0,
            applies: false,
            directive_type: 'no_op',
            explanation: 'a',
          },
        ],
      },
      2,
      CAPACITY,
    );

    expect(outcome.ok).toBe(true);
    expect(outcome.interpretations!.map((entry) => entry.note_index)).toEqual([
      0, 1,
    ]);
  });

  it('rejects a directive_type outside the supported six', () => {
    const outcome = guardrails.validate(
      {
        directive_interpretation: [
          {
            note_index: 0,
            applies: true,
            directive_type: 'shutdown_grid',
            explanation: 'x',
          },
        ],
      },
      1,
      CAPACITY,
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.failures!.join(' ')).toMatch(/directive_type/);
  });

  it('rejects hours that are not unique ascending integers 0-23', () => {
    const outcome = guardrails.validate(
      {
        directive_interpretation: [
          {
            note_index: 0,
            applies: true,
            directive_type: 'no_charge_window',
            hours: [14, 13],
            explanation: 'x',
          },
        ],
      },
      1,
      CAPACITY,
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.failures!.join(' ')).toMatch(/hours/);
  });

  it('rejects a solar_reduction factor outside 0-1', () => {
    const outcome = guardrails.validate(
      {
        directive_interpretation: [
          {
            note_index: 0,
            applies: true,
            directive_type: 'solar_reduction',
            hours: [1],
            factor: 1.5,
            explanation: 'x',
          },
        ],
      },
      1,
      CAPACITY,
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.failures!.join(' ')).toMatch(/factor/);
  });

  it('rejects a minimum_battery_reserve above battery capacity', () => {
    const outcome = guardrails.validate(
      {
        directive_interpretation: [
          {
            note_index: 0,
            applies: true,
            directive_type: 'minimum_battery_reserve',
            hours: [1],
            minimum_energy_kwh: CAPACITY + 1,
            explanation: 'x',
          },
        ],
      },
      1,
      CAPACITY,
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.failures!.join(' ')).toMatch(/minimum_energy_kwh/);
  });

  it('rejects no_op with applies = true', () => {
    const outcome = guardrails.validate(
      {
        directive_interpretation: [
          {
            note_index: 0,
            applies: true,
            directive_type: 'no_op',
            explanation: 'x',
          },
        ],
      },
      1,
      CAPACITY,
    );
    expect(outcome.ok).toBe(false);
  });

  it('rejects a real directive with applies = false', () => {
    const outcome = guardrails.validate(
      {
        directive_interpretation: [
          {
            note_index: 0,
            applies: false,
            directive_type: 'no_charge_window',
            hours: [1],
            explanation: 'x',
          },
        ],
      },
      1,
      CAPACITY,
    );
    expect(outcome.ok).toBe(false);
  });

  it('rejects a duplicate note_index', () => {
    const outcome = guardrails.validate(
      {
        directive_interpretation: [
          {
            note_index: 0,
            applies: false,
            directive_type: 'no_op',
            explanation: 'a',
          },
          {
            note_index: 0,
            applies: false,
            directive_type: 'no_op',
            explanation: 'b',
          },
        ],
      },
      2,
      CAPACITY,
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.failures!.join(' ')).toMatch(/duplicate/);
  });

  it('rejects a missing note_index mapping', () => {
    const outcome = guardrails.validate(
      {
        directive_interpretation: [
          {
            note_index: 0,
            applies: false,
            directive_type: 'no_op',
            explanation: 'a',
          },
        ],
      },
      2,
      CAPACITY,
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.failures!.join(' ')).toMatch(/missing/);
  });

  it('rejects a response that is not an object with a directive_interpretation array', () => {
    expect(guardrails.validate(null, 1, CAPACITY).ok).toBe(false);
    expect(
      guardrails.validate({ directive_interpretation: 'nope' }, 1, CAPACITY).ok,
    ).toBe(false);
    expect(guardrails.validate('a string', 1, CAPACITY).ok).toBe(false);
  });

  it('rejects a missing or blank explanation', () => {
    const outcome = guardrails.validate(
      {
        directive_interpretation: [
          {
            note_index: 0,
            applies: false,
            directive_type: 'no_op',
            explanation: '   ',
          },
        ],
      },
      1,
      CAPACITY,
    );
    expect(outcome.ok).toBe(false);
  });
});
