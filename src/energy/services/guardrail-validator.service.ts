import { Injectable } from '@nestjs/common';
import { isValidDirectiveHours } from '../../common/validation/directive-hours.validator';
import {
  DirectiveInterpretation,
  DirectiveType,
  StructuredAdjustment,
  SUPPORTED_DIRECTIVE_TYPES,
} from '../interfaces/directive.types';

export interface GuardrailOutcome {
  ok: boolean;
  interpretations?: DirectiveInterpretation[];
  failures?: string[];
}

interface RawEntry {
  note_index?: unknown;
  applies?: unknown;
  directive_type?: unknown;
  hours?: unknown;
  factor?: unknown;
  minimum_energy_kwh?: unknown;
  max_grid_kwh?: unknown;
  explanation?: unknown;
}

@Injectable()
export class GuardrailValidatorService {
  validate(
    parsed: unknown,
    noteCount: number,
    batteryCapacityKwh: number,
  ): GuardrailOutcome {
    const failures: string[] = [];
    const root = parsed as { directive_interpretation?: unknown } | null;

    if (
      !root ||
      typeof root !== 'object' ||
      !Array.isArray(root.directive_interpretation)
    ) {
      return {
        ok: false,
        failures: [
          'response must be an object with a directive_interpretation array',
        ],
      };
    }

    const rawEntries = root.directive_interpretation as unknown[];
    if (rawEntries.length !== noteCount) {
      failures.push(
        `expected ${noteCount} directive_interpretation entries, got ${rawEntries.length}`,
      );
    }

    const byIndex = new Map<number, DirectiveInterpretation>();
    rawEntries.forEach((rawEntry, position) => {
      const entryFailures = this.validateEntry(
        rawEntry as RawEntry,
        noteCount,
        batteryCapacityKwh,
        byIndex,
      );
      entryFailures.forEach((failure) =>
        failures.push(`entry ${position}: ${failure}`),
      );
    });

    for (let i = 0; i < noteCount; i++) {
      if (!byIndex.has(i)) {
        failures.push(
          `missing directive_interpretation entry for note_index ${i}`,
        );
      }
    }

    if (failures.length > 0) {
      return { ok: false, failures };
    }

    const interpretations = Array.from({ length: noteCount }, (_, i) =>
      byIndex.get(i)!,
    );
    return { ok: true, interpretations };
  }

  private validateEntry(
    raw: RawEntry,
    noteCount: number,
    batteryCapacityKwh: number,
    byIndex: Map<number, DirectiveInterpretation>,
  ): string[] {
    const failures: string[] = [];

    if (!raw || typeof raw !== 'object') {
      failures.push('entry must be an object');
      return failures;
    }

    const noteIndexRaw = raw.note_index;
    if (
      !Number.isInteger(noteIndexRaw) ||
      (noteIndexRaw as number) < 0 ||
      (noteIndexRaw as number) >= noteCount
    ) {
      failures.push(
        `note_index must be an integer between 0 and ${noteCount - 1}`,
      );
      return failures;
    }
    const noteIndex = noteIndexRaw as number;

    if (byIndex.has(noteIndex)) {
      failures.push(`duplicate note_index ${noteIndex}`);
      return failures;
    }

    if (
      typeof raw.explanation !== 'string' ||
      raw.explanation.trim().length === 0
    ) {
      failures.push(
        `note_index ${noteIndex}: explanation must be a non-empty string`,
      );
      return failures;
    }
    const explanation = raw.explanation;

    if (
      typeof raw.directive_type !== 'string' ||
      !(SUPPORTED_DIRECTIVE_TYPES as readonly string[]).includes(
        raw.directive_type,
      )
    ) {
      failures.push(
        `note_index ${noteIndex}: directive_type must be one of ${SUPPORTED_DIRECTIVE_TYPES.join(', ')}`,
      );
      return failures;
    }
    const directiveType = raw.directive_type as DirectiveType;

    if (typeof raw.applies !== 'boolean') {
      failures.push(`note_index ${noteIndex}: applies must be a boolean`);
      return failures;
    }

    if (directiveType === 'no_op') {
      if (raw.applies !== false) {
        failures.push(
          `note_index ${noteIndex}: no_op must have applies = false`,
        );
        return failures;
      }
      byIndex.set(noteIndex, {
        note_index: noteIndex,
        applies: false,
        directive_type: 'no_op',
        structured_adjustment: null,
        explanation,
      });
      return failures;
    }

    if (raw.applies !== true) {
      failures.push(
        `note_index ${noteIndex}: ${directiveType} must have applies = true`,
      );
      return failures;
    }

    if (!isValidDirectiveHours(raw.hours)) {
      failures.push(
        `note_index ${noteIndex}: hours must be unique ascending integers 0-23`,
      );
      return failures;
    }
    const hours = raw.hours;

    const adjustment = this.buildAdjustment(
      directiveType,
      hours,
      raw,
      batteryCapacityKwh,
      noteIndex,
      failures,
    );
    if (!adjustment) {
      return failures;
    }

    byIndex.set(noteIndex, {
      note_index: noteIndex,
      applies: true,
      directive_type: directiveType,
      structured_adjustment: adjustment,
      explanation,
    } as DirectiveInterpretation);
    return failures;
  }

  private buildAdjustment(
    directiveType: DirectiveType,
    hours: number[],
    raw: RawEntry,
    batteryCapacityKwh: number,
    noteIndex: number,
    failures: string[],
  ): StructuredAdjustment | undefined {
    switch (directiveType) {
      case 'solar_reduction': {
        const factor = raw.factor;
        if (
          typeof factor !== 'number' ||
          !Number.isFinite(factor) ||
          factor < 0 ||
          factor > 1
        ) {
          failures.push(
            `note_index ${noteIndex}: factor must be a finite number between 0 and 1`,
          );
          return undefined;
        }
        return { hours, factor };
      }
      case 'minimum_battery_reserve': {
        const minimumEnergyKwh = raw.minimum_energy_kwh;
        if (
          typeof minimumEnergyKwh !== 'number' ||
          !Number.isFinite(minimumEnergyKwh) ||
          minimumEnergyKwh < 0 ||
          minimumEnergyKwh > batteryCapacityKwh
        ) {
          failures.push(
            `note_index ${noteIndex}: minimum_energy_kwh must be finite, non-negative, and at most battery capacity`,
          );
          return undefined;
        }
        return { hours, minimum_energy_kwh: minimumEnergyKwh };
      }
      case 'no_charge_window':
      case 'no_discharge_window':
        return { hours };
      case 'max_grid_window': {
        const maxGridKwh = raw.max_grid_kwh;
        if (
          typeof maxGridKwh !== 'number' ||
          !Number.isFinite(maxGridKwh) ||
          maxGridKwh < 0
        ) {
          failures.push(
            `note_index ${noteIndex}: max_grid_kwh must be a finite, non-negative number`,
          );
          return undefined;
        }
        return { hours, max_grid_kwh: maxGridKwh };
      }
      default:
        failures.push(
          `note_index ${noteIndex}: unsupported directive_type ${String(directiveType)}`,
        );
        return undefined;
    }
  }
}
