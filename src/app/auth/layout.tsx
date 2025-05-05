import type { Metadata } from "next";
 
export const metadata: Metadata = {
  title: "ReviseTax - Authentication",
  description: "Authenticate with ReviseTax - Your tax filing partner",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      {children}
    </div>
  );
}