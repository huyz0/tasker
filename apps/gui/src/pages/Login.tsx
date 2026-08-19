import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { BACKEND_URL } from '../lib/backendUrl';
import { LoginForm } from '../features/Auth/LoginForm';

export default function LoginPage() {
  const handleGoogleLogin = () => {
    // Redirect user to backend's Auth route to start the OAuth 2.1 flow securely.
    window.location.href = `${BACKEND_URL}/api/auth/google/login`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-semibold text-foreground tracking-tight">
            Tasker
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Autonomous SDLC Platform
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <LoginForm />
          <div className="flex items-center gap-3" role="separator" aria-label="or">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <Button variant="inverted" className="w-full" onClick={handleGoogleLogin}>
            Continue with Google
          </Button>
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
