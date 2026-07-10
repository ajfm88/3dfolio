import { Loader2 } from "lucide-react";

import { useAuth } from "../admin/useAuth";
import AdminLogin from "../admin/AdminLogin";
import AdminShell from "../admin/AdminShell";

// Route root for the admin panel. Gates the shell behind Google auth + the admin allowlist.
const Admin = () => {
  const { user, isAdmin, loading, login, logout } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-primary text-white flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (!isAdmin) {
    return <AdminLogin user={user} login={login} logout={logout} />;
  }

  return <AdminShell user={user} logout={logout} />;
};

export default Admin;
