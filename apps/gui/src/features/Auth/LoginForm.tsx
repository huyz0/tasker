import { useState, type FormEvent } from 'react';
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

  const mutation = useMutation({
    mutationFn: () => loginWithPassword(username.trim(), password),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['authSession'] });
      navigate('/');
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    mutation.mutate();
  };

  const error = mutation.error as PasswordAuthError | null;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3" aria-label="Sign in with username and password">
      <div className="flex flex-col gap-1">
        <label htmlFor="login-username" className="text-sm font-medium text-foreground">
          Username
        </label>
        <input
          id="login-username"
          name="username"
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className={INPUT_CLASS}
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="login-password" className="text-sm font-medium text-foreground">
          Password
        </label>
        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={INPUT_CLASS}
          required
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error.status === 429
            ? `${error.message}${error.retryAfterSeconds ? ` Try again in ${error.retryAfterSeconds}s.` : ''}`
            : error.message}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={mutation.isPending || !username.trim() || !password}>
        {mutation.isPending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
