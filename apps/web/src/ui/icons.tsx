import type { SVGProps } from "react";

function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="size-4"
      {...props}
    />
  );
}

export const PlayIcon = () => (
  <Icon>
    <path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none" />
  </Icon>
);

export const PauseIcon = () => (
  <Icon>
    <path d="M8 5v14M16 5v14" strokeWidth={3} />
  </Icon>
);

export const RestartIcon = () => (
  <Icon>
    <path d="M4 12a8 8 0 1 0 2.4-5.7" />
    <path d="M4 4v4.5h4.5" />
  </Icon>
);

export const OrbitIcon = () => (
  <Icon>
    <ellipse cx="12" cy="12" rx="9" ry="4" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" />
  </Icon>
);

export const GlowIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="3.5" />
    <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
  </Icon>
);
