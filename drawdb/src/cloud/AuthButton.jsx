// 3dfolio-owned: Sign in button and Clerk user button for the header-actions-end slot.
import { useLocation } from "react-router-dom";
import { Button } from "@douyinfe/semi-ui";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/clerk-react";

export default function AuthButton() {
  useLocation();
  const here = window.location.href;
  return (
    <>
      <SignedOut>
        <SignInButton mode="modal" forceRedirectUrl={here} signUpForceRedirectUrl={here}>
          <Button
            type="primary"
            className="!text-base !px-5 !py-[18px] !rounded-md"
            icon={<i className="bi bi-person" />}
          >
            Sign in
          </Button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <UserButton />
      </SignedIn>
    </>
  );
}
