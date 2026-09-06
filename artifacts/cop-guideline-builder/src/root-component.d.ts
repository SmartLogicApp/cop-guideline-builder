declare module '*.jsx' {
  import type { ComponentType } from 'react';

  const CoPGuidelineBuilder: ComponentType<{
    onSignOut?: () => void;
    clerkUserId?: string;
  }>;
  export default CoPGuidelineBuilder;
}