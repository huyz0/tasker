import { Sun, Moon, Monitor } from 'lucide-react';
import { useLayoutStore, type Theme } from '../../store/layout';

const OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
];

/**
 * Light, dark, or follow the machine.
 *
 * Three explicit choices rather than a two-state switch: a switch cannot say
 * "follow the OS", so it either ignores the preference the user already
 * expressed at system level, or silently overrides it the first time they
 * touch it.
 */
export function ThemeToggle() {
  const theme = useLayoutStore((s) => s.theme);
  const setTheme = useLayoutStore((s) => s.setTheme);

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="flex rounded-md border overflow-hidden"
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          role="radio"
          aria-checked={theme === value}
          aria-label={label}
          title={label}
          onClick={() => setTheme(value)}
          className={`px-2 py-1.5 ${
            theme === value
              ? 'bg-secondary text-secondary-foreground'
              : 'bg-background text-muted-foreground hover:text-foreground'
          }`}
        >
          <Icon className="w-4 h-4" />
        </button>
      ))}
    </div>
  );
}
