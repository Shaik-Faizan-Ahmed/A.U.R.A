'use client';

import ConditionalLearnNav from '@/components/conditional-learn-nav';

export default function LearnLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <ConditionalLearnNav />
      {children}
    </>
  );
}
