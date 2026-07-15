import type { Metadata } from "next";
import { ProfileView } from "@/components/profile/profile-view";

export const metadata: Metadata = { title: "Profile" };

export default function ProfilePage() {
  return (
    <div className="px-4 py-6 md:px-6">
      <div className="mx-auto w-full max-w-6xl">
        <h1 className="mb-4 text-lg font-semibold tracking-tight">Profile</h1>
        <ProfileView />
      </div>
    </div>
  );
}
