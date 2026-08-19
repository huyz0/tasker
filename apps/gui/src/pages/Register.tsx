import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { RegisterForm } from '../features/Auth/RegisterForm';

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-semibold text-foreground tracking-tight">
            Create your account
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            No email or Google account required.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <RegisterForm />
          <p className="text-center text-sm text-muted-foreground">
            {/* Underlined at rest, not just on hover - see Login.tsx's own
                doc comment on its matching link for why. */}
            Already have an account? <Link to="/login" className="text-primary underline hover:no-underline">Sign in</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
