import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';

export default function LoginPage() {
  const handleGoogleLogin = () => {
    // Redirect user to backend's Auth route to start the OAuth 2.1 flow securely.
    window.location.href = 'http://localhost:8080/api/auth/google/login';
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
        <CardContent>
          <Button variant="inverted" className="w-full" onClick={handleGoogleLogin}>
            Continue with Google
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
