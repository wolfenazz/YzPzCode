import { getExtensionIcon } from '../../data/extensionIcons';

interface ExtensionLogoProps {
  extensionId: string;
  name: string;
  small?: boolean;
}

export function ExtensionLogo({ extensionId, name, small = false }: ExtensionLogoProps): React.JSX.Element {
  const icon = getExtensionIcon(extensionId);
  return (
    <span className={small ? 'flex h-4 w-4 shrink-0 items-center justify-center' : 'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-theme bg-[var(--bg-primary)] p-1.5'}>
      {icon ? <img src={icon} alt="" className="h-full w-full object-contain" draggable={false} />
        : <span aria-hidden="true" className="text-xs font-semibold text-[var(--text-secondary)]">{name.slice(0, 2)}</span>}
    </span>
  );
}
