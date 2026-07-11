import { LabelProvider, useLabels } from './LabelContext';
import { LabelChips } from './LabelChips';
import { LabelPicker } from './LabelPicker';

export const Label = {
  Provider: LabelProvider,
  Chips: LabelChips,
  Picker: LabelPicker,
};

export { useLabels };
export type { LabelData, LabelState, LabelActions } from './LabelContext';
