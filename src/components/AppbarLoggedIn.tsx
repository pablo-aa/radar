// Slim appbar variant for the landing page when the user has a session.
// Server component, no client interactivity. Brand on the left, avatar
// + handle in the middle, "Go to radar" CTA on the right.

import Link from "next/link";

type Props = {
  userInitials: string;
  userHandle: string;
};

export default function AppbarLoggedIn({ userInitials, userHandle }: Props) {
  return (
    <header className="appbar appbar-logged">
      <Link className="brand" href="/">
        <span className="mark" aria-hidden="true"></span>
        <span>radar</span>
      </Link>

      <div className="appbar-logged-r">
        <span className="appbar-logged-who">
          <span className="avatar">{userInitials}</span>
          <span className="appbar-logged-handle">@{userHandle}</span>
        </span>
        <Link className="btn sm" href="/radar">
          Go to radar
        </Link>
      </div>
    </header>
  );
}
