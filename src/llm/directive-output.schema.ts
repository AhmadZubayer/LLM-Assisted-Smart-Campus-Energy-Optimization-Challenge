import { Schema, Type } from '@google/genai';
import { SUPPORTED_DIRECTIVE_TYPES } from '../energy/interfaces/directive.types';

export const directiveInterpretationResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    directive_interpretation: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          note_index: {
            type: Type.INTEGER,
            description:
              'Zero-based index of the operator note this entry interprets.',
          },
          applies: {
            type: Type.BOOLEAN,
            description: 'true for every directive_type except no_op.',
          },
          directive_type: {
            type: Type.STRING,
            enum: [...SUPPORTED_DIRECTIVE_TYPES],
          },
          hours: {
            type: Type.ARRAY,
            items: { type: Type.INTEGER },
            nullable: true,
            description:
              'Unique ascending hours 0-23 this directive covers. Omit for no_op.',
          },
          factor: {
            type: Type.NUMBER,
            nullable: true,
            description:
              'solar_reduction only: usable solar fraction remaining, 0 to 1.',
          },
          minimum_energy_kwh: {
            type: Type.NUMBER,
            nullable: true,
            description:
              'minimum_battery_reserve only: required reserve level in kWh.',
          },
          max_grid_kwh: {
            type: Type.NUMBER,
            nullable: true,
            description:
              'max_grid_window only: grid import cap in kWh for each listed hour.',
          },
          explanation: {
            type: Type.STRING,
            description: 'Short explanation of the interpretation.',
          },
        },
        required: ['note_index', 'applies', 'directive_type', 'explanation'],
        propertyOrdering: [
          'note_index',
          'applies',
          'directive_type',
          'hours',
          'factor',
          'minimum_energy_kwh',
          'max_grid_kwh',
          'explanation',
        ],
      },
    },
  },
  required: ['directive_interpretation'],
};
