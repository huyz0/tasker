import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';

export default function LoginPage() {
  const handleGoogleLogin = () => {
    // Redirect user to backend's Auth route to start the OAuth 2.1 flow securely.
    window.location.href = '/api/auth/google/login';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4">
      <Card className="w-full max-w-sm border-zinc-800 bg-zinc-900/50 backdrop-blur-xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-semibold text-white tracking-tight">
            Tasker
          </CardTitle>
          <p className="text-sm text-zinc-400 mt-2">
            Autonomous SDLC Platform
          </p>
        </CardHeader>
        <CardContent>
          <Button 
            className="w-full bg-white text-black hover:bg-zinc-200 transition-colors"
            onClick={handleGoogleLogin}
          >
            Continue with Google
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
