import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../components/ui/button';
import { registerLocalUser, PasswordAuthError } from '../../lib/passwordAuth';

const INPUT_CLASS = 'w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50';

// Mirrors the backend's MIN_PASSWORD_LENGTH (lib/credentials.ts) and the
// 3-character floor registerLocalUser enforces on username (auth.ts) - kept
// as constants here rather than fetched, since a mismatch only means one
// extra round trip to learn what the placeholder text already says.
const MIN_PASSWORD_LENGTH = 12;
const MIN_USERNAME_LENGTH = 3;

/**
 * M13-T11. Creates a local account with no email and no external provider
 * at all - email here is optional, purely so a pending email-keyed
 * invitation can still be accepted on registration (auth.ts's
 * consumePendingInvitations). A username-keyed invitation (M13-T09) needs
 * no email at all.
 */
export function RegisterForm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  // Set on submit, not while typing - see LoginForm.tsx for why the submit
  // button stays enabled and the rules are stated next to the field instead.
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({});
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const mutation = useMutation({
    mutationFn: () => registerLocalUser({
      username: username.trim(),
      password,
      email: email.trim() || undefined,
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['authSession'] });
      navigate('/');
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const errors = {
      username: username.trim().length >= MIN_USERNAME_LENGTH ? undefined : `Use at least ${MIN_USERNAME_LENGTH} characters.`,
      password: password.length >= MIN_PASSWORD_LENGTH ? undefined : `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
    setFieldErrors(errors);
    if (errors.username) { usernameRef.current?.focus(); return; }
    if (errors.password) { passwordRef.current?.focus(); return; }
    mutation.mutate();
  };

  const error = mutation.error as PasswordAuthError | null;

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3" aria-label="Create a local account">
      <div className="flex flex-col gap-1">
        <label htmlFor="register-username" className="text-sm font-medium text-foreground">
          Username
        </label>
        <input
          ref={usernameRef}
          id="register-username"
          name="username"
          type="text"
          autoComplete="username"
          minLength={MIN_USERNAME_LENGTH}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className={INPUT_CLASS}
          required
          aria-invalid={fieldErrors.username ? true : undefined}
          aria-describedby={fieldErrors.username ? 'register-username-error' : undefined}
        />
        {fieldErrors.username && (
          <p id="register-username-error" className="text-xs text-destructive">{fieldErrors.username}</p>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="register-password" className="text-sm font-medium text-foreground">
          Password
        </label>
        <input
          ref={passwordRef}
          id="register-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={INPUT_CLASS}
          required
          aria-invalid={fieldErrors.password ? true : undefined}
          aria-describedby={fieldErrors.password ? 'register-password-error' : 'register-password-hint'}
        />
        {fieldErrors.password ? (
          <p id="register-password-error" className="text-xs text-destructive">{fieldErrors.password}</p>
        ) : (
          <p id="register-password-hint" className="text-xs text-muted-foreground">At least {MIN_PASSWORD_LENGTH} characters.</p>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="register-email" className="text-sm font-medium text-foreground">
          Email <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <input
          id="register-email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={INPUT_CLASS}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={mutation.isPending}>
        {mutation.isPending ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  );
}
