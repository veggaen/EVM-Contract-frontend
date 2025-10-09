"use client";

import React from "react";

function cn(...classes: Array<string | undefined | false | null>) {
  return classes.filter(Boolean).join(" ");
}

interface AnimatedTrailProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * The duration of the animation.
   * @default "10s"
   */
  duration?: string;

  contentClassName?: string;

  trailColor?: string;
  trailSize?: "sm" | "md" | "lg";
}

const sizes = {
  sm: 5,
  md: 10,
  lg: 20,
};

export default function AnimatedBorderTrail({
  children,
  className,
  duration = "10s",
  trailColor = "purple",
  trailSize = "md",
  contentClassName,
  ...props
}: AnimatedTrailProps) {
  const styleObj: React.CSSProperties & { [key: string]: string } = {
    "--duration": duration ?? "10s",
    "--angle": "0deg",
    background: `conic-gradient(from var(--angle) at 50% 50%, transparent ${100 - sizes[trailSize]}%, ${trailColor})`,
  };

  return (
    <div
      {...props}
      className={cn("relative h-fit w-fit overflow-hidden bg-transparent p-px z--10", className)}
    >
      <div className="absolute inset-0 h-full w-full animate-trail" style={styleObj} />
      <div
        className={cn(
          "relative h-full w-full overflow-hidden bg-transparent",
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
