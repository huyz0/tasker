import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../components/ui/button';
import { loginWithPassword, PasswordAuthError } from '../../lib/passwordAuth';

const INPUT_CLASS = 'w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50';

/**
 * M13-T11. A user with no email and no Google account authenticates here -
 * the milestone's own exit criterion, so this form (not the Google button)
 * is the one that has to work standalone.
 *
 * mustChangePassword (returned alongside a successful login, M13-T10's
 * admin reset) isn't enforced with a hard redirect yet - the screen that
 * would enforce it lives in account settings, M13-T12. The session is
 * valid either way; deferred here rather than half-built.
 */
export function LoginForm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  // Set on submit, not while typing: an empty form is not an error until the
  // person tries to send it. The submit button stays enabled so the primary
  // action is visible from the start; this is where "you missed a field" is
  // said instead, next to the field, with focus moved to the first one.
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({});
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const mutation = useMutation({
    mutationFn: () => loginWithPassword(username.trim(), password),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['authSession'] });
      navigate('/');
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const errors = {
      username: username.trim() ? undefined : 'Enter your username.',
      password: password ? undefined : 'Enter your password.',
    };
    setFieldErrors(errors);
    if (errors.username) { usernameRef.current?.focus(); return; }
    if (errors.password) { passwordRef.current?.focus(); return; }
    mutation.mutate();
  };

  const error = mutation.error as PasswordAuthError | null;

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3" aria-label="Sign in with username and password">
      <div className="flex flex-col gap-1">
        <label htmlFor="login-username" className="text-sm font-medium text-foreground">
          Username
        </label>
        <input
          ref={usernameRef}
          id="login-username"
          name="username"
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className={INPUT_CLASS}
          required
          aria-invalid={fieldErrors.username ? true : undefined}
          aria-describedby={fieldErrors.username ? 'login-username-error' : undefined}
        />
        {fieldErrors.username && (
          <p id="login-username-error" className="text-xs text-destructive">{fieldErrors.username}</p>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="login-password" className="text-sm font-medium text-foreground">
          Password
        </label>
        <input
          ref={passwordRef}
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={INPUT_CLASS}
          required
          aria-invalid={fieldErrors.password ? true : undefined}
          aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
        />
        {fieldErrors.password && (
          <p id="login-password-error" className="text-xs text-destructive">{fieldErrors.password}</p>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error.status === 429
            ? `${error.message}${error.retryAfterSeconds ? ` Try again in ${error.retryAfterSeconds}s.` : ''}`
            : error.message}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={mutation.isPending}>
        {mutation.isPending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
