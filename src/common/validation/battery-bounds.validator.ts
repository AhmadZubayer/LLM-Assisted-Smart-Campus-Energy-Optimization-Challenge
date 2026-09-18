import {
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  registerDecorator,
} from 'class-validator';

interface BatteryShape {
  capacity_kwh?: unknown;
  initial_energy_kwh?: unknown;
  minimum_energy_kwh?: unknown;
}

@ValidatorConstraint({ name: 'batteryBounds', async: false })
class BatteryBoundsConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const battery = args.object as BatteryShape;
    const { capacity_kwh, initial_energy_kwh, minimum_energy_kwh } = battery;
    if (
      typeof capacity_kwh !== 'number' ||
      typeof initial_energy_kwh !== 'number' ||
      typeof minimum_energy_kwh !== 'number'
    ) {
      return false;
    }
    return (
      minimum_energy_kwh >= 0 &&
      minimum_energy_kwh <= initial_energy_kwh &&
      initial_energy_kwh <= capacity_kwh
    );
  }

  defaultMessage(): string {
    return 'must satisfy 0 <= minimum_energy_kwh <= initial_energy_kwh <= capacity_kwh';
  }
}

export function BatteryBounds(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      constraints: [],
      validator: BatteryBoundsConstraint,
    });
  };
}
