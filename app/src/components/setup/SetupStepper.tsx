import { WorkspaceConfigForm } from './WorkspaceConfigForm';
import type { WorkspaceConfigFormProps } from './WorkspaceConfigForm';

interface SetupStepperProps extends Omit<WorkspaceConfigFormProps, 'guided' | 'isLoading'> {
  isLaunching: boolean;
}

export function SetupStepper({ isLaunching, ...props }: SetupStepperProps): React.JSX.Element {
  return <WorkspaceConfigForm {...props} guided isLoading={isLaunching} />;
}
