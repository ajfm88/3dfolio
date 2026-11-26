// 3dfolio-owned: ClerkProvider and the extension hooks that store diagrams in the cloud API.
import { useEffect, useMemo, useRef, useState } from "react";
import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import { Toast } from "@douyinfe/semi-ui";
import ExtensionsContext from "../context/ExtensionsContext";
import { API_URL, CLERK_PUBLISHABLE_KEY, CLOUD_CONFIGURED } from "./config";
import { authTransition, createCloudCore } from "./cloudCore";
import { createCloudApi } from "./cloudApi";
import { localStore } from "./localStore";
import AuthButton from "./AuthButton";

const CLERK_WAIT_MS = 5000;

function notify(message, { sticky }) {
  Toast.error(sticky ? { content: message, duration: 0 } : message);
}

function CloudGate({ children }) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const current = !isLoaded ? undefined : isSignedIn ? userId : null;
  const [mode, setMode] = useState(null);
  const [cloudUserId, setCloudUserId] = useState(null);
  const initialRef = useRef(undefined);

  useEffect(() => {
    if (current === undefined) return;
    if (initialRef.current === undefined) {
      initialRef.current = current;
      setMode((m) => m ?? (current === null ? "local" : "cloud"));
      return;
    }
    const action = authTransition(initialRef.current, current);
    if (action === "signed-out") window.location.assign("/dbdesign/editor");
    else if (action === "reload") window.location.reload();
  }, [current]);

  useEffect(() => {
    if (mode !== null) return;
    const timer = setTimeout(() => setMode((m) => m ?? "local"), CLERK_WAIT_MS);
    return () => clearTimeout(timer);
  }, [mode]);

  const core = useMemo(
    () =>
      createCloudCore({
        api: createCloudApi({
          baseUrl: API_URL,
          getToken: () => window.Clerk?.session?.getToken(),
        }),
        local: localStore,
        notify,
        onUserId: setCloudUserId,
      }),
    [],
  );
  const authSlot = useMemo(() => <AuthButton />, []);

  const value = useMemo(
    () =>
      mode === "cloud"
        ? {
            cloudList: core.list,
            cloudLoad: core.load,
            cloudSave: core.save,
            cloudDelete: core.remove,
            cloudCurrentUserId: cloudUserId,
            "header-actions-end": authSlot,
          }
        : { "header-actions-end": authSlot },
    [mode, core, cloudUserId, authSlot],
  );

  if (mode === null) {
    return (
      <div className="h-screen flex items-center justify-center">Loading</div>
    );
  }

  return (
    <ExtensionsContext.Provider value={value}>
      {children}
    </ExtensionsContext.Provider>
  );
}

export default function CloudRoot({ children }) {
  if (!CLOUD_CONFIGURED) return children;
  return (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      afterSignOutUrl="/dbdesign/editor"
    >
      <CloudGate>{children}</CloudGate>
    </ClerkProvider>
  );
}
