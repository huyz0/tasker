import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '../components/ui/button';
import { Activity } from 'lucide-react';
import { Card, CardHeader, CardContent } from '../components/ui/card';
import { BACKEND_URL } from '../lib/backendUrl';
import { fetchAuthProviders } from '../lib/authSession';
import { LoginForm } from '../features/Auth/LoginForm';

export default function LoginPage() {
  // M09-T06. The standalone binary has no Google credentials, and offering a
  // button that redirects to an OAuth endpoint with an empty client_id strands
  // the person on a Google error page. Ask what works before drawing it.
  const { data: providers } = useQuery({
    queryKey: ['authProviders'],
    queryFn: fetchAuthProviders,
    staleTime: Infinity,
  });
  const handleGoogleLogin = () => {
    // Redirect user to backend's Auth route to start the OAuth 2.1 flow securely.
    window.location.href = `${BACKEND_URL}/api/auth/google/login`;
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-background p-4">
      {/* The shell's own mark (AppShell's header), so the product a person
          signs in to is recognisably the one they land in. */}
      <div data-testid="brand-mark" className="font-semibold text-lg flex items-center gap-2 text-foreground">
        <Activity className="h-5 w-5 text-primary" aria-hidden="true" />
        Tasker
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          {/* The page's one h1; the product name now lives in the mark above. */}
          <h1 className="text-2xl font-semibold leading-none text-foreground tracking-tight">
            Sign in
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Autonomous SDLC Platform
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <LoginForm />
          {providers?.google && (
            <>
              <div className="flex items-center gap-3" role="separator" aria-label="or">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              {/* Outline: "Sign in" is the page's primary action; a second solid
                  (inverted) fill made two buttons compete for it. */}
              <Button variant="outline" className="w-full" onClick={handleGoogleLogin}>
                Continue with Google
              </Button>
            </>
          )}
          <p className="text-center text-sm text-muted-foreground">
            {/* Underlined at rest, not just on hover: a link identified by
                colour alone next to plain text fails WCAG's link-in-text-block
                rule - found via Storybook's a11y gate, the first time this
                page ever had a story to check it against. */}
            No account? <Link to="/register" className="text-primary underline hover:no-underline">Create one</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
