import { AuthenticatedShell } from "@/components/auth/AuthenticatedShell";
import { Profile } from "@/components/account/Profile";
import { SecurityPanel } from "@/components/account/SecurityPanel";

export default function ProfilePage() {
  return (
    <AuthenticatedShell>
      <Profile />
      <div className="mt-8">
        <SecurityPanel />
      </div>
    </AuthenticatedShell>
  );
}
