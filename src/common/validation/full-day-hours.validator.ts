import {
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  registerDecorator,
} from 'class-validator';

@ValidatorConstraint({ name: 'fullDayHours', async: false })
class FullDayHoursConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (!Array.isArray(value) || value.length !== 24) {
      return false;
    }
    const seen = new Set<number>();
    for (const entry of value) {
      const hour = (entry as { hour?: unknown })?.hour;
      if (
        !Number.isInteger(hour) ||
        (hour as number) < 0 ||
        (hour as number) > 23 ||
        seen.has(hour as number)
      ) {
        return false;
      }
      seen.add(hour as number);
    }
    return seen.size === 24;
  }

  defaultMessage(): string {
    return 'hours must contain exactly 24 entries with a unique hour value for each of 0 through 23';
  }
}

export function FullDayHours(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      constraints: [],
      validator: FullDayHoursConstraint,
    });
  };
}
